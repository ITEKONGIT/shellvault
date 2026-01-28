/**
 * JWT Utilities
 * 
 * Minimal JWT implementation with strict security:
 * - Access tokens contain ONLY user ID (no username, no IP)
 * - Refresh tokens contain ONLY token ID + user ID
 * - IP binding enforced at Redis session level, not in JWT
 * - Maximum privacy - tokens reveal nothing about the user
 * 
 * Token Structure:
 * Access Token:  { sub: userId, iat, exp }
 * Refresh Token: { jti: tokenId, sub: userId, iat, exp }
 */

import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import logger from '@/lib/logger';

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET!;
const ACCESS_TOKEN_EXPIRY = '15m';  // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d';  // 7 days

/**
 * Validate JWT secret exists and is strong enough
 */
function validateJWTSecret() {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET not configured in environment');
  }
  
  if (JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
}

/**
 * Generate access token (minimal payload)
 * 
 * Contains ONLY:
 * - sub: User ID
 * - iat: Issued at
 * - exp: Expiry
 * 
 * IP binding is NOT in the token - it's enforced at Redis session level
 * 
 * @param userId - User UUID
 * @returns JWT access token
 */
export function generateAccessToken(userId: string): string {
  validateJWTSecret();
  
  const payload = {
    sub: userId,  // Subject (user ID only)
  };
  
  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
  
  logger.debug('Access token generated', {
    userId,
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
  
  return token;
}

/**
 * Generate refresh token (minimal payload)
 * 
 * Contains ONLY:
 * - jti: JWT ID (for revocation via Redis)
 * - sub: User ID
 * - iat: Issued at
 * - exp: Expiry
 * 
 * @param userId - User UUID
 * @returns Object with token and token ID
 */
export function generateRefreshToken(userId: string): {
  token: string;
  tokenId: string;
} {
  validateJWTSecret();
  
  // Generate unique token ID for revocation
  const tokenId = randomBytes(32).toString('hex');
  
  const payload = {
    jti: tokenId,  // JWT ID
    sub: userId,   // Subject (user ID only)
  };
  
  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });
  
  logger.debug('Refresh token generated', {
    userId,
    tokenId: tokenId.substring(0, 10) + '...',
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });
  
  return { token, tokenId };
}

/**
 * Verify access token
 * 
 * @param token - JWT access token
 * @returns Decoded payload with userId
 */
export function verifyAccessToken(token: string): {
  userId: string;
  iat: number;
  exp: number;
} {
  validateJWTSecret();
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      iat: number;
      exp: number;
    };
    
    return {
      userId: decoded.sub,
      iat: decoded.iat,
      exp: decoded.exp,
    };
    
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.debug('Access token expired');
      throw new Error('Token expired');
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      logger.debug('Invalid access token');
      throw new Error('Invalid token');
    }
    
    logger.error('Access token verification failed:', error);
    throw new Error('Token verification failed');
  }
}

/**
 * Verify refresh token
 * 
 * @param token - JWT refresh token
 * @returns Decoded payload with userId and tokenId
 */
export function verifyRefreshToken(token: string): {
  userId: string;
  tokenId: string;
  iat: number;
  exp: number;
} {
  validateJWTSecret();
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      jti: string;
      sub: string;
      iat: number;
      exp: number;
    };
    
    return {
      userId: decoded.sub,
      tokenId: decoded.jti,
      iat: decoded.iat,
      exp: decoded.exp,
    };
    
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.debug('Refresh token expired');
      throw new Error('Token expired');
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      logger.debug('Invalid refresh token');
      throw new Error('Invalid token');
    }
    
    logger.error('Refresh token verification failed:', error);
    throw new Error('Token verification failed');
  }
}

/**
 * Decode token without verification (for debugging)
 * 
 * @param token - JWT token
 * @returns Decoded payload or null
 */
export function decodeToken(token: string): any {
  try {
    return jwt.decode(token);
  } catch (error) {
    logger.error('Token decode failed:', error);
    return null;
  }
}

/**
 * Get token expiry time
 * 
 * @param token - JWT token
 * @returns Expiry timestamp or null
 */
export function getTokenExpiry(token: string): number | null {
  const decoded = decodeToken(token);
  return decoded?.exp || null;
}

/**
 * Check if token is expired
 * 
 * @param token - JWT token
 * @returns True if expired
 */
export function isTokenExpired(token: string): boolean {
  const expiry = getTokenExpiry(token);
  if (!expiry) return true;
  
  return Date.now() >= expiry * 1000;
}

/**
 * Get time until token expires
 * 
 * @param token - JWT token
 * @returns Seconds until expiry, or 0 if expired
 */
export function getTimeUntilExpiry(token: string): number {
  const expiry = getTokenExpiry(token);
  if (!expiry) return 0;
  
  const secondsRemaining = expiry - Math.floor(Date.now() / 1000);
  return Math.max(0, secondsRemaining);
}

/**
 * Generate both access and refresh tokens
 * 
 * @param userId - User UUID
 * @returns Object with both tokens
 */
export function generateTokenPair(userId: string): {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
} {
  const accessToken = generateAccessToken(userId);
  const { token: refreshToken, tokenId: refreshTokenId } = generateRefreshToken(userId);
  
  return {
    accessToken,
    refreshToken,
    refreshTokenId,
  };
}

/**
 * Extract token from Authorization header
 * 
 * @param authHeader - Authorization header value
 * @returns Token or null
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Get token info (for debugging/logging)
 * 
 * @param token - JWT token
 * @returns Token information
 */
export function getTokenInfo(token: string): {
  userId?: string;
  tokenId?: string;
  issuedAt?: Date;
  expiresAt?: Date;
  expired: boolean;
} {
  const decoded = decodeToken(token);
  
  if (!decoded) {
    return { expired: true };
  }
  
  return {
    userId: decoded.sub,
    tokenId: decoded.jti,
    issuedAt: decoded.iat ? new Date(decoded.iat * 1000) : undefined,
    expiresAt: decoded.exp ? new Date(decoded.exp * 1000) : undefined,
    expired: isTokenExpired(token),
  };
}