// app/api/broker/route.ts

import { WebSocketServer, WebSocket } from 'ws';
import { NextRequest } from 'next/server';
import { agentRegistry } from '@/lib/broker/registry';
import { ChallengeGenerator } from '@/lib/broker/challenge';
import { sessionManager } from '@/lib/broker/session';
import { commandQueue } from '@/lib/broker/queue';
import { decrypt } from '@/lib/broker/crypto';
import { prisma } from '@/lib/db/client';
import RedisClient from '@/lib/redis/client'; // ✅ FIXED: Import RedisClient class
import logger from '@/lib/logger';

// WebSocket server instance
let wss: WebSocketServer | null = null;

/**
 * Initialize WebSocket server (runs once)
 */
function initWebSocketServer() {
  if (wss) return wss;

  wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws: WebSocket, serverId: string, userId: string) => {
    logger.info('Agent connected', { serverId, userId });

    // Register agent
    agentRegistry.register(serverId, {
      serverId,
      userId,
      ws,
      connectedAt: new Date(),
      lastSeen: new Date(),
      handshakeComplete: false,
      handshakeTier: 0,
    });

    // Start 3-tier handshake
    startHandshake(serverId, userId, ws);

    // Handle messages from agent
    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        await handleAgentMessage(serverId, userId, message, ws);
      } catch (error) {
        logger.error('Error handling agent message', error);
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      logger.info('Agent disconnected', { serverId, userId });
      agentRegistry.unregister(serverId);
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error('WebSocket error', { serverId, userId, error });
    });
  });

  logger.info('WebSocket server initialized');
  return wss;
}

/**
 * Start 3-tier handshake
 */
async function startHandshake(serverId: string, userId: string, ws: WebSocket) {
  try {
    // Get server from database
    const server = await prisma.server.findUnique({
      where: { id: serverId },
    });

    if (!server) {
      logger.error('Server not found for handshake', { serverId });
      ws.close();
      return;
    }

    // TIER 1: Initial Challenge
    logger.info('Starting TIER 1 handshake', { serverId, userId });
    const tier1Challenge = ChallengeGenerator.generateTier1Challenge(userId, serverId);

    // ✅ DEBUG: Check what we're sending
    logger.info('🔍 BROKER DEBUG: Challenge generated', {
      id: tier1Challenge.id,
      payloadType: typeof tier1Challenge.payload,
      payloadIsString: typeof tier1Challenge.payload === 'string',
      payloadLength: typeof tier1Challenge.payload === 'string' ? tier1Challenge.payload.length : 'N/A',
      payloadFirst30: typeof tier1Challenge.payload === 'string' 
        ? tier1Challenge.payload.substring(0, 30) 
        : JSON.stringify(tier1Challenge.payload).substring(0, 100),
    });

    const messageToSend = {
      type: 'challenge',
      tier: 1,
      challenge: tier1Challenge.payload,
    };

    logger.info('🔍 BROKER DEBUG: Message to send', {
      messageType: typeof messageToSend,
      challengeFieldType: typeof messageToSend.challenge,
      challengeFieldIsString: typeof messageToSend.challenge === 'string',
      messageJson: JSON.stringify(messageToSend).substring(0, 150),
    });

    ws.send(JSON.stringify(messageToSend));

    // Store challenge for verification
    await storeChallenge(tier1Challenge);

  } catch (error) {
    logger.error('Handshake start error', error);
    ws.close();
  }
}

/**
 * Handle messages from agent
 */
async function handleAgentMessage(
  serverId: string,
  userId: string,
  message: any,
  ws: WebSocket
) {
  agentRegistry.updateLastSeen(serverId);

  switch (message.type) {
    case 'response':
      await handleChallengeResponse(serverId, userId, message, ws);
      break;

    case 'heartbeat':
      await handleHeartbeat(serverId, userId);
      break;

    case 'command_result':
      await handleCommandResult(serverId, message);
      break;

    default:
      logger.warn('Unknown message type', { type: message.type, serverId });
  }
}

/**
 * Handle challenge response
 */
