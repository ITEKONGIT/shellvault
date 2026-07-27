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
// Broker HTTP API (replaces global.shellVaultBroker)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BROKER_URL = process.env.BROKER_URL || 'http://localhost:8080';
const TERMINAL_GRANT_TTL_MS = 60 * 1000;

function getBrokerInternalToken(): string {
  const token = process.env.BROKER_INTERNAL_TOKEN;
  if (!token && process.env.NODE_ENV === 'production') {
    throw new Error('BROKER_INTERNAL_TOKEN is required in production');
  }
  return token || 'dev-shellvault-broker-token-change-me';
}

function getTerminalGrantSecret(): string {
  const secret = process.env.TERMINAL_GRANT_SECRET || process.env.BROKER_INTERNAL_TOKEN;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('TERMINAL_GRANT_SECRET or BROKER_INTERNAL_TOKEN is required in production');
  }
  return secret || 'dev-shellvault-terminal-grant-change-me';
}

function signTerminalGrant(payload: Record<string, unknown>): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getTerminalGrantSecret())
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function brokerHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getBrokerInternalToken()}`,
  };
}

/**
 * Get agent status from broker via HTTP
 */
async function getBrokerAgentStatus(serverId: string) {
  try {
    const response = await fetch(`${BROKER_URL}/api/agent-status?serverId=${serverId}`, {
      method: 'GET',
      headers: brokerHeaders(),
    });
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch (error) {
    return null;
  }
}

/**
 * Request credentials from broker via HTTP
 */
async function requestCredentialsFromBroker(serverId: string, sessionId: string): Promise<Credentials> {
  const response = await fetch(`${BROKER_URL}/api/credentials`, {
    method: 'POST',
    headers: brokerHeaders(),
    body: JSON.stringify({ serverId, sessionId }),
  });
  
  const data = await response.json();
  
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to get credentials from broker');
  }
  
  return data.credentials;
}

/**
 * Ask broker to establish SSH server-side. Credentials never return to browser.
 */
async function connectSshViaBroker(params: {
  sessionId: string;
  serverId: string;
  userId: string;
  credentials: Credentials;
  terminalGrant: string;
}) {
  const response = await fetch(`${BROKER_URL}/api/ssh/connect`, {
    method: 'POST',
    headers: brokerHeaders(),
    body: JSON.stringify(params),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to establish SSH connection through broker');
  }

  return data;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST: Request credentials and spawn terminal
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 1: Authenticate user
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: serverId } = await params;

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
    // STEP 5: Request credentials from agent via broker HTTP API
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try {
      logger.info('Requesting credentials from agent', {
        serverId,
        sessionId,
      });

      // Request credentials via HTTP (this will wait for agent response)
      const credentials = await requestCredentialsFromBroker(serverId, sessionId);

      logger.info('Credentials received from agent', {
        serverId,
        sessionId,
        username: credentials.username,
        authMethod: credentials.auth_method,
        methodUsed: credentials.method_used || 'unknown',
      });

      const expiresAt = new Date(Date.now() + TERMINAL_GRANT_TTL_MS).toISOString();
      const terminalGrant = signTerminalGrant({
        purpose: 'terminal-stream',
        userId: user.id,
        serverId: server.id,
        sessionId,
        nonce: crypto.randomUUID(),
        issuedAt: new Date().toISOString(),
        expiresAt,
      });

      await connectSshViaBroker({
        sessionId,
        serverId: server.id,
        userId: user.id,
        credentials,
        terminalGrant,
      });

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 6: Return success response
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      return NextResponse.json({
        success: true,
        sessionId,
        terminalGrant,
        expiresAt,
        server: {
          id: server.id,
          name: server.name,
          hostname: server.hostname || server.ipAddress,
          ipAddress: credentials.ip_address || server.ipAddress,
        },
        metadata: {
          retrievalMethod: credentials.method_used || 'unknown',
          timestamp: new Date().toISOString(),
        },
        message: 'Terminal session prepared',
      });

    } catch (credError: any) {
      logger.error('Failed to retrieve credentials from agent', {
        serverId,
        sessionId,
        error: credError.message,
      });

      // Check specific error types
      if (credError.message.includes('not connected') || credError.message === 'Agent not connected') {
        return NextResponse.json(
          { 
            error: 'Agent is not connected to broker',
            details: 'The agent may have disconnected. Please refresh and try again.',
          },
          { status: 503 }
        );
      }

      if (credError.message.includes('not authenticated') || credError.message === 'Agent not authenticated') {
        return NextResponse.json(
          { 
            error: 'Agent is not authenticated',
            details: 'The agent has not completed the handshake process.',
          },
          { status: 503 }
        );
      }

      if (credError.message.includes('timeout') || credError.message === 'Credentials request timeout') {
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: serverId } = await params;

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

    // Check if agent is connected via broker HTTP API
    const agentStatus = await getBrokerAgentStatus(serverId);

    if (agentStatus) {
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
          connected: agentStatus.connected || false,
          authenticated: agentStatus.authenticated || false,
          connectedAt: agentStatus.connectedAt || null,
          handshakeTier: agentStatus.handshakeTier || 0,
        },
      });
    } else {
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
