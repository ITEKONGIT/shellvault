// lib/broker/registry.ts

import { AgentConnection } from '@/types/broker';
import logger from '@/lib/logger';

/**
 * In-memory agent registry
 * Tracks all connected agents
 */
class AgentRegistry {
  private agents: Map<string, AgentConnection> = new Map();

  /**
   * Register new agent connection
   */
  register(serverId: string, connection: AgentConnection): void {
    this.agents.set(serverId, connection);
    logger.info('Agent registered', { serverId, userId: connection.userId });
  }

  /**
   * Unregister agent (on disconnect)
   */
  unregister(serverId: string): void {
    const agent = this.agents.get(serverId);
    if (agent) {
      this.agents.delete(serverId);
      logger.info('Agent unregistered', { serverId, userId: agent.userId });
    }
  }

  /**
   * Get agent connection
   */
  get(serverId: string): AgentConnection | undefined {
    return this.agents.get(serverId);
  }

  /**
   * Check if agent is connected
   */
  isConnected(serverId: string): boolean {
    return this.agents.has(serverId);
  }

  /**
   * Update last seen timestamp
   */
  updateLastSeen(serverId: string): void {
    const agent = this.agents.get(serverId);
    if (agent) {
      agent.lastSeen = new Date();
    }
  }

  /**
   * Update handshake tier
   */
  updateHandshakeTier(serverId: string, tier: 0 | 1 | 2 | 3): void {
    const agent = this.agents.get(serverId);
    if (agent) {
      agent.handshakeTier = tier;
      agent.handshakeComplete = tier === 3;
      logger.info('Handshake tier updated', { serverId, tier });
    }
  }

  /**
   * Get all connected agents for a user
   */
  getByUserId(userId: string): AgentConnection[] {
    return Array.from(this.agents.values()).filter(
      (agent) => agent.userId === userId
    );
  }

  /**
   * Get all connected agents
   */
  getAll(): AgentConnection[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get connection count
   */
  count(): number {
    return this.agents.size;
  }
}

// Export singleton instance
export const agentRegistry = new AgentRegistry();