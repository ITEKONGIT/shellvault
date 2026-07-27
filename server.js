// server.js - Full WebSocket Broker with 3-Tier Handshake + Credential Retrieval + SSH Terminal
// ✅ FIXED: Proper shutdown handling, database status updates
// ✅ FIXED: SSH key content vs path handling
// ✅ NEW: SSH Terminal WebSocket support

const { WebSocketServer } = require('ws');
const http = require('http');
const url = require('url');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const { Client: SSHClient } = require('ssh2');
const fs = require('fs');

const prisma = new PrismaClient();

console.log('🚀 Starting ShellVault WebSocket Broker Server...\n');

// In-memory agent registry
const agents = new Map();

// In-memory SSH terminal sessions
const terminalSessions = new Map();

// In-memory challenge storage (should use Redis in production)
const challenges = new Map();

// Pending credential requests
const pendingCredentialRequests = new Map();

// ✅ FIX: Track if shutdown is in progress
let isShuttingDown = false;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTILITY FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function timestamp() {
  return new Date().toISOString();
}

function base64UrlEncode(input) {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecode(input) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function getBrokerInternalToken() {
  const token = process.env.BROKER_INTERNAL_TOKEN;
  if (!token && process.env.NODE_ENV === 'production') {
    throw new Error('BROKER_INTERNAL_TOKEN is required in production');
  }
  return token || 'dev-shellvault-broker-token-change-me';
}

function getTerminalGrantSecret() {
  const secret = process.env.TERMINAL_GRANT_SECRET || process.env.BROKER_INTERNAL_TOKEN;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('TERMINAL_GRANT_SECRET or BROKER_INTERNAL_TOKEN is required in production');
  }
  return secret || 'dev-shellvault-terminal-grant-change-me';
}

function timingSafeEqualString(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function isInternalRequest(req) {
  const auth = req.headers.authorization || '';
  const expected = `Bearer ${getBrokerInternalToken()}`;
  return timingSafeEqualString(auth, expected);
}

function rejectUnauthorized(res) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, error: 'Unauthorized broker request' }));
}

