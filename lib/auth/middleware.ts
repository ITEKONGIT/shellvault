// lib/auth/middleware.ts

/**
 * Authentication Middleware
 * 
 * Protects routes by verifying JWT tokens and enforcing security policies.
 * 
 * Security Features:
 * - JWT verification (signature + expiry)
 * - Strict IP binding (verifies request IP matches session IP)
 * - Session validation (checks Redis)
 * - Activity tracking (updates lastActivityAt)
 * - User status checks (active, not locked)
 * 
 * Usage:
 * ```typescript
 * // Option 1: Throws on error (for protected routes)
 * export async function GET(request: NextRequest) {
 *   const user = await requireAuth(request);
 *   // User is authenticated, proceed
 * }
 * 
 * // Option 2: Returns result object (for flexible handling)
 * export async function POST(request: NextRequest) {
 *   const result = await verifyAuth(request);
 *   if (!result.authenticated) {
 *     return NextResponse.json({ error: result.error }, { status: 401 });
 *   }
 *   // result.user is available
 * }
 * ```
 */

import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { getTokensFromCookies } from '@/lib/auth/cookies';
import { getSession, updateLastActivity } from '@/lib/redis/session-store';
import logger from '@/lib/logger';

const prisma = new PrismaClient();

/**
 * Authenticated user type
 */
export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  isActive: boolean;
}

/**
 * Authentication result type (for verifyAuth)
 */
export interface AuthResult {
  authenticated: boolean;
  user?: AuthenticatedUser;
  error?: string;
  statusCode?: number;
}

/**
 * Authentication error class
 */
export class AuthenticationError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Get client IP address
 */
function getClientIp(request: NextRequest): string {
  try {
    // Check various headers for real IP (behind proxies)
    const cfConnectingIp = request.headers.get('cf-connecting-ip');
    const realIp = request.headers.get('x-real-ip');
    const forwarded = request.headers.get('x-forwarded-for');

    // Priority order: Cloudflare > Real-IP > Forwarded
    if (cfConnectingIp) return cfConnectingIp.trim();
    if (realIp) return realIp.trim();
    if (forwarded) {
      // x-forwarded-for can be "client, proxy1, proxy2"
      const ips = forwarded.split(',').map(ip => ip.trim());
      return ips[0]; // Return the first (client) IP
    }

    // Fallback to localhost for development
    return '127.0.0.1';
  } catch (error) {
    logger.error('Error extracting client IP:', error);
    return '127.0.0.1';
  }
}

/**
 * Normalize IP address (convert IPv6 localhost to IPv4)
 */
function normalizeIp(ip: string): string {
  if (!ip) return '127.0.0.1';

  // Convert IPv6 localhost to IPv4
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    return '127.0.0.1';
  }

  // Remove IPv6 prefix if present
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }

  return ip.trim();
}

/**
 * Verify authentication (non-throwing version)
 * 
 * Returns a result object instead of throwing errors.
 * Use this for flexible error handling in API routes.
 * 
 * @param request - Next.js request object
 * @returns AuthResult with authentication status
 */
