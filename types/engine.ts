/**
 * Engine Types - Single Source of Truth
 *
 * Every type declaration for the ShellVault engine lives here.
 * No file should define its own version of these types.
 *
 * Organization:
 * - Agent types          → Agent-broker protocol
 * - Auth types           → Authentication & authorization
 * - Server types         → Server model and operations
 * - Session types        → SSH sessions and terminal
 * - Credential types     → Secret management
 * - Broker types         → Broker communication
 * - Protocol types       → Message envelope for agent
 *
 * Rule: If you need one of these types, import from here.
 */

// ────────────────────────────────────────────────────────────────
// Agent Types
// ────────────────────────────────────────────────────────────────

export interface AgentConfig {
  userId: string;
  serverId: string;
  handshakeUuid: string;
  brokerUrl: string;
  heartbeatUrl: string;
  sshUsername: string;
  version?: string;
  testMode?: boolean;
}

export interface GeneratedAgent {
  agent: string;        // Python: main orchestrator
  transport: string;    // Python: WebSocket transport
  operations: string;   // Python: command execution
  credentials: string;  // Python: credential retrieval
  wrapper: string;      // Bash: systemd wrapper
  service: string;      // systemd unit file
  secretManager: string; // Python: encrypted vault
}

export interface AgentHealthMetrics {
  uptimeSeconds: number;
  loadAverage?: {
    '1min': number;
    '5min': number;
    '15min': number;
  } | null;
  diskUsedPercent?: number | null;
  commandsExecuted: number;
  commandsFailed: number;
}

export interface AgentStatus {
  connected: boolean;
  authenticated: boolean;
  handshakeTier: 0 | 1 | 2 | 3;
  connectedAt: Date | null;
  lastSeen: Date | null;
  agentVersion: string | null;
  healthStatus: 'pending' | 'online' | 'offline' | 'failed' | 'installing';
}

// ────────────────────────────────────────────────────────────────
// Auth Types
// ────────────────────────────────────────────────────────────────

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  isActive: boolean;
}

export interface AuthResult {
  authenticated: boolean;
  user?: AuthenticatedUser;
  error?: string;
  statusCode?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
}

export interface SessionData {
  userId: string;
  ip: string;
  userAgent: string;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
}

export interface TotpSetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
  isNewSetup: boolean;
}

// ────────────────────────────────────────────────────────────────
// Server Types
// ────────────────────────────────────────────────────────────────

export interface ServerModel {
  id: string;
  userId: string;
  name: string;
  ipAddress: string;
  port: number;
  sshUsername: string;
  hostname: string | null;
  osInfo: string | null;
  tags: string[];
  notes: string | null;
  agentInstalled: boolean;
  agentVersion: string | null;
  agentHealthStatus: 'pending' | 'online' | 'offline' | 'failed' | 'installing';
  agentLastSeen: Date | null;
  rotationEnabled: boolean;
  rotationInterval: number;   // hours
  lastRotated: Date | null;
  lastConnected: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateServerInput {
  name: string;
  ipAddress: string;
  port: number;
  sshUsername: string;
  hostname?: string | null;
  tags?: string[];
  notes?: string | null;
  installAgent?: boolean;
  sshPassword?: string;       // one-time only, never stored
}

export interface UpdateServerInput {
  name?: string;
  port?: number;
  sshUsername?: string;
  hostname?: string | null;
  tags?: string[];
  notes?: string | null;
}

export interface ServerListQuery {
  page: number;
  limit: number;
  status: 'all' | 'pending' | 'online' | 'offline';
  tags?: string;
  search?: string;
}

// ────────────────────────────────────────────────────────────────
// SSH Session Types
// ────────────────────────────────────────────────────────────────

export interface SshSessionModel {
  id: string;
  userId: string;
  serverId: string;
  status: 'active' | 'closed' | 'error';
  clientIp: string;
  userAgent: string | null;
  startedAt: Date;
  endedAt: Date | null;
  lastActivity: Date;
  bytesSent: bigint;
  bytesReceived: bigint;
  errorMessage: string | null;
}

export interface TerminalSession {
  sessionId: string;
  serverName: string;
  serverId: string;
  credentials: RetrievedCredentials;
  connectedAt: Date;
}

export interface TerminalDimensions {
  cols: number;
  rows: number;
}

// ────────────────────────────────────────────────────────────────
// Credential Types
// ────────────────────────────────────────────────────────────────

export type AuthMethod = 'key' | 'password';

export interface RetrievedCredentials {
  username: string;
  authMethod: AuthMethod;
  credential: string;     // key content OR password
  ipAddress: string;
  port: number;
  hostname: string;
  methodUsed: string;
  timestamp: string;
}

export interface CredentialRequest {
  serverId: string;
  sessionId: string;
  requestedAt: string;
}

export interface CredentialResponse {
  success: boolean;
  credentials?: RetrievedCredentials;
  error?: string;
}

// ────────────────────────────────────────────────────────────────
// Broker Types
// ────────────────────────────────────────────────────────────────

export interface BrokerInterface {
  requestCredentials: (
    serverId: string,
    sessionId: string
  ) => Promise<RetrievedCredentials>;

