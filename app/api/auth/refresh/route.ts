/**
 * HARDENED Token Refresh API Endpoint
 * 
 * POST /api/auth/refresh
 * 
 * Refreshes access token using refresh token.
 * Implements rotating refresh tokens for security.
 * 
 * Security features:
 * - Rotating refresh tokens (old token invalidated)
 * - Strict IP binding verification
 * - Session validation in Redis
 * - Rate limiting (20 requests/IP/hour)
 * - Comprehensive audit logging
 * - User status checks (active, not locked)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { verifyRefreshToken, generateTokenPair } from '@/lib/auth/jwt';
import { getRefreshToken, setAuthCookies } from '@/lib/auth/cookies';
import { getSession, deleteSession, createSession } from '@/lib/redis/session-store';
import { isValidIP } from '@/lib/utils/validation-hardened';
import { apiResponse, apiError, getClientIp, getUserAgent } from '@/lib/utils';
import { auditLog } from '@/lib/logger/audit';
import logger from '@/lib/logger';

/**
 * Rate limiting for token refresh
 */
const refreshAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_REFRESH_ATTEMPTS = 20; // Higher limit for legitimate use
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

/**
 * Check rate limit for refresh
 */
function checkRefreshRateLimit(ip: string): { allowed: boolean; resetAt: number } {
  const now = Date.now();
  const attempt = refreshAttempts.get(ip);

  if (!attempt || now >= attempt.resetAt) {
    refreshAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, resetAt: now + RATE_LIMIT_WINDOW };
  }

  if (attempt.count >= MAX_REFRESH_ATTEMPTS) {
    return { allowed: false, resetAt: attempt.resetAt };
  }

  attempt.count++;
  return { allowed: true, resetAt: attempt.resetAt };
}

/**
 * Format time remaining
 */
function formatTimeRemaining(resetAt: number): string {
  const minutes = Math.ceil((resetAt - Date.now()) / 60000);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

/**
 * Normalize IP address
 */
function normalizeIp(ip: string): string {
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    return '127.0.0.1';
  }
  return ip;
}

/**
 * Safe audit log wrapper
 */
