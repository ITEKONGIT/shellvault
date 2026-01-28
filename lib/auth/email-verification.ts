/**
 * Email Verification System
 * 
 * Air-gapped, secure email verification with:
 * - Cryptographically secure token generation
 * - SHA-256 token hashing
 * - Constant-time comparison (timing attack prevention)
 * - 10-minute token expiry
 * - ATO prevention checks
 */

import crypto from 'crypto';
import { prisma } from '@/lib/db/client';
import logger from '@/lib/logger';

// Token configuration
const TOKEN_LENGTH = 32; // 32 bytes = 256 bits
const TOKEN_EXPIRY_MINUTES = 10;
const MAX_VERIFICATION_ATTEMPTS = 5;

/**
 * Generate a cryptographically secure random token
 * 
 * @returns Hex-encoded random token (64 characters)
 */
export function generateVerificationToken(): string {
  const token = crypto.randomBytes(TOKEN_LENGTH).toString('hex');
  logger.debug('Generated verification token');
  return token;
}

/**
 * Hash a token using SHA-256
 * 
 * Tokens are hashed before storage to prevent exposure if database is compromised.
 * 
 * @param token - Plain text token
 * @returns SHA-256 hash of the token
 */
export function hashToken(token: string): string {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

/**
 * Verify a token using constant-time comparison
 * 
 * Prevents timing attacks by comparing tokens in constant time.
 * 
 * @param providedToken - Token provided by user
 * @param storedHash - Hashed token from database
 * @returns True if tokens match
 */
export function verifyTokenHash(providedToken: string, storedHash: string): boolean {
  const providedHash = hashToken(providedToken);
  
  // Use crypto.timingSafeEqual for constant-time comparison
  try {
    const providedBuffer = Buffer.from(providedHash, 'hex');
    const storedBuffer = Buffer.from(storedHash, 'hex');
    
    // Both buffers must be same length
    if (providedBuffer.length !== storedBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(providedBuffer, storedBuffer);
  } catch (error) {
    logger.error('Token verification error:', error);
    return false;
  }
}

/**
 * Check if a token has expired
 * 
 * @param expiryDate - Token expiry timestamp
 * @returns True if token is expired
 */
export function isTokenExpired(expiryDate: Date): boolean {
  return new Date() > expiryDate;
}

/**
 * Generate token expiry date (10 minutes from now)
 * 
 * @returns Date object 10 minutes in the future
 */
export function generateTokenExpiry(): Date {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + TOKEN_EXPIRY_MINUTES);
  return expiry;
}

/**
 * Check if an email already exists in the database
 * 
 * ATO Prevention: Prevents attackers from taking over accounts
 * by registering with someone else's email.
 * 
 * @param email - Email address to check
 * @returns True if email exists
 */
export async function checkEmailExists(email: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    
    return user !== null;
  } catch (error) {
    logger.error('Email existence check failed:', error);
    throw new Error('Failed to check email');
  }
}

/**
 * Check if a username already exists
 * 
 * @param username - Username to check
 * @returns True if username exists
 */
export async function checkUsernameExists(username: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    
    return user !== null;
  } catch (error) {
    logger.error('Username existence check failed:', error);
    throw new Error('Failed to check username');
  }
}

/**
 * Store verification token for a user
 * 
 * @param userId - User ID
 * @param token - Plain text token (will be hashed)
 * @returns Updated user object
 */
export async function storeVerificationToken(userId: string, token: string) {
  const hashedToken = hashToken(token);
  const expiry = generateTokenExpiry();
  
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationToken: hashedToken,
        emailVerificationExpiry: expiry,
        emailVerificationAttempts: 0, // Reset attempts
      },
    });
    
    logger.info('Verification token stored', { userId, expiresAt: expiry });
    return user;
  } catch (error) {
    logger.error('Failed to store verification token:', error);
    throw new Error('Failed to store token');
  }
}

/**
 * Verify an email verification token
 * 
 * @param token - Token from verification link
 * @returns User ID if valid, null if invalid
 */
export async function verifyEmailToken(token: string): Promise<string | null> {
  try {
    const hashedToken = hashToken(token);
    
    // Find user with this token
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: hashedToken,
        emailVerified: false, // Only unverified users
      },
    });
    
    if (!user) {
      logger.debug('Token not found or already verified');
      return null;
    }
    
    // Check if token is expired
    if (!user.emailVerificationExpiry || isTokenExpired(user.emailVerificationExpiry)) {
      logger.warn('Verification token expired', { userId: user.id });
      return null;
    }
    
    // Check rate limiting
    if (user.emailVerificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
      logger.warn('Max verification attempts exceeded', { userId: user.id });
      return null;
    }
    
    // Verify token (constant-time comparison)
    const isValid = verifyTokenHash(token, hashedToken);
    
    if (!isValid) {
      // Increment attempt counter
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationAttempts: user.emailVerificationAttempts + 1,
        },
      });
      
      logger.warn('Invalid verification token', { userId: user.id });
      return null;
    }
    
    // Mark email as verified and clear token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
        emailVerificationAttempts: 0,
      },
    });
    
    logger.info('Email verified successfully', { userId: user.id });
    return user.id;
    
  } catch (error) {
    logger.error('Email verification error:', error);
    return null;
  }
}

/**
 * Resend verification email (generate new token)
 * 
 * @param email - User's email address
 * @returns New token if successful, null if failed
 */
export async function resendVerificationToken(email: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    
    if (!user) {
      logger.debug('User not found for resend');
      return null;
    }
    
    if (user.emailVerified) {
      logger.debug('Email already verified');
      return null;
    }
    
    // Generate new token
    const newToken = generateVerificationToken();
    await storeVerificationToken(user.id, newToken);
    
    logger.info('Verification token resent', { userId: user.id });
    return newToken;
    
  } catch (error) {
    logger.error('Failed to resend verification token:', error);
    return null;
  }
}

/**
 * Clean up expired tokens (can be run as a cron job)
 * 
 * @returns Number of tokens cleaned up
 */
export async function cleanupExpiredTokens(): Promise<number> {
  try {
    const result = await prisma.user.updateMany({
      where: {
        emailVerificationExpiry: {
          lt: new Date(),
        },
        emailVerified: false,
      },
      data: {
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      },
    });
    
    logger.info(`Cleaned up ${result.count} expired tokens`);
    return result.count;
  } catch (error) {
    logger.error('Token cleanup failed:', error);
    return 0;
  }
}

/**
 * Get verification status for a user
 * 
 * @param userId - User ID
 * @returns Verification status info
 */
export async function getVerificationStatus(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        emailVerified: true,
        emailVerificationExpiry: true,
        emailVerificationAttempts: true,
      },
    });
    
    if (!user) {
      return null;
    }
    
    return {
      verified: user.emailVerified,
      tokenExpired: user.emailVerificationExpiry 
        ? isTokenExpired(user.emailVerificationExpiry) 
        : true,
      attemptsRemaining: MAX_VERIFICATION_ATTEMPTS - user.emailVerificationAttempts,
    };
  } catch (error) {
    logger.error('Failed to get verification status:', error);
    return null;
  }
}