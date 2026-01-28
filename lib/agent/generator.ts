// lib/agent/generator.ts
// ✅ PRODUCTION: AES-256-GCM Crypto + Encrypted Vault Secrets

export interface AgentConfig {
  userId: string;
  serverId: string;
  handshakeUuid: string;
  brokerUrl: string;
  heartbeatUrl: string;
  version?: string;
  testMode?: boolean;
}

export interface GeneratedAgent {
  agent: string;
  transport: string;
  operations: string;
  credentials: string;
  wrapper: string;
  service: string;
  secretManager: string;  // ✅ NEW: Secret manager module
}

export function generateModularAgent(config: AgentConfig): GeneratedAgent {
  const version = config.version || '1.0.0';
  const testMode = config.testMode || false;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FILE 1: agent.py - Main Orchestrator
  // ✅ UPDATED: Loads secrets from encrypted vault
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const agent = `#!/usr/bin/env python3
"""
ShellVault Agent - Main Orchestrator
✅ Production: Secrets loaded from encrypted vault
"""

import sys
import signal
import socket
from datetime import datetime

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ✅ LOAD SECRETS FROM ENCRYPTED VAULT (PRODUCTION)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def load_secrets():
    """Load secrets from encrypted vault (production-grade)"""
    try:
        from secret_manager import SecretManager
        
        manager = SecretManager()
        secrets = manager.load_secrets()
        
        # Validate required secrets
        required = ['user_id', 'server_id', 'handshake_uuid']
        for key in required:
            if key not in secrets:
                raise ValueError(f"Missing required secret: {key}")
        
        return {
            'user_id': secrets['user_id'],
            'server_id': secrets['server_id'],
            'handshake_uuid': secrets['handshake_uuid'],
        }
        
    except ImportError:
        print("[FATAL] secret_manager module not found", flush=True)
        print("[FATAL] Ensure secret_manager.py is in /usr/local/lib/shellvault/", flush=True)
        sys.exit(1)
    except Exception as e:
        print(f"[FATAL] Failed to load secrets: {e}", flush=True)
        sys.exit(1)

# Load secrets
SECRETS = load_secrets()
print(f"[INFO] Secrets loaded from encrypted vault", flush=True)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PUBLIC CONFIGURATION (Safe to store in file)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PUBLIC_CONFIG = {
    'broker_url': '${config.brokerUrl}',
    'heartbeat_url': '${config.heartbeatUrl}',
    'version': '${version}',
    'test_mode': ${testMode ? 'True' : 'False'},
}

# Combine secrets and public config
CONFIG = {**SECRETS, **PUBLIC_CONFIG}


class AgentLogger:
    """Centralized logging"""
    
    def log(self, level, message, **context):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ctx = " | " + " ".join([f"{k}={v}" for k, v in context.items()]) if context else ""
        print(f"[{timestamp}] [{level}] {message}{ctx}", flush=True)
    
    def info(self, msg, **ctx): self.log("INFO", msg, **ctx)
    def warn(self, msg, **ctx): self.log("WARN", msg, **ctx)
    def error(self, msg, **ctx): self.log("ERROR", msg, **ctx)
    def debug(self, msg, **ctx): self.log("DEBUG", msg, **ctx)


class ShellVaultAgent:
    """Main agent orchestrator"""
    
    def __init__(self):
        self.logger = AgentLogger()
        self.running = True
        self.config = CONFIG
        
        # Import modules
        from transport import TransportLayer
        from operations import Operations
        
        # Initialize components
        self.transport = TransportLayer(self.config, self.logger)
        self.operations = Operations(self.config, self.logger)
        
        # Register signal handlers
        signal.signal(signal.SIGTERM, self.shutdown)
        signal.signal(signal.SIGINT, self.shutdown)
        
        # Register operation callbacks
        self.transport.on_command = self.operations.execute_command
        self.transport.on_health_check = self.operations.get_health_metrics
        self.transport.operations = self.operations
    
    def start(self):
        """Start the agent"""
        self.logger.info("=" * 60)
        self.logger.info("ShellVault Agent Starting")
        self.logger.info("=" * 60)
        self.logger.info("Server ID", server_id=self.config['server_id'][:16] + "...")
        self.logger.info("Version", version=self.config['version'])
        self.logger.info("Hostname", hostname=socket.gethostname())
        self.logger.info("Mode", mode="TEST" if self.config['test_mode'] else "PRODUCTION")
        self.logger.info("Security", secrets="Encrypted vault (AES-256-GCM)")
        self.logger.info("=" * 60)
        
        try:
            # Start transport layer
            self.transport.start()
        except KeyboardInterrupt:
            self.logger.info("Keyboard interrupt received")
        except Exception as e:
            self.logger.error("Fatal error", error=str(e))
            sys.exit(1)
    
    def shutdown(self, signum=None, frame=None):
        """Graceful shutdown"""
        self.logger.info("Shutting down gracefully...")
        self.running = False
        self.transport.stop()
        sys.exit(0)


def main():
    """Entry point"""
    agent = ShellVaultAgent()
    agent.start()


if __name__ == "__main__":
    main()
`;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FILE 2: transport.py - Communication Layer
  // ✅ UNCHANGED: Already has AES-256-GCM encryption
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const transport = `#!/usr/bin/env python3
"""
Transport Layer - All Communication
✅ Phase 1: AES-256-GCM Encryption + 3-tier handshake
"""

import json
import hashlib
import time
import socket
import base64
from datetime import datetime, timezone
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError


class Crypto:
    """✅ AES-256-GCM Encryption (matching TypeScript implementation)"""
    
    ALGORITHM = 'aes-256-gcm'
    KEY_LENGTH = 32
    IV_LENGTH = 12
    AUTH_TAG_LENGTH = 16
    SALT = b'shellvault-secure-salt-v1'
    
    def __init__(self, key: str):
        """Initialize crypto with user UUID"""
        # Import cryptography library
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
            from cryptography.hazmat.backends import default_backend
            
            self.AESGCM = AESGCM
            self.Scrypt = Scrypt
            self.backend = default_backend()
        except ImportError:
            raise ImportError(
                "cryptography module not available. "
                "Install: pip3 install cryptography --break-system-packages"
            )
        
        # Derive encryption key from UUID
        self.key = self._derive_key(key)
        self.aesgcm = self.AESGCM(self.key)
    
    def _derive_key(self, user_uuid: str) -> bytes:
        """Derive 256-bit key from UUID using scrypt"""
        kdf = self.Scrypt(
            salt=self.SALT,
            length=self.KEY_LENGTH,
            n=2**14,
            r=8,
            p=1,
            backend=self.backend
        )
        return kdf.derive(user_uuid.encode('utf-8'))
    
    def encrypt(self, data: dict) -> str:
        """
        Encrypt data with AES-256-GCM
        Returns: base64(IV + ciphertext + authTag)
        """
        import os
        
        # Generate random IV (never reuse!)
        nonce = os.urandom(self.IV_LENGTH)
        
        # Encrypt data
        plaintext = json.dumps(data).encode('utf-8')
        ciphertext = self.aesgcm.encrypt(nonce, plaintext, None)
        
        # Combine: IV + ciphertext (ciphertext includes auth tag)
        combined = nonce + ciphertext
        
        # Return as base64
        return base64.b64encode(combined).decode('utf-8')
    
    def decrypt(self, encrypted: str) -> dict:
        """Decrypt and verify AES-256-GCM data"""
        # Decode from base64
        combined = base64.b64decode(encrypted)
        
        # Extract IV and ciphertext
        nonce = combined[:self.IV_LENGTH]
        ciphertext = combined[self.IV_LENGTH:]
        
        # Decrypt and verify
        plaintext = self.aesgcm.decrypt(nonce, ciphertext, None)
        
        # Parse JSON
        return json.loads(plaintext.decode('utf-8'))
    
    @staticmethod
    def hash(data: str) -> str:
        """SHA256 hash"""
        return hashlib.sha256(data.encode('utf-8')).hexdigest()


class HandshakeHandler:
    """3-Tier Handshake Protocol Handler"""
    
    def __init__(self, config, crypto, logger):
        self.config = config
        self.crypto = crypto
        self.logger = logger
        self.tier = 0
        self.authenticated = False
    
    def handle_tier1(self, challenge: dict) -> dict:
        """TIER 1: Proof of Key Ownership"""
        nonce = challenge.get('nonce')
        timestamp = challenge.get('timestamp')
        challenge_id = challenge.get('challenge_id')
        
        # Verify timestamp (prevent replay attacks)
        try:
            challenge_time = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            age = (datetime.now(timezone.utc) - challenge_time).total_seconds()
            if abs(age) > 30:
                self.logger.warn("TIER 1: Challenge expired", age=age)
                return None
        except Exception as e:
            self.logger.error("TIER 1: Timestamp error", error=str(e))
            return None
        
        # Generate response hash
        response_hash = self.crypto.hash(f"{nonce}:{self.config['handshake_uuid']}:{timestamp}")
        self.tier = 1
        
        return {
            'tier': 1,
            'challenge_id': challenge_id,
            'response_hash': response_hash,
            'agent_version': self.config['version'],
            'server_id': self.config['server_id']
        }
    
    def handle_tier2(self, challenge: dict) -> dict:
        """TIER 2: Identity Verification"""
        challenge_id = challenge.get('challenge_id')
        hostname = socket.gethostname()
        fingerprint = self.crypto.hash(f"{self.config['handshake_uuid']}:{hostname}:{self.config['server_id']}")
        self.tier = 2
        
        return {
            'tier': 2,
            'challenge_id': challenge_id,
            'hostname': hostname,
            'handshake_uuid': self.config['handshake_uuid'],
            'server_fingerprint': fingerprint,
            'verified': True
        }
    
    def handle_tier3(self, challenge: dict) -> dict:
        """TIER 3: Session Key Exchange"""
        self.tier = 3
        self.authenticated = True
        
        return {
            'tier': 3,
            'challenge_id': challenge.get('challenge_id'),
            'session_id': challenge.get('session_id'),
            'session_ready': True,
            'agent_ready': True,
            'ssh_port': 22,
            'server_id': self.config['server_id']
        }
    
    def handle_challenge(self, tier: int, encrypted_challenge: str) -> str:
        """Route challenge to appropriate tier handler"""
        # Decrypt challenge
        try:
            challenge = self.crypto.decrypt(encrypted_challenge)
        except Exception as e:
            self.logger.error(f"TIER {tier}: Decryption failed", error=str(e))
            return None
        
        # Route to handler
        if tier == 1:
            response = self.handle_tier1(challenge)
        elif tier == 2:
            response = self.handle_tier2(challenge)
        elif tier == 3:
            response = self.handle_tier3(challenge)
        else:
            self.logger.error(f"Unknown tier: {tier}")
            return None
        
        if not response:
            return None
        
        # Encrypt response
        self.logger.info(f"TIER {tier}: Response generated")
        return self.crypto.encrypt(response)
    
    def reset(self):
        """Reset handshake state"""
        self.tier = 0
        self.authenticated = False


class HTTPTransport:
    """HTTP Heartbeat Transport (TEST MODE)"""
    
    def __init__(self, config, logger, on_health_check):
        self.config = config
        self.logger = logger
        self.on_health_check = on_health_check
        self.running = True
    
    def send_heartbeat(self):
        """Send HTTP heartbeat"""
        try:
            metrics = self.on_health_check() if self.on_health_check else {}
            data = {
                'serverId': self.config['server_id'],
                'agentVersion': self.config['version'],
                'hostname': socket.gethostname(),
                'timestamp': datetime.now().isoformat(),
                **metrics
            }
            
            req = Request(
                self.config['heartbeat_url'],
                data=json.dumps(data).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            
            response = urlopen(req, timeout=10)
            result = json.loads(response.read().decode('utf-8'))
            
            if result.get('success'):
                self.logger.info("💓 Heartbeat sent")
                return True
            return False
        except Exception as e:
            self.logger.warn("Heartbeat failed", error=str(e)[:50])
            return False
    
    def run(self):
        """Run heartbeat loop"""
        self.logger.info("🧪 TEST MODE: HTTP Heartbeat enabled")
        count = 0
        
        while self.running:
            count += 1
            self.logger.info(f"Heartbeat #{count}")
            self.send_heartbeat()
            time.sleep(30)
    
    def stop(self):
        """Stop transport"""
        self.running = False


class WebSocketTransport:
    """WebSocket Transport (PRODUCTION MODE)"""
    
    def __init__(self, config, logger, crypto, handshake, on_command):
        self.config = config
        self.logger = logger
        self.crypto = crypto
        self.handshake = handshake
        self.on_command = on_command
        self.ws = None
        self.running = True
        self._operations = None
    
    def on_message(self, ws, message):
        """Handle incoming WebSocket messages"""
        try:
            data = json.loads(message)
            msg_type = data.get('type')
            
            if msg_type == 'challenge':
                tier = data.get('tier')
                encrypted_challenge = data.get('challenge')
                
                self.logger.info(f"Received TIER {tier} challenge")
                
                # Handle challenge
                encrypted_response = self.handshake.handle_challenge(tier, encrypted_challenge)
                if not encrypted_response:
                    self.logger.error(f"TIER {tier}: Failed to generate response")
                    ws.close()
                    return
                
                # Send response
                ws.send(json.dumps({
                    'type': 'response',
                    'tier': tier,
                    'payload': encrypted_response
                }))
                
                self.logger.info(f"TIER {tier}: Response sent")
                
            elif msg_type == 'handshake_complete':
                self.logger.info("🎉 3-TIER HANDSHAKE COMPLETE!")
                
            elif msg_type == 'command':
                command_id = data.get('commandId')
                command = data.get('command')
                self.logger.info("Command received", cmd=command[:50] + "...")
                
                if self.on_command:
                    result = self.on_command(command, command_id)
                    ws.send(json.dumps(result))
            
            elif msg_type == 'credentials_request':
                session_id = data.get('session_id')
                
                self.logger.info("Credentials request received", session_id=session_id)
                
                if self.operations:
                    credentials_response = self.operations.get_credentials()
                    credentials_response['session_id'] = session_id
                    
                    # Encrypt entire response
                    encrypted = self.crypto.encrypt(credentials_response)
                    
                    ws.send(json.dumps({
                        'type': 'credentials_response',
                        'session_id': session_id,
                        'payload': encrypted
                    }))
                    
                    self.logger.info("Encrypted credentials sent to broker")
                else:
                    self.logger.error("Operations module not available for credentials")
                    
            else:
                self.logger.warn("Unknown message type", type=msg_type)
                
        except Exception as e:
            self.logger.error("Message handler error", error=str(e))
    
    def on_open(self, ws):
        """WebSocket connection opened"""
        self.handshake.reset()
        self.logger.info("✅ Connected to broker")
    
    def on_close(self, ws, code, msg):
        """WebSocket connection closed"""
        self.logger.warn("Connection closed", code=code)
    
    def on_error(self, ws, error):
        """WebSocket error"""
        self.logger.error("WebSocket error", error=str(error)[:50])
    
    def connect(self):
        """Establish WebSocket connection"""
        try:
            import websocket
        except ImportError:
            self.logger.error("websocket-client not installed")
            self.logger.error("Install: pip3 install websocket-client --break-system-packages")
            return False
        
        # Build WebSocket URL
        ws_url = self.config['broker_url'].replace('http://', 'ws://').replace('https://', 'wss://')
        ws_url = f"{ws_url}?serverId={self.config['server_id']}&userId={self.config['user_id']}"
        
        self.logger.info("Connecting to broker...")
        
        # Create WebSocket app
        self.ws = websocket.WebSocketApp(
            ws_url,
            on_message=self.on_message,
            on_open=self.on_open,
            on_close=self.on_close,
            on_error=self.on_error
        )
        
        return True
    
    def run(self):
        """Run WebSocket loop with reconnection"""
        self.logger.info("🚀 PRODUCTION MODE: WebSocket Broker enabled")
        delay = 5
        max_delay = 300
        
        while self.running:
            if not self.connect():
                time.sleep(5)
                continue
            
            try:
                self.ws.run_forever(ping_interval=30, ping_timeout=10)
            except Exception as e:
                self.logger.error("Connection error", error=str(e)[:50])
            
            if self.running:
                self.logger.info(f"Reconnecting in {delay}s...")
                time.sleep(delay)
                delay = min(delay * 2, max_delay)
    
    def stop(self):
        """Stop transport"""
        self.running = False
        if self.ws:
            self.ws.close()


class TransportLayer:
    """Main transport coordinator"""
    
    def __init__(self, config, logger):
        self.config = config
        self.logger = logger
        self.crypto = Crypto(config['user_id'])
        self.handshake = HandshakeHandler(config, self.crypto, logger)
        
        self.on_command = None
        self.on_health_check = None
        self._operations = None
        
        if config['test_mode']:
            self.transport = HTTPTransport(
                config, 
                logger, 
                lambda: self.on_health_check() if self.on_health_check else {}
            )
        else:
            self.transport = WebSocketTransport(
                config, 
                logger, 
                self.crypto, 
                self.handshake,
                lambda cmd, cid: self.on_command(cmd, cid) if self.on_command else None
            )
    
    @property
    def operations(self):
        return self._operations if hasattr(self, '_operations') else None
    
    @operations.setter
    def operations(self, ops):
        self._operations = ops
        if hasattr(self.transport, 'operations'):
            self.transport.operations = ops
    
    def start(self):
        """Start transport"""
        self.transport.run()
    
    def stop(self):
        """Stop transport"""
        self.transport.stop()
`;

  // operations.py and credentials.py remain unchanged
  const operations = `#!/usr/bin/env python3
"""
Operations Module - What the agent can do
All executable operations and system monitoring
"""

import subprocess
import time
import os
from datetime import datetime
from credentials import CredentialRetriever


class Operations:
    """Agent operations and capabilities"""
    
    def __init__(self, config, logger):
        self.config = config
        self.logger = logger
        self.credential_retriever = CredentialRetriever(logger)
        self.stats = {
            'commands_executed': 0,
            'commands_failed': 0,
            'start_time': time.time()
        }
    
    def execute_command(self, command: str, command_id: str) -> dict:
        """Execute shell command securely"""
        self.logger.info("Executing command", cmd=command[:50] + "...")
        
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            self.stats['commands_executed'] += 1
            
            response = {
                'type': 'command_result',
                'command_id': command_id,
                'exit_code': result.returncode,
                'stdout': result.stdout[:10000],
                'stderr': result.stderr[:10000],
                'timestamp': datetime.now().isoformat()
            }
            
            self.logger.info("Command completed", exit_code=result.returncode)
            return response
            
        except subprocess.TimeoutExpired:
            self.stats['commands_failed'] += 1
            self.logger.error("Command timeout (5 minutes)")
            return {
                'type': 'command_result',
                'command_id': command_id,
                'exit_code': -1,
                'stdout': '',
                'stderr': 'Command timeout after 5 minutes',
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            self.stats['commands_failed'] += 1
            self.logger.error("Command execution error", error=str(e))
            return {
                'type': 'command_result',
                'command_id': command_id,
                'exit_code': -1,
                'stdout': '',
                'stderr': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    def get_health_metrics(self) -> dict:
        """Get system health metrics"""
        try:
            uptime = int(time.time() - self.stats['start_time'])
            
            try:
                load = os.getloadavg()
                load_avg = {
                    '1min': round(load[0], 2),
                    '5min': round(load[1], 2),
                    '15min': round(load[2], 2)
                }
            except:
                load_avg = None
            
            try:
                stat = os.statvfs('/')
                disk_total = stat.f_blocks * stat.f_frsize
                disk_free = stat.f_bfree * stat.f_frsize
                disk_used_pct = ((disk_total - disk_free) / disk_total) * 100
            except:
                disk_used_pct = None
            
            return {
                'uptime_seconds': uptime,
                'load_average': load_avg,
                'disk_used_percent': round(disk_used_pct, 2) if disk_used_pct else None,
                'commands_executed': self.stats['commands_executed'],
                'commands_failed': self.stats['commands_failed'],
            }
            
        except Exception as e:
            self.logger.error("Health metrics error", error=str(e))
            return {}
    
    def get_credentials(self) -> dict:
        """Get current credentials on-demand"""
        self.logger.info("Credentials requested by broker")
        
        try:
            credentials = self.credential_retriever.get_current_credentials()
            
            if not credentials:
                self.logger.error("Failed to retrieve credentials")
                return {
                    'type': 'credentials_response',
                    'success': False,
                    'error': 'Could not retrieve credentials via any method',
                    'timestamp': datetime.now().isoformat()
                }
            
            self.logger.info(
                "Credentials retrieved successfully",
                method=credentials['method_used'],
                auth_method=credentials['auth_method']
            )
            
            return {
                'type': 'credentials_response',
                'success': True,
                'credentials': {
                    'username': credentials['username'],
                    'auth_method': credentials['auth_method'],
                    'credential': credentials['credential'],
                    'ip_address': credentials['ip_address'],
                    'port': credentials['port'],
                    'hostname': credentials['hostname'],
                },
                'metadata': {
                    'method_used': credentials['method_used'],
                    'timestamp': credentials['timestamp'],
                },
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            self.logger.error("Credential retrieval error", error=str(e))
            return {
                'type': 'credentials_response',
                'success': False,
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
`;

  const credentials = `#!/usr/bin/env python3
"""
Credential Retrieval Module
Knows HOW to get current credentials without storing them
"""

import os
import socket
import getpass
import subprocess
from typing import Optional, Dict
from datetime import datetime


class CredentialRetriever:
    """Retrieves current system credentials on-demand"""
    
    def __init__(self, logger):
        self.logger = logger
        self.retrieval_methods = [
            self._get_from_ssh_key,
            self._get_from_keyring,
            self._get_from_ssh_agent,
        ]
    
    def get_current_credentials(self) -> Optional[Dict]:
        """Get current credentials using available methods"""
        self.logger.info("Retrieving current credentials...")
        
        username = getpass.getuser()
        hostname = socket.gethostname()
        ip_address = self._get_local_ip()
        port = 22
        
        for method in self.retrieval_methods:
            try:
                result = method()
                if result:
                    self.logger.info(f"Credentials retrieved via: {result['method']}")
                    return {
                        'username': username,
                        'auth_method': result['auth_method'],
                        'credential': result['credential'],
                        'ip_address': ip_address,
                        'port': port,
                        'hostname': hostname,
                        'method_used': result['method'],
                        'timestamp': datetime.now().isoformat()
                    }
            except Exception as e:
                self.logger.debug(f"Method {method.__name__} failed: {e}")
                continue
        
        self.logger.error("Failed to retrieve credentials via any method")
        return None
    
    def _get_from_ssh_key(self) -> Optional[Dict]:
        """Method 1: Use SSH key (most secure)"""
        ssh_key_paths = [
            os.path.expanduser('~/.ssh/id_rsa'),
            os.path.expanduser('~/.ssh/id_ed25519'),
            os.path.expanduser('~/.ssh/id_ecdsa'),
        ]
        
        for key_path in ssh_key_paths:
            if os.path.exists(key_path):
                try:
                    with open(key_path, 'r') as f:
                        key_content = f.read()
                    
                    if 'ENCRYPTED' in key_content:
                        self.logger.debug(f"SSH key is encrypted: {key_path}")
                        continue
                    
                    self.logger.debug(f"Found SSH key: {key_path}")
                    return {
                        'auth_method': 'key',
                        'credential': key_path,
                        'method': 'ssh_key'
                    }
                except Exception as e:
                    self.logger.debug(f"Could not read key {key_path}: {e}")
                    continue
        
        return None
    
    def _get_from_keyring(self) -> Optional[Dict]:
        """Method 2: System Keyring"""
        try:
            import keyring
            password = keyring.get_password('shellvault', 'ssh_password')
            
            if password:
                self.logger.debug("Retrieved password from system keyring")
                return {
                    'auth_method': 'password',
                    'credential': password,
                    'method': 'system_keyring'
                }
        except ImportError:
            self.logger.debug("keyring module not available")
        except Exception as e:
            self.logger.debug(f"Keyring retrieval failed: {e}")
        
        return None
    
    def _get_from_ssh_agent(self) -> Optional[Dict]:
        """Method 3: SSH Agent"""
        try:
            ssh_auth_sock = os.environ.get('SSH_AUTH_SOCK')
            
            if ssh_auth_sock:
                result = subprocess.run(
                    ['ssh-add', '-l'],
                    capture_output=True,
                    text=True,
                    timeout=2
                )
                
                if result.returncode == 0 and result.stdout.strip():
                    self.logger.debug("SSH agent has loaded keys")
                    return {
                        'auth_method': 'key',
                        'credential': 'ssh-agent',
                        'method': 'ssh_agent'
                    }
        except Exception as e:
            self.logger.debug(f"SSH agent check failed: {e}")
        
        return None
    
    def _get_local_ip(self) -> str:
        """Get local IP address"""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            return socket.gethostbyname(socket.gethostname())
`;

  const wrapper = `#!/bin/bash
# ShellVault Agent Wrapper

AGENT_DIR="/usr/local/lib/shellvault"
AGENT_SCRIPT="\${AGENT_DIR}/agent.py"

export PYTHONPATH="\${AGENT_DIR}:\${PYTHONPATH}"

exec /usr/bin/python3 "\${AGENT_SCRIPT}" "$@"
`;

  const service = `[Unit]
Description=ShellVault Agent - Secure SSH Access Broker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/usr/local/lib/shellvault
Environment="PYTHONPATH=/usr/local/lib/shellvault"
ExecStart=/usr/local/bin/shellvault-agent
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

NoNewPrivileges=false
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
`;

  // ✅ NEW: Secret Manager Module
  const secretManager = `#!/usr/bin/env python3
"""
ShellVault Secret Manager - Production Grade
Encrypted file-based secret storage for Linux systemd services

Security Features:
- AES-256-GCM encryption
- Machine-specific key derivation (from /etc/machine-id)
- Auto-unlock (no password needed)
- Root-only file access (600 permissions)
- Tamper detection (authenticated encryption)
- Secure deletion (overwrites before delete)

Author: ShellVault Security Team
Version: 1.0.0 (Production)
"""

import os
import json
import hashlib
from typing import Dict
from pathlib import Path


class SecretManager:
    """
    Production-grade encrypted secret storage
    
    Stores secrets in /etc/shellvault/secrets.enc
    Encrypted with AES-256-GCM using machine-specific key
    """
    
    SECRET_FILE = '/etc/shellvault/secrets.enc'
    MACHINE_ID_FILE = '/etc/machine-id'
    SALT = b'shellvault-production-secrets-v1'
    
    def __init__(self):
        """Initialize secret manager with cryptography library"""
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            self.AESGCM = AESGCM
        except ImportError:
            raise ImportError(
                "❌ cryptography module required\\n"
                "Install: pip3 install cryptography --break-system-packages"
            )
    
    def _get_machine_key(self) -> bytes:
        """
        Derive encryption key from machine ID
        
        This creates a machine-specific encryption key:
        - Derived from /etc/machine-id (unique per Linux installation)
        - Uses PBKDF2 with 100,000 iterations
        - Produces 256-bit key
        - Makes secrets portable only on this machine
        
        Returns:
            32-byte (256-bit) encryption key
            
        Raises:
            RuntimeError: If machine-id file not found or unreadable
        """
        try:
            # Read machine ID (UUID generated at system install)
            if not os.path.exists(self.MACHINE_ID_FILE):
                raise FileNotFoundError(f"Machine ID file not found: {self.MACHINE_ID_FILE}")
            
            with open(self.MACHINE_ID_FILE, 'r') as f:
                machine_id = f.read().strip()
            
            if not machine_id or len(machine_id) < 16:
                raise ValueError("Invalid machine ID (too short)")
            
            # Derive 256-bit key using PBKDF2-HMAC-SHA256
            key = hashlib.pbkdf2_hmac(
                'sha256',                    # Hash algorithm
                machine_id.encode('utf-8'),  # Password (machine ID)
                self.SALT,                   # Salt
                100000,                      # Iterations (100k = secure)
                32                           # Key length (32 bytes = 256 bits)
            )
            
            return key
            
        except FileNotFoundError as e:
            raise RuntimeError(
                f"❌ {e}\\n"
                "This system may not have systemd or /etc/machine-id"
            )
        except Exception as e:
            raise RuntimeError(f"❌ Failed to derive machine key: {e}")
    
    def store_secrets(self, secrets: Dict[str, str]) -> None:
        """
        Store secrets in encrypted file
        
        Process:
        1. Derives machine-specific encryption key
        2. Encrypts secrets with AES-256-GCM
        3. Writes to /etc/shellvault/secrets.enc
        4. Sets file permissions to 600 (root only)
        
        Args:
            secrets: Dictionary of secrets
                    Required keys: user_id, server_id, handshake_uuid
        
        Security:
            - Encrypted with AES-256-GCM (military-grade)
            - Machine-specific key (can't copy to other servers)
            - Root-only access (600 permissions)
            - Authenticated encryption (detects tampering)
        
        Raises:
            RuntimeError: If storage fails
        """
        try:
            # Validate required secrets
            required = ['user_id', 'server_id', 'handshake_uuid']
            missing = [k for k in required if k not in secrets]
            if missing:
                raise ValueError(f"Missing required secrets: {missing}")
            
            # Derive machine-specific encryption key
            key = self._get_machine_key()
            aesgcm = self.AESGCM(key)
            
            # Serialize secrets to JSON
            plaintext = json.dumps(secrets, indent=2).encode('utf-8')
            
            # Generate random nonce (IV) - NEVER REUSE!
            nonce = os.urandom(12)  # 96 bits (recommended for GCM)
            
            # Encrypt with AES-256-GCM
            # Output includes: encrypted_data + authentication_tag
            ciphertext = aesgcm.encrypt(nonce, plaintext, None)
            
            # Combine: nonce + ciphertext (ciphertext includes auth tag)
            encrypted_data = nonce + ciphertext
            
            # Create directory with restricted permissions
            secret_dir = os.path.dirname(self.SECRET_FILE)
            if not os.path.exists(secret_dir):
                os.makedirs(secret_dir, mode=0o700)  # rwx------
                print(f"📁 Created directory: {secret_dir}")
            
            # Write encrypted file
            with open(self.SECRET_FILE, 'wb') as f:
                f.write(encrypted_data)
            
            # Set strict permissions (owner read/write only)
            os.chmod(self.SECRET_FILE, 0o600)  # rw-------
            
            # Verify file was created
            if not os.path.exists(self.SECRET_FILE):
                raise RuntimeError("Secret file not created")
            
            # Success!
            print("\\n" + "=" * 60)
            print("✅ SECRETS STORED SECURELY")
            print("=" * 60)
            print(f"📄 File: {self.SECRET_FILE}")
            print(f"🔒 Encryption: AES-256-GCM")
            print(f"🔑 Key Source: {self.MACHINE_ID_FILE}")
            print(f"🛡️  Permissions: 600 (root only)")
            print(f"📦 Secrets: {len(secrets)} items")
            print("=" * 60 + "\\n")
            
        except Exception as e:
            raise RuntimeError(f"❌ Failed to store secrets: {e}")
    
    def load_secrets(self) -> Dict[str, str]:
        """
        Load and decrypt secrets from file
        
        Process:
        1. Reads encrypted file
        2. Derives machine-specific decryption key
        3. Decrypts and verifies with AES-256-GCM
        4. Validates required fields exist
        
        Returns:
            Dictionary containing decrypted secrets
        
        Security:
            - Only works on machine where secrets were stored
            - Detects any tampering (authentication tag)
            - Validates all required fields present
        
        Raises:
            RuntimeError: If file not found, decryption fails, or validation fails
        """
        try:
            # Check if secrets file exists
            if not os.path.exists(self.SECRET_FILE):
                raise FileNotFoundError(
                    f"❌ Secrets file not found: {self.SECRET_FILE}\\n"
                    "Agent not installed or secrets not stored."
                )
            
            # Check file permissions
            file_stat = os.stat(self.SECRET_FILE)
            file_perms = file_stat.st_mode & 0o777
            
            if file_perms != 0o600:
                print(f"⚠️  WARNING: Insecure permissions: {oct(file_perms)}")
                print(f"   Fixing to 600...")
                try:
                    os.chmod(self.SECRET_FILE, 0o600)
                    print(f"   ✅ Permissions fixed")
                except Exception as e:
                    print(f"   ⚠️  Could not fix permissions: {e}")
            
            # Read encrypted file
            with open(self.SECRET_FILE, 'rb') as f:
                encrypted_data = f.read()
            
            if len(encrypted_data) < 12:
                raise ValueError("Encrypted file too small (corrupted?)")
            
            # Derive machine-specific decryption key
            key = self._get_machine_key()
            aesgcm = self.AESGCM(key)
            
            # Extract nonce and ciphertext
            nonce = encrypted_data[:12]           # First 12 bytes
            ciphertext = encrypted_data[12:]      # Rest is ciphertext + auth tag
            
            # Decrypt and verify authentication tag
            # If tampering detected, this will raise exception
            plaintext = aesgcm.decrypt(nonce, ciphertext, None)
            
            # Parse JSON
            secrets = json.loads(plaintext.decode('utf-8'))
            
            # Validate required fields
            required = ['user_id', 'server_id', 'handshake_uuid']
            missing = [f for f in required if f not in secrets]
            
            if missing:
                raise ValueError(f"Missing required secrets: {missing}")
            
            # Validate UUIDs are not empty
            for field in required:
                if not secrets[field] or len(secrets[field]) < 10:
                    raise ValueError(f"Invalid {field}: too short or empty")
            
            return secrets
            
        except FileNotFoundError as e:
            raise RuntimeError(str(e))
        except Exception as e:
            # Decryption can fail for multiple reasons:
            # - Wrong machine (different machine-id)
            # - File tampered with (auth tag mismatch)
            # - File corrupted
            raise RuntimeError(
                f"❌ Failed to load secrets: {e}\\n"
                "Possible causes:\\n"
                "  - File copied from another machine\\n"
                "  - File tampered with\\n"
                "  - File corrupted"
            )
    
    def delete_secrets(self) -> None:
        """
        Securely delete secrets file
        
        Process:
        1. Overwrites file with random data (3 passes)
        2. Syncs to disk to ensure overwrite
        3. Deletes file
        
        Security:
            - Prevents forensic recovery
            - Multiple overwrite passes
            - Sync to disk ensures data written
        """
        try:
            if not os.path.exists(self.SECRET_FILE):
                print(f"⚠️  Secret file not found: {self.SECRET_FILE}")
                print(f"   (Already deleted or never created)")
                return
            
            # Get file size
            file_size = os.path.getsize(self.SECRET_FILE)
            
            print(f"🗑️  Securely deleting: {self.SECRET_FILE}")
            print(f"   Size: {file_size} bytes")
            print(f"   Method: 3-pass random overwrite")
            
            # Overwrite with random data (3 passes)
            for pass_num in range(1, 4):
                print(f"   Pass {pass_num}/3...", end="", flush=True)
                with open(self.SECRET_FILE, 'r+b') as f:
                    f.seek(0)
                    f.write(os.urandom(file_size))
                    f.flush()
                    os.fsync(f.fileno())  # Force write to disk
                print(" ✅")
            
            # Delete file
            os.remove(self.SECRET_FILE)
            
            print(f"✅ Secrets securely deleted")
            
        except Exception as e:
            raise RuntimeError(f"❌ Failed to delete secrets: {e}")
    
    def verify_secrets(self) -> bool:
        """
        Verify secrets file exists and can be decrypted
        
        Returns:
            True if secrets are valid and accessible
            False if any check fails
        """
        try:
            # Try to load secrets
            secrets = self.load_secrets()
            
            # Check all required fields exist
            required = ['user_id', 'server_id', 'handshake_uuid']
            for field in required:
                if field not in secrets or not secrets[field]:
                    return False
            
            return True
            
        except Exception:
            return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CLI INTERFACE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if __name__ == "__main__":
    import sys
    
    def print_usage():
        print("""
ShellVault Secret Manager - Production Grade

Usage:
  Store secrets:
    python3 secret_manager.py store <user_id> <server_id> <handshake_uuid>
  
  Load secrets:
    python3 secret_manager.py load
  
  Verify secrets:
    python3 secret_manager.py verify
  
  Delete secrets:
    python3 secret_manager.py delete

Examples:
  # Store
  python3 secret_manager.py store "abc-123-uuid" "def-456-uuid" "ghi-789-uuid"
  
  # Load
  python3 secret_manager.py load
  
  # Verify
  python3 secret_manager.py verify && echo "OK" || echo "FAIL"
  
  # Delete
  python3 secret_manager.py delete
""")
    
    if len(sys.argv) < 2:
        print_usage()
        sys.exit(1)
    
    manager = SecretManager()
    command = sys.argv[1].lower()
    
    try:
        if command == "store":
            if len(sys.argv) != 5:
                print("❌ Error: store requires 3 arguments")
                print("Usage: python3 secret_manager.py store <user_id> <server_id> <handshake_uuid>")
                sys.exit(1)
            
            secrets = {
                'user_id': sys.argv[2],
                'server_id': sys.argv[3],
                'handshake_uuid': sys.argv[4],
            }
            
            manager.store_secrets(secrets)
            sys.exit(0)
        
        elif command == "load":
            secrets = manager.load_secrets()
            
            print("\\n" + "=" * 60)
            print("✅ SECRETS LOADED SUCCESSFULLY")
            print("=" * 60)
            
            for key, value in secrets.items():
                # Mask sensitive values for security
                if len(value) > 16:
                    masked = value[:8] + "..." + value[-8:]
                else:
                    masked = "***"
                
                print(f"  {key:20s} : {masked}")
            
            print("=" * 60 + "\\n")
            sys.exit(0)
        
        elif command == "verify":
            if manager.verify_secrets():
                print("✅ Secrets are valid")
                sys.exit(0)
            else:
                print("❌ Secrets are invalid or missing")
                sys.exit(1)
        
        elif command == "delete":
            manager.delete_secrets()
            sys.exit(0)
        
        else:
            print(f"❌ Unknown command: {command}")
            print_usage()
            sys.exit(1)
    
    except Exception as e:
        print(f"\\n❌ ERROR: {e}\\n")
        sys.exit(1)
`;

  return {
    agent,
    transport,
    operations,
    credentials,
    wrapper,
    service,
    secretManager,  // ✅ NEW
  };
}