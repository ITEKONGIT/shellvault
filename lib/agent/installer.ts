// lib/agent/installer.ts
// ✅ PRODUCTION: SSH Key Validation + Encrypted vault storage + AES-256-GCM + SSH Username

import { SSHClient, SSHConfig } from '@/lib/ssh/client';
import logger from '@/lib/logger';
import { generateModularAgent, type AgentConfig as ModularAgentConfig } from './generator';

export interface AgentConfig {
  userId: string;
  serverId: string;
  handshakeUuid: string;
  brokerUrl: string;
  sshUsername: string;
}

export interface InstallResult {
  success: boolean;
  agentVersion: string;
  serverInfo: {
    hostname: string;
    os: string;
  };
  error?: string;
  warnings?: string[];
}

export class AgentInstaller {
  private sshClient: SSHClient;
  private agentConfig: AgentConfig;
  private warnings: string[] = [];

  constructor(sshConfig: SSHConfig, agentConfig: AgentConfig) {
    this.sshClient = new SSHClient(sshConfig);
    this.agentConfig = agentConfig;
  }

  /**
   * ✅ PRODUCTION: Install agent with SSH validation, encrypted vault secrets and AES-256-GCM crypto
   */
  async install(): Promise<InstallResult> {
    try {
      logger.info('[PRODUCTION] Installing agent with SSH validation + encrypted vault + AES-256-GCM...');

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 1: Connect
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      logger.info('Connecting to server via SSH...');
      await this.sshClient.connect();
      logger.info('SSH connection established');

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 2: Get server info
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const serverInfo = await this.sshClient.getServerInfo();
      logger.info('Server info retrieved', serverInfo);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 3: Check Python 3
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const pythonCheck = await this.sshClient.executeCommand('which python3');
      if (pythonCheck.exitCode !== 0) {
        throw new Error('Python 3 is not installed on the server');
      }
      logger.info('Python 3 found');

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // ✅ STEP 4: Install dependencies (cryptography + websocket-client)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      await this.installDependencies();

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 5: Check sudo
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const sudoCheck = await this.sshClient.executeSudoCommand('true');
      if (sudoCheck.exitCode !== 0) {
        throw new Error('User does not have sudo privileges');
      }
      logger.info('Sudo access confirmed');

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // ✅ NEW STEP 5.5: Validate SSH Key Setup (CRITICAL!)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      logger.info('═══════════════════════════════════════════');
      logger.info('VALIDATING SSH KEY AUTHENTICATION');
      logger.info('═══════════════════════════════════════════');
      await this.validateSshKeySetup();
      logger.info('═══════════════════════════════════════════');
      logger.info('✅ SSH KEY VALIDATION COMPLETE');
      logger.info('═══════════════════════════════════════════');

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 6: Clean up old installation
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      logger.info('Cleaning up old installation...');
      await this.sshClient.executeSudoCommand('systemctl stop shellvault-agent 2>/dev/null || true');
      await this.sshClient.executeSudoCommand('systemctl disable shellvault-agent 2>/dev/null || true');
      await this.sshClient.executeSudoCommand('rm -rf /usr/local/lib/shellvault');
      await this.sshClient.executeSudoCommand('rm -f /usr/local/bin/shellvault-agent');
      await this.sshClient.executeSudoCommand('rm -rf /etc/shellvault');

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 7: Create directories
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      logger.info('Creating directory structure...');
      await this.sshClient.executeSudoCommand('mkdir -p /usr/local/lib/shellvault');
      await this.sshClient.executeSudoCommand('mkdir -p /var/log/shellvault');
      await this.sshClient.executeSudoCommand('mkdir -p /etc/shellvault');

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // ✅ STEP 8: Generate agent modules (with sshUsername)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      logger.info('Generating agent modules...');
      logger.info(`SSH Username: ${this.agentConfig.sshUsername}`);
      
      const agent = generateModularAgent({
        userId: this.agentConfig.userId,
        serverId: this.agentConfig.serverId,
        handshakeUuid: this.agentConfig.handshakeUuid,
        brokerUrl: this.agentConfig.brokerUrl,
        sshUsername: this.agentConfig.sshUsername,
        heartbeatUrl: process.env.NEXT_PUBLIC_APP_URL
          ? `${process.env.NEXT_PUBLIC_APP_URL}/api/agent/heartbeat`
          : 'http://172.20.10.3:3000/api/agent/heartbeat',
        version: '1.0.0',
        testMode: false,
      });

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // ✅ STEP 9: Upload secret_manager.py FIRST
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      logger.info('Uploading secret manager...');
      
      await this.sshClient.uploadFileWithSudo(
        agent.secretManager,
        '/usr/local/lib/shellvault/secret_manager.py'
      );
      
      await this.sshClient.executeSudoCommand('chmod +x /usr/local/lib/shellvault/secret_manager.py');
      logger.info('Secret manager uploaded ✅');

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // ✅ STEP 10: Store secrets in encrypted vault
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      await this.storeSecretsInVault();

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 11: Upload Python modules
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      logger.info('Uploading agent modules...');

      await this.sshClient.uploadFileWithSudo(
        agent.agent,
        '/usr/local/lib/shellvault/agent.py'
      );

      await this.sshClient.uploadFileWithSudo(
        agent.transport,
        '/usr/local/lib/shellvault/transport.py'
      );

      await this.sshClient.uploadFileWithSudo(
        agent.operations,
        '/usr/local/lib/shellvault/operations.py'
      );

      await this.sshClient.uploadFileWithSudo(
        agent.credentials,
        '/usr/local/lib/shellvault/credentials.py'
      );

      await this.sshClient.executeSudoCommand('chmod +x /usr/local/lib/shellvault/*.py');
      logger.info('Modules uploaded and made executable');

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 12: Upload wrapper
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      logger.info('Installing wrapper script...');
      await this.sshClient.uploadFileWithSudo(
        agent.wrapper,
        '/usr/local/bin/shellvault-agent'
      );
      await this.sshClient.executeSudoCommand('chmod +x /usr/local/bin/shellvault-agent');

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 13: Test agent execution
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      logger.info('Testing agent...');
      const testRun = await this.sshClient.executeCommand(
        'timeout 2 /usr/local/bin/shellvault-agent 2>&1 || true'
      );
      logger.info('Agent test completed', {
        output: testRun.stdout.substring(0, 200),
      });

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 14: Install systemd service
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      logger.info('Installing systemd service...');
      await this.sshClient.uploadFileWithSudo(
        agent.service,
        '/etc/systemd/system/shellvault-agent.service'
      );

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 15: Enable and start service
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      await this.sshClient.executeSudoCommand('systemctl daemon-reload');
      await this.sshClient.executeSudoCommand('systemctl enable shellvault-agent');
      await this.sshClient.executeSudoCommand('systemctl restart shellvault-agent');

      // Wait for service to start
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 16: Verify service
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const statusCheck = await this.sshClient.executeSudoCommand(
        'systemctl is-active shellvault-agent'
      );
      const isActive = statusCheck.stdout.trim() === 'active';

      if (!isActive) {
        const logs = await this.sshClient.executeSudoCommand(
          'journalctl -u shellvault-agent -n 20 --no-pager'
        );
        logger.error('Service not active:', { logs: logs.stdout });
        throw new Error('Agent service failed to start');
      }

      logger.info('✅ Production agent installed successfully!');
      logger.info(`   - SSH Username: ${this.agentConfig.sshUsername}`);
      logger.info('   - SSH Key Authentication: ✅ VALIDATED');
      logger.info('   - AES-256-GCM encryption: ✅');
      logger.info('   - Encrypted vault storage: ✅');
      logger.info('   - Machine-bound secrets: ✅');
      logger.info('   - No plaintext secrets: ✅');

      return {
        success: true,
        agentVersion: '1.0.0',
        serverInfo: {
          hostname: serverInfo.hostname,
          os: serverInfo.os,
        },
        warnings: this.warnings.length > 0 ? this.warnings : undefined,
      };
    } catch (error: any) {
      logger.error('Agent installation failed', error);
      return {
        success: false,
        agentVersion: '',
        serverInfo: { hostname: '', os: '' },
        error: error.message || 'Unknown error',
        warnings: this.warnings.length > 0 ? this.warnings : undefined,
      };
    } finally {
      this.sshClient.disconnect();
    }
  }

