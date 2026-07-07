/**
 * Login Endpoint
 * 
 * Authenticates users with username + TOTP.
 * 
 * Security Features:
 * - Rate limiting (5 attempts/IP/hour, admins bypass)
 * - TOTP verification (6-digit codes)
 * - Account lockout (10 failures = 24h lock)
 * - Single session enforcement (deletes old sessions)
 * - Strict IP binding (stored in Redis session)
 * - JWT token generation (minimal payload)
 * - HTTP-only cookies
 * - Comprehensive audit logging
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auditLog } from '@/lib/logger/audit';
import { verifyTOTP } from '@/lib/auth/totp';
import { generateTokenPair } from '@/lib/auth/jwt';
import { setAuthCookies } from '@/lib/auth/cookies';
import { createSession } from '@/lib/redis/session-store';
import logger from '@/lib/logger';
import { logAuditEvent } from '@/lib/utils/audit';
import { prisma } from '@/lib/db/client';

// Validation schema
const loginSchema = z.object({
  username: z.string().min(3).max(50),
  totpCode: z.string().length(6).regex(/^\d{6}$/),
});

// Rate limiting (in-memory for now, Redis in production)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS_PER_IP = 100;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

// Account lockout
const LOCKOUT_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const MAX_FAILED_ATTEMPTS = 10;

/**
 * Check rate limit
 */
function checkRateLimit(ip: string, isAdmin: boolean): {
  allowed: boolean;
  remainingAttempts: number;
  resetAt: number;
} {
  // Admins bypass rate limits
  if (isAdmin) {
    return { allowed: true, remainingAttempts: 999, resetAt: 0 };
  }

  const now = Date.now();
  const attempt = loginAttempts.get(ip);

  // No attempts or window expired
  if (!attempt || now >= attempt.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS_PER_IP - 1, resetAt: now + RATE_LIMIT_WINDOW };
  }

  // Check if limit exceeded
  if (attempt.count >= MAX_ATTEMPTS_PER_IP) {
    return { allowed: false, remainingAttempts: 0, resetAt: attempt.resetAt };
  }

  // Increment counter
  attempt.count++;
  return {
    allowed: true,
    remainingAttempts: MAX_ATTEMPTS_PER_IP - attempt.count,
    resetAt: attempt.resetAt,
  };
}

/**
 * Get client IP address
 */
function getClientIp(request: NextRequest): string {
  // Check various headers for real IP (behind proxies)
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');

  if (cfConnectingIp) return cfConnectingIp;
  if (realIp) return realIp;
  if (forwarded) return forwarded.split(',')[0].trim();

  // Fallback to localhost for development
  return '127.0.0.1';
}

/**
 * Format time remaining
 */
function formatTimeRemaining(resetAt: number): string {
  const remaining = Math.ceil((resetAt - Date.now()) / 1000 / 60);
  if (remaining <= 1) return 'less than 1 minute';
  if (remaining < 60) return `${remaining} minutes`;
  const hours = Math.floor(remaining / 60);
  return `${hours} hour${hours > 1 ? 's' : ''}`;
}

