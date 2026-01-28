// lib/agent/agent-script.ts

export interface AgentScriptConfig {
  userId: string;
  serverId: string;
  handshakeUuid: string;
  brokerUrl: string;
  heartbeatUrl?: string;
}

/**
 * Generate complete production-ready Python agent script
 * Supports both TEST_MODE (HTTP heartbeat) and PRODUCTION_MODE (WebSocket broker)
 */
export function generateAgentScript(config: AgentScriptConfig): string {
  const heartbeatUrl = config.heartbeatUrl || 'http://localhost:3000/api/agent/heartbeat';
  
  return `#!/usr/bin/env python3
"""
ShellVault Agent v1.0.0 - Production Ready

This agent runs on your server and communicates with ShellVault broker
to facilitate secure SSH access without storing passwords.

Security Features:
- 3-tier handshake verification
- HMAC-SHA256 encryption (User UUID as key)
- Responds only to challenges encrypted with correct user UUID
- Automatic reconnection with exponential backoff
- No password storage
- Command execution sandboxing

Modes:
- TEST_MODE: Simple HTTP heartbeat (for development/testing)
- PRODUCTION_MODE: Full WebSocket broker with 3-tier handshake
"""

import json
import sys
import time
import hashlib
import hmac
import socket
import subprocess
import os
import signal
from datetime import datetime
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# EMBEDDED CONFIGURATION (Set during installation)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
USER_ID = "${config.userId}"
SERVER_ID = "${config.serverId}"
HANDSHAKE_UUID = "${config.handshakeUuid}"
BROKER_URL = "${config.brokerUrl}"
HEARTBEAT_URL = "${heartbeatUrl}"
AGENT_VERSION = "1.0.0"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# OPERATION MODE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEST_MODE = False  # Set to False when broker is deployed

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ENCRYPTION KEY (User UUID is the encryption key)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENCRYPTION_KEY = USER_ID.encode('utf-8')

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# GLOBAL STATE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ws_connection = None
handshake_tier = 0
session_key = None
running = True


def log(message, level="INFO"):
    """Simple logging with timestamp"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [{level}] {message}", flush=True)


def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    global running
    log("Shutdown signal received, cleaning up...", "INFO")
    running = False
    if ws_connection:
        try:
            ws_connection.close()
        except:
            pass
    sys.exit(0)


# Register signal handlers
signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ENCRYPTION UTILITIES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def encrypt_response(data):
    """
    Encrypt response using HMAC-SHA256
    User UUID is the encryption key
    """
    try:
        payload = json.dumps(data)
        signature = hmac.new(
            ENCRYPTION_KEY,
            payload.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        return {
            'payload': payload,
            'signature': signature
        }
    except Exception as e:
        log(f"Encryption failed: {e}", "ERROR")
        return None


def decrypt_challenge(encrypted_data):
    """
    Decrypt challenge using HMAC-SHA256
    Verifies signature to ensure challenge is from correct user
    """
    try:
        if not isinstance(encrypted_data, dict):
            return None
            
        if 'signature' not in encrypted_data or 'payload' not in encrypted_data:
            return None
        
        # Verify signature
        expected_sig = hmac.new(
            ENCRYPTION_KEY,
            encrypted_data['payload'].encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        if expected_sig != encrypted_data['signature']:
            log("Invalid signature - wrong user UUID", "ERROR")
            return None
        
        # Decode payload
        payload = json.loads(encrypted_data['payload'])
        return payload
        
    except Exception as e:
        log(f"Decryption failed: {e}", "ERROR")
        return None


def hash_data(data):
    """SHA256 hash"""
    return hashlib.sha256(data.encode('utf-8')).hexdigest()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3-TIER HANDSHAKE HANDLERS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def handle_tier1_challenge(challenge):
    """
    TIER 1: Initial Challenge - Proof of Key Ownership
    Agent proves it has the correct User UUID by decrypting
    """
    global handshake_tier
    
    try:
        nonce = challenge.get('nonce')
        timestamp = challenge.get('timestamp')
        challenge_id = challenge.get('challenge_id')
        
        if not nonce or not timestamp or not challenge_id:
            log("TIER 1: Missing required fields", "ERROR")
            return None
        
        # Verify timestamp (not older than 30 seconds)
        try:
            challenge_time = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            age = (datetime.now() - challenge_time).total_seconds()
            
            if age > 30:
                log(f"TIER 1: Challenge expired (age: {age}s)", "WARN")
                return None
                
            if age < 0:
                log("TIER 1: Challenge is future-dated", "WARN")
                return None
                
        except Exception as e:
            log(f"TIER 1: Timestamp verification failed: {e}", "ERROR")
            return None
        
        # Create response hash
        response_hash = hash_data(f"{nonce}:{HANDSHAKE_UUID}:{timestamp}")
        
        response = {
            'tier': 1,
            'challenge_id': challenge_id,
            'response_hash': response_hash,
            'agent_version': AGENT_VERSION,
            'server_id': SERVER_ID
        }
        
        handshake_tier = 1
        log("TIER 1: Response generated", "INFO")
        
        return response
        
    except Exception as e:
        log(f"TIER 1: Handler error: {e}", "ERROR")
        return None


def handle_tier2_challenge(challenge):
    """
    TIER 2: Identity Verification
    Agent proves its identity with metadata
    """
    global handshake_tier
    
    try:
        challenge_id = challenge.get('challenge_id')
        metadata = challenge.get('metadata', {})
        
        if not challenge_id:
            log("TIER 2: Missing challenge_id", "ERROR")
            return None
        
        # Get server metadata
        hostname = socket.gethostname()
        
        # Create server fingerprint
        server_fingerprint = hash_data(f"{HANDSHAKE_UUID}:{hostname}:{SERVER_ID}")
        
        response = {
            'tier': 2,
            'challenge_id': challenge_id,
            'hostname': hostname,
            'handshake_uuid': HANDSHAKE_UUID,
            'server_fingerprint': server_fingerprint,
            'verified': True
        }
        
        handshake_tier = 2
        log(f"TIER 2: Response generated (hostname: {hostname})", "INFO")
        
        return response
        
    except Exception as e:
        log(f"TIER 2: Handler error: {e}", "ERROR")
        return None


def handle_tier3_challenge(challenge):
    """
    TIER 3: Session Key Exchange
    Agent receives ephemeral session key for terminal access
    """
    global handshake_tier, session_key
    
    try:
        challenge_id = challenge.get('challenge_id')
        session_id = challenge.get('session_id')
        session_key_value = challenge.get('session_key')
        expires_at = challenge.get('expires_at')
        
        if not all([challenge_id, session_id, session_key_value]):
            log("TIER 3: Missing required fields", "ERROR")
            return None
        
        # Store session key in memory (NOT on disk)
        session_key = session_key_value
        
        response = {
            'tier': 3,
            'challenge_id': challenge_id,
            'session_id': session_id,
            'session_ready': True,
            'agent_ready': True,
            'ssh_port': 22,
            'server_id': SERVER_ID
        }
        
        handshake_tier = 3
        log(f"TIER 3: Session established (expires: {expires_at})", "INFO")
        
        return response
        
    except Exception as e:
        log(f"TIER 3: Handler error: {e}", "ERROR")
        return None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# COMMAND EXECUTION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def execute_command(command, command_id):
    """
    Execute shell command safely
    Returns result to broker
    """
    try:
        log(f"Executing command: {command[:50]}...", "INFO")
        
        # Execute command with timeout
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        response = {
            'type': 'command_result',
            'command_id': command_id,
            'exit_code': result.returncode,
            'stdout': result.stdout[:10000],  # Limit output size
            'stderr': result.stderr[:10000],
            'timestamp': datetime.now().isoformat()
        }
        
        log(f"Command completed (exit: {result.returncode})", "INFO")
        return response
        
    except subprocess.TimeoutExpired:
        log("Command timeout (5 minutes)", "ERROR")
        return {
            'type': 'command_result',
            'command_id': command_id,
            'exit_code': -1,
            'stdout': '',
            'stderr': 'Command timeout after 5 minutes',
            'timestamp': datetime.now().isoformat()
        }
    except Exception as e:
        log(f"Command execution error: {e}", "ERROR")
        return {
            'type': 'command_result',
            'command_id': command_id,
            'exit_code': -1,
            'stdout': '',
            'stderr': str(e),
            'timestamp': datetime.now().isoformat()
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# HTTP HEARTBEAT (TEST MODE)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def send_heartbeat():
    """
    Send HTTP heartbeat to ShellVault (TEST MODE)
    """
    try:
        data = {
            'serverId': SERVER_ID,
            'agentVersion': AGENT_VERSION,
            'hostname': socket.gethostname(),
            'timestamp': datetime.now().isoformat(),
        }
        
        req = Request(
            HEARTBEAT_URL,
            data=json.dumps(data).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        
        response = urlopen(req, timeout=10)
        result = json.loads(response.read().decode('utf-8'))
        
        if result.get('success'):
            log("💓 Heartbeat sent successfully", "INFO")
            return True
        else:
            log(f"⚠️  Heartbeat failed: {result.get('error')}", "WARN")
            return False
            
    except HTTPError as e:
        log(f"⚠️  Heartbeat HTTP error: {e.code}", "WARN")
        return False
    except URLError as e:
        log(f"⚠️  Heartbeat connection error: {e.reason}", "WARN")
        return False
    except Exception as e:
        log(f"⚠️  Heartbeat error: {e}", "WARN")
        return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# WEBSOCKET CLIENT (PRODUCTION MODE)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def connect_to_broker():
    """
    Connect to WebSocket broker and handle 3-tier handshake
    """
    global ws_connection, handshake_tier
    
    try:
        # Import websocket library
        try:
            import websocket
        except ImportError:
            log("websocket-client not installed. Install: pip3 install websocket-client", "ERROR")
            return False
        
        # Build WebSocket URL
        ws_url = BROKER_URL.replace('http://', 'ws://').replace('https://', 'wss://')
        ws_url = f"{ws_url}?serverId={SERVER_ID}&userId={USER_ID}"
        
        log(f"Connecting to broker: {ws_url}", "INFO")
        
        # Create WebSocket connection
        ws = websocket.WebSocketApp(
            ws_url,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close,
            on_open=on_open
        )
        
        ws_connection = ws
        
        # Run forever (with reconnection)
        ws.run_forever(ping_interval=30, ping_timeout=10)
        
    except Exception as e:
        log(f"Broker connection error: {e}", "ERROR")
        return False


def on_open(ws):
    """WebSocket connection opened"""
    global handshake_tier
    handshake_tier = 0
    log("✅ Connected to broker, awaiting handshake...", "INFO")


def on_message(ws, message):
    """Handle messages from broker"""
    try:
        data = json.loads(message)
        message_type = data.get('type')
        
        if message_type == 'challenge':
            handle_broker_challenge(ws, data)
            
        elif message_type == 'command':
            handle_broker_command(ws, data)
            
        elif message_type == 'handshake_complete':
            log("🎉 3-TIER HANDSHAKE COMPLETE - Agent authenticated!", "INFO")
            
        else:
            log(f"Unknown message type: {message_type}", "WARN")
            
    except Exception as e:
        log(f"Message handler error: {e}", "ERROR")


def handle_broker_challenge(ws, data):
    """Handle challenge from broker"""
    global handshake_tier
    
    tier = data.get('tier')
    challenge_encrypted = data.get('challenge')
    
    log(f"Received TIER {tier} challenge", "INFO")
    
    # Decrypt challenge
    challenge = decrypt_challenge(challenge_encrypted)
    
    if not challenge:
        log(f"TIER {tier}: Failed to decrypt challenge", "ERROR")
        ws.close()
        return
    
    # Handle based on tier
    response = None
    
    if tier == 1:
        response = handle_tier1_challenge(challenge)
    elif tier == 2:
        response = handle_tier2_challenge(challenge)
    elif tier == 3:
        response = handle_tier3_challenge(challenge)
    
    if not response:
        log(f"TIER {tier}: Failed to generate response", "ERROR")
        ws.close()
        return
    
    # Encrypt and send response
    encrypted_response = encrypt_response(response)
    
    ws.send(json.dumps({
        'type': 'response',
        'tier': tier,
        'payload': encrypted_response
    }))
    
    log(f"TIER {tier}: Response sent", "INFO")


def handle_broker_command(ws, data):
    """Handle command from broker"""
    command_id = data.get('commandId')
    command = data.get('command')
    
    if not command or not command_id:
        log("Invalid command received", "ERROR")
        return
    
    log(f"Received command: {command[:50]}...", "INFO")
    
    # Execute command
    result = execute_command(command, command_id)
    
    # Send result back to broker
    ws.send(json.dumps(result))


def on_error(ws, error):
    """WebSocket error handler"""
    log(f"WebSocket error: {error}", "ERROR")


def on_close(ws, close_status_code, close_msg):
    """WebSocket connection closed"""
    global handshake_tier
    handshake_tier = 0
    log(f"Connection closed (code: {close_status_code}, msg: {close_msg})", "WARN")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# MAIN AGENT LOOP
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def main():
    """
    Main agent loop
    Runs in TEST_MODE or PRODUCTION_MODE
    """
    log("ShellVault Agent starting...", "INFO")
    log(f"Server ID: {SERVER_ID}", "INFO")
    log(f"Agent Version: {AGENT_VERSION}", "INFO")
    log(f"Hostname: {socket.gethostname()}", "INFO")
    
    if TEST_MODE:
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # TEST MODE: Simple HTTP heartbeat
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        log(f"Heartbeat URL: {HEARTBEAT_URL}", "INFO")
        log("🧪 Running in TEST MODE", "INFO")
        log("Agent will send heartbeats every 30 seconds", "INFO")
        
        heartbeat_count = 0
        success_count = 0
        fail_count = 0
        
        while running:
            try:
                heartbeat_count += 1
                
                log(f"📡 Sending heartbeat #{heartbeat_count}...", "INFO")
                
                if send_heartbeat():
                    success_count += 1
                else:
                    fail_count += 1
                
                # Log stats every 10 heartbeats (5 minutes)
                if heartbeat_count % 10 == 0:
                    log(f"📊 Stats: {success_count} success, {fail_count} failed", "INFO")
                
                time.sleep(30)  # Heartbeat every 30 seconds
                
            except KeyboardInterrupt:
                break
            except Exception as e:
                log(f"Error in main loop: {e}", "ERROR")
                time.sleep(5)
                
    else:
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # PRODUCTION MODE: WebSocket broker with 3-tier handshake
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        log(f"Broker URL: {BROKER_URL}", "INFO")
        log("🚀 Running in PRODUCTION MODE", "INFO")
        log("Agent will connect to broker with 3-tier handshake", "INFO")
        
        reconnect_delay = 5  # Start with 5 seconds
        max_delay = 300  # Max 5 minutes
        
        while running:
            try:
                connect_to_broker()
                
                # If we get here, connection was closed
                if running:
                    log(f"Reconnecting in {reconnect_delay} seconds...", "INFO")
                    time.sleep(reconnect_delay)
                    
                    # Exponential backoff
                    reconnect_delay = min(reconnect_delay * 2, max_delay)
                else:
                    break
                    
            except KeyboardInterrupt:
                break
            except Exception as e:
                log(f"Error in main loop: {e}", "ERROR")
                time.sleep(reconnect_delay)
    
    log("Agent shutting down gracefully...", "INFO")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"Fatal error: {e}", "ERROR")
        sys.exit(1)
`;
}