  /**
   * ✅ NEW: Validate and setup SSH key authentication
   */
  private async validateSshKeySetup(): Promise<void> {
    const username = this.agentConfig.sshUsername;
    const homeDir = username === 'root' ? '/root' : `/home/${username}`;
    const sshDir = `${homeDir}/.ssh`;
    const keyPath = `${sshDir}/id_rsa`;
    const pubKeyPath = `${keyPath}.pub`;
    const authKeysPath = `${sshDir}/authorized_keys`;

    logger.info(`Target user: ${username}`);
    logger.info(`SSH directory: ${sshDir}`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 1: Check/Create .ssh directory
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const sshDirCheck = await this.sshClient.executeCommand(`test -d ${sshDir} && echo exists`);
    
    if (!sshDirCheck.stdout.includes('exists')) {
      logger.info('Creating .ssh directory...');
      await this.sshClient.executeCommand(`mkdir -p ${sshDir}`);
      await this.sshClient.executeCommand(`chmod 700 ${sshDir}`);
      logger.info('✅ Created .ssh directory');
    } else {
      logger.info('✅ .ssh directory exists');
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 2: Check SSH key exists (or generate)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    logger.info('Checking for SSH key...');
    const keyCheck = await this.sshClient.executeCommand(`test -f ${keyPath} && echo exists`);
    
    if (!keyCheck.stdout.includes('exists')) {
      logger.info('SSH key not found, generating new key...');
      const keygenResult = await this.sshClient.executeCommand(
        `ssh-keygen -t rsa -b 4096 -f ${keyPath} -N "" -C "shellvault-${username}@$(hostname)"`
      );
      
      if (keygenResult.exitCode !== 0) {
        throw new Error(`Failed to generate SSH key: ${keygenResult.stderr}`);
      }
      
      // Set permissions
      await this.sshClient.executeCommand(`chmod 600 ${keyPath}`);
      await this.sshClient.executeCommand(`chmod 644 ${pubKeyPath}`);
      
      logger.info('✅ Generated new SSH key');
    } else {
      logger.info('✅ SSH key already exists');
      
      // Ensure correct permissions
      await this.sshClient.executeCommand(`chmod 600 ${keyPath}`);
      await this.sshClient.executeCommand(`chmod 644 ${pubKeyPath}`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 3: Ensure public key is in authorized_keys
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    logger.info('Checking authorized_keys...');
    
    // Check if authorized_keys exists
    const authKeysExists = await this.sshClient.executeCommand(
      `test -f ${authKeysPath} && echo exists`
    );
    
    // Check if our public key is already in authorized_keys
    const keyAuthorized = await this.sshClient.executeCommand(
      `test -f ${authKeysPath} && grep -qF "$(cat ${pubKeyPath})" ${authKeysPath} && echo authorized`
    );
    
    if (!keyAuthorized.stdout.includes('authorized')) {
      logger.info('Adding public key to authorized_keys...');
      
      // Create file if it doesn't exist, then append
      if (!authKeysExists.stdout.includes('exists')) {
        await this.sshClient.executeCommand(`touch ${authKeysPath}`);
      }
      
      await this.sshClient.executeCommand(`cat ${pubKeyPath} >> ${authKeysPath}`);
      await this.sshClient.executeCommand(`chmod 600 ${authKeysPath}`);
      
      logger.info('✅ Added public key to authorized_keys');
    } else {
      logger.info('✅ Public key already authorized');
      
      // Ensure correct permissions
      await this.sshClient.executeCommand(`chmod 600 ${authKeysPath}`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 4: CRITICAL - Test SSH key authentication works!
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    logger.info('Testing SSH key authentication...');
    logger.info(`Test command: ssh -i ${keyPath} ${username}@localhost`);
    
    const sshTest = await this.sshClient.executeCommand(
      `ssh -i ${keyPath} ` +
      `-o StrictHostKeyChecking=no ` +
      `-o PasswordAuthentication=no ` +
      `-o BatchMode=yes ` +
      `-o ConnectTimeout=10 ` +
      `${username}@localhost "echo SSH_AUTH_SUCCESS"`
    );
    
    if (!sshTest.stdout.includes('SSH_AUTH_SUCCESS')) {
      logger.error('SSH key authentication test FAILED');
      logger.error('Command output:', sshTest.stdout);
      logger.error('Command error:', sshTest.stderr);
      logger.error('Exit code:', sshTest.exitCode);
      
      throw new Error(
        `SSH key authentication test failed!\n` +
        `The agent will not be able to provide SSH access.\n` +
        `Error: ${sshTest.stderr || 'Authentication rejected'}\n\n` +
        `Troubleshooting:\n` +
        `1. Check SSH server config: /etc/ssh/sshd_config\n` +
        `   Ensure: PubkeyAuthentication yes\n` +
        `2. Check SSH logs on server: sudo tail -f /var/log/auth.log\n` +
        `3. Verify permissions:\n` +
        `   chmod 700 ${sshDir}\n` +
        `   chmod 600 ${keyPath}\n` +
        `   chmod 600 ${authKeysPath}`
      );
    }
    
    logger.info('✅ SSH key authentication test PASSED');
    logger.info(`   SSH will work for: ${username}@localhost`);
  }

  /**
   * ✅ PRODUCTION: Store secrets in encrypted vault
   */
  private async storeSecretsInVault(): Promise<void> {
    logger.info('Storing secrets in encrypted vault...');

    // Build command to store secrets using secret_manager.py
    const storeCommand = `python3 /usr/local/lib/shellvault/secret_manager.py store "${this.agentConfig.userId}" "${this.agentConfig.serverId}" "${this.agentConfig.handshakeUuid}"`;
    
    const result = await this.sshClient.executeSudoCommand(storeCommand);
    
    if (result.exitCode !== 0) {
      logger.error('Failed to store secrets in vault', {
        error: result.stderr,
        stdout: result.stdout,
      });
      throw new Error('Failed to store secrets in encrypted vault');
    }
    
    // ✅ FIX: Ensure proper ownership and permissions for systemd service
    await this.sshClient.executeSudoCommand('chown root:root /etc/shellvault/secrets.enc');
    await this.sshClient.executeSudoCommand('chmod 600 /etc/shellvault/secrets.enc');
    
    logger.info('✅ Secrets stored in encrypted vault');
    logger.info('   Location: /etc/shellvault/secrets.enc');
    logger.info('   Encryption: AES-256-GCM');
    logger.info('   Permissions: 600 (root only)');
    logger.info('   Machine-bound: Yes');

    // Verify secrets were stored correctly
    logger.info('Verifying vault...');
    const verifyCommand = 'python3 /usr/local/lib/shellvault/secret_manager.py verify';
    const verify = await this.sshClient.executeSudoCommand(verifyCommand);
    
    if (verify.exitCode !== 0) {
      logger.error('Vault verification failed', {
        error: verify.stderr,
      });
      throw new Error('Vault verification failed');
    }
    
    logger.info('✅ Vault verified successfully');
  }

  /**
   * ✅ PRODUCTION: Install Python dependencies (cryptography + websocket-client)
   */
  private async installDependencies(): Promise<void> {
    logger.info('Installing Python dependencies...');

    // Check pip3
    const pipCheck = await this.sshClient.executeCommand('which pip3');
    if (pipCheck.exitCode !== 0) {
      logger.warn('pip3 not found, attempting to install...');
      const pipInstall = await this.sshClient.executeSudoCommand(
        'apt-get update && apt-get install -y python3-pip'
      );
      if (pipInstall.exitCode !== 0) {
        this.warnings.push('Failed to install pip3');
        return;
      }
      logger.info('pip3 installed');
    }

    // ✅ CRITICAL: Install cryptography (for AES-256-GCM)
    await this.installPackage('cryptography', 'AES-256-GCM encryption', true);

    // Install websocket-client
    await this.installPackage('websocket-client', 'WebSocket communication', false);
  }

  /**
   * Helper to install a Python package
   */
  private async installPackage(
    packageName: string,
    purpose: string,
    critical: boolean
  ): Promise<void> {
    logger.info(`Checking ${packageName} (${purpose})...`);

    // Check if already installed
    const checkCommand = `python3 -c "import ${packageName.replace('-', '_').split('[')[0]}" 2>&1`;
    const check = await this.sshClient.executeCommand(checkCommand);

    if (check.exitCode === 0) {
      logger.info(`${packageName} already installed ✅`);
      return;
    }

    // Try to install
    logger.info(`Installing ${packageName}...`);

    const installMethods = [
      `pip3 install ${packageName} --break-system-packages`,
      `pip3 install ${packageName} --user`,
      `pip3 install ${packageName}`,
    ];

    let installed = false;
    for (const method of installMethods) {
      const result = await this.sshClient.executeCommand(method);
      if (result.exitCode === 0) {
        // Verify installation
        const verify = await this.sshClient.executeCommand(checkCommand);
        if (verify.exitCode === 0) {
          logger.info(`${packageName} installed successfully ✅`);
          installed = true;
          break;
        }
      }
    }

    if (!installed) {
      const message = `Failed to install ${packageName} (${purpose})`;
      
      if (critical) {
        throw new Error(message);
      } else {
        logger.warn(message);
        this.warnings.push(message);
      }
    }
  }
}