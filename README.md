# ShellVault

**Passwordless remote access through an authenticated agent-broker architecture.**

ShellVault is an experimental secure remote-access platform that reduces direct dependence on user-managed SSH passwords and key files. Instead of asking users to carry credentials around, ShellVault installs a lightweight server-side agent, authenticates that agent through a custom three-tier handshake, and brokers browser-based terminal access through a controlled WebSocket path.

> Status: proof of concept / architecture demonstration. The project is not yet production hardened.

## Why ShellVault Exists

Traditional SSH is powerful, but operationally noisy:

- Users must manage private keys, passphrases, host fingerprints, and rotation.
- Password fallback creates obvious attack paths.
- Teams often centralize access through bastions, VPNs, or shared jump boxes.
- Auditability and credential lifecycle management become separate systems instead of first-class properties.

ShellVault explores a different model: make server access agent-mediated, short-lived, auditable, and cryptographically authenticated by default.

## What It Does Today

ShellVault currently provides:

- A Next.js dashboard for registering and managing servers.
- TOTP-based user login with email verification, JWT cookies, Redis-backed sessions, lockout, and audit logging.
- A Prisma/PostgreSQL data model for users, servers, SSH sessions, and audit events.
- A generated Python agent that runs as a systemd service on managed Linux servers.
- Machine-bound encrypted agent secret storage in `/etc/shellvault/secrets.enc`.
- A standalone Node.js broker that accepts agent WebSocket connections.
- A three-tier agent-broker authentication handshake using AES-256-GCM challenge payloads.
- On-demand credential retrieval from the authenticated agent.
- Browser terminal streaming through xterm.js and broker-managed WebSocket sessions.

Important honesty: ShellVault does not fully remove SSH yet. The current implementation uses SSH for initial agent installation and for broker-side terminal attachment. The user-facing goal is to hide credential handling and replace direct SSH workflow friction with an authenticated brokered access model.

## Architecture

ShellVault is built around four main pieces:

1. **Web App**
   - Next.js application.
   - Handles user auth, server registration, dashboard UI, and terminal launch.

2. **Broker**
   - Standalone Node.js WebSocket/HTTP service in `server.js`.
   - Authenticates agents.
   - Tracks online agents.
   - Requests credentials.
   - Opens and streams terminal sessions.

3. **Agent**
   - Generated Python service installed on the target server.
   - Stores identity secrets in an encrypted machine-bound vault.
   - Maintains a WebSocket connection to the broker.
   - Responds to handshake challenges, heartbeat checks, command requests, and credential requests.

4. **Database and Session Layer**
   - PostgreSQL via Prisma.
   - Redis for web sessions.
   - Audit logging for authentication, server management, and administrative actions.

## Access Flow

```text
User -> Web App -> Broker -> Agent -> Managed Server
```

High-level connection flow:

1. User logs in with TOTP.
2. User registers a server in the dashboard.
3. ShellVault optionally uses a one-time SSH password to install the agent.
4. Agent stores its identity material in an encrypted vault.
5. Agent connects to the broker over WebSocket.
6. Broker and agent complete the ShellVault Agent-Broker Protocol handshake.
7. User clicks "Connect Terminal".
8. Web app asks the broker for an access session.
9. Broker requests credentials from the authenticated agent.
10. Broker opens a terminal channel and streams it to the browser.

## Authentication Protocol

The protocol is documented in:

```text
docs/AUTH-PROTOCOL-v2.md
```

The current protocol design includes:

- agent-to-broker identity binding,
- challenge-response authentication,
- replay-resistant challenge IDs,
- time-bounded challenge windows,
- encrypted challenge and response payloads,
- heartbeat-based liveness tracking,
- credential request and response messages.

The protocol is still evolving. Future hardening should replace identifier-derived encryption keys with a proper ephemeral key exchange and avoid transmitting long-lived agent secrets in any form.

## Security Model

