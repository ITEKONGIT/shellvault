// lib/ssh/credential-request.ts
// Requests credentials from agent via broker

import logger from '@/lib/logger';

interface Credentials {
  username: string;
  auth_method: 'key' | 'password';
  credential: string;
  ip_address: string;
  port: number;
  hostname: string;
  method_used: string;
}

interface CredentialRequestResult {
  success: boolean;
  credentials?: Credentials;
  error?: string;
}

/**
 * Request credentials from agent via broker
 * 
 * This function:
 * 1. Calls the broker's requestCredentials() function
 * 2. Broker sends WebSocket message to agent
 * 3. Agent retrieves credentials (SSH key, password, etc)
 * 4. Agent sends encrypted response back
 * 5. Broker decrypts and returns credentials
 * 
 * @param serverId - Server ID to request credentials for
 * @param sessionId - Unique session ID for tracking
 * @returns Credentials object or error
 */
export async function requestCredentialsFromAgent(
  serverId: string,
  sessionId: string
): Promise<CredentialRequestResult> {
  try {
    logger.info('🔑 Requesting credentials from agent', {
      serverId: serverId.substring(0, 8) + '...',
      sessionId,
    });

    // Access the global broker instance
    // The broker server.js exposes: global.shellVaultBroker
    const broker = (global as any).shellVaultBroker;

    if (!broker) {
      logger.error('❌ Broker not available');
      return {
        success: false,
        error: 'Broker not available. Is server.js running?',
      };
    }

    // Check if agent is connected
    const agent = broker.getAgent(serverId);
    if (!agent) {
      logger.error('❌ Agent not connected', { serverId });
      return {
        success: false,
        error: 'Agent not connected. Please ensure the agent is running on the server.',
      };
    }

    if (!agent.authenticated) {
      logger.error('❌ Agent not authenticated', { serverId });
      return {
        success: false,
        error: 'Agent not authenticated. Handshake may have failed.',
      };
    }

    // Request credentials from agent (via broker)
    logger.info('📡 Sending credential request to agent...', { serverId: serverId.substring(0, 8) });

    const credentials = await broker.requestCredentials(serverId, sessionId);

    logger.info('✅ Credentials received from agent', {
      serverId: serverId.substring(0, 8),
      username: credentials.username,
      authMethod: credentials.auth_method,
      methodUsed: credentials.method_used,
    });

    return {
      success: true,
      credentials,
    };
  } catch (error: any) {
    logger.error('❌ Credential request failed', {
      serverId: serverId.substring(0, 8),
      error: error.message,
    });

    return {
      success: false,
      error: error.message || 'Failed to retrieve credentials',
    };
  }
}

/**
 * Check if agent is connected and authenticated
 */
export function isAgentReady(serverId: string): boolean {
  try {
    const broker = (global as any).shellVaultBroker;
    if (!broker) return false;

    const agent = broker.getAgent(serverId);
    if (!agent) return false;

    return agent.authenticated === true;
  } catch {
    return false;
  }
}

/**
 * Get agent status information
 */
export function getAgentStatus(serverId: string) {
  try {
    const broker = (global as any).shellVaultBroker;
    if (!broker) {
      return {
        connected: false,
        authenticated: false,
        error: 'Broker not available',
      };
    }

    const agent = broker.getAgent(serverId);
    if (!agent) {
      return {
        connected: false,
        authenticated: false,
        error: 'Agent not connected',
      };
    }

    return {
      connected: true,
      authenticated: agent.authenticated || false,
      handshakeTier: agent.handshakeTier || 0,
      connectedAt: agent.connectedAt,
      lastSeen: agent.lastSeen,
    };
  } catch (error: any) {
    return {
      connected: false,
      authenticated: false,
      error: error.message,
    };
  }
}