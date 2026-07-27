/**
 * Environment Configuration - Dual-Pattern Validation
 *
 * Architectural decision:
 * Build-time config and runtime config are SEPARATE concerns.
 *
 * Build config (Schema A):
 *   - Used by Next.js compilation, static generation
 *   - Should never crash the build
 *   - Provides defaults that are safe for non-sensitive values
 *
 * Runtime config (Schema B):
 *   - Used by API routes, server-side functions
 *   - Validates on first access
 *   - Throws descriptive errors for missing required values
 *   - Never validates at module import time (prevents SSR crashes)
 *
 * Usage:
 *   // In API routes (runtime):
 *   import { assertRuntimeEnv } from '@/lib/config/env';
 *   const env = assertRuntimeEnv();
 *
 *   // In build scripts (build-time):
 *   import { buildConfig } from '@/lib/config/env';
 *   const buildSettings = buildConfig;
 */

import { z } from 'zod';

// ────────────────────────────────────────────────────────────────
// Validation helpers
// ────────────────────────────────────────────────────────────────

function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

// ────────────────────────────────────────────────────────────────
// Build-Time Configuration Schema
// ────────────────────────────────────────────────────────────────

const buildSchema = z.object({
  // These MUST be known at build time but can have defaults
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Optional build configuration
  ANALYZE: z.enum(['true', 'false']).default('false'),
});

export type BuildConfig = z.infer<typeof buildSchema>;

/**
 * Build-time configuration — safe defaults, never throws.
 * Used during compilation and static generation.
 */
function parseBuildConfig(): BuildConfig {
  const result = buildSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    ANALYZE: process.env.ANALYZE,
  });

  if (!result.success) {
    // Should never happen with .default(), but defensive
    console.warn('[ENV] Build config validation warnings:', result.error.issues);
    // Return safe defaults
    return { NODE_ENV: 'development', ANALYZE: 'false' };
  }

  return result.data;
}

// Lazy-evaluated build config (don't parse at module load)
let _buildConfig: BuildConfig | null = null;
export function getBuildConfig(): BuildConfig {
  if (_buildConfig === null) {
    _buildConfig = parseBuildConfig();
  }
  return _buildConfig;
}

// ────────────────────────────────────────────────────────────────
// Runtime Configuration Schema
// ────────────────────────────────────────────────────────────────

const runtimeSchema = z.object({
  // ── Database ──────────────────────────────────────────────────
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required').refine(
    (url) => url.startsWith('postgresql://') || url.startsWith('postgres://'),
    { message: 'DATABASE_URL must be a PostgreSQL connection string' }
  ),

  // ── Authentication ────────────────────────────────────────────
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters')
    .refine(
      (val) => {
        // Entropy check: reject simple repeated patterns
        const uniqueChars = new Set(val).size;
        return uniqueChars >= 8;
      },
      { message: 'JWT_SECRET lacks sufficient entropy (use 8+ unique characters)' }
    ),
  JWT_EXPIRES_IN: z.string().default('7d'),
  TOTP_ENCRYPTION_KEY: z
    .string()
    .min(32, 'TOTP_ENCRYPTION_KEY must be at least 32 characters')
    .optional()
    .describe('Fallback: uses JWT_SECRET if not provided'),

  // ── Redis ─────────────────────────────────────────────────────
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),

  // ── Application ───────────────────────────────────────────────
  APP_URL: z
    .string()
    .url('APP_URL must be a valid URL')
    .default('http://localhost:3000'),
  BROKER_URL: z
    .string()
    .url('BROKER_URL must be a valid URL')
    .default('http://localhost:8080'),
  BROKER_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  BROKER_INTERNAL_TOKEN: z
    .string()
    .min(32, 'BROKER_INTERNAL_TOKEN must be at least 32 characters')
    .optional(),
  TERMINAL_GRANT_SECRET: z
    .string()
    .min(32, 'TERMINAL_GRANT_SECRET must be at least 32 characters')
    .optional(),

  // ── Email ─────────────────────────────────────────────────────
  EMAIL_PROVIDER: z.enum(['sendgrid', 'resend', 'ses', 'smtp', 'console']).default('console'),
  EMAIL_FROM: z.string().email().default('noreply@shellvault.io'),

  // ── Logging ───────────────────────────────────────────────────
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

/**
 * Complete runtime environment type.
 * Infer red from the schema for automatic type safety.
 */
