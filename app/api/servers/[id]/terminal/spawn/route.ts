// app/api/servers/[id]/terminal/spawn/route.ts
/**
 * Terminal Spawn API
 * Requests credentials from agent and initiates terminal session
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import logger from '@/lib/logger';
import crypto from 'crypto';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Credentials {
  username: string;
  auth_method: 'key' | 'password';
  credential: string;
  ip_address: string;
  port: number;
  hostname: string;
  method_used?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper to access broker server functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getBrokerAPI() {
  // Access the global broker API exported by broker-server.js
  if (typeof global.shellVaultBroker === 'undefined') {
    throw new Error('Broker server not available. Make sure broker-server.js is running.');
  }
  return global.shellVaultBroker;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST: Request credentials and spawn terminal
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 1: Authenticate user
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serverId = params.id;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 2: Verify server exists and belongs to user
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const server = await prisma.server.findFirst({
      where: {
        id: serverId,
        userId: user.id,
        isActive: true,
      },
    });

    if (!server) {
      logger.warn('Server not found or access denied', {
        serverId,
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Server not found' },
        { status: 404 }
      );
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 3: Verify agent is installed and online
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (!server.agentInstalled) {
      return NextResponse.json(
        { error: 'Agent is not installed on this server' },
        { status: 400 }
      );
    }

    if (server.agentHealthStatus !== 'online') {
      return NextResponse.json(
        { 
          error: 'Agent is not online',
          status: server.agentHealthStatus,
          lastSeen: server.agentLastSeen,
        },
        { status: 400 }
      );
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 4: Generate session ID
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const sessionId = crypto.randomUUID();

    logger.info('Terminal spawn requested', {
      serverId,
      sessionId,
      userId: user.id,
      serverName: server.name,
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 5: Request credentials from agent via broker
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try {
      const broker = getBrokerAPI();
      
      logger.info('Requesting credentials from agent', {
        serverId,
        sessionId,
      });

      // Request credentials (this will wait for agent response)
      const credentials = await broker.requestCredentials(serverId, sessionId);

      logger.info('Credentials received from agent', {
        serverId,
        sessionId,
        username: credentials.username,
        authMethod: credentials.auth_method,
        methodUsed: credentials.method_used || 'unknown',
      });

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 6: Return success response
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      return NextResponse.json({
        success: true,
        sessionId,
        server: {
          id: server.id,
          name: server.name,
          hostname: server.hostname || server.ipAddress,
          ipAddress: credentials.ip_address || server.ipAddress,
        },
        credentials: {
          username: credentials.username,
          authMethod: credentials.auth_method,
          // ⚠️ IMPORTANT: Only include credential if it's a key path
          // Never send passwords to frontend
          ...(credentials.auth_method === 'key' && {
            keyPath: credentials.credential,
          }),
        },
        metadata: {
          retrievalMethod: credentials.method_used || 'unknown',
          timestamp: new Date().toISOString(),
        },
        message: 'Credentials retrieved successfully',
      });

    } catch (credError: any) {
      logger.error('Failed to retrieve credentials from agent', {
        serverId,
        sessionId,
        error: credError.message,
      });

      // Check specific error types
      if (credError.message === 'Agent not connected') {
        return NextResponse.json(
          { 
            error: 'Agent is not connected to broker',
            details: 'The agent may have disconnected. Please refresh and try again.',
          },
          { status: 503 }
        );
      }

      if (credError.message === 'Agent not authenticated') {
        return NextResponse.json(
          { 
            error: 'Agent is not authenticated',
            details: 'The agent has not completed the handshake process.',
          },
          { status: 503 }
        );
      }

      if (credError.message === 'Credentials request timeout') {
        return NextResponse.json(
          { 
            error: 'Credentials request timeout',
            details: 'The agent did not respond within 30 seconds.',
          },
          { status: 504 }
        );
      }

      // Generic credential retrieval error
      return NextResponse.json(
        { 
          error: 'Failed to retrieve credentials',
          details: credError.message,
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    logger.error('Terminal spawn error', {
      error: error.message,
      stack: error.stack,
    });

    return NextResponse.json(
      { 
        error: 'Failed to spawn terminal',
        details: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET: Check terminal session status (future use)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serverId = params.id;

    // Get server
    const server = await prisma.server.findFirst({
      where: {
        id: serverId,
        userId: user.id,
        isActive: true,
      },
    });

    if (!server) {
      return NextResponse.json(
        { error: 'Server not found' },
        { status: 404 }
      );
    }

    // Check if agent is connected via broker
    try {
      const broker = getBrokerAPI();
      const agent = broker.getAgent(serverId);

      return NextResponse.json({
        success: true,
        server: {
          id: server.id,
          name: server.name,
          agentInstalled: server.agentInstalled,
          agentStatus: server.agentHealthStatus,
          agentLastSeen: server.agentLastSeen,
        },
        broker: {
          connected: !!agent,
          authenticated: agent?.authenticated || false,
          connectedAt: agent?.connectedAt || null,
          handshakeTier: agent?.handshakeTier || 0,
        },
      });
    } catch (brokerError) {
      // Broker not available
      return NextResponse.json({
        success: true,
        server: {
          id: server.id,
          name: server.name,
          agentInstalled: server.agentInstalled,
          agentStatus: server.agentHealthStatus,
          agentLastSeen: server.agentLastSeen,
        },
        broker: {
          connected: false,
          authenticated: false,
          error: 'Broker server not available',
        },
      });
    }

  } catch (error: any) {
    logger.error('Terminal status check error', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check status' },
      { status: 500 }
    );
  }
}