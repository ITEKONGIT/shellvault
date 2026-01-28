// broker-server.js - Full WebSocket Broker with 3-Tier Handshake + Credential Retrieval
// ✅ UPDATED: Now uses AES-256-GCM encryption instead of HMAC

const { WebSocketServer } = require('ws');
const http = require('http');
const url = require('url');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

console.log('🚀 Starting ShellVault WebSocket Broker Server...\n');

// In-memory agent registry
const agents = new Map();

// In-memory challenge storage (should use Redis in production)
const challenges = new Map();

// ✅ NEW: Pending credential requests
const pendingCredentialRequests = new Map();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✅ NEW: AES-256-GCM CRYPTO UTILITIES (matching lib/broker/crypto.ts)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;       // 256 bits
const IV_LENGTH = 12;        // 96 bits (recommended for GCM)
const AUTH_TAG_LENGTH = 16;  // 128 bits
const SALT = 'shellvault-secure-salt-v1'; // ✅ MUST MATCH AGENT!

/**
 * Derive a 256-bit encryption key from User UUID
 * ✅ USES SCRYPT TO MATCH AGENT (not PBKDF2!)
 */
function deriveKey(userUuid) {
  // Use scrypt to match Python agent's KDF
  return crypto.scryptSync(
    userUuid,          // Password
    SALT,              // Salt
    KEY_LENGTH,        // Key length (32 bytes)
    {
      N: 16384,        // CPU/memory cost (2^14)
      r: 8,            // Block size
      p: 1,            // Parallelization
      maxmem: 64 * 1024 * 1024  // 64 MB
    }
  );
}

/**
 * Encrypt data using AES-256-GCM
 * ✅ NOW RETURNS BASE64 STRING, NOT OBJECT
 */
