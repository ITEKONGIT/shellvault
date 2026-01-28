/**
 * Email Verification API Endpoint
 * 
 * POST /api/auth/verify-email
 * 
 * Verifies email with token and initiates TOTP setup.
 * 
 * Flow:
 * 1. Verify token (not expired, valid hash)
 * 2. Mark email as verified
 * 3. Generate TOTP secret
 * 4. Return TOTP QR code
 * 
 * Security features:
 * - Rate limiting (10 attempts/IP/hour)
 * - Constant-time token comparison
 * - One-time token use
 * - Comprehensive audit logging
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/client';
import {
  verifyEmailToken,
  getVerificationStatus,
} from '@/lib/auth/email-verification';
import {
  generateTOTPSecret,
  generateTOTPQRCode,
  generateBackupCodes,
} from '@/lib/auth/totp';
import {
  verifyEmailSchema,
  formatValidationError,
  isValidIP,
} from '@/lib/utils/validation-hardened';
import {
  checkVerificationRateLimit,
  formatTimeRemaining,
} from '@/lib/utils/rate-limit';
import { apiResponse, apiError, getClientIp, getUserAgent } from '@/lib/utils';
import { auditLog } from '@/lib/logger/audit';
import logger from '@/lib/logger';
import { z } from 'zod';

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
    // STEP 1: Rate Limiting
    // ============================================
    const rateLimit = checkVerificationRateLimit(clientIp);
    
    if (!rateLimit.allowed) {
      const timeRemaining = formatTimeRemaining(rateLimit.resetAt);
      
      await safeAuditLog({
        eventType: 'verification_rate_limited',
        eventCategory: 'auth',
        severity: 'warning',
        message: `Email verification rate limit exceeded from IP: ${clientIp}`,
        details: { reason: 'rate_limit', resetIn: timeRemaining },
        ipAddress: clientIp,
        userAgent,
      });
      
      logger.warn('Verification rate limit exceeded', { ip: clientIp });
      
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
      logger.debug('Invalid JSON in request body');
      return apiError('Invalid request format', 400);
    }
    
    const validationResult = verifyEmailSchema.safeParse(body);
    
    if (!validationResult.success) {
      const errorMessage = formatValidationError(validationResult.error);
      logger.debug('Verification validation failed', { error: errorMessage });
      return apiError(errorMessage, 400);
    }

    const { token } = validationResult.data;

    // ============================================
    // STEP 3: Verify Token
    // ============================================
    const userId = await verifyEmailToken(token);
    
    if (!userId) {
      await safeAuditLog({
        eventType: 'email_verification_failed',
        eventCategory: 'auth',
        severity: 'warning',
        message: 'Email verification failed - invalid or expired token',
        details: { reason: 'invalid_token' },
        ipAddress: clientIp,
        userAgent,
      });
      
      logger.warn('Email verification failed - invalid token');
      
      return apiError(
        'Invalid or expired verification token. Please request a new one.',
        400
      );
    }

    // ============================================
    // STEP 4: Get User & Generate TOTP
    // ============================================
    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Get user
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          emailVerified: true,
          totpSecret: true,
          totpVerified: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Check if already has TOTP set up
      if (user.totpSecret && user.totpVerified) {
        return {
          user,
          totpSecret: user.totpSecret,
          isNewSetup: false,
        };
      }

      // Generate new TOTP secret
      const totpSecret = generateTOTPSecret();
      const backupCodes = generateBackupCodes(10);

      // Update user with TOTP secret
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          totpSecret,
          totpVerified: false, // Will be verified in next step
          backupCodes,
        },
      });

      return {
        user: updatedUser,
        totpSecret,
        backupCodes,
        isNewSetup: true,
      };
    });

    // ============================================
    // STEP 5: Generate QR Code
    // ============================================
    const qrCode = await generateTOTPQRCode(
      result.user.username,
      result.totpSecret,
      'ShellVault'
    );

    // ============================================
    // STEP 6: Audit Logging
    // ============================================
    await safeAuditLog({
      userId: result.user.id,
      eventType: 'email_verified',
      eventCategory: 'auth',
      severity: 'info',
      message: `Email verified for user: ${result.user.username}`,
      details: {
        username: result.user.username,
        email: result.user.email,
        totpSetupInitiated: result.isNewSetup,
        processingTime: Date.now() - startTime,
      },
      ipAddress: clientIp,
      userAgent,
    });

    logger.info('Email verified and TOTP setup initiated', {
      userId: result.user.id,
      username: result.user.username,
      isNewSetup: result.isNewSetup,
    });

    // ============================================
    // STEP 7: Return Response
    // ============================================
    return apiResponse({
      success: true,
      message: 'Email verified successfully! Please set up 2FA to continue.',
      user: {
        id: result.user.id,
        username: result.user.username,
        email: result.user.email,
        emailVerified: true,
      },
      totp: {
        secret: result.totpSecret,
        qrCode: qrCode,
        backupCodes: result.backupCodes || [],
        isNewSetup: result.isNewSetup,
      },
      nextStep: 'Scan the QR code with your authenticator app, then verify your first TOTP code.',
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(formatValidationError(error), 400);
    }

    logger.error('Email verification error:', error);
    
    await safeAuditLog({
      eventType: 'email_verification_error',
      eventCategory: 'auth',
      severity: 'error',
      message: 'Email verification error',
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
      ipAddress: clientIp,
      userAgent,
    });

    return apiError('Verification failed. Please try again.', 500);
  }
}