// types/global.d.ts
/**
 * Global type declarations for ShellVault
 */

declare global {
  // ✅ Broker API types
  var shellVaultBroker:
    | {
        requestCredentials: (
          serverId: string,
          sessionId: string
        ) => Promise<{
          username: string;
          auth_method: 'key' | 'password';
          credential: string;
          ip_address: string;
          port: number;
          hostname: string;
          method_used?: string;
        }>;
        getAgent: (serverId: string) => {
          ws: any;
          userId: string;
          serverId: string;
          handshakeTier: number;
          authenticated: boolean;
          connectedAt: Date;
        } | undefined;
        agents: Map<string, any>;
      }
    | undefined;
}

export {};