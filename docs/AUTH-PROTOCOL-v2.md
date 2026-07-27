# ShellVault Agent-Broker Authentication Protocol v2

> **Document ID:** AUTH-PROTOCOL-v2  
> **Status:** DESIGN SPECIFICATION  
> **Date:** 2026-01-27  
> **Audience:** Engineering team, security auditors, agent implementers  

---

## 1. Protocol Overview

The ShellVault Agent-Broker Protocol (SABP) is a **mutual authentication protocol** that establishes a cryptographically secure WebSocket channel between:
- **Agent**: A Python systemd service running on a managed server
- **Broker**: A Node.js WebSocket server that mediates all communication

### Design Goals
1. **Proof of possession**: The agent proves it knows a shared secret without transmitting it
2. **Identity binding**: The connection is cryptographically bound to the specific server
3. **Forward secrecy**: Session keys are ephemeral and unique per connection
4. **Replay resistance**: Challenges are single-use and time-bounded
5. **No plaintext credentials**: The `handshake_uuid` never leaves the agent machine in plaintext

### Threat Model
| Threat | Mitigation |
|--------|-----------|
| Eavesdropping | All messages encrypted with AES-256-GCM |
| Man-in-the-middle | Mutual auth via challenge-response; broker verifies agent, agent verifies broker |
| Replay attacks | Challenges have unique IDs and 30-second expiry |
| Agent impersonation | Agent must prove possession of `handshake_uuid` hash |
| Broker impersonation | Broker must encrypt challenges with key derived from user UUID |
| Stolen handshake UUID | Attacker still needs access to agent's machine-id to decrypt secrets |

---

## 2. Connection Establishment

