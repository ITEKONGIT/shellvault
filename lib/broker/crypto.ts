// lib/broker/crypto.ts
// ✅ PHASE 1 FIX: Replaced HMAC with AES-256-GCM encryption

import crypto from 'crypto';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;       // 256 bits
const IV_LENGTH = 12;        // 96 bits (recommended for GCM)
const AUTH_TAG_LENGTH = 16;  // 128 bits
const SALT = 'shellvault-2026-salt'; // Static salt for key derivation

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// KEY DERIVATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Derive a 256-bit encryption key from User UUID
 * Uses PBKDF2 with 100,000 iterations for security
 */
function deriveKey(userUuid: string): Buffer {
  return crypto.pbkdf2Sync(
    userUuid,           // Password (User UUID)
    SALT,               // Salt
    100000,             // Iterations (100k is secure)
    KEY_LENGTH,         // Key length (32 bytes = 256 bits)
    'sha256'            // Hash algorithm
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ENCRYPTION / DECRYPTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Encrypt data using AES-256-GCM
 * 
 * @param data - Data to encrypt (will be JSON stringified)
 * @param userUuid - User UUID (used to derive encryption key)
 * @returns Base64-encoded encrypted string (IV + ciphertext + auth tag)
 */
export function encrypt(data: any, userUuid: string): string {
  try {
    // Derive encryption key from User UUID
    const key = deriveKey(userUuid);
    
    // Generate random IV (Initialization Vector)
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt data
    const plaintext = JSON.stringify(data);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    
    // Get authentication tag
    const authTag = cipher.getAuthTag();
    
    // Combine: IV + encrypted data + auth tag
    const combined = Buffer.concat([iv, encrypted, authTag]);
    
    // Return as base64
    return combined.toString('base64');
    
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypt data using AES-256-GCM
 * 
 * @param encryptedData - Base64-encoded encrypted string
 * @param userUuid - User UUID (used to derive decryption key)
 * @returns Decrypted data (parsed JSON)
 */
export function decrypt(encryptedData: string, userUuid: string): any | null {
  try {
    // Derive decryption key from User UUID
    const key = deriveKey(userUuid);
    
    // Decode from base64
    const combined = Buffer.from(encryptedData, 'base64');
    
    // Extract components
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(-AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH, -AUTH_TAG_LENGTH);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt data
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    // Parse JSON and return
    return JSON.parse(decrypted.toString('utf8'));
    
  } catch (error) {
    // Return null on decryption failure (wrong key, tampered data, etc.)
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTILITY FUNCTIONS (unchanged)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Generate random nonce (64 characters hex)
 */
export function generateNonce(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate session key (64 characters hex)
 */
export function generateSessionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash data with SHA-256
 */
export function hash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BACKWARD COMPATIBILITY (for old HMAC format)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Detect if data is in old HMAC format
 */
function isOldHMACFormat(data: any): data is { payload: string; signature: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.payload === 'string' &&
    typeof data.signature === 'string'
  );
}

/**
 * Decrypt old HMAC format (for migration period)
 * Remove this after all agents are upgraded
 */
export function decryptLegacy(encrypted: { payload: string; signature: string }, userUuid: string): any | null {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', userUuid)
      .update(encrypted.payload)
      .digest('hex');

    if (expectedSignature !== encrypted.signature) {
      return null;
    }

    return JSON.parse(encrypted.payload);
  } catch {
    return null;
  }
}

/**
 * Universal decrypt - handles both new AES-GCM and old HMAC formats
 * Use this during migration period
 */
export function decryptUniversal(encryptedData: any, userUuid: string): any | null {
  // If it's old HMAC format
  if (isOldHMACFormat(encryptedData)) {
    return decryptLegacy(encryptedData, userUuid);
  }
  
  // If it's a string, it's new AES-GCM format
  if (typeof encryptedData === 'string') {
    return decrypt(encryptedData, userUuid);
  }
  
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXPORTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default {
  encrypt,
  decrypt,
  decryptUniversal,
  decryptLegacy,
  generateNonce,
  generateSessionKey,
  hash,
  deriveKey,
};