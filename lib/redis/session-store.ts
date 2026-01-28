/**
 * Redis Session Store
 * 
 * Manages user sessions in Redis with TTL and single session enforcement.
 * Minimal data storage for maximum security and privacy.
 */

import { getRedisClient } from './client';
import logger from '@/lib/logger';

// Session TTL
const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Session data structure (stored in Redis)
 */
export interface SessionData {
  userId: string;
  ip: string;
  userAgent: string;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
}

/**
 * Redis key patterns
 */
const KEYS = {
  session: (refreshToken: string) => `session:${refreshToken}`,
  userSessions: (userId: string) => `user:${userId}:sessions`,
};

/**
 * Create a new session
 * 
 * Enforces single session per user by deleting existing sessions.
 * 
 * @param userId - User UUID
 * @param refreshToken - Refresh token (used as session key)
 * @param ip - Client IP address
 * @param userAgent - User agent string
 * @returns SessionData
 */
export async function createSession(
  userId: string,
  refreshToken: string,
  ip: string,
  userAgent: string
): Promise<SessionData> {
  try {
    const redis = await getRedisClient();
    const now = Date.now();
    const expiresAt = now + (SESSION_TTL * 1000);

    const sessionData: SessionData = {
      userId,
      ip,
      userAgent,
      createdAt: now,
      lastActivityAt: now,
      expiresAt,
    };

    // Delete all existing sessions for this user (single session enforcement)
    await deleteUserSessions(userId);

    // Store session data
    const sessionKey = KEYS.session(refreshToken);
    await redis.setex(
      sessionKey,
      SESSION_TTL,
      JSON.stringify(sessionData)
    );

    // Track session for user (for single session enforcement)
    const userSessionsKey = KEYS.userSessions(userId);
    await redis.setex(
      userSessionsKey,
      SESSION_TTL,
      refreshToken
    );

    logger.debug('Session created', {
      userId,
      ip,
      expiresIn: `${SESSION_TTL}s`,
    });

    return sessionData;
    
  } catch (error) {
    logger.error('Failed to create session:', error);
    throw new Error('Session creation failed');
  }
}

/**
 * Get session data by refresh token
 * 
 * @param refreshToken - Refresh token
 * @returns SessionData or null if not found
 */
export async function getSession(
  refreshToken: string
): Promise<SessionData | null> {
  try {
    const redis = await getRedisClient();
    const sessionKey = KEYS.session(refreshToken);
    
    const data = await redis.get(sessionKey);
    
    if (!data) {
      logger.debug('Session not found', { refreshToken: refreshToken.substring(0, 10) + '...' });
      return null;
    }

    const session: SessionData = JSON.parse(data);
    
    // Check if expired (shouldn't happen with TTL, but double-check)
    if (session.expiresAt < Date.now()) {
      logger.debug('Session expired', { userId: session.userId });
      await deleteSession(refreshToken);
      return null;
    }

    return session;
    
  } catch (error) {
    logger.error('Failed to get session:', error);
    return null;
  }
}

/**
 * Delete a specific session
 * 
 * @param refreshToken - Refresh token
 * @returns boolean - True if deleted
 */
export async function deleteSession(refreshToken: string): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    
    // Get session to find userId
    const session = await getSession(refreshToken);
    
    // Delete session key
    const sessionKey = KEYS.session(refreshToken);
    const deleted = await redis.del(sessionKey);
    
    // Delete user sessions tracking (if we found the user)
    if (session) {
      const userSessionsKey = KEYS.userSessions(session.userId);
      await redis.del(userSessionsKey);
    }

    logger.debug('Session deleted', {
      userId: session?.userId,
      deleted: deleted > 0,
    });

    return deleted > 0;
    
  } catch (error) {
    logger.error('Failed to delete session:', error);
    return false;
  }
}

/**
 * Delete all sessions for a user
 * 
 * Used for single session enforcement and logout everywhere.
 * 
 * @param userId - User UUID
 * @returns number - Number of sessions deleted
 */
export async function deleteUserSessions(userId: string): Promise<number> {
  try {
    const redis = await getRedisClient();
    const userSessionsKey = KEYS.userSessions(userId);
    
    // Get current session token
    const currentToken = await redis.get(userSessionsKey);
    
    if (!currentToken) {
      logger.debug('No sessions found for user', { userId });
      return 0;
    }

    // Delete session
    const sessionKey = KEYS.session(currentToken);
    const sessionDeleted = await redis.del(sessionKey);
    
    // Delete tracking
    const trackingDeleted = await redis.del(userSessionsKey);
    
    const totalDeleted = sessionDeleted + trackingDeleted;
    
    logger.debug('User sessions deleted', {
      userId,
      sessionsDeleted: totalDeleted,
    });

    return totalDeleted;
    
  } catch (error) {
    logger.error('Failed to delete user sessions:', error);
    return 0;
  }
}

/**
 * Update last activity timestamp
 * 
 * Called on every authenticated request to track activity.
 * 
 * @param refreshToken - Refresh token
 * @returns boolean - True if updated
 */
export async function updateLastActivity(
  refreshToken: string
): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    const sessionKey = KEYS.session(refreshToken);
    
    // Get current session
    const data = await redis.get(sessionKey);
    if (!data) {
      return false;
    }

    const session: SessionData = JSON.parse(data);
    
    // Update last activity
    session.lastActivityAt = Date.now();
    
    // Store back with same TTL
    const ttl = await redis.ttl(sessionKey);
    if (ttl > 0) {
      await redis.setex(sessionKey, ttl, JSON.stringify(session));
    }

    return true;
    
  } catch (error) {
    logger.error('Failed to update last activity:', error);
    return false;
  }
}

/**
 * Get session count for a user (should always be 0 or 1)
 * 
 * @param userId - User UUID
 * @returns number - Session count
 */
export async function getUserSessionCount(userId: string): Promise<number> {
  try {
    const redis = await getRedisClient();
    const userSessionsKey = KEYS.userSessions(userId);
    
    const exists = await redis.exists(userSessionsKey);
    return exists;
    
  } catch (error) {
    logger.error('Failed to get session count:', error);
    return 0;
  }
}

/**
 * Verify IP matches session
 * 
 * @param refreshToken - Refresh token
 * @param requestIp - Current request IP
 * @returns boolean - True if IP matches
 */
export async function verifySessionIp(
  refreshToken: string,
  requestIp: string
): Promise<boolean> {
  try {
    const session = await getSession(refreshToken);
    
    if (!session) {
      logger.debug('Session not found for IP verification');
      return false;
    }

    const ipMatch = session.ip === requestIp;
    
    if (!ipMatch) {
      logger.warn('IP mismatch detected', {
        userId: session.userId,
        sessionIp: session.ip,
        requestIp: requestIp,
      });
    }

    return ipMatch;
    
  } catch (error) {
    logger.error('Failed to verify session IP:', error);
    return false;
  }
}

/**
 * Get session info (for debugging/monitoring)
 * 
 * @param refreshToken - Refresh token
 * @returns Session info or null
 */
export async function getSessionInfo(refreshToken: string): Promise<{
  userId: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  ip: string;
} | null> {
  const session = await getSession(refreshToken);
  
  if (!session) {
    return null;
  }

  return {
    userId: session.userId,
    createdAt: new Date(session.createdAt),
    lastActivityAt: new Date(session.lastActivityAt),
    expiresAt: new Date(session.expiresAt),
    ip: session.ip,
  };
}