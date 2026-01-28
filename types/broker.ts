// types/broker.ts

export type ChallengeType = 'tier1' | 'tier2' | 'tier3';

export interface Challenge {
  id: string;
  tier: 1 | 2 | 3;
  serverId: string;
  userId: string;
  timestamp: string;
  expiresAt: string;
  payload: any;
}

export interface ChallengeResponse {
  challengeId: string;
  tier: 1 | 2 | 3;
  serverId: string;
  payload: any;
  timestamp: string;
}

export interface AgentConnection {
  serverId: string;
  userId: string;
  ws: any; // WebSocket
  connectedAt: Date;
  lastSeen: Date;
  handshakeComplete: boolean;
  handshakeTier: 0 | 1 | 2 | 3;
}

export interface BrokerSession {
  sessionId: string;
  userId: string;
  serverId: string;
  sessionKey: string;
  createdAt: Date;
  expiresAt: Date;
  status: 'active' | 'expired' | 'terminated';
}

export interface QueuedCommand {
  id: string;
  serverId: string;
  userId: string;
  command: string;
  priority: 'low' | 'normal' | 'high';
  createdAt: Date;
  expiresAt: Date;
  status: 'pending' | 'delivered' | 'expired';
}

export interface EncryptedPayload {
  payload: string;
  signature: string;
}