export async function verifyAuth(request: NextRequest): Promise<AuthResult> {
  try {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 1: Extract tokens from cookies
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const { accessToken, refreshToken } = getTokensFromCookies(request);

    if (!accessToken || !refreshToken) {
      return {
        authenticated: false,
        error: 'No authentication tokens provided',
        statusCode: 401,
      };
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 2: Verify access token (JWT signature + expiry)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let tokenPayload;
    try {
      tokenPayload = verifyAccessToken(accessToken);
    } catch (error) {
      return {
        authenticated: false,
        error: 'Invalid or expired access token',
        statusCode: 401,
      };
    }

    // Validate token payload
    if (!tokenPayload || !tokenPayload.userId) {
      return {
        authenticated: false,
        error: 'Invalid token payload',
        statusCode: 401,
      };
    }

    const userId = tokenPayload.userId;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 3: Get session from Redis
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let session;
    try {
      session = await getSession(refreshToken);
    } catch (error) {
      logger.error('Redis session lookup failed:', error);
      return {
        authenticated: false,
        error: 'Session lookup failed',
        statusCode: 500,
      };
    }

    if (!session) {
      return {
        authenticated: false,
        error: 'Session not found or expired',
        statusCode: 401,
      };
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 4: Verify session belongs to the user
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (session.userId !== userId) {
      logger.warn('Session user mismatch', {
        tokenUserId: userId,
        sessionUserId: session.userId,
      });
      return {
        authenticated: false,
        error: 'Invalid session',
        statusCode: 401,
      };
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 5: Strict IP binding - verify request IP matches session IP
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const requestIp = normalizeIp(getClientIp(request));
    const sessionIp = normalizeIp(session.ip);

    if (requestIp !== sessionIp) {
      logger.warn('IP mismatch detected - possible token theft', {
        userId: userId,
        sessionIp: sessionIp,
        requestIp: requestIp,
      });
      return {
        authenticated: false,
        error: 'IP address mismatch - please login again',
        statusCode: 401,
      };
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 6: Update last activity in Redis (non-blocking)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    updateLastActivity(refreshToken).catch((error) => {
      logger.error('Failed to update last activity:', error);
      // Don't fail auth if activity update fails
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 7: Get user from database
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let user;
    try {
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          isAdmin: true,
          isActive: true,
          isLocked: true,
          lockedUntil: true,
        },
      });
    } catch (error) {
      logger.error('Database user lookup failed:', error);
      return {
        authenticated: false,
        error: 'User lookup failed',
        statusCode: 500,
      };
    }

    if (!user) {
      return {
        authenticated: false,
        error: 'User not found',
        statusCode: 401,
      };
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 8: Check if account is locked
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (user.isLocked && user.lockedUntil) {
      const lockedUntil = new Date(user.lockedUntil);
      const now = new Date();

      if (lockedUntil > now) {
        const minutesRemaining = Math.ceil(
          (lockedUntil.getTime() - now.getTime()) / 60000
        );
        return {
          authenticated: false,
          error: `Account is locked for ${minutesRemaining} more minute(s)`,
          statusCode: 403,
        };
      }
      // Lock expired but flag still set - this is okay, proceed
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 9: Check if account is active
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (!user.isActive) {
      return {
        authenticated: false,
        error: 'Account is not active',
        statusCode: 403,
      };
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 10: Success - return authenticated user
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    logger.debug('User authenticated', {
      userId: user.id,
      username: user.username,
      ip: requestIp,
    });

    return {
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
      },
    };
  } catch (error) {
    // Catch-all for unexpected errors
    logger.error('Unexpected authentication error:', error);
    return {
      authenticated: false,
      error: 'Authentication failed',
      statusCode: 500,
    };
  }
}

/**
 * Require authentication - throws if not authenticated
 * 
 * Use this for protected routes where you want automatic error handling.
 * 
 * @param request - Next.js request object
 * @returns Authenticated user
 * @throws AuthenticationError if authentication fails
 */
export async function requireAuth(request: NextRequest): Promise<AuthenticatedUser> {
  const result = await verifyAuth(request);

  if (!result.authenticated) {
    throw new AuthenticationError(
      result.error || 'Authentication failed',
      result.statusCode || 401
    );
  }

  // TypeScript knows user exists here because authenticated is true
  return result.user!;
}

/**
 * Optional authentication - returns user or null
 * 
 * Use this for routes that work with or without authentication.
 * 
 * @param request - Next.js request object
 * @returns Authenticated user or null
 */
export async function optionalAuth(request: NextRequest): Promise<AuthenticatedUser | null> {
  const result = await verifyAuth(request);
  return result.authenticated ? result.user! : null;
}

/**
 * Require admin authentication
 * 
 * Use this for admin-only routes.
 * 
 * @param request - Next.js request object
 * @returns Authenticated admin user
 * @throws AuthenticationError if not admin
 */
export async function requireAdmin(request: NextRequest): Promise<AuthenticatedUser> {
  const user = await requireAuth(request);

  if (!user.isAdmin) {
    throw new AuthenticationError('Admin access required', 403);
  }

  return user;
}