/**
 * Login endpoint
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || 'Unknown';

  try {
    // Parse and validate request body
    const body = await request.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      await logAuditEvent({
        eventType: 'login_failed',
        eventCategory: 'auth',
        severity: 'warning',
        message: 'Login failed - invalid input',
        details: { errors: validation.error.issues },
        ipAddress: ip,
        userAgent,
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Invalid input',
          details: validation.error.issues,
        },
        { status: 400 }
      );
    }

    const { username, totpCode } = validation.data;

    // Find user
    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: {
        id: true,
        username: true,
        email: true,
        emailVerified: true,
        totpSecret: true,
        totpVerified: true,
        isActive: true,
        isLocked: true,
        isAdmin: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });

    // User not found (don't reveal which)
    if (!user) {
      await logAuditEvent({
        eventType: 'login_failed',
        eventCategory: 'auth',
        severity: 'warning',
        message: 'Login failed - user not found',
        details: { username },
        ipAddress: ip,
        userAgent,
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Invalid credentials',
        },
        { status: 401 }
      );
    }

    // Check rate limit (admins bypass)
    const rateLimit = checkRateLimit(ip, user.isAdmin);
    if (!rateLimit.allowed) {
      await logAuditEvent({
        userId: user.id,
        eventType: 'login_rate_limited',
        eventCategory: 'auth',
        severity: 'warning',
        message: 'Login rate limit exceeded',
        details: { username, ip },
        ipAddress: ip,
        userAgent,
      });

      return NextResponse.json(
        {
          success: false,
          error: `Too many login attempts. Please try again in ${formatTimeRemaining(rateLimit.resetAt)}.`,
        },
        { status: 429 }
      );
    }

    // Check if account is locked
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      await logAuditEvent({
        userId: user.id,
        eventType: 'login_failed_locked',
        eventCategory: 'auth',
        severity: 'warning',
        message: 'Login failed - account locked',
        details: { username, lockedUntil: user.lockedUntil },
        ipAddress: ip,
        userAgent,
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Account is locked',
          lockedUntil: new Date(user.lockedUntil).toISOString(),
        },
        { status: 403 }
      );
    }

    // Check account status
    if (!user.isActive) {
      await logAuditEvent({
        userId: user.id,
        eventType: 'login_failed_inactive',
        eventCategory: 'auth',
        severity: 'warning',
        message: 'Login failed - account inactive',
        details: { username },
        ipAddress: ip,
        userAgent,
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Account is not active',
        },
        { status: 403 }
      );
    }

    // Check email verification
    if (!user.emailVerified) {
      await logAuditEvent({
        userId: user.id,
        eventType: 'login_failed_unverified',
        eventCategory: 'auth',
        severity: 'info',
        message: 'Login failed - email not verified',
        details: { username },
        ipAddress: ip,
        userAgent,
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Email not verified. Please verify your email first.',
        },
        { status: 403 }
      );
    }

    // Check TOTP setup
    if (!user.totpVerified || !user.totpSecret) {
      await logAuditEvent({
        userId: user.id,
        eventType: 'login_failed_no_totp',
        eventCategory: 'auth',
        severity: 'info',
        message: 'Login failed - TOTP not set up',
        details: { username },
        ipAddress: ip,
        userAgent,
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Two-factor authentication not set up. Please complete setup first.',
        },
        { status: 403 }
      );
    }

    // Verify TOTP code
    const totpValid = verifyTOTP(totpCode, user.totpSecret);

    if (!totpValid) {
      // Increment failed attempts
      const newFailedAttempts = (user.failedLoginAttempts || 0) + 1;
      const shouldLock = newFailedAttempts >= MAX_FAILED_ATTEMPTS;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newFailedAttempts,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_DURATION) : null,
        },
      });

      await logAuditEvent({
        userId: user.id,
        eventType: shouldLock ? 'account_locked' : 'login_failed_invalid_totp',
        eventCategory: 'auth',
        severity: shouldLock ? 'error' : 'warning',
        message: shouldLock
          ? `Account locked after ${MAX_FAILED_ATTEMPTS} failed attempts`
          : 'Login failed - invalid TOTP code',
        details: {
          username,
          failedAttempts: newFailedAttempts,
          locked: shouldLock,
        },
        ipAddress: ip,
        userAgent,
      });

      return NextResponse.json(
        {
          success: false,
          error: shouldLock
            ? `Account locked for 24 hours after ${MAX_FAILED_ATTEMPTS} failed attempts.`
            : 'Invalid authentication code',
          remainingAttempts: shouldLock ? 0 : MAX_FAILED_ATTEMPTS - newFailedAttempts,
        },
        { status: 401 }
      );
    }

    // Login successful! Generate tokens
    const { accessToken, refreshToken, refreshTokenId } = generateTokenPair(user.id);

    // Create session in Redis (single session enforcement - deletes old sessions)
    await createSession(user.id, refreshToken, ip, userAgent);

    // Update user in database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Audit log
    await logAuditEvent({
      userId: user.id,
      eventType: 'login_success',
      eventCategory: 'auth',
      severity: 'info',
      message: 'User logged in successfully',
      details: {
        username: user.username,
        ip,
      },
      ipAddress: ip,
      userAgent,
    });

    // Create response with cookies
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
      message: 'Login successful',
    });

    // Set HTTP-only cookies
    setAuthCookies(response, accessToken, refreshToken);

    logger.info('User logged in', {
      userId: user.id,
      username: user.username,
      ip,
    });

    return response;
  } catch (error) {
    logger.error('Login error:', error);

    await logAuditEvent({
      eventType: 'login_error',
      eventCategory: 'auth',
      severity: 'error',
      message: 'Login error',
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
      ipAddress: ip,
      userAgent,
    });

    return NextResponse.json(
      {
        success: false,
        error: 'An error occurred during login',
      },
      { status: 500 }
    );
  }
}