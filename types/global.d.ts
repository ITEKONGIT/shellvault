// types/global.d.ts
/**
 * Global type declarations for ShellVault
 *
 * ⚠️ All new types should be added to types/engine.ts.
 * This file maintains backward compatibility for global declarations.
 */

import type { BrokerInterface, RetrievedCredentials } from './engine';

declare global {
  /**
   * Broker API interface (legacy — prefer dependency injection)
   * @deprecated Use service registry instead of globals
   */
  var shellVaultBroker: BrokerInterface | undefined;
}

export {};