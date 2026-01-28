/**
 * Rate Limiting System
 * 
 * In-memory rate limiting with Redis-ready architecture.
 * Prevents abuse by limiting requests per IP and email.
 */

import logger from '@/lib/logger';

// Rate limit configuration
const RATE_LIMITS = {
  REGISTRATION_PER_IP: {
    max: 5,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  REGISTRATION_PER_EMAIL: {
    max: 3,
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
  },
  VERIFICATION_ATTEMPTS: {
    max: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
};

// In-memory storage (will be replaced with Redis in production)
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Clean up expired entries periodically
 */
function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

/**
 * Check rate limit for a given key
 * 
 * @param key - Unique identifier (e.g., "reg:ip:192.168.1.1")
 * @param max - Maximum attempts allowed
 * @param windowMs - Time window in milliseconds
 * @returns Object with allowed status and remaining count
 */
function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // No previous entry - allow and create new
  if (!entry) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    
    return {
      allowed: true,
      remaining: max - 1,
      resetAt: now + windowMs,
    };
  }

  // Entry expired - reset
  if (entry.resetAt < now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    
    return {
      allowed: true,
      remaining: max - 1,
      resetAt: now + windowMs,
    };
  }

  // Entry exists and not expired - check limit
  if (entry.count >= max) {
    logger.warn('Rate limit exceeded', { key, count: entry.count, max });
    
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  // Increment counter
  entry.count++;
  
  return {
    allowed: true,
    remaining: max - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Check registration rate limit for IP address
 * 
 * @param ip - IP address
 * @returns Rate limit result
 */
export function checkRegistrationRateLimitByIP(ip: string) {
  const key = `reg:ip:${ip}`;
  return checkRateLimit(
    key,
    RATE_LIMITS.REGISTRATION_PER_IP.max,
    RATE_LIMITS.REGISTRATION_PER_IP.windowMs
  );
}

/**
 * Check registration rate limit for email
 * 
 * @param email - Email address
 * @returns Rate limit result
 */
export function checkRegistrationRateLimitByEmail(email: string) {
  const key = `reg:email:${email.toLowerCase()}`;
  return checkRateLimit(
    key,
    RATE_LIMITS.REGISTRATION_PER_EMAIL.max,
    RATE_LIMITS.REGISTRATION_PER_EMAIL.windowMs
  );
}

/**
 * Check verification attempt rate limit
 * 
 * @param ip - IP address
 * @returns Rate limit result
 */
export function checkVerificationRateLimit(ip: string) {
  const key = `verify:ip:${ip}`;
  return checkRateLimit(
    key,
    RATE_LIMITS.VERIFICATION_ATTEMPTS.max,
    RATE_LIMITS.VERIFICATION_ATTEMPTS.windowMs
  );
}

/**
 * Reset rate limit for a key (admin function)
 * 
 * @param key - Rate limit key
 */
export function resetRateLimit(key: string) {
  rateLimitStore.delete(key);
  logger.info('Rate limit reset', { key });
}

/**
 * Get rate limit stats (admin function)
 */
export function getRateLimitStats() {
  return {
    totalKeys: rateLimitStore.size,
    limits: RATE_LIMITS,
  };
}

/**
 * Format time remaining for user-friendly error messages
 * 
 * @param resetAt - Reset timestamp
 * @returns Human-readable time string
 */
export function formatTimeRemaining(resetAt: number): string {
  const now = Date.now();
  const remaining = resetAt - now;
  
  if (remaining <= 0) return '0 seconds';
  
  const minutes = Math.ceil(remaining / (60 * 1000));
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  
  return `${minutes}m`;
}