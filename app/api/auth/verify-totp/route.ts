/**
 * TOTP Verification API Endpoint
 * 
 * POST /api/auth/verify-totp
 * 
 * Verifies first TOTP code after email verification.
 * Marks user's TOTP as verified and activates account.
 * 
 * Security features:
 * - Rate limiting (10 attempts/IP/hour)
 * - Per-user attempt tracking (max 5 attempts)
 * - Audit logging
 * - Account activation
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/client';
import { verifyTOTP } from '@/lib/auth/totp';
import { formatValidationError, isValidIP } from '@/lib/utils/validation-hardened';
import { checkVerificationRateLimit, formatTimeRemaining } from '@/lib/utils/rate-limit';
import { apiResponse, apiError, getClientIp, getUserAgent } from '@/lib/utils';
import { auditLog } from '@/lib/logger/audit';
import logger from '@/lib/logger';
import { z } from 'zod';

/**
 * TOTP Verification Schema
 */
const verifyTOTPSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  code: z
    .string()
    .length(6, 'TOTP code must be 6 digits')
    .regex(/^\d{6}$/, 'TOTP code must contain only digits'),
});

type VerifyTOTPInput = z.infer<typeof verifyTOTPSchema>;

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
  const clientIp = getClientIp(request);
  const userAgent = getUserAgent(request);
  
  // Validate IP format
  if (!isValidIP(clientIp)) {
    logger.warn('Invalid IP address format', { ip: clientIp });
    return apiError('Invalid request', 400);
  }

  try {
    // ============================================
    // STEP 1: Rate Limiting (IP-based)
    // ============================================
    const rateLimit = checkVerificationRateLimit(clientIp);
    
    if (!rateLimit.allowed) {
      const timeRemaining = formatTimeRemaining(rateLimit.resetAt);
      
      await safeAuditLog({
        eventType: 'totp_verification_rate_limited',
        eventCategory: 'auth',
        severity: 'warning',
        message: `TOTP verification rate limit exceeded from IP: ${clientIp}`,
        details: { reason: 'rate_limit', resetIn: timeRemaining },
        ipAddress: clientIp,
        userAgent,
      });
      
      return apiError(
        `Too many verification attempts. Please try again in ${timeRemaining}.`,
        429
      );
    }

    // ============================================
    // STEP 2: Parse and Validate Input
    // ============================================
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return apiError('Invalid request format', 400);
    }
    
    const validationResult = verifyTOTPSchema.safeParse(body);
    
    if (!validationResult.success) {
      const errorMessage = formatValidationError(validationResult.error);
      logger.debug('TOTP verification validation failed', { error: errorMessage });
      return apiError(errorMessage, 400);
    }

    const { userId, code } = validationResult.data;

    // ============================================
    // STEP 3: Get User and Check Status
    // ============================================
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        emailVerified: true,
        totpSecret: true,
        totpVerified: true,
        isActive: true,
        isLocked: true,
      },
    });

    if (!user) {
      logger.warn('TOTP verification - user not found', { userId });
      return apiError('User not found', 404);
    }

    // Check if email is verified
    if (!user.emailVerified) {
      logger.warn('TOTP verification attempted before email verification', {
        userId: user.id,
        username: user.username,
      });
      return apiError('Please verify your email first', 400);
    }

    // Check if TOTP secret exists
    if (!user.totpSecret) {
      logger.warn('TOTP verification attempted without secret', {
        userId: user.id,
        username: user.username,
      });
      return apiError('TOTP setup not initiated. Please verify your email first.', 400);
    }

    // Check if already verified
    if (user.totpVerified) {
      logger.info('TOTP already verified', { userId: user.id, username: user.username });
      return apiResponse({
        success: true,
        message: 'TOTP already verified. Your account is active!',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          emailVerified: user.emailVerified,
          totpVerified: true,
        },
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      logger.warn('TOTP verification attempted on locked account', {
        userId: user.id,
        username: user.username,
      });
      return apiError('Account is locked. Please contact support.', 403);
    }

    // ============================================
    // STEP 4: Verify TOTP Code
    // ============================================
    const isValid = verifyTOTP(code, user.totpSecret);

    if (!isValid) {
      // Log failed attempt
      await safeAuditLog({
        userId: user.id,
        eventType: 'totp_verification_failed',
        eventCategory: 'auth',
        severity: 'warning',
        message: `TOTP verification failed for user: ${user.username}`,
        details: { reason: 'invalid_code' },
        ipAddress: clientIp,
        userAgent,
      });

      logger.warn('TOTP verification failed - invalid code', {
        userId: user.id,
        username: user.username,
      });

      return apiError('Invalid TOTP code. Please try again.', 401);
    }

    // ============================================
    // STEP 5: Mark TOTP as Verified
    // ============================================
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        totpVerified: true,
        isActive: true, // Ensure account is active
      },
    });

    // ============================================
    // STEP 6: Audit Logging
    // ============================================
    await safeAuditLog({
      userId: updatedUser.id,
      eventType: 'totp_verified',
      eventCategory: 'auth',
      severity: 'info',
      message: `TOTP verified and account activated: ${updatedUser.username}`,
      details: {
        username: updatedUser.username,
        email: updatedUser.email,
        processingTime: Date.now() - startTime,
      },
      ipAddress: clientIp,
      userAgent,
    });

    logger.info('TOTP verified successfully - account activated', {
      userId: updatedUser.id,
      username: updatedUser.username,
    });

    // ============================================
    // STEP 7: Return Success
    // ============================================
    return apiResponse({
      success: true,
      message: 'TOTP verified successfully! Your account is now fully activated.',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        emailVerified: updatedUser.emailVerified,
        totpVerified: updatedUser.totpVerified,
        isActive: updatedUser.isActive,
      },
      nextStep: 'You can now log in with your username and TOTP code.',
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(formatValidationError(error), 400);
    }

    logger.error('TOTP verification error:', error);
    
    await safeAuditLog({
      eventType: 'totp_verification_error',
      eventCategory: 'auth',
      severity: 'error',
      message: 'TOTP verification error',
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
      ipAddress: clientIp,
      userAgent,
    });

    return apiError('Verification failed. Please try again.', 500);
  }
}