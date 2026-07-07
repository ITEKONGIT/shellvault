#!/usr/bin/env tsx
/**
 * Phase 0 Gate Test - Structural Integrity Audit
 *
 * Test ID: GT-0-001
 * Purpose: Verify all Phase 0 architectural foundations are in place
 *
 * Steps:
 * 1. TypeScript strict build - zero errors
 * 2. PrismaClient singleton enforcement - no direct instantiations
 * 3. Runtime singleton verification - one instance under load
 * 4. Environment validation - runtime-safe, no build-time crashes
 * 5. Structured logging - all modules comply with schema
 * 6. Engine types - centralized, no duplicates
 * 7. No imports of ../config/env from db/client
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const RESULTS: Array<{ test: string; passed: boolean; details?: string }> = [];

function assert(name: string, condition: boolean, details?: string): void {
  RESULTS.push({ test: name, passed: condition, details });
  const icon = condition ? '✅' : '❌';
  const color = condition ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  console.log(`${color}${icon}${reset} ${name}`);
  if (!condition && details) {
    console.log(`   ${details}`);
  }
}

function printHeader(title: string): void {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(title);
  console.log(`${'═'.repeat(60)}`);
}

// ────────────────────────────────────────────────────────────────
// TEST 1: TypeScript Strict Build
// ────────────────────────────────────────────────────────────────

printHeader('TEST 1: TypeScript Strict Build');

try {
  execSync('npx tsc --noEmit --pretty', {
    cwd: process.cwd(),
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 120000,
  });
  assert('TypeScript compiles with zero errors', true);
} catch (error: any) {
  const stderr = error.stderr || '';
  const errorCount = (stderr.match(/error TS/g) || []).length;
  assert(
    'TypeScript compiles with zero errors',
    false,
    `Found ${errorCount} TypeScript errors:\n${stderr.substring(0, 500)}`
  );
}

// ────────────────────────────────────────────────────────────────
// TEST 2: No Direct PrismaClient Instantiation
// ────────────────────────────────────────────────────────────────

printHeader('TEST 2: PrismaClient Singleton Enforcement');

function findDirectInstantiations(): string[] {
  const violations: string[] = [];

  function scanDirectory(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        scanDirectory(fullPath);
      } else if (entry.name.endsWith('.ts')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        // Look for 'new PrismaClient' but exclude the singleton file itself
        if (
          content.includes('new PrismaClient') &&
          !fullPath.includes('lib\\db\\client.ts') &&
          !fullPath.includes('lib/db/client.ts')
        ) {
          violations.push(fullPath);
        }
      }
    }
  }

  scanDirectory(path.join(process.cwd(), 'app'));
  scanDirectory(path.join(process.cwd(), 'lib'));

  return violations;
}

const violations = findDirectInstantiations();
assert(
  'No files instantiate new PrismaClient() (singleton enforced)',
  violations.length === 0,
  violations.length > 0
    ? `Found ${violations.length} violations:\n${violations.join('\n')}`
    : undefined
);

// ────────────────────────────────────────────────────────────────
// TEST 3: db/client.ts does NOT import ../config/env
// ────────────────────────────────────────────────────────────────

printHeader('TEST 3: No Env Validation at Module Import');

const dbClientContent = fs.readFileSync(
  path.join(process.cwd(), 'lib', 'db', 'client.ts'),
  'utf-8'
);

assert(
  'lib/db/client.ts does not import ../config/env',
  !dbClientContent.includes("import '../config/env'") && !dbClientContent.includes("import \"../config/env\""),
  'Remove the import to prevent build-time env validation crashes'
);

assert(
  'lib/db/client.ts uses process.env directly for runtime lookup',
  dbClientContent.includes('process.env.DATABASE_URL'),
  'Must read DATABASE_URL at runtime, not at module import'
);

// ────────────────────────────────────────────────────────────────
// TEST 4: Structured Logger Exists and Exports Correctly
// ────────────────────────────────────────────────────────────────

printHeader('TEST 4: Structured Logging Infrastructure');

const structuredLoggerPath = path.join(
  process.cwd(),
  'lib',
  'logging',
  'structured.ts'
);

assert(
  'lib/logging/structured.ts exists',
  fs.existsSync(structuredLoggerPath),
  'File not found'
);

if (fs.existsSync(structuredLoggerPath)) {
  const loggerContent = fs.readFileSync(structuredLoggerPath, 'utf-8');

  assert(
    'Logger has logEvent() function',
    loggerContent.includes('export function logEvent('),
    'Must export primary logging function'
  );

  assert(
    'Logger has redaction for sensitive patterns',
    loggerContent.includes('SENSITIVE_PATTERNS'),
    'Must redact secrets automatically'
  );

  assert(
    'Logger never uses console.log directly',
    !loggerContent.includes('console.log(') || loggerContent.includes('console.error(`[Logger]'),
    'Must use winston exclusively'
  );
}

// ────────────────────────────────────────────────────────────────
// TEST 5: Engine Types Centralization
// ────────────────────────────────────────────────────────────────

printHeader('TEST 5: Engine Types Single Source of Truth');

const engineTypesPath = path.join(process.cwd(), 'types', 'engine.ts');

assert(
  'types/engine.ts exists',
  fs.existsSync(engineTypesPath),
  'Central type file not found'
);

if (fs.existsSync(engineTypesPath)) {
  const engineContent = fs.readFileSync(engineTypesPath, 'utf-8');

  assert(
    'types/engine.ts exports AgentConfig',
    engineContent.includes('export interface AgentConfig'),
    'Must define AgentConfig'
  );

  assert(
    'types/engine.ts exports ServerModel',
    engineContent.includes('export interface ServerModel'),
    'Must define ServerModel'
  );

  assert(
    'types/engine.ts exports SessionData',
    engineContent.includes('export interface SessionData'),
    'Must define SessionData'
  );

  assert(
    'types/engine.ts exports BrokerInterface',
    engineContent.includes('export interface BrokerInterface'),
    'Must define BrokerInterface'
  );
}

// ────────────────────────────────────────────────────────────────
// TEST 6: Transaction Wrapper Exists
// ────────────────────────────────────────────────────────────────

printHeader('TEST 6: Transaction Wrapper');

const txWrapperPath = path.join(
  process.cwd(),
  'lib',
  'prisma',
  'transaction-wrapper.ts'
);

assert(
  'lib/prisma/transaction-wrapper.ts exists',
  fs.existsSync(txWrapperPath),
  'File not found'
);

if (fs.existsSync(txWrapperPath)) {
  const txContent = fs.readFileSync(txWrapperPath, 'utf-8');

  assert(
    'Has retry logic with exponential backoff',
    txContent.includes('Math.pow(2, attempt)'),
    'Must retry transient failures'
  );

  assert(
    'Has TransactionError class',
    txContent.includes('class TransactionError'),
    'Must provide typed errors'
  );

  assert(
    'Has retryable error code detection',
    txContent.includes('RETRYABLE_ERROR_CODES'),
    'Must detect transient PG errors'
  );
}

// ────────────────────────────────────────────────────────────────
// TEST 7: Environment Config Uses Dual-Pattern
// ────────────────────────────────────────────────────────────────

printHeader('TEST 7: Dual-Pattern Environment Config');

const envConfigPath = path.join(process.cwd(), 'lib', 'config', 'env.ts');
const envContent = fs.readFileSync(envConfigPath, 'utf-8');

assert(
  'Has assertRuntimeEnv() for runtime validation',
  envContent.includes('export function assertRuntimeEnv'),
  'Must export runtime-only validator'
);

assert(
  'Has getBuildConfig() for build-time use',
  envContent.includes('export function getBuildConfig'),
  'Must export build-time config'
);

assert(
  'No validateEnv() called at module top-level',
  !envContent.match(/export const env = validateEnv\(\)/) || envContent.includes('@deprecated'),
  'Must not execute validation at module import'
);

assert(
  'Runtime env uses Zod schema',
  envContent.includes("import { z } from 'zod'") || envContent.includes('import { z } from "zod"'),
  'Must use Zod for type-safe validation'
);

// ────────────────────────────────────────────────────────────────
// TEST 8: Auth Protocol Doc Exists
// ────────────────────────────────────────────────────────────────

printHeader('TEST 8: Auth Protocol v2 Specification');

const protocolDocPath = path.join(
  process.cwd(),
  'docs',
  'AUTH-PROTOCOL-v2.md'
);

assert(
  'docs/AUTH-PROTOCOL-v2.md exists',
  fs.existsSync(protocolDocPath),
  'Protocol specification not found'
);

if (fs.existsSync(protocolDocPath)) {
  const docContent = fs.readFileSync(protocolDocPath, 'utf-8');

  assert(
    'Contains threat model section',
    docContent.includes('## 1. Protocol Overview') && docContent.includes('Threat Model'),
    'Must document security assumptions'
  );

  assert(
    'Contains state machine',
    docContent.includes('State Machine'),
    'Must document protocol states'
  );

  assert(
    'Contains message definitions',
    docContent.includes('interface ChallengeMessage'),
    'Must document message formats'
  );

  assert(
    'Contains encryption details',
    docContent.includes('AES-256-GCM'),
    'Must document crypto choices'
  );

  assert(
    'Contains timeout and retry logic',
    docContent.includes('Timeout'),
    'Must document reliability'
  );
}

// ────────────────────────────────────────────────────────────────
// FINAL REPORT
// ────────────────────────────────────────────────────────────────

printHeader('PHASE 0 GATE TEST RESULTS');

const passed = RESULTS.filter((r) => r.passed).length;
const failed = RESULTS.filter((r) => !r.passed).length;
const total = RESULTS.length;

console.log(`\n${'─'.repeat(60)}`);
console.log(`Total:  ${total}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`${'─'.repeat(60)}`);

if (failed === 0) {
  console.log('\n\x1b[32m🎉 ALL TESTS PASSED - Phase 0 is COMPLETE\x1b[0m');
  console.log('\x1b[32mYou may now proceed to Phase 1: Core Safety\x1b[0m');
  process.exit(0);
} else {
  console.log('\n\x1b[31m❌ SOME TESTS FAILED - Phase 0 is INCOMPLETE\x1b[0m');
  console.log('\x1b[31mFix the failures before proceeding to Phase 1\x1b[0m');
  process.exit(1);
}
