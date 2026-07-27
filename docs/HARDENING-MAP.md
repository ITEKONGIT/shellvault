# ShellVault Hardening Map

This document maps the current issues, errors, and vulnerabilities spotted in ShellVault. It is intended to become the implementation checklist for the hardening phase.

## Priority Legend

- **P0 Critical**: can lead directly to shell takeover, credential exposure, or broad fleet compromise.
- **P1 High**: serious security gap or reliability issue that blocks production hardening.
- **P2 Medium**: weakens guarantees, increases blast radius, or creates operational fragility.
- **P3 Low**: cleanup, documentation, or future-proofing.

## Current System Errors

### E1. Global `npm` Entry Point Is Broken

**Priority:** P2  
**Observed:** `npm run build` fails because Node looks for a missing global npm CLI at:

```text
C:\Users\aweem\AppData\Roaming\npm\node_modules\npm\bin\npm-cli.js
```

**Impact:**

- Normal project commands cannot be trusted on this machine.
- Build/test verification requires bypassing npm through local binaries.

**Current workaround:**

```bash
node node_modules\typescript\bin\tsc --noEmit
node node_modules\next\dist\bin\next build
```

**Fix design:**

- Repair or reinstall local/global Node/npm installation.
- Prefer adding package-manager metadata once the intended package manager is chosen.
- Keep CI using project-local dependencies instead of global npm assumptions.

### E2. Next Build Root Detection Fails

**Priority:** P1  
**Status:** Fixed  
**Observed:** Next/Turbopack detects multiple lockfiles and chooses `C:\Users\aweem` as workspace root, then fails with access denied while reading `C:\Users\aweem`.

**Impact:**

- Production build is currently blocked.
- Turbopack scans outside the project boundary.

**Implemented fix:**

- Add an explicit `next.config` setting for the project root.
- Cap local build workers with `experimental.cpus` to avoid Windows worker OOM during page-data generation.

**Remaining note:**

- The global `npm` entry point is still a local machine issue; project-local `node node_modules\next\dist\bin\next build` succeeds.

### E3. Redis Reconnect Storm

**Priority:** P1  
**Status:** Partially fixed  
**Observed:** Logs show repeated Redis `ECONNREFUSED` errors and tens of thousands of reconnect attempts.

**Impact:**

- Web auth/session reliability depends on Redis.
- Reconnect logging can flood logs and hide more important events.
- Redis outage may break login/session behavior.

**Implemented fix:**

- Tune retry strategy and logging to avoid noisy reconnect loops.
- Add a health endpoint field for Redis status.

**Remaining fix design:**

- Make Redis startup explicit in local docs.
- Fail closed with clearer UX for auth-sensitive routes when Redis is unavailable.

### E4. Phase 0 Gate Script Depends On Broken `npx`

**Priority:** P3  
**Observed:** `scripts/verify-phase-0.ts` failed its TypeScript subcheck because it shells out to `npx tsc`, while direct local TypeScript passed.

**Impact:**

- False negative in project verification.

**Fix design:**

- Replace `npx tsc` with a project-local binary invocation.
- Make the script cross-platform.

## Security Vulnerability Map

### V1. Terminal WebSocket Uses Bearer `sessionId` In URL

**Priority:** P0 Critical  
**Status:** Fixed for the current browser terminal flow  
**Area:** `server.js`, `components/terminal/SSHTerminal.tsx`, `app/servers/[id]/page.tsx`

**Previous behavior:**

- Browser connects to:

```text
/api/ssh/stream?sessionId=...
```

- Broker accepts the WebSocket if `terminalSessions.has(sessionId)`.
- No user identity is re-checked at WebSocket attach time.

**Attack path:**

1. Attacker obtains terminal `sessionId` from browser history, logs, proxy traces, APM, copied URL, or referrer leakage.
2. Attacker connects to the terminal WebSocket with that ID.
3. Broker attaches attacker to an existing interactive shell.

**Impact:**

- Full terminal hijack.

**Implemented fix:**

- Terminal WebSocket no longer receives `sessionId` in the URL.
- Browser sends a signed terminal grant as the first WebSocket message.
- Grants bind `userId`, `serverId`, `sessionId`, purpose, nonce, and expiry.
- Broker verifies the grant before attaching the SSH stream.
- Broker rejects duplicate attachment to the same terminal session.

**Remaining fix design:**

- Move terminal session metadata from broker memory to Redis.
- Make stream grants one-time across broker restarts and multiple broker instances.

**Implementation order:**

1. Add grant issuing in terminal spawn route.
2. Pass grant to broker connect and stream paths.
3. Broker validates grant before creating or attaching terminal sessions.
4. Make stream attach single-use or owner-bound.

### V2. Broker Control Endpoints Lack Strong Service Authentication

**Priority:** P0 Critical  
**Status:** Fixed with shared internal token; scoped grants still used for terminal sessions  
**Area:** `server.js`, `app/api/servers/[id]/terminal/spawn/route.ts`, `app/servers/[id]/page.tsx`

**Previous behavior:**