  getAgentStatus: (serverId: string) => AgentStatus | null;

  getAllAgents: () => AgentStatus[];

  isAgentReady: (serverId: string) => boolean;

  getAgentCount: () => number;

  getAuthenticatedAgentCount: () => number;
}

export interface BrokerCredentialsResponse {
  success: boolean;
  credentials: RetrievedCredentials;
}

// ────────────────────────────────────────────────────────────────
// Agent-Broker Protocol Types (v2)
// ────────────────────────────────────────────────────────────────

export type BrokerMessageType =
  | 'challenge'
  | 'response'
  | 'handshake_complete'
  | 'command'
  | 'command_result'
  | 'credentials_request'
  | 'credentials_response'
  | 'heartbeat'
  | 'error';

export interface BrokerMessage {
  type: BrokerMessageType;
  timestamp: string;
  [key: string]: unknown;
}

export interface ChallengeMessage extends BrokerMessage {
  type: 'challenge';
  tier: 1 | 2 | 3;
  challenge: string;        // AES-256-GCM encrypted payload
}

export interface ResponseMessage extends BrokerMessage {
  type: 'response';
  tier: 1 | 2 | 3;
  payload: string;          // AES-256-GCM encrypted response
}

export interface CommandMessage extends BrokerMessage {
  type: 'command';
  commandId: string;
  command: string;
}

export interface CommandResultMessage extends BrokerMessage {
  type: 'command_result';
  commandId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface HeartbeatMessage extends BrokerMessage {
  type: 'heartbeat';
  serverId: string;
  uptime: number;
  version: string;
}

export interface CredentialsRequestMessage extends BrokerMessage {
  type: 'credentials_request';
  sessionId: string;
}

export interface CredentialsResponseMessage extends BrokerMessage {
  type: 'credentials_response';
  sessionId: string;
  payload: string;          // AES-256-GCM encrypted
}

// ────────────────────────────────────────────────────────────────
// Encryption Types
// ────────────────────────────────────────────────────────────────

export interface EncryptedPayload {
  iv: string;               // base64
  ciphertext: string;       // base64
  tag: string;              // base64 (GCM auth tag)
}

export interface ChallengePayload {
  tier: number;
  nonce: string;
  timestamp: string;
  challengeId: string;
  [key: string]: unknown;   // tier-specific fields
}

// ────────────────────────────────────────────────────────────────
// Audit Types
// ────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id?: bigint;
  userId?: string;
  eventType: string;        // e.g., 'login_success', 'server_created'
  eventCategory: 'auth' | 'server' | 'session' | 'admin' | 'system' | 'server_management';
  severity: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  message: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt?: Date;
}

// ────────────────────────────────────────────────────────────────
// Rate Limiting Types
// ────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  total: number;
}

// ────────────────────────────────────────────────────────────────
// Validation Types
// ────────────────────────────────────────────────────────────────

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: Array<{ field: string; message: string }>;
}