export type RuntimeConfig = z.infer<typeof runtimeSchema>;

// Cached validated config
let _validatedRuntimeConfig: RuntimeConfig | null = null;

/**
 * Validate and return runtime configuration.
 *
 * IMPORTANT: This function throws if validation fails.
 * Only call it inside request handlers or background jobs,
 * not at module import time.
 */
export function assertRuntimeEnv(): RuntimeConfig {
  if (_validatedRuntimeConfig !== null) {
    return _validatedRuntimeConfig;
  }

  const rawEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
    TOTP_ENCRYPTION_KEY: process.env.TOTP_ENCRYPTION_KEY,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    REDIS_DB: process.env.REDIS_DB,
    APP_URL: process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL,
    BROKER_URL: process.env.BROKER_URL,
    BROKER_PORT: process.env.BROKER_PORT,
    BROKER_INTERNAL_TOKEN: process.env.BROKER_INTERNAL_TOKEN,
    TERMINAL_GRANT_SECRET: process.env.TERMINAL_GRANT_SECRET,
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    EMAIL_FROM: process.env.EMAIL_FROM,
    LOG_LEVEL: process.env.LOG_LEVEL,
  };

  const result = runtimeSchema.safeParse(rawEnv);

  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`
    );

    const errorMessage = [
      '❌ Runtime environment validation failed',
      '',
      'The following configuration errors were found:',
      ...issues,
      '',
      'Please check your .env file or environment variables.',
      'Refer to .env.example for required variables.',
    ].join('\n');

    throw new Error(errorMessage);
  }

  if (getBuildConfig().NODE_ENV === 'production') {
    const missingProductionSecrets = [
      !result.data.BROKER_INTERNAL_TOKEN ? 'BROKER_INTERNAL_TOKEN' : null,
      !result.data.TERMINAL_GRANT_SECRET ? 'TERMINAL_GRANT_SECRET' : null,
    ].filter(Boolean);

    if (missingProductionSecrets.length > 0) {
      throw new Error(
        `Production runtime environment is missing required broker secret(s): ${missingProductionSecrets.join(', ')}`
      );
    }
  }

  // Coerce TOTP_ENCRYPTION_KEY to use JWT_SECRET if not set
  if (!result.data.TOTP_ENCRYPTION_KEY) {
    result.data.TOTP_ENCRYPTION_KEY = result.data.JWT_SECRET;
  }

  _validatedRuntimeConfig = result.data;

  return _validatedRuntimeConfig;
}

/**
 * Check if runtime environment is valid without throwing.
 * Useful for health checks and graceful degradation.
 */
export function isRuntimeEnvValid(): boolean {
  try {
    assertRuntimeEnv();
    return true;
  } catch {
    return false;
  }
}

/**
 * Flush the cached runtime config.
 * Call after environment variable changes in tests.
 */
export function flushRuntimeEnv(): void {
  _validatedRuntimeConfig = null;
}

/**
 * Safely get a subset of config with no secrets.
 * Useful for health checks and diagnostics.
 */
export function getPublicConfig(): Record<string, string | number> {
  const env = assertRuntimeEnv();

  return {
    nodeEnv: getBuildConfig().NODE_ENV,
    appUrl: env.APP_URL,
    brokerPort: env.BROKER_PORT,
    brokerUrl: env.BROKER_URL,
    logLevel: env.LOG_LEVEL,
    emailProvider: env.EMAIL_PROVIDER,
    redisHost: env.REDIS_HOST,
    redisPort: env.REDIS_PORT,
  };
}

// ────────────────────────────────────────────────────────────────
// Backward compatibility (deprecated — migrate callers)
// ────────────────────────────────────────────────────────────────

/**
 * @deprecated Use assertRuntimeEnv() in API routes instead.
 * This old interface validated at module import, causing build failures.
 */
export const env = (() => {
  try {
    return assertRuntimeEnv();
  } catch {
    // Return partial object for build-time compatibility
    // Temporary: will be removed in Phase 1 migration
    const partial = {
      DATABASE_URL: process.env.DATABASE_URL || '',
      JWT_SECRET: process.env.JWT_SECRET || '',
      JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
      NODE_ENV: getBuildConfig().NODE_ENV,
      LOG_LEVEL: process.env.LOG_LEVEL || 'info',
      REDIS_URL: process.env.REDIS_URL,
    };
    return partial as unknown as RuntimeConfig;
  }
})();