async function safeAuditLog(data: Parameters<typeof auditLog>[0]) {
  try {
    await auditLog(data);
  } catch (error) {
    logger.error('Audit log failed (non-blocking):', error);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const clientIp = normalizeIp(getClientIp(request));
  const userAgent = getUserAgent(request);

  // Validate IP format
  if (!isValidIP(clientIp)) {
    logger.warn('Invalid IP address format', { ip: clientIp });
    return apiError('Invalid request', 400);
  }

  try {
    // ============================================
    // STEP 1: Rate Limiting
    // ============================================
    const rateLimit = checkRefreshRateLimit(clientIp);
    
    if (!rateLimit.allowed) {
      const timeRemaining = formatTimeRemaining(rateLimit.resetAt);
      
      await safeAuditLog({
        eventType: 'refresh_rate_limited',
        eventCategory: 'auth',
        severity: 'warning',
        message: `Token refresh rate limit exceeded from IP: ${clientIp}`,
        details: { reason: 'rate_limit', resetIn: timeRemaining },
        ipAddress: clientIp,
        userAgent,
      });
      
      logger.warn('Refresh rate limit exceeded', { ip: clientIp });
      
      return apiError(
        `Too many refresh attempts. Please try again in ${timeRemaining}.`,
        429
      );
    }

    // ============================================
    // STEP 2: Extract Refresh Token
    // ============================================
    const oldRefreshToken = getRefreshToken(request);

    if (!oldRefreshToken) {
      await safeAuditLog({
        eventType: 'refresh_no_token',
        eventCategory: 'auth',
        severity: 'warning',
        message: 'Refresh attempt without token',
        ipAddress: clientIp,
        userAgent,
      });

      return apiError('No refresh token provided', 401);
    }

    // ============================================
    // STEP 3: Verify Refresh Token (JWT)
    // ============================================
    let tokenPayload;
    try {
      tokenPayload = verifyRefreshToken(oldRefreshToken);
    } catch (error) {
      await safeAuditLog({
        eventType: 'refresh_invalid_token',
        eventCategory: 'auth',
        severity: 'warning',
        message: 'Invalid refresh token',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        ipAddress: clientIp,
        userAgent,
      });

      logger.debug('Invalid refresh token', { error });

      return apiError('Invalid or expired refresh token', 401);
    }

    const userId = tokenPayload.userId;

    // ============================================
    // STEP 4: Validate Session in Redis
    // ============================================
    const session = await getSession(oldRefreshToken);
    
    if (!session) {
      await safeAuditLog({
        userId,
        eventType: 'refresh_session_not_found',
        eventCategory: 'auth',
        severity: 'warning',
        message: 'Session not found in Redis',
        ipAddress: clientIp,
        userAgent,
      });

      logger.warn('Session not found', { userId });

      return apiError('Session not found or expired', 401);
    }

    // Verify session belongs to user
    if (session.userId !== userId) {
      logger.error('Session user mismatch', {
        tokenUserId: userId,
        sessionUserId: session.userId,
      });

      return apiError('Invalid session', 401);
    }

    // ============================================
    // STEP 5: Strict IP Binding Verification
    // ============================================
    const sessionIp = normalizeIp(session.ip);
    
    if (clientIp !== sessionIp) {
      await safeAuditLog({
        userId,
        eventType: 'refresh_ip_mismatch',
        eventCategory: 'auth',
        severity: 'warning',
        message: 'IP mismatch on token refresh - possible token theft',
        details: {
          sessionIp,
          requestIp: clientIp,
        },
        ipAddress: clientIp,
        userAgent,
      });

      logger.warn('IP mismatch on refresh', {
        userId,
        sessionIp,
        requestIp: clientIp,
      });

      return apiError('IP address mismatch - please login again', 401);
    }

    // ============================================
    // STEP 6: Get User & Check Status
    // ============================================
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        isActive: true,
        isLocked: true,
        lockedUntil: true,
        emailVerified: true,
        totpVerified: true,
      },
    });

    if (!user) {
      logger.error('User not found during refresh', { userId });
      return apiError('User not found', 404);
    }

    // Check account locked
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      await safeAuditLog({
        userId: user.id,
        eventType: 'refresh_account_locked',
        eventCategory: 'auth',
        severity: 'warning',
        message: `Refresh attempt on locked account: ${user.username}`,
        ipAddress: clientIp,
        userAgent,
      });

      return apiError('Account is locked', 403);
    }

    // Check account active
    if (!user.isActive) {
      await safeAuditLog({
        userId: user.id,
        eventType: 'refresh_account_inactive',
        eventCategory: 'auth',
        severity: 'warning',
        message: `Refresh attempt on inactive account: ${user.username}`,
        ipAddress: clientIp,
        userAgent,
      });

      return apiError('Account is not active', 403);
    }

    // Check email verified
    if (!user.emailVerified) {
      return apiError('Email not verified', 403);
    }

    // Check TOTP verified
    if (!user.totpVerified) {
      return apiError('TOTP not verified', 403);
    }

    // ============================================
    // STEP 7: Generate New Token Pair (Rotating)
    // ============================================
    const { accessToken, refreshToken, refreshTokenId } = generateTokenPair(userId);

    // ============================================
    // STEP 8: Update Redis Session
    // ============================================
    // Delete old session
    await deleteSession(oldRefreshToken);

    // Create new session with new refresh token
    await createSession(userId, refreshToken, clientIp, userAgent);

    // ============================================
    // STEP 9: Audit Logging
    // ============================================
    await safeAuditLog({
      userId: user.id,
      eventType: 'token_refreshed',
      eventCategory: 'auth',
      severity: 'info',
      message: `Access token refreshed for user: ${user.username}`,
      details: {
        username: user.username,
        processingTime: Date.now() - startTime,
      },
      ipAddress: clientIp,
      userAgent,
    });

    logger.info('Token refreshed successfully', {
      userId: user.id,
      username: user.username,
      ip: clientIp,
    });

    // ============================================
    // STEP 10: Set New Cookies & Return
    // ============================================
    const response = NextResponse.json(
      apiResponse({
        success: true,
        message: 'Token refreshed successfully',
      })
    );

    // Set new auth cookies
    setAuthCookies(response, accessToken, refreshToken);

    return response;

  } catch (error) {
    logger.error('Token refresh error:', error);

    await safeAuditLog({
      eventType: 'refresh_error',
      eventCategory: 'auth',
      severity: 'error',
      message: 'Token refresh error',
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
      ipAddress: clientIp,
      userAgent,
    });

    return apiError('Token refresh failed. Please login again.', 500);
  }
}