function signTerminalGrant(payload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', getTerminalGrantSecret())
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifyTerminalGrant(token, expected = {}) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, error: 'Missing terminal grant' };
  }

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return { valid: false, error: 'Malformed terminal grant' };
  }

  const expectedSignature = crypto
    .createHmac('sha256', getTerminalGrantSecret())
    .update(encodedPayload)
    .digest('base64url');

  if (!timingSafeEqualString(signature, expectedSignature)) {
    return { valid: false, error: 'Invalid terminal grant signature' };
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch (error) {
    return { valid: false, error: 'Invalid terminal grant payload' };
  }

  if (payload.purpose !== 'terminal-stream') {
    return { valid: false, error: 'Invalid terminal grant purpose' };
  }

  if (!payload.expiresAt || Date.parse(payload.expiresAt) <= Date.now()) {
    return { valid: false, error: 'Terminal grant expired' };
  }

  for (const [key, value] of Object.entries(expected)) {
    if (value !== undefined && payload[key] !== value) {
      return { valid: false, error: `Terminal grant ${key} mismatch` };
    }
  }

  return { valid: true, payload };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AES-256-GCM CRYPTO UTILITIES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;       // 256 bits
const IV_LENGTH = 12;        // 96 bits (recommended for GCM)
const AUTH_TAG_LENGTH = 16;  // 128 bits
const SALT = 'shellvault-secure-salt-v1';

/**
 * Derive a 256-bit encryption key from an agent secret using Scrypt.
 */
function deriveKey(secret) {
  return crypto.scryptSync(
    secret,
    SALT,
    KEY_LENGTH,
    {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024
    }
  );
}

/**
 * Encrypt data using AES-256-GCM
 */
function encrypt(data, secret) {
  try {
    const key = deriveKey(secret);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    const plaintext = JSON.stringify(data);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, encrypted, authTag]);
    
    return combined.toString('base64');
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt data using AES-256-GCM
 */
function decrypt(encryptedData, secret) {
  try {
    const key = deriveKey(secret);
    const combined = Buffer.from(encryptedData, 'base64');
    
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(-AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH, -AUTH_TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return JSON.parse(decrypted.toString('utf8'));
  } catch (error) {
    return null;
  }
}

function generateNonce() {
  return crypto.randomBytes(32).toString('hex');
}

function hash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function generateUuid() {
  return crypto.randomUUID();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DATABASE HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function updateServerStatus(serverId, status) {
  try {
    await prisma.server.update({
      where: { id: serverId },
      data: {
        agentHealthStatus: status,
        agentLastSeen: new Date(),
      },
    });
    console.log(`   📝 Database updated: ${status}`);
  } catch (error) {
    console.error(`   ⚠️  Failed to update database: ${error.message}`);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TIER 1: PROOF OF KEY OWNERSHIP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function generateTier1Challenge(userId, serverId, encryptionSecret) {
  const challengeId = generateUuid();
  const nonce = generateNonce();
  const timestamp = new Date().toISOString();
  
  const payload = {
    tier: 1,
    nonce,
    timestamp,
    challenge_id: challengeId,
  };
  
  const encrypted = encrypt(payload, encryptionSecret);
  
  const challenge = {
    id: challengeId,
    tier: 1,
    serverId,
    userId,
    timestamp,
    payload,
    encrypted,
  };
  
  challenges.set(challengeId, challenge);
  setTimeout(() => challenges.delete(challengeId), 30000);
  
  console.log(`[TIER 1] Challenge generated for server ${serverId.substring(0, 8)}...`);
  
  return challenge;
}

function verifyTier1Response(challenge, response, handshakeUuid) {
  const expectedHash = hash(
    `${challenge.payload.nonce}:${handshakeUuid}:${challenge.payload.timestamp}`
  );
  return response.response_hash === expectedHash;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TIER 2: IDENTITY VERIFICATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function generateTier2Challenge(userId, serverId, handshakeUuid) {
  const challengeId = generateUuid();
  const nonce = generateNonce();
  const timestamp = new Date().toISOString();
  
  const payload = {
    tier: 2,
    challenge_id: challengeId,
    nonce,
    metadata: {
      verify_hostname: true,
      timestamp,
    },
  };
  
  const encrypted = encrypt(payload, handshakeUuid);
  
  const challenge = {
    id: challengeId,
    tier: 2,
    serverId,
    userId,
    timestamp,
    payload,
    encrypted,
  };
  
  challenges.set(challengeId, challenge);
  setTimeout(() => challenges.delete(challengeId), 30000);
  
  console.log(`[TIER 2] Challenge generated for server ${serverId.substring(0, 8)}...`);
  return challenge;
}

function verifyTier2Response(response, expectedHandshakeUuid, challenge) {
  if (!response.verified || !response.hostname || !response.proof) {
    return false;
  }

  const expectedProof = hmac(
    expectedHandshakeUuid,
    `${challenge.payload.challenge_id}:${challenge.payload.nonce}:${challenge.serverId}:${response.hostname}`
  );

  return timingSafeEqualString(response.proof, expectedProof);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TIER 3: SESSION KEY EXCHANGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function generateTier3Challenge(userId, serverId, encryptionSecret) {
  const challengeId = generateUuid();
  const sessionId = generateUuid();
  const sessionKey = generateNonce();
  const timestamp = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  
  const payload = {
    tier: 3,
    challenge_id: challengeId,
    session_id: sessionId,
    session_key: sessionKey,
    expires_at: expiresAt,
    allowed_commands: ['ssh', 'sftp'],
  };
  
  const encrypted = encrypt(payload, encryptionSecret);
  
  const challenge = {
    id: challengeId,
    tier: 3,
    serverId,
    userId,
    timestamp,
    sessionId,
    sessionKey,
    payload,
    encrypted,
  };
  
  challenges.set(challengeId, challenge);
  setTimeout(() => challenges.delete(challengeId), 30000);
  
  console.log(`[TIER 3] Challenge generated for server ${serverId.substring(0, 8)}...`);
  return challenge;
}

function verifyTier3Response(response) {
  return response.session_ready && response.agent_ready;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CREDENTIAL REQUEST FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function requestCredentials(serverId, sessionId) {
  const agent = agents.get(serverId);
  
  if (!agent) {
    throw new Error('Agent not connected');
  }
  
  if (!agent.authenticated) {
    throw new Error('Agent not authenticated');
  }
  
  console.log(`[${timestamp()}] 🔑 Requesting credentials from agent`);
  console.log(`   Server ID: ${serverId.substring(0, 8)}...`);
  console.log(`   Session ID: ${sessionId}`);
  
  const credentialPromise = new Promise((resolve, reject) => {
    pendingCredentialRequests.set(sessionId, { 
      resolve, 
      reject,
      requestedAt: new Date()
    });
    
    setTimeout(() => {
      if (pendingCredentialRequests.has(sessionId)) {
        pendingCredentialRequests.delete(sessionId);
        reject(new Error('Credentials request timeout'));
      }
    }, 30000);
  });
  
  agent.ws.send(JSON.stringify({
    type: 'credentials_request',
    session_id: sessionId,
    timestamp: new Date().toISOString()
  }));
  
  return credentialPromise;
}

function handleCredentialsResponse(data, encryptionSecret) {
  const { session_id, payload } = data;
  
  console.log(`[${timestamp()}] 🔑 Credentials response received`);
  console.log(`   Session ID: ${session_id}`);
  
  const decrypted = decrypt(payload, encryptionSecret);
  
  if (!decrypted) {
    console.error('❌ Failed to decrypt credentials');
    
    const pending = pendingCredentialRequests.get(session_id);
    if (pending) {
      pending.reject(new Error('Failed to decrypt credentials'));
      pendingCredentialRequests.delete(session_id);
    }
    return;
  }
  
  if (!decrypted.success) {
    console.error('❌ Agent failed to retrieve credentials:', decrypted.error);
    
    const pending = pendingCredentialRequests.get(session_id);
    if (pending) {
      pending.reject(new Error(decrypted.error));
      pendingCredentialRequests.delete(session_id);
    }
    return;
  }
  
  console.log('✅ Credentials retrieved successfully');
  console.log(`   Username: ${decrypted.credentials.username}`);
  console.log(`   Auth Method: ${decrypted.credentials.auth_method}`);
  console.log(`   Retrieved via: ${decrypted.metadata.method_used}`);
  
  const pending = pendingCredentialRequests.get(session_id);
  if (pending) {
    pending.resolve(decrypted.credentials);
    pendingCredentialRequests.delete(session_id);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SSH TERMINAL SESSION HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function cleanupTerminalSession(sessionId) {
  const session = terminalSessions.get(sessionId);
  if (session) {
    if (session.stream) {
      try { session.stream.end(); } catch (e) {}
    }
    if (session.sshClient) {
      try { session.sshClient.end(); } catch (e) {}
    }
    terminalSessions.delete(sessionId);
    console.log(`   🗑️  Terminal session ${sessionId.substring(0, 8)}... cleaned up`);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HTTP SERVER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const server = http.createServer(async (req, res) => {
  // CORS headers for local development
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url || '', true);
  
  // Health check / status endpoint
  if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'running',
      service: 'ShellVault WebSocket Broker',
      agents: agents.size,
      authenticated: Array.from(agents.values()).filter(a => a.authenticated).length,
      terminalSessions: terminalSessions.size
    }));
    return;
  }
  
  // Get agent status
  if (parsedUrl.pathname === '/api/agent-status' && req.method === 'GET') {
    if (!isInternalRequest(req)) {
      rejectUnauthorized(res);
      return;
    }

    const serverId = parsedUrl.query.serverId;
    
    if (!serverId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'serverId required' }));
      return;
    }
    
    const agent = agents.get(serverId);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      connected: !!agent,
      authenticated: agent?.authenticated || false,
      handshakeTier: agent?.handshakeTier || 0,
      connectedAt: agent?.connectedAt || null,
      lastSeen: agent?.lastSeen || null,
    }));
    return;
  }
  
  // Request credentials from agent
  if (parsedUrl.pathname === '/api/credentials' && req.method === 'POST') {
    if (!isInternalRequest(req)) {
      rejectUnauthorized(res);
      return;
    }

    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const { serverId, sessionId } = JSON.parse(body);
        
        if (!serverId || !sessionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'serverId and sessionId required' }));
          return;
        }
        
        console.log(`[${timestamp()}] 📥 HTTP credential request`);
        console.log(`   Server ID: ${serverId.substring(0, 8)}...`);
        console.log(`   Session ID: ${sessionId}`);
        
        const credentials = await requestCredentials(serverId, sessionId);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          credentials
        }));
        
      } catch (error) {
        console.error(`❌ Credential request failed: ${error.message}`);
        
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
    });
    return;
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SSH CONNECT - Establish SSH connection for terminal
  // ✅ FIXED: Handle key content vs key path
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (parsedUrl.pathname === '/api/ssh/connect' && req.method === 'POST') {
    if (!isInternalRequest(req)) {
      rejectUnauthorized(res);
      return;
    }

    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const { sessionId, credentials, terminalGrant, userId, serverId } = JSON.parse(body);
        
        if (!sessionId || !credentials || !terminalGrant || !userId || !serverId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'sessionId, credentials, userId, serverId, and terminalGrant required' }));
          return;
        }

        const grantCheck = verifyTerminalGrant(terminalGrant, {
          sessionId,
          userId,
          serverId,
        });

        if (!grantCheck.valid) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: grantCheck.error }));
          return;
        }
        
        console.log(`[${timestamp()}] 🔐 SSH connect request`);
        console.log(`   Session ID: ${sessionId}`);
        console.log(`   Host: ${credentials.ip_address}:${credentials.port || 22}`);
        console.log(`   User: ${credentials.username}`);
        console.log(`   Auth: ${credentials.auth_method}`);
        
        // Create SSH connection
        const sshClient = new SSHClient();
        
        const connectPromise = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('SSH connection timeout'));
          }, 15000);
          
          sshClient.on('ready', () => {
            clearTimeout(timeout);
            console.log(`✅ SSH connected to ${credentials.ip_address}`);
            
            // Request shell
            sshClient.shell({
              term: 'xterm-256color',
              cols: 80,
              rows: 24,
            }, (err, stream) => {
              if (err) {
                reject(err);
                return;
              }
              
              console.log(`✅ SSH shell established`);
              
              // Store session
              terminalSessions.set(sessionId, {
                credentials,
                sshClient,
                stream,
                ws: null,
                userId,
                serverId,
                terminalGrant,
                streamAttached: false,
                expiresAt: grantCheck.payload.expiresAt,
                connectedAt: new Date(),
              });
              
              resolve({ success: true });
            });
          });
          
          sshClient.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
          
          // Build connection options
          const connectOptions = {
            host: credentials.ip_address,
            port: credentials.port || 22,
            username: credentials.username,
            readyTimeout: 10000,
          };

          if (credentials.host_key_fingerprint) {
            connectOptions.hostHash = 'sha256';
            connectOptions.hostVerifier = (hashedKey) => {
              const normalize = (value) => String(value).trim().replace(/^SHA256:/i, '').replace(/=+$/g, '');
              return normalize(hashedKey) === normalize(credentials.host_key_fingerprint);
            };
          }
          
          // ✅ FIXED: Handle key content vs key path
          if (credentials.auth_method === 'key') {
            const keyData = credentials.credential;
            
            // Check if it's already key content (starts with -----BEGIN)
            if (keyData.startsWith('-----BEGIN')) {
              connectOptions.privateKey = keyData;
              console.log(`   🔑 Using SSH key (content received from agent)`);
            } 
            // Otherwise it's a path (backward compatibility)
            else if (fs.existsSync(keyData)) {
              connectOptions.privateKey = fs.readFileSync(keyData, 'utf8');
              console.log(`   🔑 Using key file: ${keyData}`);
            } 
            else {
              reject(new Error(`SSH key invalid: neither content nor valid path`));
              return;
            }
          } else {
            connectOptions.password = credentials.credential;
            console.log(`   🔑 Using password auth`);
          }
          
          sshClient.connect(connectOptions);
        });
        
        await connectPromise;
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          sessionId,
          message: 'SSH connection established. Connect WebSocket to /api/ssh/stream and authenticate with terminal grant.'
        }));
        
      } catch (error) {
        console.error(`❌ SSH connect failed: ${error.message}`);
        
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
    });
    return;
  }
  
  // 404 for unknown routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WEBSOCKET SERVERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Agent broker WebSocket server
