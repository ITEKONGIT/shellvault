// lib/agent/generator.ts
// ✅ PRODUCTION: AES-256-GCM Crypto + Encrypted Vault Secrets + Heartbeat + SSH Username

export interface AgentConfig {
  userId: string;
  serverId: string;
  handshakeUuid: string;
  brokerUrl: string;
  heartbeatUrl: string;
  sshUsername: string;  // ✅ ADDED: SSH username from database
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
  secretManager: string;
}

export function generateModularAgent(config: AgentConfig): GeneratedAgent {
  const version = config.version || '1.0.0';
  const testMode = config.testMode || false;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FILE 1: agent.py - Main Orchestrator
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
# LOAD SECRETS FROM ENCRYPTED VAULT (PRODUCTION)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def load_secrets():
    """Load secrets from encrypted vault (production-grade)"""
    try:
        from secret_manager import SecretManager
        
        manager = SecretManager()
        secrets = manager.load_secrets()
        
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

SECRETS = load_secrets()
print(f"[INFO] Secrets loaded from encrypted vault", flush=True)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PUBLIC CONFIGURATION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PUBLIC_CONFIG = {
    'broker_url': '${config.brokerUrl}',
    'heartbeat_url': '${config.heartbeatUrl}',
    'ssh_username': '${config.sshUsername}',  # ✅ ADDED
    'version': '${version}',
    'test_mode': ${testMode ? 'True' : 'False'},
}

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
        
        from transport import TransportLayer
        from operations import Operations
        
        self.transport = TransportLayer(self.config, self.logger)
        self.operations = Operations(self.config, self.logger)
        
        signal.signal(signal.SIGTERM, self.shutdown)
        signal.signal(signal.SIGINT, self.shutdown)
        
        self.transport.on_command = self.operations.execute_command
        self.transport.on_health_check = self.operations.get_health_metrics
        self.transport.operations = self.operations
    
    def start(self):
        """Start the agent"""
        self.logger.info("=" * 60)
        self.logger.info("ShellVault Agent Starting")
        self.logger.info("=" * 60)
        self.logger.info("Server ID", server_id=self.config['server_id'][:16] + "...")
        self.logger.info("SSH Username", ssh_user=self.config['ssh_username'])  # ✅ ADDED
        self.logger.info("Version", version=self.config['version'])
        self.logger.info("Hostname", hostname=socket.gethostname())
        self.logger.info("Mode", mode="TEST" if self.config['test_mode'] else "PRODUCTION")
        self.logger.info("Security", secrets="Encrypted vault (AES-256-GCM)")
        self.logger.info("Heartbeat", interval="30 seconds")
        self.logger.info("=" * 60)
        
        try:
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

  // Transport layer stays the same (too long to repeat - no changes needed)
  const transport = `#!/usr/bin/env python3
"""
Transport Layer - All Communication
✅ UPDATED: Added periodic heartbeat in production mode
"""

import json
import hashlib
import time
import socket
import base64
import threading
from datetime import datetime, timezone
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError


class Crypto:
    """AES-256-GCM Encryption (matching TypeScript implementation)"""
    
    ALGORITHM = 'aes-256-gcm'
    KEY_LENGTH = 32
    IV_LENGTH = 12
    AUTH_TAG_LENGTH = 16
    SALT = b'shellvault-secure-salt-v1'
    
    def __init__(self, key: str):
        """Initialize crypto with user UUID"""
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
        """Encrypt data with AES-256-GCM"""
        import os
        
        nonce = os.urandom(self.IV_LENGTH)
        plaintext = json.dumps(data).encode('utf-8')
        ciphertext = self.aesgcm.encrypt(nonce, plaintext, None)
        combined = nonce + ciphertext
        
        return base64.b64encode(combined).decode('utf-8')
    
    def decrypt(self, encrypted: str) -> dict:
        """Decrypt and verify AES-256-GCM data"""
        combined = base64.b64decode(encrypted)
        
        nonce = combined[:self.IV_LENGTH]
        ciphertext = combined[self.IV_LENGTH:]
        
        plaintext = self.aesgcm.decrypt(nonce, ciphertext, None)
        
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
        
        try:
            challenge_time = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            age = (datetime.now(timezone.utc) - challenge_time).total_seconds()
            if abs(age) > 30:
                self.logger.warn("TIER 1: Challenge expired", age=age)
                return None
        except Exception as e:
            self.logger.error("TIER 1: Timestamp error", error=str(e))
            return None
        
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
        try:
            challenge = self.crypto.decrypt(encrypted_challenge)
        except Exception as e:
            self.logger.error(f"TIER {tier}: Decryption failed", error=str(e))
            return None
        
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
    """WebSocket Transport (PRODUCTION MODE) with Heartbeat"""
    
    def __init__(self, config, logger, crypto, handshake, on_command):
        self.config = config
        self.logger = logger
        self.crypto = crypto
        self.handshake = handshake
        self.on_command = on_command
        self.ws = None
        self.running = True
        self._operations = None
        self._heartbeat_thread = None
        self._start_time = time.time()
    
    @property
    def operations(self):
        return self._operations
    
    @operations.setter
    def operations(self, ops):
        self._operations = ops
    
    def _start_heartbeat(self):
        """Start heartbeat thread after authentication"""
        if self._heartbeat_thread and self._heartbeat_thread.is_alive():
            return
        
        self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()
        self.logger.info("💓 Heartbeat thread started (every 30s)")
    
    def _heartbeat_loop(self):
        """Send periodic heartbeats to broker"""
        while self.running and self.ws:
            try:
                time.sleep(30)
                
                if not self.running or not self.ws:
                    break
                
                if not self.handshake.authenticated:
                    continue
                
                heartbeat = {
                    'type': 'heartbeat',
                    'timestamp': datetime.now().isoformat(),
                    'server_id': self.config['server_id'],
                    'uptime': int(time.time() - self._start_time),
                }
                
                self.ws.send(json.dumps(heartbeat))
                self.logger.debug("💓 Heartbeat sent")
                
            except Exception as e:
                self.logger.warn("Heartbeat error", error=str(e)[:50])
                break
    
    def on_message(self, ws, message):
        """Handle incoming WebSocket messages"""
        try:
            data = json.loads(message)
            msg_type = data.get('type')
            
            if msg_type == 'challenge':
                tier = data.get('tier')
                encrypted_challenge = data.get('challenge')
                
                self.logger.info(f"Received TIER {tier} challenge")
                
                encrypted_response = self.handshake.handle_challenge(tier, encrypted_challenge)
                if not encrypted_response:
                    self.logger.error(f"TIER {tier}: Failed to generate response")
                    ws.close()
                    return
                
                ws.send(json.dumps({
                    'type': 'response',
                    'tier': tier,
                    'payload': encrypted_response
                }))
                
                self.logger.info(f"TIER {tier}: Response sent")
                
            elif msg_type == 'handshake_complete':
                self.logger.info("🎉 3-TIER HANDSHAKE COMPLETE!")
                self._start_heartbeat()
                
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
                
                if self._operations:
                    credentials_response = self._operations.get_credentials()
                    credentials_response['session_id'] = session_id
                    
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
            return False
        
        ws_url = self.config['broker_url'].replace('http://', 'ws://').replace('https://', 'wss://')
        ws_url = f"{ws_url}?serverId={self.config['server_id']}&userId={self.config['user_id']}"
        
        self.logger.info("Connecting to broker...")
        
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
        return self._operations
    
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

  // Operations stays mostly the same
  const operations = `#!/usr/bin/env python3
"""
Operations Module - What the agent can do
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
        self.credential_retriever = CredentialRetriever(config, logger)  # ✅ PASS CONFIG
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
            
            return {
                'type': 'command_result',
                'command_id': command_id,
                'exit_code': result.returncode,
                'stdout': result.stdout[:10000],
                'stderr': result.stderr[:10000],
                'timestamp': datetime.now().isoformat()
            }
            
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FILE 4: credentials.py - ✅ UPDATED TO USE CONFIGURED USERNAME
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const credentials = `#!/usr/bin/env python3
"""
Credential Retrieval Module
✅ UPDATED: Uses configured SSH username from dashboard
"""

import os
import socket
import getpass
import subprocess
from typing import Optional, Dict
from datetime import datetime


class CredentialRetriever:
    """Retrieves current system credentials on-demand"""
    
    def __init__(self, config, logger):
        self.config = config
        self.logger = logger
        self.retrieval_methods = [
            self._get_from_ssh_key,
            self._get_from_keyring,
            self._get_from_ssh_agent,
        ]
    
    def get_current_credentials(self) -> Optional[Dict]:
        """Get current credentials using available methods"""
        self.logger.info("Retrieving current credentials...")
        
        # ✅ USE CONFIGURED USERNAME (from dashboard, not getpass.getuser())
        username = self.config.get('ssh_username', getpass.getuser())
        
        hostname = socket.gethostname()
        ip_address = self._get_local_ip()
        port = 22
        
        self.logger.info(f"Using configured SSH username: {username}")
        
        for method in self.retrieval_methods:
            try:
                result = method(username)  # ✅ PASS USERNAME
                if result:
                    self.logger.info(f"Credentials retrieved via: {result['method']}")
                    return {
                        'username': username,  # ✅ FROM CONFIG
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
    
    def _get_from_ssh_key(self, username: str) -> Optional[Dict]:
        """Method 1: Use SSH key (most secure)"""
        # ✅ Look in the HOME directory of the configured username
        home_dir = os.path.expanduser(f'~{username}') if username != getpass.getuser() else os.path.expanduser('~')
        
        ssh_key_paths = [
            os.path.join(home_dir, '.ssh/id_rsa'),
            os.path.join(home_dir, '.ssh/id_ed25519'),
            os.path.join(home_dir, '.ssh/id_ecdsa'),
        ]
        
        self.logger.debug(f"Looking for SSH keys in {home_dir}/.ssh/")
        
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
                        'credential': key_content,  # ✅ SEND CONTENT
                        'method': 'ssh_key'
                    }
                except Exception as e:
                    self.logger.debug(f"Could not read key {key_path}: {e}")
                    continue
        
        return None
    
    def _get_from_keyring(self, username: str) -> Optional[Dict]:
        """Method 2: System Keyring"""
        try:
            import keyring
            password = keyring.get_password('shellvault', f'ssh_password_{username}')
            
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
    
    def _get_from_ssh_agent(self, username: str) -> Optional[Dict]:
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

  // Wrapper, service, and secretManager stay the same
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

  const secretManager = `#!/usr/bin/env python3
"""
ShellVault Secret Manager - Production Grade
"""

import os
import json
import hashlib
from typing import Dict
from pathlib import Path


class SecretManager:
    """Production-grade encrypted secret storage"""
    
    SECRET_FILE = '/etc/shellvault/secrets.enc'
    MACHINE_ID_FILE = '/etc/machine-id'
    SALT = b'shellvault-production-secrets-v1'
    
    def __init__(self):
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            self.AESGCM = AESGCM
        except ImportError:
            raise ImportError(
                "cryptography module required. "
                "Install: pip3 install cryptography --break-system-packages"
            )
    
    def _get_machine_key(self) -> bytes:
        """Derive encryption key from machine ID"""
        try:
            if not os.path.exists(self.MACHINE_ID_FILE):
                raise FileNotFoundError(f"Machine ID file not found: {self.MACHINE_ID_FILE}")
            
            with open(self.MACHINE_ID_FILE, 'r') as f:
                machine_id = f.read().strip()
            
            if not machine_id or len(machine_id) < 16:
                raise ValueError("Invalid machine ID")
            
            key = hashlib.pbkdf2_hmac(
                'sha256',
                machine_id.encode('utf-8'),
                self.SALT,
                100000,
                32
            )
            
            return key
            
        except FileNotFoundError as e:
            raise RuntimeError(f"{e}")
        except Exception as e:
            raise RuntimeError(f"Failed to derive machine key: {e}")
    
    def store_secrets(self, secrets: Dict[str, str]) -> None:
        """Store secrets in encrypted file"""
        try:
            required = ['user_id', 'server_id', 'handshake_uuid']
            missing = [k for k in required if k not in secrets]
            if missing:
                raise ValueError(f"Missing required secrets: {missing}")
            
            key = self._get_machine_key()
            aesgcm = self.AESGCM(key)
            
            plaintext = json.dumps(secrets, indent=2).encode('utf-8')
            nonce = os.urandom(12)
            ciphertext = aesgcm.encrypt(nonce, plaintext, None)
            encrypted_data = nonce + ciphertext
            
            secret_dir = os.path.dirname(self.SECRET_FILE)
            if not os.path.exists(secret_dir):
                os.makedirs(secret_dir, mode=0o700)
            
            with open(self.SECRET_FILE, 'wb') as f:
                f.write(encrypted_data)
            
            os.chmod(self.SECRET_FILE, 0o600)
            
            print("=" * 60)
            print("SECRETS STORED SECURELY")
            print("=" * 60)
            
        except Exception as e:
            raise RuntimeError(f"Failed to store secrets: {e}")
    
    def load_secrets(self) -> Dict[str, str]:
        """Load and decrypt secrets from file"""
        try:
            if not os.path.exists(self.SECRET_FILE):
                raise FileNotFoundError(f"Secrets file not found: {self.SECRET_FILE}")
            
            with open(self.SECRET_FILE, 'rb') as f:
                encrypted_data = f.read()
            
            if len(encrypted_data) < 12:
                raise ValueError("Encrypted file too small")
            
            key = self._get_machine_key()
            aesgcm = self.AESGCM(key)
            
            nonce = encrypted_data[:12]
            ciphertext = encrypted_data[12:]
            
            plaintext = aesgcm.decrypt(nonce, ciphertext, None)
            secrets = json.loads(plaintext.decode('utf-8'))
            
            required = ['user_id', 'server_id', 'handshake_uuid']
            missing = [f for f in required if f not in secrets]
            
            if missing:
                raise ValueError(f"Missing required secrets: {missing}")
            
            return secrets
            
        except FileNotFoundError as e:
            raise RuntimeError(str(e))
        except Exception as e:
            raise RuntimeError(f"Failed to load secrets: {e}")
    
    def verify_secrets(self) -> bool:
        """Verify secrets file exists and can be decrypted"""
        try:
            secrets = self.load_secrets()
            required = ['user_id', 'server_id', 'handshake_uuid']
            for field in required:
                if field not in secrets or not secrets[field]:
                    return False
            return True
        except Exception:
            return False


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python3 secret_manager.py <store|load|verify> [args]")
        sys.exit(1)
    
    manager = SecretManager()
    command = sys.argv[1].lower()
    
    try:
        if command == "store" and len(sys.argv) == 5:
            secrets = {
                'user_id': sys.argv[2],
                'server_id': sys.argv[3],
                'handshake_uuid': sys.argv[4],
            }
            manager.store_secrets(secrets)
        elif command == "load":
            secrets = manager.load_secrets()
            print(json.dumps(secrets, indent=2))
        elif command == "verify":
            if manager.verify_secrets():
                print("Secrets are valid")
                sys.exit(0)
            else:
                print("Secrets are invalid")
                sys.exit(1)
        else:
            print("Invalid command")
            sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
`;

  return {
    agent,
    transport,
    operations,
    credentials,
    wrapper,
    service,
    secretManager,
  };
}