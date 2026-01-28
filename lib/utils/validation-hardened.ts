/**
 * Hardened Validation System
 * 
 * Security-focused validation with:
 * - Username normalization and homograph protection
 * - Reserved username blocking
 * - Email plus addressing handling
 * - Disposable email domain blocking (optional)
 */

import { z } from 'zod';

/**
 * Reserved usernames that cannot be registered
 */
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'system', 'sys',
  'api', 'support', 'help', 'security', 'abuse',
  'postmaster', 'webmaster', 'hostmaster', 'info',
  'noreply', 'no-reply', 'mailer-daemon', 'null',
  'billing', 'sales', 'marketing', 'legal', 'privacy',
  'moderator', 'mod', 'operator', 'shellvault',
  'official', 'verified', 'staff', 'team', 'bot',
]);

/**
 * Known disposable email domains (subset - expand in production)
 */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'tempmail.com', 'temp-mail.org', 'guerrillamail.com',
  '10minutemail.com', 'throwaway.email', 'mailinator.com',
  'maildrop.cc', 'trashmail.com', 'yopmail.com',
  'getnada.com', 'temp-mail.io', 'mintemail.com',
]);

/**
 * Normalize username to lowercase and validate ASCII-only
 * Prevents homograph attacks and case sensitivity issues
 * 
 * @param username - Raw username input
 * @returns Normalized username or throws error
 */
export function normalizeUsername(username: string): string {
  const normalized = username.toLowerCase().trim();
  
  // Check if ASCII-only (prevents Unicode homograph attacks)
  // eslint-disable-next-line no-control-regex
  if (!/^[\x00-\x7F]+$/.test(normalized)) {
    throw new Error('Username must contain only ASCII characters');
  }
  
  return normalized;
}

/**
 * Check if username is reserved
 * 
 * @param username - Username to check (should be normalized)
 * @returns True if reserved
 */
export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username.toLowerCase());
}

/**
 * Normalize email address
 * - Convert to lowercase
 * - Optionally strip plus addressing (gmail style)
 * 
 * @param email - Raw email input
 * @param stripPlus - Whether to strip +tags (default: true)
 * @returns Normalized email
 */
export function normalizeEmail(email: string, stripPlus: boolean = true): string {
  let normalized = email.toLowerCase().trim();
  
  // Strip plus addressing: test+tag@gmail.com → test@gmail.com
  if (stripPlus) {
    const [localPart, domain] = normalized.split('@');
    if (localPart && domain) {
      const cleanLocal = localPart.split('+')[0];
      normalized = `${cleanLocal}@${domain}`;
    }
  }
  
  return normalized;
}

/**
 * Check if email domain is disposable
 * 
 * @param email - Email address
 * @returns True if disposable
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? DISPOSABLE_EMAIL_DOMAINS.has(domain) : false;
}

/**
 * Validate IP address format
 * 
 * @param ip - IP address string
 * @returns True if valid IPv4 or IPv6
 */
export function isValidIP(ip: string): boolean {
  // Allow 'unknown' for proxied requests
  if (ip === 'unknown') return true;
  
  // Allow common localhost values
  if (ip === 'localhost' || ip === '127.0.0.1' || ip === '::1') return true;
  
  // IPv4 regex
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  
  // IPv6 regex (comprehensive)
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(::)?([0-9a-fA-F]{1,4}:){0,6}(::)?([0-9a-fA-F]{1,4})?|::ffff:[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})$/i;
  
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}
/**
 * Hardened Registration Schema
 */
export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must not exceed 50 characters')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Username can only contain letters, numbers, hyphens, and underscores'
    )
    .transform(normalizeUsername)
    .refine(
      (username) => !isReservedUsername(username),
      'This username is reserved and cannot be used'
    ),
  
  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email must not exceed 255 characters')
    .transform((email) => normalizeEmail(email, true))
    .refine(
      (email) => !isDisposableEmail(email),
      'Disposable email addresses are not allowed'
    ),
});

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Email Verification Schema
 */
export const verifyEmailSchema = z.object({
  token: z
    .string()
    .length(64, 'Invalid verification token')
    .regex(/^[a-f0-9]{64}$/, 'Invalid token format'),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/**
 * Resend Verification Email Schema
 */
export const resendVerificationSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .transform((email) => normalizeEmail(email, true)),
});

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

/**
 * Format Zod validation errors for API responses
 * 
 * @param error - Zod validation error
 * @returns Formatted error message
 */
export function formatValidationError(error: z.ZodError): string {
  const errors = error.issues.map((err: z.ZodIssue) => {
    const field = err.path.join('.');
    return `${field}: ${err.message}`;
  });
  
  return errors.join('; ');
}

/**
 * Add a reserved username (admin function)
 * 
 * @param username - Username to reserve
 */
export function addReservedUsername(username: string) {
  RESERVED_USERNAMES.add(username.toLowerCase());
}

/**
 * Add a disposable email domain (admin function)
 * 
 * @param domain - Domain to block
 */
export function addDisposableEmailDomain(domain: string) {
  DISPOSABLE_EMAIL_DOMAINS.add(domain.toLowerCase());
}