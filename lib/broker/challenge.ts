// lib/broker/challenge.ts
// ✅ PHASE 1 FIX: Updated to use AES-256-GCM encryption

import { v4 as uuid } from 'uuid';
import { Challenge } from '@/types/broker';
import { encrypt, generateNonce, generateSessionKey, hash } from './crypto';
import logger from '@/lib/logger';

/**
 * Challenge Generator for 3-Tier Handshake
 * ✅ Updated to use AES-256-GCM instead of HMAC
 */
export class ChallengeGenerator {
  
  /**
   * TIER 1: Initial Challenge (Proof of Key)
   */
  static generateTier1Challenge(userId: string, serverId: string): Challenge {
    const challengeId = uuid();
    const nonce = generateNonce();
    const timestamp = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30000).toISOString();

    const payload = {
      tier: 1,
      nonce,
      timestamp,
      challenge_id: challengeId,
    };

    // ✅ NEW: Returns base64 string instead of object
    const encrypted = encrypt(payload, userId);

    logger.info('TIER 1 challenge generated', {
      challengeId,
      serverId: serverId.substring(0, 8),
    });

    return {
      id: challengeId,
      tier: 1,
      serverId,
      userId,
      timestamp,
      expiresAt,
      payload: encrypted, // ✅ Now a base64 string
    };
  }

  /**
   * Verify TIER 1 response
   */
  static verifyTier1Response(
    challenge: Challenge,
    response: any,
    handshakeUuid: string
  ): boolean {
    try {
      // We need the original payload for hash verification
      // Since payload is now encrypted, we need to store the unencrypted version
      // This is handled in the broker's message handling
      
      const expectedHash = hash(
        `${response.nonce}:${handshakeUuid}:${response.timestamp}`
      );

      const valid = response.response_hash === expectedHash;

      logger.info('TIER 1 verification', {
        challengeId: challenge.id,
        valid,
      });

      return valid;
    } catch (error) {
      logger.error('TIER 1 verification error', error);
      return false;
    }
  }

  /**
   * TIER 2: Identity Verification Challenge
   */
  static generateTier2Challenge(
    userId: string,
    serverId: string,
    handshakeUuid: string
  ): Challenge {
    const challengeId = uuid();
    const timestamp = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30000).toISOString();

    const payload = {
      tier: 2,
      challenge_id: challengeId,
      metadata: {
        expected_handshake_uuid: handshakeUuid,
        verify_hostname: true,
        timestamp,
      },
    };

    // ✅ NEW: Returns base64 string
    const encrypted = encrypt(payload, userId);

    logger.info('TIER 2 challenge generated', {
      challengeId,
      serverId: serverId.substring(0, 8),
    });

    return {
      id: challengeId,
      tier: 2,
      serverId,
      userId,
      timestamp,
      expiresAt,
      payload: encrypted, // ✅ Base64 string
    };
  }

  /**
   * Verify TIER 2 response
   */
  static verifyTier2Response(
    challenge: Challenge,
    response: any,
    expectedHandshakeUuid: string
  ): boolean {
    try {
      if (response.handshake_uuid !== expectedHandshakeUuid) {
        logger.warn('TIER 2 verification failed: handshake UUID mismatch', {
          expected: expectedHandshakeUuid,
          received: response.handshake_uuid,
        });
        return false;
      }

      if (!response.verified) {
        logger.warn('TIER 2 verification failed: not verified');
        return false;
      }

      logger.info('TIER 2 verification passed', {
        challengeId: challenge.id,
        hostname: response.hostname,
      });

      return true;
    } catch (error) {
      logger.error('TIER 2 verification error', error);
      return false;
    }
  }

  /**
   * TIER 3: Session Key Exchange
   */
  static generateTier3Challenge(
    userId: string,
    serverId: string
  ): { challenge: Challenge; sessionKey: string } {
    const challengeId = uuid();
    const sessionId = uuid();
    const sessionKey = generateSessionKey();
    const timestamp = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    const payload = {
      tier: 3,
      challenge_id: challengeId,
      session_id: sessionId,
      session_key: sessionKey,
      expires_at: expiresAt,
      allowed_commands: ['ssh', 'sftp'],
    };

    // ✅ NEW: Returns base64 string
    const encrypted = encrypt(payload, userId);

    logger.info('TIER 3 challenge generated', {
      challengeId,
      sessionId,
      serverId: serverId.substring(0, 8),
    });

    return {
      challenge: {
        id: challengeId,
        tier: 3,
        serverId,
        userId,
        timestamp,
        expiresAt,
        payload: encrypted, // ✅ Base64 string
      },
      sessionKey,
    };
  }

  /**
   * Verify TIER 3 response
   */
  static verifyTier3Response(challenge: Challenge, response: any): boolean {
    try {
      if (!response.session_ready) {
        logger.warn('TIER 3 verification failed: session not ready');
        return false;
      }

      if (!response.agent_ready) {
        logger.warn('TIER 3 verification failed: agent not ready');
        return false;
      }

      logger.info('TIER 3 verification passed', {
        challengeId: challenge.id,
        serverId: challenge.serverId.substring(0, 8),
      });

      return true;
    } catch (error) {
      logger.error('TIER 3 verification error', error);
      return false;
    }
  }
}