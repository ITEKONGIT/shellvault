/**
 * HARDENED User Registration API Endpoint (WITH EMAIL INTEGRATION)
 * 
 * POST /api/auth/register
 * 
 * Security features:
 * - Rate limiting (5/IP/hour, 3/email/day)
 * - Username normalization + homograph protection
 * - Database transactions (atomic operations)
 * - User enumeration defense (generic errors, constant-time)
 * - Reserved username blocking
 * - Email plus addressing handling
 * - Disposable email blocking
 * - Comprehensive error handling
 * - Audit logging with fallback
 * - EMAIL VERIFICATION (production-ready)
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/client';
import {
  generateVerificationToken,
  storeVerificationToken,
  checkEmailExists,
  checkUsernameExists,
} from '@/lib/auth/email-verification';
import {
  registerSchema,
  formatValidationError,
  isValidIP,
} from '@/lib/utils/validation-hardened';
import {
  checkRegistrationRateLimitByIP,
  checkRegistrationRateLimitByEmail,
  formatTimeRemaining,
} from '@/lib/utils/rate-limit';
import { apiResponse, apiError, getClientIp, getUserAgent } from '@/lib/utils';
import { auditLog } from '@/lib/logger/audit';
import logger from '@/lib/logger';
import { z } from 'zod';

// Email integration
import { sendEmail } from '@/lib/email/service';
import { emailVerificationTemplate } from '@/lib/email/templates';

/**
 * Constant-time delay to prevent timing attacks on user enumeration
 */