- `/api/credentials` and `/api/ssh/connect` accept powerful actions from HTTP requests.
- The broker trusts requests without a visible signed service-to-service credential.

**Attack path:**

1. Attacker reaches broker HTTP endpoint.
2. Attacker requests credentials or initiates SSH connection attempts.

**Impact:**

- Credential exposure or unauthorized connection attempts.

**Implemented fix:**

- Require token on every control endpoint.
- Browser no longer calls broker `/api/ssh/connect` directly.
- Next.js server route calls broker control endpoints with `Authorization: Bearer <BROKER_INTERNAL_TOKEN>`.
- Terminal stream access is additionally scoped by signed terminal grants.

**Remaining fix design:**

- Add structured broker audit events for every control action.
- Replace shared internal token with rotating service JWTs or mTLS for production.

### V3. Protocol Encryption Key Is Derived From `userId`

**Priority:** P1 High  
**Status:** Fixed for newly generated agents; full forward secrecy still pending  
**Area:** `server.js`, generated Python agent in `lib/agent/generator.ts`

**Previous behavior:**

- Broker crypto derives AES-GCM key from `userId`.
- Agent receives/uses the same user ID.
- `userId` is an identifier, not a secret.

**Attack path:**

1. Attacker learns or obtains a user UUID.
2. Attacker can derive the same key material used for protocol payload encryption.

**Impact:**

- Challenge confidentiality is weaker than intended.
- Protocol claims can be challenged in review.

**Implemented fix:**

- Treat `userId` and `serverId` as public identifiers.
- Derive current AES-GCM challenge encryption from `handshakeUuid`, not `userId`.

**Remaining fix design:**

- Add ephemeral X25519/ECDH exchange and derive session keys with HKDF.
- Use separate keys for broker-to-agent and agent-to-broker traffic.

### V4. `handshakeUuid` Was Transmitted In Tier 2 Payload

**Priority:** P1 High  
**Status:** Fixed for newly generated agents  
**Area:** `server.js`, `lib/agent/generator.ts`, `docs/AUTH-PROTOCOL-v2.md`

**Previous behavior:**

- Tier 2 response includes `handshake_uuid`.
- The protocol goal says this should not leave the agent machine in plaintext/recoverable form.

**Attack path:**

1. Attacker compromises protocol encryption key or broker logs/memory.
2. Attacker obtains long-lived agent shared secret.

**Impact:**

- Agent identity secret exposure.

**Implemented fix:**

- Replace Tier 2 secret transmission with:

```text
HMAC(handshakeUuid, challengeId || nonce || serverId || hostname)
```

- Broker verifies HMAC using stored secret.
- Use constant-time comparison.

**Remaining compatibility note:**

- Already-installed agents must be reinstalled or upgraded to speak the hardened Tier 2 protocol.

### V5. SSH Host-Key Verification Is Missing

**Priority:** P1 High  
**Status:** Enforcement hooks added; enrollment storage still pending  
**Area:** `server.js`, `lib/ssh/ssh-connection.ts`, `lib/ssh/client.ts`, `lib/agent/installer.ts`

**Previous behavior:**

- SSH connection code does not visibly pin or verify host keys.
- Installer test uses `StrictHostKeyChecking=no`.

**Attack path:**

1. DNS/ARP/network attacker or reassigned IP presents a different SSH host.
2. Broker or installer connects without cryptographic host identity verification.

**Impact:**

- SSH MITM.
- Credential interception or wrong-host terminal access.

**Implemented groundwork:**

- SSH client paths now support SHA-256 host-key fingerprint verification when an expected fingerprint is provided.

**Remaining fix design:**

- Add `hostKeyFingerprint` to server model.
- Capture fingerprint at enrollment.
- Enforce host verifier in all SSH client connections.
- Treat host-key changes as blocking security events requiring re-approval.

### V6. Private Key Material Can Move Through Broker/Frontend Paths

**Priority:** P0 Critical  
**Status:** Browser exposure fixed for current terminal spawn flow; broker credential handling remains  
**Area:** `lib/agent/generator.ts`, `server.js`, `app/api/servers/[id]/terminal/spawn/route.ts`, `app/servers/[id]/page.tsx`

**Previous behavior:**

- Agent can return private key content.
- Spawn route may return key path/content-derived credential fields to the browser.
- Broker can hold credentials for SSH connection setup.

**Attack path:**

1. Browser, frontend logs, devtools, proxy, or broker memory is compromised.
2. SSH credential material is exposed.

**Impact:**

- Credential theft.
- Persistent server compromise if key is reusable.

**Implemented fix:**

- Never return passwords or private key content to the browser.

**Remaining fix design:**

- Longer term: replace broker-side SSH with agent-side PTY streaming so credentials never leave the managed server.

### V7. Broker State Is In Memory

**Priority:** P1 High  
**Area:** `server.js`

**Current behavior:**

- Agents, challenges, credential requests, and terminal sessions are in process memory.

**Impact:**

- No horizontal scaling.
- State lost on restart.
- Challenge/session enforcement inconsistent across broker instances.
- Harder to revoke or inspect sessions.