const wss = new WebSocketServer({ noServer: true });

// SSH Terminal WebSocket server
const sshWss = new WebSocketServer({ noServer: true });

console.log('✅ WebSocket servers initialized\n');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HTTP UPGRADE HANDLER - Route to correct WebSocket server
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.on('upgrade', (request, socket, head) => {
  const parsedUrl = url.parse(request.url, true);
  const pathname = parsedUrl.pathname;

  if (pathname === '/api/broker') {
    // Agent broker connections
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else if (pathname === '/api/ssh/stream') {
    // SSH terminal connections
    sshWss.handleUpgrade(request, socket, head, (ws) => {
      sshWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SSH TERMINAL WEBSOCKET HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

sshWss.on('connection', async (ws, req) => {
  console.log(`[${timestamp()}] 🖥️  SSH Terminal WebSocket connected`);

  const authTimer = setTimeout(() => {
    if (ws.readyState === 1) {
      ws.close(1008, 'Terminal authentication timeout');
    }
  }, 10000);

  ws.once('message', (message) => {
    try {
      clearTimeout(authTimer);

      const authMessage = JSON.parse(message.toString());
      if (authMessage.type !== 'terminal_auth') {
        ws.close(1008, 'Terminal authentication required');
        return;
      }

      const { sessionId, terminalGrant } = authMessage;
      if (!sessionId || !terminalGrant) {
        ws.close(1008, 'Missing terminal authentication fields');
        return;
      }

      const session = terminalSessions.get(sessionId);
      if (!session) {
        console.error('❌ SSH session not found. Call /api/ssh/connect first');
        ws.send('\r\n\x1b[31m❌ Session not found. Please reconnect.\x1b[0m\r\n');
        ws.close(1008, 'Session not found');
        return;
      }

      const grantCheck = verifyTerminalGrant(terminalGrant, {
        sessionId,
        userId: session.userId,
        serverId: session.serverId,
      });

      if (!grantCheck.valid || !timingSafeEqualString(terminalGrant, session.terminalGrant)) {
        ws.close(1008, grantCheck.error || 'Invalid terminal grant');
        return;
      }

      if (session.streamAttached) {
        ws.close(1008, 'Terminal session already attached');
        return;
      }

      const { credentials, stream } = session;

      if (!stream) {
        console.error('❌ SSH stream not available');
        ws.send('\r\n\x1b[31m❌ SSH connection failed.\x1b[0m\r\n');
        ws.close(1011, 'SSH stream not available');
        return;
      }

      console.log(`✅ SSH stream authenticated and connected to WebSocket`);
      console.log(`   Session ID: ${sessionId}`);
      console.log(`   Host: ${credentials.ip_address}`);
      console.log(`   User: ${credentials.username}`);

      session.ws = ws;
      session.streamAttached = true;

      const forwardSshOutput = (data) => {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(data.toString('utf-8'));
        }
      };

      const handleStreamClose = () => {
        console.log(`[${timestamp()}] 🔌 SSH stream closed`);
        ws.close(1000, 'SSH connection closed');
        cleanupTerminalSession(sessionId);
      };

      const handleStreamError = (error) => {
        console.error('❌ SSH stream error:', error.message);
        ws.send(`\r\n\x1b[31m❌ SSH Error: ${error.message}\x1b[0m\r\n`);
        ws.close(1011, 'SSH stream error');
      };

      // SSH → Browser: Forward SSH output to WebSocket
      stream.on('data', forwardSshOutput);
      stream.once('close', handleStreamClose);
      stream.once('error', handleStreamError);
      stream.once('end', () => {
        console.log(`[${timestamp()}] 🔌 SSH stream ended`);
      });

      // Browser → SSH: Forward WebSocket input to SSH
      ws.on('message', (terminalMessage) => {
        try {
          const data = terminalMessage.toString();

          if (data.startsWith('__RESIZE__:')) {
            const [, dimensions] = data.split(':');
            const [cols, rows] = dimensions.split(',').map(Number);
            if (cols && rows && stream.setWindow) {
              stream.setWindow(rows, cols, 480, 640);
              console.log(`📏 Terminal resized: ${cols}x${rows}`);
            }
          } else {
            stream.write(data);
          }
        } catch (error) {
          console.error('❌ Error processing terminal input:', error.message);
        }
      });

      ws.on('close', () => {
        console.log(`[${timestamp()}] 🔌 Terminal WebSocket disconnected`);
        stream.off('data', forwardSshOutput);
        cleanupTerminalSession(sessionId);
      });

    } catch (error) {
      clearTimeout(authTimer);
      console.error('❌ Terminal auth error:', error.message);
      ws.close(1008, 'Invalid terminal authentication message');
    }
  });

  ws.on('error', (error) => {
    console.error('❌ Terminal WebSocket error:', error.message);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AGENT BROKER WEBSOCKET HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

wss.on('connection', async (ws, req) => {
  const queryParams = url.parse(req.url, true).query;
  const serverId = queryParams.serverId;
  const userId = queryParams.userId;

  if (!serverId || !userId) {
    console.error('❌ Missing serverId or userId in connection');
    ws.close(1008, 'Missing required parameters');
    return;
  }

  console.log(`[${timestamp()}] 🔌 Agent connected`);
  console.log(`   Server ID: ${serverId}`);
  console.log(`   User ID: ${userId}`);

  // Look up server in database
  let serverRecord;
  try {
    serverRecord = await prisma.server.findUnique({
      where: { id: serverId }
    });
    
    if (!serverRecord) {
      console.error('❌ Server not found in database\n');
      ws.close(1008, 'Server not found');
      return;
    }
    
    // Verify userId matches
    if (serverRecord.userId !== userId) {
      console.error('❌ User ID mismatch\n');
      ws.close(1008, 'Unauthorized');
      return;
    }
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
    ws.close(1011, 'Database error');
    return;
  }

  // Register agent
  agents.set(serverId, {
    ws,
    userId,
    serverId,
    handshakeTier: 0,
    authenticated: false,
    connectedAt: new Date(),
    lastSeen: new Date(),
  });

  // Start TIER 1 handshake
  const tier1 = generateTier1Challenge(userId, serverId, serverRecord.handshakeUuid);
  ws.send(JSON.stringify({
    type: 'challenge',
    tier: 1,
    challenge: tier1.encrypted,
  }));

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      const agent = agents.get(serverId);
      
      if (!agent) {
        console.error('❌ Agent not found in registry');
        return;
      }
      
      // Update last seen
      agent.lastSeen = new Date();
      
      if (message.type === 'response') {
        const { tier, payload } = message;
        
        const decrypted = decrypt(payload, serverRecord.handshakeUuid);
        if (!decrypted) {
          console.error(`❌ Failed to decrypt TIER ${tier} response`);
          ws.close(1008, 'Decryption failed');
          return;
        }

        switch (tier) {
          case 1: {
            const challenge1 = challenges.get(decrypted.challenge_id);
            if (!challenge1) {
              console.error('❌ TIER 1: Challenge not found or expired');
              ws.close(1008, 'Challenge expired');
              return;
            }
            
            const tier1Valid = verifyTier1Response(challenge1, decrypted, serverRecord.handshakeUuid);
            if (!tier1Valid) {
              console.error('❌ TIER 1: Verification failed');
              ws.close(1008, 'Verification failed');
              return;
            }
            
            console.log(`✅ TIER 1 PASSED for server ${serverId.substring(0, 8)}...`);
            agent.handshakeTier = 1;
            
            const tier2 = generateTier2Challenge(userId, serverId, serverRecord.handshakeUuid);
            ws.send(JSON.stringify({
              type: 'challenge',
              tier: 2,
              challenge: tier2.encrypted,
            }));
            break;
          }

          case 2: {
            const challenge2 = challenges.get(decrypted.challenge_id);
            if (!challenge2) {
              console.error('❌ TIER 2: Challenge not found or expired');
              ws.close(1008, 'Challenge expired');
              return;
            }
            
            const tier2Valid = verifyTier2Response(decrypted, serverRecord.handshakeUuid, challenge2);
            if (!tier2Valid) {
              console.error('❌ TIER 2: Verification failed');
              ws.close(1008, 'Verification failed');
              return;
            }
            
            console.log(`✅ TIER 2 PASSED for server ${serverId.substring(0, 8)}...`);
            agent.handshakeTier = 2;
            
            const tier3 = generateTier3Challenge(userId, serverId, serverRecord.handshakeUuid);
            ws.send(JSON.stringify({
              type: 'challenge',
              tier: 3,
              challenge: tier3.encrypted,
            }));
            break;
          }

          case 3: {
            const challenge3 = challenges.get(decrypted.challenge_id);
            if (!challenge3) {
              console.error('❌ TIER 3: Challenge not found or expired');
              ws.close(1008, 'Challenge expired');
              return;
            }
            
            const tier3Valid = verifyTier3Response(decrypted);
            if (!tier3Valid) {
              console.error('❌ TIER 3: Verification failed');
              ws.close(1008, 'Verification failed');
              return;
            }
            
            console.log(`✅ TIER 3 PASSED for server ${serverId.substring(0, 8)}...`);
            console.log(`🎉 3-TIER HANDSHAKE COMPLETE!`);
            
            agent.handshakeTier = 3;
            agent.authenticated = true;
            
            ws.send(JSON.stringify({
              type: 'handshake_complete',
              status: 'success',
              message: 'Authentication successful',
            }));
            
            // ✅ Update database status to ONLINE
            await updateServerStatus(serverId, 'online');
            console.log('');
            break;
          }
        }
      } 
      else if (message.type === 'credentials_response') {
        handleCredentialsResponse(message, serverRecord.handshakeUuid);
      } 
      else if (message.type === 'heartbeat') {
        console.log(`💓 Heartbeat from server ${serverId.substring(0, 8)}...`);
        await updateServerStatus(serverId, 'online');
      }
    } catch (error) {
      console.error('❌ Error handling message:', error.message);
    }
  });

  ws.on('close', async (code, reason) => {
    console.log(`[${timestamp()}] 🔌 Agent disconnected`);
    console.log(`   Server ID: ${serverId.substring(0, 8)}...`);
    console.log(`   Code: ${code}`);
    
    // ✅ Update database status to OFFLINE
    await updateServerStatus(serverId, 'offline');
    
    // Remove from registry
    agents.delete(serverId);
    console.log('');
  });

  ws.on('error', (error) => {
    console.error(`❌ WebSocket error for ${serverId.substring(0, 8)}:`, error.message);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GLOBAL BROKER INTERFACE (for API access)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const brokerInterface = {
  getAgent: (serverId) => agents.get(serverId),

  getAllAgents: () => {
    const agentList = [];
    for (const [serverId, agent] of agents) {
      agentList.push({
        serverId: serverId.substring(0, 8) + '...',
        userId: agent.userId.substring(0, 8) + '...',
        authenticated: agent.authenticated,
        handshakeTier: agent.handshakeTier,
        connectedAt: agent.connectedAt,
        lastSeen: agent.lastSeen,
      });
    }
    return agentList;
  },

  requestCredentials: async (serverId, sessionId) => {
    return requestCredentials(serverId, sessionId);
  },

  isAgentReady: (serverId) => {
    const agent = agents.get(serverId);
    return agent && agent.authenticated === true;
  },

  getAgentCount: () => agents.size,

  getAuthenticatedAgentCount: () => {
    let count = 0;
    for (const agent of agents.values()) {
      if (agent.authenticated) count++;
    }
    return count;
  },
};

global.shellVaultBroker = brokerInterface;

console.log('✅ Broker interface exposed globally');
console.log('   API routes can now call: global.shellVaultBroker.requestCredentials()\n');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// START SERVER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PORT = process.env.BROKER_PORT || 8080;

server.listen(PORT, '0.0.0.0', () => {
  console.log('═'.repeat(60));
  console.log('🎉 ShellVault WebSocket Broker Server Running!');
  console.log('═'.repeat(60));
  console.log(`📍 Local:     http://localhost:${PORT}`);
  console.log(`📍 Network:   http://172.20.10.3:${PORT}`);
  console.log(`📍 Agent WS:  ws://172.20.10.3:${PORT}/api/broker`);
  console.log(`📍 SSH WS:    ws://172.20.10.3:${PORT}/api/ssh/stream`);
  console.log('═'.repeat(60));
  console.log('\n✅ Ready to accept connections!');
  console.log('🔒 Using AES-256-GCM encryption');
  console.log('💡 Credential request system active');
  console.log('🖥️  SSH terminal support enabled\n');
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✅ FIXED: GRACEFUL SHUTDOWN (only runs once)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function gracefulShutdown(signal) {
  // Prevent multiple shutdowns
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  
  console.log(`\n\n🛑 Received ${signal}, shutting down gracefully...`);
  
  // Close all terminal sessions
  console.log('🖥️  Closing terminal sessions...');
  for (const [sessionId] of terminalSessions) {
    cleanupTerminalSession(sessionId);
  }
  
  // Update all connected agents to offline
  console.log('📝 Updating agent statuses to offline...');
  for (const [serverId] of agents) {
    try {
      await prisma.server.update({
        where: { id: serverId },
        data: { agentHealthStatus: 'offline' }
      });
      console.log(`   ✓ ${serverId.substring(0, 8)}... set to offline`);
    } catch (e) {
      console.log(`   ⚠ Failed to update ${serverId.substring(0, 8)}...`);
    }
  }
  
  // Close all WebSocket connections
  console.log('🔌 Closing WebSocket connections...');
  for (const [, agent] of agents) {
    try {
      agent.ws.close(1001, 'Server shutting down');
    } catch (e) {
      // Ignore errors when closing
    }
  }
  agents.clear();
  
  // Close WebSocket servers
  wss.close(() => {
    console.log('✓ Agent WebSocket server closed');
  });
  
  sshWss.close(() => {
    console.log('✓ SSH WebSocket server closed');
    
    // Close HTTP server
    server.close(() => {
      console.log('✓ HTTP server closed');
      
      // Disconnect Prisma
      prisma.$disconnect().then(() => {
        console.log('✓ Database disconnected');
        console.log('\n✅ Shutdown complete\n');
        process.exit(0);
      });
    });
  });
  
  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('⚠️  Forced exit after timeout');
    process.exit(1);
  }, 10000);
}

// ✅ FIX: Register signal handlers only once
process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});
