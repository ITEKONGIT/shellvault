// lib/ssh/client.ts

import { Client, ClientChannel } from 'ssh2';
import { Readable } from 'stream';

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface SSHCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class SSHClient {
  private config: SSHConfig;
  private client: Client | null = null;

  constructor(config: SSHConfig) {
    this.config = config;
  }

  /**
   * Connect to SSH server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client = new Client();

      const timeout = setTimeout(() => {
        this.client?.end();
        reject(new Error('SSH connection timeout (30s)'));
      }, 30000);

      this.client
        .on('ready', () => {
          clearTimeout(timeout);
          resolve();
        })
        .on('error', (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        })
        .connect({
          host: this.config.host,
          port: this.config.port,
          username: this.config.username,
          password: this.config.password,
          readyTimeout: 30000,
          keepaliveInterval: 10000,
        });
    });
  }

  /**
   * Execute a command on the remote server
   */
  async executeCommand(command: string): Promise<SSHCommandResult> {
    if (!this.client) {
      throw new Error('SSH client not connected');
    }

    return new Promise((resolve, reject) => {
      this.client!.exec(command, (err: Error | undefined, stream: ClientChannel) => {
        if (err) {
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';

        stream
          .on('close', (code: number) => {
            resolve({
              stdout,
              stderr,
              exitCode: code,
            });
          })
          .on('data', (data: Buffer) => {
            stdout += data.toString();
          })
          .stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });
      });
    });
  }

  /**
   * ✅ NEW: Execute a command with sudo using the SSH password
   * More secure than passwordless sudo
   */
  async executeSudoCommand(command: string): Promise<SSHCommandResult> {
    if (!this.client) {
      throw new Error('SSH client not connected');
    }

    // Escape single quotes in password for shell safety
    const escapedPassword = this.config.password.replace(/'/g, "'\\''");
    
    // Use echo to pipe password to sudo -S (stdin)
    // The -S flag tells sudo to read password from stdin
    const sudoCommand = `echo '${escapedPassword}' | sudo -S ${command} 2>&1`;

    return new Promise((resolve, reject) => {
      this.client!.exec(sudoCommand, (err: Error | undefined, stream: ClientChannel) => {
        if (err) {
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';

        stream
          .on('close', (code: number) => {
            // Remove sudo password prompt from output
            const cleanStdout = stdout
              .replace(/\[sudo\] password for .*?:\s*/g, '')
              .trim();
            
            const cleanStderr = stderr
              .replace(/\[sudo\] password for .*?:\s*/g, '')
              .trim();

            resolve({
              stdout: cleanStdout,
              stderr: cleanStderr,
              exitCode: code,
            });
          })
          .on('data', (data: Buffer) => {
            stdout += data.toString();
          })
          .stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });
      });
    });
  }

  /**
   * ✅ NEW: Upload file with sudo (for system directories)
   */
  async uploadFileWithSudo(localContent: string, remotePath: string): Promise<void> {
    if (!this.client) {
      throw new Error('SSH client not connected');
    }

    // First upload to /tmp (no sudo needed)
    const tempPath = `/tmp/shellvault-upload-${Date.now()}`;
    await this.uploadFile(localContent, tempPath);

    // Then move to final location with sudo
    const moveResult = await this.executeSudoCommand(`mv ${tempPath} ${remotePath}`);
    
    if (moveResult.exitCode !== 0) {
      // Cleanup temp file on failure
      await this.executeCommand(`rm -f ${tempPath}`).catch(() => {});
      throw new Error(`Failed to move file to ${remotePath}: ${moveResult.stderr}`);
    }
  }

  /**
   * Upload a file to the remote server
   */
  async uploadFile(localContent: string, remotePath: string): Promise<void> {
    if (!this.client) {
      throw new Error('SSH client not connected');
    }

    return new Promise((resolve, reject) => {
      this.client!.sftp((err: Error | undefined, sftp: any) => {
        if (err) {
          reject(err);
          return;
        }

        const writeStream = sftp.createWriteStream(remotePath);

        writeStream.on('close', () => {
          resolve();
        });

        writeStream.on('error', (error: Error) => {
          reject(error);
        });

        // Write content
        const readable = Readable.from([localContent]);
        readable.pipe(writeStream);
      });
    });
  }

  /**
   * Check if a file exists on the remote server
   */
  async fileExists(remotePath: string): Promise<boolean> {
    try {
      const result = await this.executeCommand(`test -f ${remotePath} && echo "exists" || echo "not found"`);
      return result.stdout.trim() === 'exists';
    } catch (error) {
      return false;
    }
  }

  /**
   * Get server information
   */
  async getServerInfo(): Promise<{
    hostname: string;
    os: string;
    kernel: string;
    uptime: string;
  }> {
    const [hostname, os, kernel, uptime] = await Promise.all([
      this.executeCommand('hostname'),
      this.executeCommand('cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\''),
      this.executeCommand('uname -r'),
      this.executeCommand('uptime -p'),
    ]);

    return {
      hostname: hostname.stdout.trim(),
      os: os.stdout.trim() || 'Unknown',
      kernel: kernel.stdout.trim(),
      uptime: uptime.stdout.trim(),
    };
  }

  /**
   * Disconnect from SSH server
   */
  disconnect(): void {
    if (this.client) {
      this.client.end();
      this.client = null;
    }
  }
}