async function handleChallengeResponse(
  serverId: string,
  userId: string,
  message: any,
  ws: WebSocket
) {
  const { tier, payload } = message;

  try {
    // Decrypt response
    const decrypted = decrypt(payload, userId);

    if (!decrypted) {
      logger.error('Failed to decrypt challenge response', { serverId, tier });
      ws.close();
      return;
    }

    // Get server data
    const server = await prisma.server.findUnique({
      where: { id: serverId },
    });

    if (!server) {
      logger.error('Server not found', { serverId });
      ws.close();
      return;
    }

    switch (tier) {
      case 1:
        // Verify TIER 1
        const challenge1 = await getChallenge(decrypted.challenge_id);
        if (!challenge1) {
          logger.error('Challenge not found', { challengeId: decrypted.challenge_id });
          ws.close();
          return;
        }

        const tier1Valid = ChallengeGenerator.verifyTier1Response(
          challenge1,
          decrypted,
          server.handshakeUuid
        );

        if (!tier1Valid) {
          logger.error('TIER 1 verification failed', { serverId });
          ws.close();
          return;
        }

        // Update registry
        agentRegistry.updateHandshakeTier(serverId, 1);

        // Send TIER 2 challenge
        logger.info('TIER 1 passed, sending TIER 2', { serverId });
        const tier2Challenge = ChallengeGenerator.generateTier2Challenge(
          userId,
          serverId,
          server.handshakeUuid
        );

        ws.send(JSON.stringify({
          type: 'challenge',
          tier: 2,
          challenge: tier2Challenge.payload,
        }));

        await storeChallenge(tier2Challenge);
        break;

      case 2:
        // Verify TIER 2
        const challenge2 = await getChallenge(decrypted.challenge_id);
        if (!challenge2) {
          logger.error('Challenge not found', { challengeId: decrypted.challenge_id });
          ws.close();
          return;
        }

        const tier2Valid = ChallengeGenerator.verifyTier2Response(
          challenge2,
          decrypted,
          server.handshakeUuid
        );

        if (!tier2Valid) {
          logger.error('TIER 2 verification failed', { serverId });
          ws.close();
          return;
        }

        // Update registry
        agentRegistry.updateHandshakeTier(serverId, 2);

        // Send TIER 3 challenge
        logger.info('TIER 2 passed, sending TIER 3', { serverId });
        const { challenge: tier3Challenge, sessionKey } = ChallengeGenerator.generateTier3Challenge(
          userId,
          serverId
        );

        // Create session
        await sessionManager.createSession(userId, serverId, sessionKey);

        ws.send(JSON.stringify({
          type: 'challenge',
          tier: 3,
          challenge: tier3Challenge.payload,
        }));

        await storeChallenge(tier3Challenge);
        break;

      case 3:
        // Verify TIER 3
        const challenge3 = await getChallenge(decrypted.challenge_id);
        if (!challenge3) {
          logger.error('Challenge not found', { challengeId: decrypted.challenge_id });
          ws.close();
          return;
        }

        const tier3Valid = ChallengeGenerator.verifyTier3Response(challenge3, decrypted);

        if (!tier3Valid) {
          logger.error('TIER 3 verification failed', { serverId });
          ws.close();
          return;
        }

        // Update registry
        agentRegistry.updateHandshakeTier(serverId, 3);

        logger.info('🎉 3-TIER HANDSHAKE COMPLETE', { serverId, userId });

        // Send confirmation
        ws.send(JSON.stringify({
          type: 'handshake_complete',
          status: 'success',
          message: 'Authentication successful',
        }));

        // Update database
        await prisma.server.update({
          where: { id: serverId },
          data: {
            agentHealthStatus: 'online',
            agentLastSeen: new Date(),
          },
        });

        // Send any queued commands
        await deliverQueuedCommands(serverId, ws);
        break;
    }
  } catch (error) {
    logger.error('Challenge response error', error);
    ws.close();
  }
}

/**
 * Handle heartbeat from agent
 */
async function handleHeartbeat(serverId: string, userId: string) {
  logger.debug('Heartbeat received', { serverId, userId });

  // Update database
  await prisma.server.update({
    where: { id: serverId },
    data: {
      agentHealthStatus: 'online',
      agentLastSeen: new Date(),
    },
  });
}

/**
 * Handle command result from agent
 */
async function handleCommandResult(serverId: string, message: any) {
  logger.info('Command result received', {
    serverId,
    commandId: message.commandId,
    exitCode: message.exitCode,
  });

  // TODO: Store result, notify user, etc.
}

/**
 * Deliver queued commands to agent
 */
async function deliverQueuedCommands(serverId: string, ws: WebSocket) {
  const queueSize = await commandQueue.getQueueSize(serverId);

  if (queueSize === 0) {
    return;
  }

  logger.info('Delivering queued commands', { serverId, queueSize });

  while (true) {
    const command = await commandQueue.dequeue(serverId);
    if (!command) break;

    ws.send(JSON.stringify({
      type: 'command',
      commandId: command.id,
      command: command.command,
    }));

    logger.info('Command delivered', {
      commandId: command.id,
      serverId,
    });
  }
}

/**
 * Store challenge in Redis (30 second TTL)
 */
async function storeChallenge(challenge: any) {
  const redis = await RedisClient.getInstance(); // ✅ FIXED: Get instance
  await redis.set(
    `broker:challenge:${challenge.id}`,
    JSON.stringify(challenge),
    'EX',
    30
  );
}

/**
 * Get challenge from Redis
 */
async function getChallenge(challengeId: string) {
  const redis = await RedisClient.getInstance(); // ✅ FIXED: Get instance
  const data = await redis.get(`broker:challenge:${challengeId}`);
  return data ? JSON.parse(data) : null;
}

/**
 * WebSocket upgrade handler
 */
export async function GET(req: NextRequest) {
  const upgradeHeader = req.headers.get('upgrade');

  if (upgradeHeader !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }

  // Extract server ID and user ID from query params or headers
  const url = new URL(req.url);
  const serverId = url.searchParams.get('serverId');
  const userId = url.searchParams.get('userId');

  if (!serverId || !userId) {
    return new Response('Missing serverId or userId', { status: 400 });
  }

  // Initialize WebSocket server
  const wss = initWebSocketServer();

  // Upgrade connection (Next.js specific handling would go here)
  // For now, return informational response
  return new Response(
    JSON.stringify({
      message: 'WebSocket broker ready',
      serverId,
      userId,
      status: 'ready',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}