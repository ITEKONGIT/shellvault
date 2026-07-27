# Threat Model: ShellVault

ShellVault is a remote-access system. Its most important security question is not only whether users can log in, but whether every step between the browser, broker, agent, and managed server preserves the intended trust boundary.

This document describes the current trust model, known attack surfaces, and the security improvements needed before ShellVault can be considered production hardened.

## Trust Boundaries

ShellVault currently has four major trust zones:

1. **Browser**
   - Untrusted until the user is authenticated.
   - Runs the dashboard and terminal UI.
   - Receives terminal output and sends terminal input.

2. **Broker**
   - The trusted core of the system.
   - Includes the standalone `server.js` broker and the Next.js API layer.
   - Holds access to JWT signing material, database credentials, Redis, agent registry state, and terminal session state.

3. **Agent**
   - Semi-trusted Python systemd service on each managed server.
   - Holds the managed server's local access material.
   - Authenticates to the broker and responds to broker requests.

4. **Managed Server**
   - The protected asset.
   - The thing ShellVault ultimately grants access to.

The broker is the highest-value target. A broker compromise can become standing access to every online agent and every managed server reachable through those agents.

## Assets

Key assets include:

- User web sessions and refresh tokens.
- JWT signing keys.
- Database credentials.
- Redis session data.
- `serverId`, `userId`, and agent identity material.
- Agent `handshakeUuid` values.
- Terminal session identifiers.
- SSH private keys, passwords, or ssh-agent handles.
- Terminal input and output streams.
- Audit logs and session metadata.

## Attack Surface

### 1. Agent-Broker Handshake

The ShellVault Agent-Broker Protocol uses a tiered challenge-response design with AES-256-GCM encrypted payloads, single-use challenges, and 30-second challenge windows.

This is a strong structure. The original implementation derived challenge encryption from `userId`, which is an identifier rather than a cryptographic secret. The current implementation uses the agent `handshakeUuid` as the Scrypt input instead, while public identifiers remain identifiers only.

Current risk:

- The protocol still does not provide full ephemeral forward secrecy.
- A broker/database compromise can expose stored agent secrets.

Resolved hardening:

- Protocol encryption is no longer derived from `userId`.
- Tier 2 no longer transmits `handshakeUuid`; newly generated agents prove possession with a nonce-bound HMAC.

Better direction:

- Treat `userId` and `serverId` as public identifiers.
- Add an ephemeral ECDH exchange for session keys.
- Derive channel keys with HKDF.
- Continue using HMAC proofs for `handshakeUuid` possession.
- Use constant-time comparison for all secret-derived proofs.

### 2. Terminal WebSocket Session Binding

The terminal stream endpoint currently uses:

```text
/api/ssh/stream?sessionId=...
```

The broker-side WebSocket upgrade path checks whether `sessionId` exists in an in-memory map. That makes the session ID a bearer capability: whoever has it can attempt to attach to the terminal stream.

This is risky because URL query parameters can leak through:

- browser history,
- reverse proxy logs,
- error tracking tools,
- APM traces,
- server logs,
- accidental copy/paste,
- referrer headers if third-party resources are introduced later.

Current risk:

- A leaked `sessionId` can become an interactive shell hijack.
- The WebSocket reconnect path does not visibly re-check the authenticated user's identity.
- Session ownership is not bound strongly enough to the web user who initiated the terminal.

Better direction:

- Bind every terminal stream to the authenticated user.
- Verify a signed, short-lived terminal grant during WebSocket upgrade or as the first WebSocket message.
- Do not pass powerful session secrets in URL query strings.
- Make terminal stream grants single-use and short-lived.
- Store session ownership and expiry server-side.

### 3. Broker HTTP Endpoints

Broker endpoints such as credential requests and SSH connection setup are powerful internal control-plane operations.

Current risk:

- If these endpoints are reachable without strong service-to-service authentication, an attacker can request credentials or initiate connection attempts.
- Trust is partly based on local network assumptions.

Better direction:

- Require signed service-to-service tokens between the Next.js app and broker.
- Use short-lived terminal grants scoped to `userId`, `serverId`, `sessionId`, and expiry.
- Reject requests that do not map to an authenticated user and an active server authorization.
- Add rate limiting and audit events at the broker boundary.

### 4. Outbound SSH Host Verification

Current SSH connection code does not visibly enforce host-key pinning or known-host verification.

Current risk:

- The broker may connect to an attacker-controlled SSH server during DNS spoofing, ARP spoofing, server rebuilds, or IP reassignment.
- This weakens ShellVault's claim to improve remote-access trust.

Better direction:

- Capture and pin host keys during server enrollment.
- Store host key fingerprints in the database.
- Refuse connections when the host key changes unless explicitly re-approved.
- Show host key changes as high-severity audit events.

### 5. Agent Secret Storage

The generated agent stores secrets in `/etc/shellvault/secrets.enc`, encrypted with a key derived from `/etc/machine-id` and a hardcoded salt.

This is useful as an anti-portability control: copying `secrets.enc` to another machine should not be enough to decrypt it.

It should not be described as strong confidentiality against local attackers, because `/etc/machine-id` is commonly readable by local users and the salt is public source code.

Current risk:

