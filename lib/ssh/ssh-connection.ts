// lib/ssh/ssh-connection.ts
// SSH connection manager using ssh2

import { Client, ClientChannel } from 'ssh2';
import logger from '@/lib/logger';
import { readFileSync, existsSync } from 'fs';

interface SSHCredentials {
  username: string;
  auth_method: 'key' | 'password';
  credential: string;
  ip_address: string;
  port: number;
  hostname: string;
}

interface SSHConnectionOptions {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: Buffer | string;
  agent?: string;
  readyTimeout?: number;
}

export class SSHConnection {
  private client: Client;
  private stream: ClientChannel | null = null;
  private connected: boolean = false;
  private sessionId: string;

  constructor(sessionId: string) {
    this.client = new Client();
    this.sessionId = sessionId;
  }

  /**
   * Connect to SSH server using credentials
   */
  async connect(credentials: SSHCredentials): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info('Establishing SSH connection', {
        sessionId: this.sessionId,
        host: credentials.ip_address,
        port: credentials.port,
        username: credentials.username,
        authMethod: credentials.auth_method
      });

      try {
        // Build connection options
        const options: SSHConnectionOptions = {
          host: credentials.ip_address,
          port: credentials.port,
          username: credentials.username,
          readyTimeout: 10000, // 10 seconds
        };

        // Add authentication method
        if (credentials.auth_method === 'key') {
          // Credential is a file path to SSH key
          const keyPath = credentials.credential;

          if (keyPath === 'ssh-agent') {
            // Use SSH agent
            options.agent = process.env.SSH_AUTH_SOCK;
            logger.info('Using SSH agent for authentication', { sessionId: this.sessionId });
          } else {
            // Read key file
            if (!existsSync(keyPath)) {
              throw new Error(`SSH key not found: ${keyPath}`);
            }

            const privateKey = readFileSync(keyPath, 'utf8');
            options.privateKey = privateKey;
            logger.info('Using SSH key file for authentication', { 
              sessionId: this.sessionId,
              keyPath: keyPath.substring(0, 30) + '...'
            });
          }
        } else {
          // Use password
          options.password = credentials.credential;
          logger.info('Using password authentication', { sessionId: this.sessionId });
        }

        // Set up event handlers
        this.client.on('ready', () => {
          this.connected = true;
          logger.info('SSH connection established', {
            sessionId: this.sessionId,
            host: credentials.ip_address
          });
          resolve();
        });

        this.client.on('error', (err) => {
          logger.error('SSH connection error', {
            sessionId: this.sessionId,
            error: err.message
          });
          reject(err);
        });

        this.client.on('close', () => {
          this.connected = false;
          logger.info('SSH connection closed', { sessionId: this.sessionId });
        });

        this.client.on('end', () => {
          this.connected = false;
          logger.info('SSH connection ended', { sessionId: this.sessionId });
        });

        // Connect
        this.client.connect(options);

      } catch (error: any) {
        logger.error('Failed to initiate SSH connection', {
          sessionId: this.sessionId,
          error: error.message
        });
        reject(error);
      }
    });
  }

  /**
   * Request a shell (PTY)
   */
  async requestShell(): Promise<ClientChannel> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('SSH not connected'));
        return;
      }

      logger.info('Requesting SSH shell', { sessionId: this.sessionId });

      this.client.shell({
        term: 'xterm-256color',
        cols: 80,
        rows: 24,
      }, (err, stream) => {
        if (err) {
          logger.error('Failed to request shell', {
            sessionId: this.sessionId,
            error: err.message
          });
          reject(err);
          return;
        }

        this.stream = stream;
        logger.info('SSH shell established', { sessionId: this.sessionId });
        resolve(stream);
      });
    });
  }

  /**
   * Execute a command (non-interactive)
   */
  async exec(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('SSH not connected'));
        return;
      }

      logger.info('Executing SSH command', {
        sessionId: this.sessionId,
        command: command.substring(0, 50) + '...'
      });

      this.client.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('close', (code: number) => {
          logger.info('Command executed', {
            sessionId: this.sessionId,
            exitCode: code
          });
          resolve({ stdout, stderr, code });
        });

        stream.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
      });
    });
  }

  /**
   * Resize terminal
   */
  resize(cols: number, rows: number): void {
    if (this.stream && this.connected) {
      this.stream.setWindow(rows, cols, 480, 640);
      logger.debug('Terminal resized', {
        sessionId: this.sessionId,
        cols,
        rows
      });
    }
  }

  /**
   * Write data to shell
   */
  write(data: string): void {
    if (this.stream && this.connected) {
      this.stream.write(data);
    }
  }

  /**
   * Get the SSH stream for reading/writing
   */
  getStream(): ClientChannel | null {
    return this.stream;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Close connection
   */
  close(): void {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }

    if (this.client) {
      this.client.end();
    }

    this.connected = false;
    logger.info('SSH connection closed', { sessionId: this.sessionId });
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
}

/**
 * SSH Connection Manager
 * Manages multiple SSH connections
 */
export class SSHConnectionManager {
  private connections: Map<string, SSHConnection> = new Map();

  /**
   * Create new SSH connection
   */
  async createConnection(
    sessionId: string,
    credentials: SSHCredentials
  ): Promise<SSHConnection> {
    logger.info('Creating SSH connection', { sessionId });

    const connection = new SSHConnection(sessionId);
    
    try {
      await connection.connect(credentials);
      this.connections.set(sessionId, connection);
      
      logger.info('SSH connection created and stored', {
        sessionId,
        totalConnections: this.connections.size
      });

      return connection;
    } catch (error) {
      logger.error('Failed to create SSH connection', { sessionId, error });
      throw error;
    }
  }

  /**
   * Get existing connection
   */
  getConnection(sessionId: string): SSHConnection | undefined {
    return this.connections.get(sessionId);
  }

  /**
   * Close and remove connection
   */
  closeConnection(sessionId: string): void {
    const connection = this.connections.get(sessionId);
    
    if (connection) {
      connection.close();
      this.connections.delete(sessionId);
      
      logger.info('SSH connection removed', {
        sessionId,
        remainingConnections: this.connections.size
      });
    }
  }

  /**
   * Get all active connections
   */
  getActiveConnections(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Close all connections
   */
  closeAll(): void {
    logger.info('Closing all SSH connections', {
      count: this.connections.size
    });

    for (const [sessionId, connection] of this.connections) {
      connection.close();
    }

    this.connections.clear();
  }
}

// Export singleton instance
export const sshConnectionManager = new SSHConnectionManager();