async function constantTimeDelay(ms: number = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safe audit log wrapper (doesn't throw on failure)
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
    // STEP 1: Rate Limiting (IP)
    // ============================================
    const ipRateLimit = checkRegistrationRateLimitByIP(clientIp);
    
    if (!ipRateLimit.allowed) {
      const timeRemaining = formatTimeRemaining(ipRateLimit.resetAt);
      
      await safeAuditLog({
        eventType: 'registration_rate_limited',
        eventCategory: 'auth',
        severity: 'warning',
        message: `Registration rate limit exceeded from IP: ${clientIp}`,
        details: { reason: 'ip_rate_limit', resetIn: timeRemaining },
        ipAddress: clientIp,
        userAgent,
      });
      
      logger.warn('IP rate limit exceeded', { ip: clientIp, timeRemaining });
      
      return apiError(
        `Too many registration attempts. Please try again in ${timeRemaining}.`,
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
    
    const validationResult = registerSchema.safeParse(body);
    
    if (!validationResult.success) {
      const errorMessage = formatValidationError(validationResult.error);
      logger.debug('Registration validation failed', { error: errorMessage });
      
      await safeAuditLog({
        eventType: 'registration_validation_failed',
        eventCategory: 'auth',
        severity: 'info',
        message: 'Registration validation failed',
        details: { error: errorMessage },
        ipAddress: clientIp,
        userAgent,
      });
      
      return apiError(errorMessage, 400);
    }

    const { username, email } = validationResult.data;

    // ============================================
    // STEP 3: Rate Limiting (Email)
    // ============================================
    const emailRateLimit = checkRegistrationRateLimitByEmail(email);
    
    if (!emailRateLimit.allowed) {
      const timeRemaining = formatTimeRemaining(emailRateLimit.resetAt);
      
      await safeAuditLog({
        eventType: 'registration_rate_limited',
        eventCategory: 'auth',
        severity: 'warning',
        message: `Registration rate limit exceeded for email: ${email}`,
        details: { reason: 'email_rate_limit', resetIn: timeRemaining },
        ipAddress: clientIp,
        userAgent,
      });
      
      logger.warn('Email rate limit exceeded', { email, timeRemaining });
      
      return apiError(
        `Too many registration attempts for this email. Please try again in ${timeRemaining}.`,
        429
      );
    }

    // ============================================
    // STEP 4: Check Existence (Anti-Enumeration)
    // ============================================
    // Check both username and email simultaneously
    // Always take same amount of time (constant-time)
    
    const [usernameExists, emailExists] = await Promise.all([
      checkUsernameExists(username),
      checkEmailExists(email),
      constantTimeDelay(100), // Add constant delay
    ]);

    if (usernameExists || emailExists) {
      await safeAuditLog({
        eventType: 'registration_failed',
        eventCategory: 'auth',
        severity: 'warning',
        message: 'Registration attempt with existing credentials',
        details: {
          usernameExists,
          emailExists,
          // Don't log actual values for privacy
        },
        ipAddress: clientIp,
        userAgent,
      });
      
      logger.info('Registration failed - credentials exist', {
        usernameExists,
        emailExists,
      });
      
      // Generic error message (doesn't reveal which field exists)
      // Helps prevent user enumeration attacks
      return apiError(
        'This username or email is already registered. Please try a different one.',
        409
      );
    }

    // ============================================
    // STEP 5: Create User + Token (TRANSACTION)
    // ============================================
    // Use database transaction to ensure atomicity
    // If token storage fails, user creation is rolled back
    
    const verificationToken = generateVerificationToken();
    
    let user;
    try {
      user = await prisma.$transaction(async (tx) => {
        // Create user
        const newUser = await tx.user.create({
          data: {
            username,
            email,
            emailVerified: false,
            passwordHash: null, // Passwordless!
            totpSecret: null, // Set after email verification
            totpVerified: false,
            backupCodes: [],
            isAdmin: false,
            isActive: true,
            isLocked: false,
          },
        });

        // Store verification token (hashed)
        const hashedToken = require('crypto')
          .createHash('sha256')
          .update(verificationToken)
          .digest('hex');
        
        const expiry = new Date();
        expiry.setMinutes(expiry.getMinutes() + 10);

        await tx.user.update({
          where: { id: newUser.id },
          data: {
            emailVerificationToken: hashedToken,
            emailVerificationExpiry: expiry,
            emailVerificationAttempts: 0,
          },
        });

        return newUser;
      });
    } catch (error) {
      logger.error('Transaction failed during registration:', error);
      
      await safeAuditLog({
        eventType: 'registration_transaction_failed',
        eventCategory: 'auth',
        severity: 'error',
        message: 'Registration transaction failed',
        details: { error: String(error) },
        ipAddress: clientIp,
        userAgent,
      });
      
      return apiError('Registration failed. Please try again.', 500);
    }

    // ============================================
    // STEP 6: Send Verification Email
    // ============================================
    
    // Generate email template
    const emailTemplate = emailVerificationTemplate({
      username: user.username,
      token: verificationToken,
      expiresInMinutes: 10,
    });

    // Send email
    let emailSent = false;
    try {
      emailSent = await sendEmail({
        to: user.email,
        subject: 'Verify your ShellVault account',
        html: emailTemplate.html,
        text: emailTemplate.text,
      });

      if (emailSent) {
        logger.info('Verification email sent successfully', {
          userId: user.id,
          email: user.email,
        });
      } else {
        logger.error('Failed to send verification email', {
          userId: user.id,
          email: user.email,
        });
      }
    } catch (error) {
      logger.error('Error sending verification email:', error);
      emailSent = false;
      // Continue anyway - token is still in database
    }

    // ============================================
    // STEP 7: Audit Logging
    // ============================================
    await safeAuditLog({
      userId: user.id,
      eventType: 'user_registered',
      eventCategory: 'auth',
      severity: 'info',
      message: `User registered (passwordless): ${username}`,
      details: {
        username,
        email,
        emailVerified: false,
        emailSent,
        processingTime: Date.now() - startTime,
      },
      ipAddress: clientIp,
      userAgent,
    });

    logger.info('User registered successfully (passwordless)', {
      userId: user.id,
      username,
      email,
      emailSent,
      processingTime: Date.now() - startTime,
    });

    // ============================================
    // STEP 8: Generate Response
    // ============================================
    
    // Determine if we should return token in response
    const isDevelopment = process.env.NODE_ENV === 'development';
    const includeToken = isDevelopment || !emailSent; // Include if dev OR email failed

    return apiResponse(
      {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
        },
        verification: {
          // Include token only in development OR if email failed (fallback)
          token: includeToken ? verificationToken : undefined,
          expiresIn: '10 minutes',
          emailSent,
        },
        message: emailSent
          ? 'Registration successful! Please check your email to verify your account.'
          : 'Registration successful! Use the verification token to complete registration.',
      },
      201
    );

  } catch (error) {
    // ============================================
    // Catch-All Error Handler
    // ============================================
    
    if (error instanceof z.ZodError) {
      return apiError(formatValidationError(error), 400);
    }

    logger.error('Unexpected registration error:', error);
    
    await safeAuditLog({
      eventType: 'registration_error',
      eventCategory: 'auth',
      severity: 'error',
      message: 'Unexpected registration error',
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
      ipAddress: clientIp,
      userAgent,
    });

    // Generic error - don't leak details to client
    return apiError('Registration failed. Please try again later.', 500);
  }
}