**Fix design:**

- Move challenge IDs, terminal grants, rate limits, and pending credential metadata into Redis with TTLs.
- Keep active WebSocket objects in memory but store session metadata in Redis.

### V8. Agent Runs Powerful Commands With `shell=True`

**Priority:** P1 High  
**Status:** Partially fixed for newly generated agents  
**Area:** generated Python operations in `lib/agent/generator.ts`

**Previous behavior:**

- Agent command execution uses `subprocess.run(..., shell=True)`.
- The systemd service runs as root.

**Attack path:**

1. Broker compromise or protocol bypass sends crafted command.
2. Agent executes with shell interpretation and high privilege.

**Impact:**

- Root command execution on managed server.

**Implemented fix:**

- Generated agents now enforce a small command allowlist.
- Generated agents use structured argument arrays with `shell=False`.

**Remaining fix design:**

- Run agent with least privilege and split privileged helper actions.

### V9. Agent Secret Storage Is Overstated

**Priority:** P2 Medium  
**Area:** `lib/agent/generator.ts`

**Current behavior:**

- `secret_manager.py` derives encryption key from `/etc/machine-id` and public salt.
- Comments call this production-grade.

**Impact:**

- Protects against copying secrets to another machine.
- Does not strongly protect against local attackers who can read machine-id and encrypted secret file.

**Fix design:**

- Reframe as machine binding.
- Remove overclaiming comments.
- Later support TPM, OS keyring, root-only random wrapping keys, or cloud KMS.

### V10. Installer Shell Construction Needs Escaping Discipline

**Priority:** P2 Medium  
**Area:** `lib/agent/installer.ts`, `lib/ssh/client.ts`

**Current behavior:**

- Many shell commands interpolate username/path values.
- Current validation reduces risk, but the installer should not depend on UI validation only.
- `executeSudoCommand` pipes passwords through shell.

**Impact:**

- Command injection if validation is bypassed.
- Password exposure to shell/process surfaces.

**Fix design:**

- Add server-side strict validation for Linux usernames and paths before installer runs.
- Quote shell arguments consistently.
- Avoid shell where possible.
- Prefer sudo stdin stream over `echo password | sudo -S`.

### V11. Redis Is A Hard Auth Dependency Without Graceful UX

**Priority:** P2 Medium  
**Area:** `lib/redis/client.ts`, auth middleware, health route

**Current behavior:**

- Auth depends on Redis session lookup.
- Redis outage logs repeatedly.

**Impact:**

- Users may be logged out or blocked during Redis outages.
- Logs become noisy.

**Fix design:**

- Add Redis status to health endpoint.
- Back off reconnect logging.
- Return clear 503 responses for session-store failures.
- Document Redis as required infrastructure.

### V12. Admin Surface Is Empty But Needs Guardrails

**Priority:** P3 Low now, P1 once implemented  
**Area:** `app/admin/*`

**Current behavior:**

- Admin page files are empty.

**Impact:**

- No immediate admin-route exposure from those pages.
- Future admin implementation could introduce IDOR or missing-auth issues.

**Fix design:**

- Add an admin layout or helper that requires admin auth.
- Add tests/checks so admin pages cannot be shipped without `requireAdmin`.
- Audit every admin action.

### V13. Session Recording Is Missing

**Priority:** P2 Medium  
**Area:** terminal streaming path, `ssh_sessions` model

**Current behavior:**

- DB has session byte counters but no actual terminal recording.

**Impact:**

- Weak audit/compliance story.
- Hard to investigate incidents.

**Fix design:**

- Record terminal streams in an asciinema-like format.
- Store metadata in DB and recordings in file/object storage.
- Protect recordings as sensitive data.

## Recommended Implementation Order

### Phase 1: Stop Shell Hijack And Control-Plane Abuse

1. Add broker internal authentication.
2. Add signed terminal grants.
3. Bind terminal WebSocket attach to grant/user/session ownership.
4. Stop returning credential material to the browser.

### Phase 2: Fix SSH Trust

1. Add server host-key fingerprint fields.
2. Capture host key on enrollment.
3. Enforce host-key verification in broker and installer SSH paths.
4. Add host-key change audit events.

### Phase 3: Fix Protocol Crypto

1. Remove `userId` as crypto secret material.
2. Keep transmitted `handshakeUuid` removed from Tier 2.
3. Add HMAC proof for current protocol.
4. Move to ECDH/HKDF session keys.

### Phase 4: Reduce Agent Blast Radius

1. Remove or restrict general command execution.
2. Remove `shell=True` from agent command execution.
3. Split privileged operations.
4. Reframe and improve secret storage.

### Phase 5: Production Reliability

1. Move broker metadata to Redis.
2. Tune Redis reconnect behavior.
3. Fix Next build root detection.
4. Repair npm/tooling.
5. Add full integration tests.

## Immediate Next Fix Candidate

The first code fix should be **broker control-plane authentication plus terminal session grants**. It directly addresses the highest-risk issue: anyone with a leaked terminal session ID being able to hijack an interactive shell.