- Local users or compromised local processes may derive the same key if they can read both inputs.
- Comments that frame this as "production-grade" overstate the guarantee.

Better direction:

- Reframe the current control as machine binding, not strong at-rest secrecy.
- Prefer OS keyrings, TPM-backed storage, systemd credentials, cloud KMS, or root-only generated random keys where available.
- Keep `/etc/shellvault` root-owned with strict permissions.
- Document the local attacker assumptions clearly.

### 6. Agent Command Execution

The agent has command-execution capability and currently runs with high privilege.

Current risk:

- If command routing expands beyond intended operations, the agent becomes a general root command executor.
- A compromised broker could expand the agent's effective command surface.

Better direction:

- Enforce command allowlists on the agent, not only on broker-supplied capability lists.
- Avoid `shell=True` for structured commands.
- Run the agent with the least privilege possible.
- Separate terminal streaming from administrative agent commands.

### 7. Web Authentication and Session Layer

The web auth layer is one of the stronger areas of the project.

Current strengths:

- TOTP-based login.
- Email verification.
- JWT signature and expiry checks.
- Redis-backed session existence checks.
- User/session match validation.
- IP binding.
- Account lockout and active-status checks.
- Audit logging.

Tradeoff:

- IP binding reduces pure token replay risk, but may create friction for users on mobile networks, VPNs, or CGNAT connections.

Future review:

- Confirm refresh-token rotation on use.
- Confirm logout revokes all relevant sessions.
- Confirm admin routes consistently require admin authorization.

### 8. Stored Input and Shell Construction

The reviewed installer commands are mostly fixed strings, which reduces injection risk.

Remaining review areas:

- Any place `hostname`, `server name`, `username`, `notes`, `tags`, or other stored fields reach a shell command.
- Any path where broker or agent command strings are built from user-controlled input.

Better direction:

- Validate and normalize all server enrollment fields.
- Avoid interpolating user-controlled data into shell commands.
- Use structured process arguments where possible.

### 9. Admin Surface

The admin UI and admin APIs need a dedicated authorization review.

Review goals:

- Confirm `requireAdmin` is applied consistently.
- Check for IDOR issues across users, servers, sessions, and audit logs.
- Ensure admin actions are audited.
- Ensure admin pages do not expose secrets or full credential payloads.

## STRIDE Summary

| Threat | Area | Severity | Current Status |
| --- | --- | --- | --- |
| Session hijack via leaked `sessionId` | Terminal WebSocket | High | Real gap; needs auth binding |
| SSH MITM | Outbound SSH | High | Needs host-key pinning |
| Predictable protocol encryption key | Agent-broker handshake | Medium-High | Needs crypto redesign |
| Agent secret exposure to local users | `secret_manager.py` | Medium | Machine binding, not strong local secrecy |
| Token replay from different IP | Web auth/session | Low | Mitigated by IP binding |
| Command injection via stored fields | Installer/terminal paths | Low/Unknown | Needs targeted review |
| Admin authorization gaps | Admin routes | Unknown | Needs dedicated review |
| Broker compromise | Broker trust zone | Critical | Central architectural risk |

## Highest-Priority Fixes

1. **Bind terminal WebSocket sessions to authenticated users.**
   - Remove powerful bearer IDs from URLs where possible.
   - Add signed, short-lived, single-use terminal grants.
   - Re-check ownership on terminal attach.

2. **Add SSH host-key verification.**
   - Pin host fingerprints during enrollment.
   - Reject unexpected host-key changes.

3. **Redesign protocol key derivation.**
   - Stop deriving encryption from `userId`.
   - Use ephemeral ECDH and HKDF.
   - Use HMAC proofs for `handshakeUuid`.

4. **Keep credentials away from the browser.**
   - The browser should never receive SSH private key content or passwords.
   - Prefer agent-side PTY streaming so the broker relays access rather than holding credentials.

5. **Move broker state out of memory.**
   - Store challenges, terminal grants, rate limits, and session state in Redis with TTLs.

6. **Clarify secret-storage guarantees.**
   - Describe current agent secret encryption as machine binding.
   - Avoid marketing language that overstates local-at-rest confidentiality.

## Product Direction

ShellVault has a recognizable product shape: a self-hosted, open-source access broker for teams that want browser-based fleet access without handing infrastructure secrets to a SaaS vendor.

The closest product category is similar to Teleport, Boundary, StrongDM, Tailscale SSH, or browser terminal tools such as ttyd and Wetty, but ShellVault's opportunity is the combination of:

- self-hosting,
- agent-mediated access,
- multi-user auth,
- audit logs,
- server health,
- browser terminal access,
- future session recording,
- future RBAC and approval workflows.

The project becomes much more defensible if the terminal session binding, host-key pinning, and handshake crypto concerns are fixed before it is positioned as production-grade security software.

## Future Hardening Roadmap

- Add terminal session recording and replay.
- Add per-server RBAC instead of only `isAdmin`.
- Add time-boxed access grants.
- Add approval workflows for sensitive servers.
- Add broker-side service authentication.
- Add formal integration tests for the full browser-broker-agent flow.
- Add a crypto review before calling the handshake production ready.
- Add deployment docs for TLS, reverse proxies, Redis, PostgreSQL, and broker isolation.