function encrypt(data, userUuid) {
  try {
    // Derive encryption key from User UUID
    const key = deriveKey(userUuid);
    
    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt data
    const plaintext = JSON.stringify(data);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    
    // Get authentication tag
    const authTag = cipher.getAuthTag();
    
    // Combine: IV + encrypted data + auth tag
    const combined = Buffer.concat([iv, encrypted, authTag]);
    
    // Return as base64 STRING
    return combined.toString('base64');
    
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt data using AES-256-GCM
 */
function decrypt(encryptedData, userUuid) {
  try {
    // Derive decryption key from User UUID
    const key = deriveKey(userUuid);
    
    // Decode from base64
    const combined = Buffer.from(encryptedData, 'base64');
    
    // Extract components
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(-AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH, -AUTH_TAG_LENGTH);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt data
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    // Parse JSON and return
    return JSON.parse(decrypted.toString('utf8'));
    
  } catch (error) {
    // Return null on decryption failure
    return null;
  }
}

function generateNonce() {
  return crypto.randomBytes(32).toString('hex');
}

function hash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function generateUuid() {
  return crypto.randomUUID();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TIER 1: PROOF OF KEY OWNERSHIP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function generateTier1Challenge(userId, serverId) {
  const challengeId = generateUuid();
  const nonce = generateNonce();
  const timestamp = new Date().toISOString();
  
  const payload = {
    tier: 1,
    nonce,
    timestamp,
    challenge_id: challengeId,
  };
  
  // ✅ NOW RETURNS BASE64 STRING
  const encrypted = encrypt(payload, userId);
  
  const challenge = {
    id: challengeId,
    tier: 1,
    serverId,
    userId,
    timestamp,
    payload,
    encrypted,
  };
  
  // Store challenge
  challenges.set(challengeId, challenge);
  setTimeout(() => challenges.delete(challengeId), 30000); // 30s expiry
  
  console.log(`[TIER 1] Challenge generated for server ${serverId.substring(0, 8)}...`);
  console.log(`   Encrypted payload type: ${typeof encrypted}`);
  console.log(`   Encrypted payload length: ${encrypted.length}`);
  console.log(`   First 30 chars: ${encrypted.substring(0, 30)}`);
  
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
  const timestamp = new Date().toISOString();
  
  const payload = {
    tier: 2,
    challenge_id: challengeId,
    metadata: {
      expected_handshake_uuid: handshakeUuid,
      verify_hostname: true,
      timestamp,
    },
  };
  
  // ✅ NOW RETURNS BASE64 STRING
  const encrypted = encrypt(payload, userId);
  
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

function verifyTier2Response(response, expectedHandshakeUuid) {
  return response.handshake_uuid === expectedHandshakeUuid && response.verified;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TIER 3: SESSION KEY EXCHANGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function generateTier3Challenge(userId, serverId) {
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
  
  // ✅ NOW RETURNS BASE64 STRING
  const encrypted = encrypt(payload, userId);
  
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
// ✅ NEW: CREDENTIAL REQUEST FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function requestCredentials(serverId, sessionId) {
  const agent = agents.get(serverId);
  
  if (!agent) {
    throw new Error('Agent not connected');
  }
  
  if (!agent.authenticated) {
    throw new Error('Agent not authenticated');
  }
  
  console.log(`[${new Date().toISOString()}] 🔑 Requesting credentials from agent`);
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

function handleCredentialsResponse(data, userId) {
  const { session_id, payload } = data;
  
  console.log(`[${new Date().toISOString()}] 🔑 Credentials response received`);
  console.log(`   Session ID: ${session_id}`);
  
  const decrypted = decrypt(payload, userId);
  
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
// WEBSOCKET SERVER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ShellVault WebSocket Broker Server\n');
});

const wss = new WebSocketServer({ 
  server,
  path: '/api/broker'
});

console.log('✅ WebSocket server initialized\n');

wss.on('connection', async (ws, req) => {
  const queryParams = url.parse(req.url, true).query;
  const serverId = queryParams.serverId;
  const userId = queryParams.userId;

  console.log(`[${new Date().toISOString()}] 🔌 Agent connected`);
  console.log(`   Server ID: ${serverId}`);
  console.log(`   User ID: ${userId}\n`);

  let server;
  try {
    server = await prisma.server.findUnique({
      where: { id: serverId }
    });
    
    if (!server) {
      console.error('❌ Server not found in database');
      ws.close();
      return;
    }
  } catch (error) {
    console.error('❌ Database error:', error.message);
    ws.close();
    return;
  }

  agents.set(serverId, {
    ws,
    userId,
    serverId,
    handshakeTier: 0,
    authenticated: false,
    connectedAt: new Date(),
  });

  // Start TIER 1 handshake
  const tier1 = generateTier1Challenge(userId, serverId);
  ws.send(JSON.stringify({
    type: 'challenge',
    tier: 1,
    challenge: tier1.encrypted,  // ✅ NOW A BASE64 STRING
  }));

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'response') {
        const { tier, payload } = message;
        
        const decrypted = decrypt(payload, userId);
        if (!decrypted) {
          console.error(`❌ Failed to decrypt TIER ${tier} response`);
          ws.close();
          return;
        }

        const agent = agents.get(serverId);
        
        switch (tier) {
          case 1:
            const challenge1 = challenges.get(decrypted.challenge_id);
            if (!challenge1) {
              console.error('❌ TIER 1: Challenge not found');
              ws.close();
              return;
            }
            
            const tier1Valid = verifyTier1Response(challenge1, decrypted, server.handshakeUuid);
            if (!tier1Valid) {
              console.error('❌ TIER 1: Verification failed');
              ws.close();
              return;
            }
            
            console.log(`✅ TIER 1 PASSED for server ${serverId.substring(0, 8)}...`);
            agent.handshakeTier = 1;
            
            const tier2 = generateTier2Challenge(userId, serverId, server.handshakeUuid);
            ws.send(JSON.stringify({
              type: 'challenge',
              tier: 2,
              challenge: tier2.encrypted,
            }));
            break;

          case 2:
            const challenge2 = challenges.get(decrypted.challenge_id);
            if (!challenge2) {
              console.error('❌ TIER 2: Challenge not found');
              ws.close();
              return;
            }
            
            const tier2Valid = verifyTier2Response(decrypted, server.handshakeUuid);
            if (!tier2Valid) {
              console.error('❌ TIER 2: Verification failed');
              ws.close();
              return;
            }
            
            console.log(`✅ TIER 2 PASSED for server ${serverId.substring(0, 8)}...`);
            agent.handshakeTier = 2;
            
            const tier3 = generateTier3Challenge(userId, serverId);
            ws.send(JSON.stringify({
              type: 'challenge',
              tier: 3,
              challenge: tier3.encrypted,
            }));
            break;

          case 3:
            const challenge3 = challenges.get(decrypted.challenge_id);
            if (!challenge3) {
              console.error('❌ TIER 3: Challenge not found');
              ws.close();
              return;
            }
            
            const tier3Valid = verifyTier3Response(decrypted);
            if (!tier3Valid) {
              console.error('❌ TIER 3: Verification failed');
              ws.close();
              return;
            }
            
            console.log(`✅ TIER 3 PASSED for server ${serverId.substring(0, 8)}...`);
            console.log(`🎉 3-TIER HANDSHAKE COMPLETE!\n`);
            
            agent.handshakeTier = 3;
            agent.authenticated = true;
            
            ws.send(JSON.stringify({
              type: 'handshake_complete',
              status: 'success',
              message: 'Authentication successful',
            }));
            
            await prisma.server.update({
              where: { id: serverId },
              data: {
                agentHealthStatus: 'online',
                agentLastSeen: new Date(),
              },
            });
            break;
        }
      } 
      else if (message.type === 'credentials_response') {
        handleCredentialsResponse(message, userId);
      } 
      else if (message.type === 'heartbeat') {
        console.log(`💓 Heartbeat from server ${serverId.substring(0, 8)}...`);
        
        await prisma.server.update({
          where: { id: serverId },
          data: {
            agentHealthStatus: 'online',
            agentLastSeen: new Date(),
          },
        });
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  ws.on('close', () => {
    console.log(`[${new Date().toISOString()}] 🔌 Agent disconnected (Server: ${serverId.substring(0, 8)}...)\n`);
    agents.delete(serverId);
  });

  ws.on('error', (error) => {
    console.error(`❌ WebSocket error:`, error.message);
  });
});

global.shellVaultBroker = {
  requestCredentials,
  getAgent: (serverId) => agents.get(serverId),
  agents,
};

const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log('═'.repeat(60));
  console.log('🎉 ShellVault WebSocket Broker Server Running!');
  console.log('═'.repeat(60));
  console.log(`📍 Local:     http://localhost:${PORT}`);
  console.log(`📍 Network:   http://172.20.10.3:${PORT}`);
  console.log(`📍 WebSocket: ws://172.20.10.3:${PORT}/api/broker`);
  console.log('═'.repeat(60));
  console.log('\n✅ Ready to accept agent connections!');
  console.log('🔒 Using AES-256-GCM encryption\n');
  console.log('💡 Credential request system active\n');
});

process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down broker server...');
  prisma.$disconnect();
  wss.close(() => {
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });
});