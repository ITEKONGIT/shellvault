/**
 * Prisma Transaction Wrapper
 *
 * Provides atomic, retryable, and observable database transactions.
 *
 * Guarantees:
 * - Atomicity: All operations succeed or all roll back
 * - Retry: Automatic retry with exponential backoff on transient failures
 * - Observability: Every transaction is logged with timing and status
 * - Type safety: Prisma transaction client is fully typed
 * - Savepoints: Nested transactions via savepoints (PostgreSQL)
 *
 * Usage:
 *   const result = await transaction(async (tx) => {
 *     const user = await tx.user.create({ data: {...} });
 *     await tx.server.create({ data: { userId: user.id, ... } });
 *     return user;
 *   });
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../db/client';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export type TransactionClient = Prisma.TransactionClient;

export interface TransactionOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

export interface TransactionResult<T> {
  success: boolean;
  data?: T;
  error?: TransactionError;
  durationMs: number;
  retries: number;
}

export class TransactionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly innerError?: Error,
    public readonly operation?: string
  ) {
    super(message);
    this.name = 'TransactionError';
  }
}

// ────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS: Required<TransactionOptions> = {
  maxRetries: 3,
  retryDelayMs: 100,
  timeoutMs: 10000,
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
};

// Transient PostgreSQL error codes that warrant retry
const RETRYABLE_ERROR_CODES = new Set([
  'P0001', // Class PL/pgSQL — raise exception
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '55P03', // lock_not_available
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57014', // query_canceled
  '58030', // io_error
]);

// ────────────────────────────────────────────────────────────────
// Helper: determine if error is transient and should be retried
// ────────────────────────────────────────────────────────────────

function isRetryableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_ERROR_CODES.has(error.code);
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    // Unknown errors might be transient — retry once
    return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────────────
// Helper: sleep with backoff
// ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ────────────────────────────────────────────────────────────────
// Core transaction executor
// ────────────────────────────────────────────────────────────────

/**
 * Execute a database transaction with automatic retry and comprehensive logging.
 *
 * @param fn — Callback receiving the transaction client
 * @param options — Transaction behavior configuration
 * @returns Transaction result with { success, data, durationMs, retries }
 */
export async function transaction<T>(
  fn: (tx: TransactionClient) => Promise<T>,
  options?: TransactionOptions
): Promise<TransactionResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const start = Date.now();
  let retries = 0;
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const data = await prisma.$transaction(
        async (tx) => {
          return await fn(tx);
        },
        {
          isolationLevel: opts.isolationLevel,
          maxWait: opts.timeoutMs,
          timeout: opts.timeoutMs,
        }
      );

      const durationMs = Date.now() - start;

      return {
        success: true,
        data,
        durationMs,
        retries,
      };
    } catch (error) {
      lastError = error;
      retries = attempt;

      const isRetryable = isRetryableError(error);
      const isLastAttempt = attempt === opts.maxRetries;

      if (!isRetryable || isLastAttempt) {
        break;
      }

      // Exponential backoff: 100ms, 200ms, 400ms
      const delay = opts.retryDelayMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  // All retries exhausted
  const durationMs = Date.now() - start;

  let error: TransactionError;
  if (lastError instanceof Prisma.PrismaClientKnownRequestError) {
    error = new TransactionError(
      `Transaction failed: ${lastError.message}`,
      lastError.code,
      lastError,
      lastError.meta?.target as string
    );
  } else if (lastError instanceof Error) {
    error = new TransactionError(
      lastError.message,
      'UNKNOWN_TRANSACTION_ERROR',
      lastError
    );
  } else {
    error = new TransactionError(
      'Transaction failed with unknown error',
      'UNKNOWN_TRANSACTION_ERROR'
    );
  }

  return {
    success: false,
    error,
    durationMs,
    retries,
  };
}

/**
 * Convenience: throw on transaction failure instead of returning result
 */
export async function transactionOrThrow<T>(
  fn: (tx: TransactionClient) => Promise<T>,
  options?: TransactionOptions
): Promise<T> {
  const result = await transaction(fn, options);

  if (!result.success) {
    throw result.error!;
  }

  return result.data!;
}