### 2.1 Transport Layer
- **Protocol**: WebSocket (ws:// in dev, wss:// in production)
- **Endpoint**: `{brokerUrl}/api/broker?serverId={serverId}&userId={userId}`
- **Origin validation**: Broker rejects WebSocket connections from unauthorized origins
- **Rate limiting**: Max 5 connection attempts per IP per minute

### 2.2 Connection Sequence

```
┌─────────────┐                          ┌─────────────┐
│    Agent    │                          │   Broker    │
└──────┬──────┘                          └──────┬──────┘
       │                                        │
       │  1. WebSocket CONNECT                  │
       │ ─────────────────────────────────────> │
       │     Query: serverId, userId            │
       │                                        │
       │  2. TIER 1 Challenge                   │
       │ <───────────────────────────────────── │
       │     {type: 'challenge', tier: 1,       │
       │      challenge: <encrypted>}            │
       │                                        │
       │  3. TIER 1 Response                    │
       │ ─────────────────────────────────────> │
       │     {type: 'response', tier: 1,        │
       │      payload: <encrypted>}              │
       │                                        │
       │  4. TIER 2 Challenge                   │
       │ <───────────────────────────────────── │
       │     {type: 'challenge', tier: 2,       │
       │      challenge: <encrypted>}            │
       │                                        │
       │  5. TIER 2 Response                    │
       │ ─────────────────────────────────────> │
       │     {type: 'response', tier: 2,        │
       │      payload: <encrypted>}              │
       │                                        │
       │  6. TIER 3 Challenge                   │
       │ <───────────────────────────────────── │
       │     {type: 'challenge', tier: 3,       │
       │      challenge: <encrypted>}            │
       │                                        │
       │  7. TIER 3 Response                    │
       │ ─────────────────────────────────────> │
       │     {type: 'response', tier: 3,        │
       │      payload: <encrypted>}              │
       │                                        │
       │  8. Handshake Complete                 │
       │ <───────────────────────────────────── │
       │     {type: 'handshake_complete',       │
       │      status: 'success'}                │
       │                                        │
       │  9. Heartbeat (every 30s)              │
       │ <────────────────────────────────────> │
       │     {type: 'heartbeat', ...}           │
       │                                        │
```

---

## 3. State Machine

### 3.1 Agent States

```
┌──────────┐   CONNECT    ┌──────────┐   TIER 1 OK  ┌──────────┐
│ DISCONN  │ ───────────> │ CONNECT  │ ───────────> │ TIER1_OK │
└──────────┘              └──────────┘              └──────────┘
     │                         │      TIER 1 FAIL        │
     │                         │ ─────────────────>      │
     │                         v                         │
     │                    ┌──────────┐                   │
     │                    │  FAILED  │                   │
     │                    └──────────┘                   │
     │                                                   │
     │                         TIER 2 OK                 v
     │                    ┌──────────────────────────> ┌──────────┐
     │                    │                            │ TIER2_OK │
     │                    │                            └──────────┘
     │                    │      TIER 2 FAIL                │
     │                    │ ────────────────────>           │
     │                    v                                 │
     │               ┌──────────┐                          │
     │               │  FAILED  │                          │
     │               └──────────┘                          │
     │                                                   TIER 3 OK
     │                    ┌───────────────────────────────> │
     │                    │                                  v
     │                    │                             ┌──────────┐
     │                    │                             │TIER3_OK  │
     │                    │                             │=AUTHENTD │
     │                    │                             └──────────┘
     │                    │      TIER 3 FAIL                 │
     │                    │ <───────────────────             │
     │                    v                                  │
     │               ┌──────────┐                           │
     │               │  FAILED  │                           │
     │               └──────────┘                           │
     │                                                       │
     │                    DISCONNECT                         │
     │ <──────────────────────────────────────────────────── │
     v
┌──────────┐
│ DISCONN  │
└──────────┘
```

### 3.2 State Transitions

| Current State | Event | Next State | Timeout |
|---------------|-------|-----------|---------|
| DISCONNECTED | WebSocket `open` | CONNECTED | N/A |
| CONNECTED | Receive tier 1 challenge | TIER1_SENT | 30s |
| CONNECTED | Tier 1 challenge timeout | FAILED | 30s |
| TIER1_SENT | Send tier 1 response | TIER1_SENT | N/A |
| TIER1_SENT | Receive tier 2 challenge | TIER2_SENT | 30s |
| TIER2_SENT | Send tier 2 response | TIER2_SENT | N/A |
| TIER2_SENT | Receive tier 3 challenge | TIER3_SENT | 30s |
| TIER3_SENT | Send tier 3 response | TIER3_SENT | N/A |
| TIER3_SENT | Receive handshake_complete | AUTHENTICATED | N/A |
| AUTHENTICATED | Heartbeat interval | AUTHENTICATED | 30s |
| AUTHENTICATED | Heartbeat timeout | FAILED | 60s |
| *any* | WebSocket `close` / `error` | DISCONNECTED | N/A |

---

## 4. Message Types

### 4.1 Envelope Format

All messages are JSON objects with a common envelope:

```typescript
interface BrokerMessage {
  type: MessageType;       // Discriminator
  timestamp: string;        // ISO 8601, agent's clock
  version: '2.0';           // Protocol version
}
```

### 4.2 Message Definitions

#### 4.2.1 Challenge (Broker → Agent)
```typescript
interface ChallengeMessage extends BrokerMessage {
  type: 'challenge';
  tier: 1 | 2 | 3;
  challengeId: string;       // UUIDv4, single-use
  challenge: string;         // Base64-encoded AES-256-GCM ciphertext
}
```

#### 4.2.2 Response (Agent → Broker)
```typescript
interface ResponseMessage extends BrokerMessage {
  type: 'response';
  tier: 1 | 2 | 3;
  challengeId: string;       // Must match challenge
  payload: string;           // Base64-encoded AES-256-GCM ciphertext
}
```

#### 4.2.3 Handshake Complete (Broker → Agent)
```typescript
interface HandshakeCompleteMessage extends BrokerMessage {
  type: 'handshake_complete';
  status: 'success' | 'failure';
  sessionId: string;         // UUIDv4, ephemeral session identifier
  expiresAt: string;         // ISO 8601, session expiry
}
```

#### 4.2.4 Command (Broker → Agent)
```typescript
interface CommandMessage extends BrokerMessage {
  type: 'command';
  commandId: string;         // UUIDv4
  command: string;           // Whitelisted command only
  timeout: number;           // Seconds, default 300
}
```

#### 4.2.5 Command Result (Agent → Broker)
```typescript
interface CommandResultMessage extends BrokerMessage {
  type: 'command_result';
  commandId: string;
  exitCode: number;          // -1 for timeout
  stdout: string;            // Truncated to 10KB
  stderr: string;            // Truncated to 10KB
  finishedAt: string;
}
```

#### 4.2.6 Credentials Request (Broker → Agent)
```typescript
interface CredentialsRequestMessage extends BrokerMessage {
  type: 'credentials_request';
  requestId: string;
  sessionId: string;         // SSH session needing credentials
}
```

#### 4.2.7 Credentials Response (Agent → Broker)
```typescript
interface CredentialsResponseMessage extends BrokerMessage {
  type: 'credentials_response';
  requestId: string;
  payload: string;           // Base64-encoded AES-256-GCM ciphertext
}
```

#### 4.2.8 Heartbeat (Agent → Broker)
```typescript
interface HeartbeatMessage extends BrokerMessage {
  type: 'heartbeat';
  uptime: number;            // Seconds since agent start
  version: string;           // Agent version
  metrics: AgentHealthMetrics;
}
```

#### 4.2.9 Error (Bidirectional)
```typescript
interface ErrorMessage extends BrokerMessage {
  type: 'error';
  code: string;              // Error code (e.g., 'TIER_1_INVALID')
  message: string;           // Human-readable
  fatal: boolean;            // If true, connection closes
}
```

---

## 5. Encryption

### 5.1 Algorithm: AES-256-GCM
- **Key size**: 256 bits (32 bytes)
- **IV size**: 96 bits (12 bytes)
- **Auth tag size**: 128 bits (16 bytes)
- **Payload format**: `base64(iv || ciphertext || tag)`

### 5.2 Key Derivation

All encryption keys are derived using **Scrypt**:

```
scrypt(
  password = handshake_uuid,
  salt = 'shellvault-secure-salt-v1',
  N = 16384,
  r = 8,
  p = 1,
  keyLength = 32
)
```

**Why Scrypt**: Memory-hard against GPU attacks. The handshake UUID is known to the broker from the database and to the agent from its encrypted local vault. Public identifiers such as `userId` and `serverId` must not be used as encryption secrets.

### 5.3 Challenge Payload Structure

Before encryption, the plaintext challenge is a JSON object:

#### Tier 1 Challenge (Broker → Agent)
```typescript
{
  tier: 1,
  nonce: string,             // 32 bytes hex, random
  timestamp: string,         // ISO 8601, broker time
  challengeId: string        // UUIDv4
}
```

#### Tier 1 Response (Agent → Broker)
```typescript
{
  tier: 1,
  challengeId: string,
  responseHash: string,      // SHA-256(nonce + ":" + handshake_uuid + ":" + timestamp)
  agentVersion: string,
  serverId: string
}
```

#### Tier 2 Challenge (Broker → Agent)
```typescript
{
  tier: 2,
  challengeId: string,
  nonce: string,
  metadata: {
    verifyHostname: true,
    timestamp: string
  }
}
```

#### Tier 2 Response (Agent → Broker)
```typescript
{
  tier: 2,
  challengeId: string,
  hostname: string,          // gethostname()
  proof: string,             // HMAC-SHA256(handshake_uuid, challengeId:nonce:serverId:hostname)
  serverFingerprint: string, // SHA-256(handshake_uuid + ":" + hostname + ":" + serverId)
  verified: true
}
```

#### Tier 3 Challenge (Broker → Agent)
```typescript
{
  tier: 3,
  challengeId: string,
  sessionId: string,         // UUIDv4, ephemeral session
  sessionKey: string,        // 32 bytes hex, for future use
  allowedCommands: ['ssh', 'sftp'],
  expiresAt: string          // ISO 8601, 1 hour from now
}
```

#### Tier 3 Response (Agent → Broker)
```typescript
{
  tier: 3,
  challengeId: string,
  sessionId: string,
  sessionReady: true,
  agentReady: true,
  sshPort: 22,
  serverId: string
}
```

---

## 6. Timeout and Retry Logic

### 6.1 Challenge Timeouts
| Tier | Challenge Expiry | Response Timeout |
|------|-----------------|------------------|
| 1 | 30 seconds | 10 seconds to respond |
| 2 | 30 seconds | 10 seconds to respond |
| 3 | 30 seconds | 10 seconds to respond |

### 6.2 Connection Retry (Agent-side)
```
Initial delay: 5 seconds
Backoff: exponential (×2 each attempt)
Max delay: 300 seconds (5 minutes)
Max attempts: infinite (with jitter)
Jitter: ±20% randomization
```

### 6.3 Heartbeat
- **Interval**: 30 seconds
- **Broker tolerance**: 60 seconds without heartbeat = mark offline
- **Agent detection**: If no response to 3 consecutive heartbeats, trigger reconnect

### 6.4 Session Expiry
- **Authenticated session**: 1 hour (Tier 3 `expiresAt`)
- **Credential request**: Valid for 60 seconds after issuance
- **Command execution**: 5 minutes (`timeout: 300`)

---

## 7. Error Handling

### 7.1 Error Codes

| Code | Description | Fatal? | Action |
|------|-------------|--------|--------|
| `TIER_1_INVALID` | Tier 1 response hash mismatch | Yes | Close connection, agent reconnects |
| `TIER_1_EXPIRED` | Challenge older than 30s | Yes | Close connection |
| `TIER_1_DECRYPT` | Failed to decrypt response | Yes | Close connection |
| `TIER_2_MISMATCH` | Handshake UUID doesn't match | Yes | Close connection |
| `TIER_2_HOSTNAME` | Hostname verification failed | Yes | Close connection |
| `TIER_3_INVALID` | Session readiness check failed | Yes | Close connection |
| `HEARTBEAT_TIMEOUT` | No heartbeat received | No | Mark offline, keep socket open for 30s |
| `COMMAND_TIMEOUT` | Command exceeded 5 minutes | No | Return exit_code: -1 |
| `COMMAND_REJECTED` | Command not in allowed list | No | Return error, keep connection |
| `CREDENTIALS_FAIL` | Agent couldn't retrieve credentials | No | Return error to user |
| `RATE_LIMITED` | Too many connection attempts | Yes | Close connection, ban IP for 1 min |

### 7.2 Error Message Format
```json
{
  "type": "error",
  "timestamp": "2026-01-27T12:00:00Z",
  "version": "2.0",
  "code": "TIER_1_INVALID",
  "message": "Tier 1 response hash verification failed",
  "fatal": true
}
```

---

## 8. Security Considerations

### 8.1 Secrets Never Transmitted
- `handshake_uuid` is never sent over the wire
- Only a nonce-bound HMAC proof is transmitted
- Even if the hash is intercepted, it cannot be reversed without the UUID

### 8.2 Machine-Binding
- Agent secrets are encrypted with machine-id
- Encrypted vault cannot be decrypted on another machine
- Even with stolen database + stolen vault file: attacker still needs correct machine

### 8.3 Forward Secrecy
- Session keys (Tier 3) are ephemeral
- No long-lived shared secret beyond the initial handshake UUID
- Compromising one session does not compromise past or future sessions

### 8.4 Denial of Service
- Challenge timeout limits resource consumption
- Rate limiting on connections per IP
- Max challenge Map size with LRU eviction prevents memory exhaustion
- No unlimited retry without backoff

### 8.5 Logging
- Broker logs: Challenge IDs, timestamps, IP addresses, agent versions
- **Never logged**: `handshake_uuid`, session keys, decrypted payloads, SSH credentials
- All logs go through redaction layer (`lib/logging/structured.ts`)

---

## 9. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-15 | Initial protocol with 3-tier handshake |
| 2.0 | 2026-01-27 | Formal specification, state machine, error codes, credentials request |

---

## 10. References

- `lib/agent/generator.ts` — Agent implementation
- `server.js` — Broker implementation (transitional, see Phase 3)
- `lib/prisma/transaction-wrapper.ts` — Database atomicity
- `lib/logging/structured.ts` — Observability contract
- `types/engine.ts` — TypeScript type definitions