ShellVault is designed around these principles:

- **No persistent user-facing SSH password storage.**
- **Agent identity is bound to the managed server.**
- **Access is brokered and auditable.**
- **Terminal sessions are initiated only after user and agent checks.**
- **Secrets should stay out of logs and browser-visible responses.**

Known security work still needed:

- Replace `userId`-derived broker encryption keys with a real secret or ephemeral ECDH handshake.
- Stop transmitting `handshakeUuid` in protocol payloads.
- Add signed broker API grants for `/api/credentials`, `/api/ssh/connect`, and terminal WebSockets.
- Move challenge, rate-limit, and broker session state from memory into Redis.
- Prevent private key material from reaching the browser.
- Prefer agent-side PTY streaming so the broker relays sessions instead of holding SSH credentials.
- Add production-grade origin checks, TLS requirements, and broker service authentication.

A deeper threat model is maintained in:

```text
docs/THREAT-MODEL.md
```

The current hardening checklist is maintained in:

```text
docs/HARDENING-MAP.md
```

## Repository Layout

```text
app/                         Next.js app routes and API routes
components/                  Dashboard and terminal UI components
docs/AUTH-PROTOCOL-v2.md     Agent-broker protocol specification
docs/THREAT-MODEL.md         Current trust boundaries and hardening plan
docs/HARDENING-MAP.md        Prioritized issue map and fix order
lib/agent/                   Agent generator and installer
lib/auth/                    JWT, TOTP, cookie, and auth middleware
lib/db/                      Prisma client singleton
lib/redis/                   Redis session storage
lib/ssh/                     SSH client and connection helpers
lib/logging/                 Structured logging and redaction
prisma/                      Database schema and migrations
server.js                    Transitional broker implementation
scripts/                     Setup and verification scripts
types/                       Central engine type definitions
```

## Requirements

- Node.js
- PostgreSQL
- Redis
- Linux target server with:
  - Python 3
  - sudo-capable installation user
  - SSH available for first-time bootstrap

## Environment

Create a `.env` file from `.env.example` and configure at least:

```text
DATABASE_URL=
JWT_SECRET=
REDIS_HOST=
REDIS_PORT=
NEXT_PUBLIC_APP_URL=
AGENT_BROKER_URL=
BROKER_URL=
NEXT_PUBLIC_BROKER_URL=
NEXT_PUBLIC_BROKER_WS_URL=
```

Do not commit `.env` files. They are ignored by default.

## Local Development

Install dependencies:

```bash
npm install
```

Generate Prisma client:

```bash
npm run db:generate
```

Run migrations:

```bash
npm run db:migrate
```

Start the Next.js app:

```bash
npm run dev
```

Start the broker in a second terminal:

```bash
node server.js
```

By default:

- Web app: `http://localhost:3000`
- Broker HTTP: `http://localhost:8080`
- Agent WebSocket: `ws://localhost:8080/api/broker`
- Terminal WebSocket: `ws://localhost:8080/api/ssh/stream`

## Verification

Type-check the project:

```bash
npx tsc --noEmit
```

Run the Phase 0 structural audit:

```bash
npx tsx scripts/verify-phase-0.ts
```

## Current Limitations

- The broker is transitional and currently lives in `server.js`.
- Broker state is in memory.
- Redis is required for web sessions and must be running.
- Build behavior may need explicit Next.js root configuration in workspaces with multiple lockfiles.
- Some archived code and test files remain under `archive/` for historical reference.

## Roadmap

- Migrate broker logic from `server.js` into typed modules.
- Introduce ephemeral ECDH session keys and HKDF-derived channel keys.
- Move broker state to Redis.
- Add signed terminal grants between the web app and broker.
- Move from broker-side SSH credential handling to agent-side PTY streaming.
- Add integration tests for full agent-broker-terminal flow.
- Add deployment documentation and production hardening checklist.

## License

No license has been declared yet.
