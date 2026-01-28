// lib/broker/session.ts (COMPLETE PROPER FIX)

import { v4 as uuid } from 'uuid';
import { BrokerSession } from '@/types/broker';
import RedisClient from '@/lib/redis/client'; // ✅ Import the class
import logger from '@/lib/logger';

/**
 * Session Manager
 * Manages ephemeral session keys for terminal access
 */
export class SessionManager {
  private sessions: Map<string, BrokerSession> = new Map();

  /**
   * Create new session
   */
  async createSession(
    userId: string,
    serverId: string,
    sessionKey: string,
    expiresInMs: number = 3600000 // 1 hour default
  ): Promise<BrokerSession> {
    const sessionId = uuid();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInMs);

    const session: BrokerSession = {
      sessionId,
      userId,
      serverId,
      sessionKey,
      createdAt: now,
      expiresAt,
      status: 'active',
    };

    // Store in memory
    this.sessions.set(sessionId, session);

    // Store in Redis for persistence
    const redis = await RedisClient.getInstance(); // ✅ Get instance
    await redis.set(
      `broker:session:${sessionId}`,
      JSON.stringify(session),
      'EX',
      Math.floor(expiresInMs / 1000)
    );

    logger.info('Session created', {
      sessionId,
      userId,
      serverId,
      expiresAt,
    });

    return session;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<BrokerSession | null> {
    // Check memory first
    let session = this.sessions.get(sessionId);

    // If not in memory, check Redis
    if (!session) {
      const redis = await RedisClient.getInstance(); // ✅ Get instance
      const sessionData = await redis.get(`broker:session:${sessionId}`);
      if (sessionData) {
        session = JSON.parse(sessionData);
        // Restore to memory
        if (session) {
          this.sessions.set(sessionId, session);
        }
      }
    }

    // Check if expired
    if (session && new Date() > new Date(session.expiresAt)) {
      await this.terminateSession(sessionId);
      return null;
    }

    return session || null;
  }

  /**
   * Validate session
   */
  async validateSession(sessionId: string, userId: string, serverId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);

    if (!session) {
      logger.warn('Session validation failed: session not found', { sessionId });
      return false;
    }

    if (session.status !== 'active') {
      logger.warn('Session validation failed: session not active', {
        sessionId,
        status: session.status,
      });
      return false;
    }

    if (session.userId !== userId) {
      logger.warn('Session validation failed: user ID mismatch', {
        sessionId,
        expectedUserId: session.userId,
        providedUserId: userId,
      });
      return false;
    }

    if (session.serverId !== serverId) {
      logger.warn('Session validation failed: server ID mismatch', {
        sessionId,
        expectedServerId: session.serverId,
        providedServerId: serverId,
      });
      return false;
    }

    logger.debug('Session validated', { sessionId, userId, serverId });
    return true;
  }

  /**
   * Terminate session
   */
  async terminateSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (session) {
      session.status = 'terminated';
      this.sessions.delete(sessionId);

      // Remove from Redis
      const redis = await RedisClient.getInstance(); // ✅ Get instance
      await redis.del(`broker:session:${sessionId}`);

      logger.info('Session terminated', {
        sessionId,
        userId: session.userId,
        serverId: session.serverId,
      });
    }
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const now = new Date();
    let count = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > new Date(session.expiresAt)) {
        await this.terminateSession(sessionId);
        count++;
      }
    }

    if (count > 0) {
      logger.info('Expired sessions cleaned up', { count });
    }

    return count;
  }

  /**
   * Get all active sessions for a user
   */
  getUserSessions(userId: string): BrokerSession[] {
    return Array.from(this.sessions.values()).filter(
      (session) => session.userId === userId && session.status === 'active'
    );
  }

  /**
   * Get all active sessions for a server
   */
  getServerSessions(serverId: string): BrokerSession[] {
    return Array.from(this.sessions.values()).filter(
      (session) => session.serverId === serverId && session.status === 'active'
    );
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return Array.from(this.sessions.values()).filter(
      (session) => session.status === 'active'
    ).length;
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();

// Auto-cleanup expired sessions every 5 minutes
setInterval(() => {
  sessionManager.cleanupExpiredSessions().catch((error) => {
    logger.error('Session cleanup error', error);
  });
}, 5 * 60 * 1000);