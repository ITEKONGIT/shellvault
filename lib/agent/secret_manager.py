#!/usr/bin/env python3
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
                "❌ cryptography module required\n"
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
                f"❌ {e}\n"
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
            print("\n" + "=" * 60)
            print("✅ SECRETS STORED SECURELY")
            print("=" * 60)
            print(f"📄 File: {self.SECRET_FILE}")
            print(f"🔒 Encryption: AES-256-GCM")
            print(f"🔑 Key Source: {self.MACHINE_ID_FILE}")
            print(f"🛡️  Permissions: 600 (root only)")
            print(f"📦 Secrets: {len(secrets)} items")
            print("=" * 60 + "\n")
            
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
                    f"❌ Secrets file not found: {self.SECRET_FILE}\n"
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
                f"❌ Failed to load secrets: {e}\n"
                "Possible causes:\n"
                "  - File copied from another machine\n"
                "  - File tampered with\n"
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
            
            print("\n" + "=" * 60)
            print("✅ SECRETS LOADED SUCCESSFULLY")
            print("=" * 60)
            
            for key, value in secrets.items():
                # Mask sensitive values for security
                if len(value) > 16:
                    masked = value[:8] + "..." + value[-8:]
                else:
                    masked = "***"
                
                print(f"  {key:20s} : {masked}")
            
            print("=" * 60 + "\n")
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
        print(f"\n❌ ERROR: {e}\n")
        sys.exit(1)