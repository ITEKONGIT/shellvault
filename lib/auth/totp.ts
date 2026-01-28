/**
 * TOTP (Time-Based One-Time Password) Utility
 * 
 * Handles TOTP secret generation, QR code creation, and code verification.
 * Compatible with Google Authenticator, Authy, and other TOTP apps.
 * 
 * Using speakeasy for better Next.js compatibility.
 */

import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import logger from '@/lib/logger';

// TOTP configuration
const TOTP_CONFIG = {
  name: 'ShellVault',
  length: 6, // 6-digit codes
  window: 1, // Allow 1 window before/after (60 seconds total)
};

/**
 * Generate a cryptographically secure TOTP secret
 * 
 * @returns Base32-encoded secret (compatible with authenticator apps)
 */
export function generateTOTPSecret(): string {
  const secret = speakeasy.generateSecret({
    name: TOTP_CONFIG.name,
    length: 32, // 32 characters = 160 bits
  });
  
  logger.debug('TOTP secret generated');
  return secret.base32;
}

/**
 * Generate TOTP QR code as data URL
 * 
 * @param username - User's username
 * @param secret - TOTP secret (base32)
 * @param issuer - Service name (e.g., "ShellVault")
 * @returns Promise<string> - QR code as data URL (base64 PNG)
 */
export async function generateTOTPQRCode(
  username: string,
  secret: string,
  issuer: string = 'ShellVault'
): Promise<string> {
  try {
    // Generate OTP Auth URL
    // Format: otpauth://totp/Issuer:Username?secret=SECRET&issuer=Issuer
    const otpAuthUrl = speakeasy.otpauthURL({
      secret: secret,
      label: username,
      issuer: issuer,
      encoding: 'base32',
    });
    
    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl, {
      errorCorrectionLevel: 'H', // High error correction
      width: 300, // 300x300 pixels
      margin: 2,
    });
    
    logger.debug('TOTP QR code generated', { username, issuer });
    return qrCodeDataUrl;
    
  } catch (error) {
    logger.error('Failed to generate TOTP QR code:', error);
    throw new Error('Failed to generate QR code');
  }
}

/**
 * Verify a TOTP code against a secret
 * 
 * @param code - 6-digit code from authenticator app
 * @param secret - User's TOTP secret
 * @returns boolean - True if code is valid
 */
export function verifyTOTP(code: string, secret: string): boolean {
  try {
    const isValid = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: code,
      window: TOTP_CONFIG.window,
    });
    
    if (isValid) {
      logger.debug('TOTP code verified successfully');
    } else {
      logger.debug('TOTP code verification failed');
    }
    
    return isValid;
    
  } catch (error) {
    logger.error('TOTP verification error:', error);
    return false;
  }
}

/**
 * Generate backup codes for account recovery
 * 
 * Backup codes are one-time use codes that can be used if TOTP device is lost.
 * 
 * @param count - Number of backup codes to generate (default: 10)
 * @returns string[] - Array of backup codes
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  
  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric code
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    
    // Format as XXXX-XXXX for readability
    const formattedCode = `${code.substring(0, 4)}-${code.substring(4, 8)}`;
    codes.push(formattedCode);
  }
  
  logger.debug(`Generated ${count} backup codes`);
  return codes;
}

/**
 * Hash a backup code for storage
 * 
 * Backup codes should be hashed before storing in database,
 * similar to passwords.
 * 
 * @param code - Backup code to hash
 * @returns string - SHA-256 hash of the code
 */
export function hashBackupCode(code: string): string {
  return crypto
    .createHash('sha256')
    .update(code.toUpperCase()) // Normalize to uppercase
    .digest('hex');
}

/**
 * Verify a backup code against stored hash
 * 
 * @param providedCode - Code provided by user
 * @param storedHash - Hashed code from database
 * @returns boolean - True if code matches
 */
export function verifyBackupCode(providedCode: string, storedHash: string): boolean {
  const providedHash = hashBackupCode(providedCode);
  
  try {
    const providedBuffer = Buffer.from(providedHash, 'hex');
    const storedBuffer = Buffer.from(storedHash, 'hex');
    
    if (providedBuffer.length !== storedBuffer.length) {
      return false;
    }
    
    // Constant-time comparison
    return crypto.timingSafeEqual(providedBuffer, storedBuffer);
  } catch (error) {
    logger.error('Backup code verification error:', error);
    return false;
  }
}

/**
 * Get current TOTP code (for testing/debugging only)
 * 
 * NEVER expose this to production API endpoints!
 * Only use for internal testing.
 * 
 * @param secret - TOTP secret
 * @returns string - Current 6-digit code
 */
export function getCurrentTOTPCode(secret: string): string {
  return speakeasy.totp({
    secret: secret,
    encoding: 'base32',
  });
}

/**
 * Get time remaining until current code expires
 * 
 * @returns number - Seconds remaining
 */
export function getTimeRemaining(): number {
  const now = Date.now();
  const period = 30 * 1000; // 30 seconds in ms
  const remaining = period - (now % period);
  return Math.floor(remaining / 1000);
}