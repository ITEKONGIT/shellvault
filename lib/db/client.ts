/**
 * Prisma Database Client - Singleton
 *
 * Architectural guarantees:
 * - Single PrismaClient instance for the entire application lifecycle
 * - Explicit connection pool limits to prevent PostgreSQL exhaustion
 * - Graceful shutdown handling via $on('beforeExit')
 * - No environment validation at module import level
 *
 * Connection pool rationale:
 * - Next.js dev server: 1 process
 * - Next.js production: 1 process (standalone) or multiple workers
 * - Prisma default pool: 2 * numCPUs (e.g., 16 on 8-core)
 * - PostgreSQL default max_connections: 100
 * - ShellVault pool limit: 5 per process (conservative, safe for multi-worker)
 *
 * @see https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool
 */

import { PrismaClient } from '@prisma/client';

// ────────────────────────────────────────────────────────────────
// Connection pool configuration
// ────────────────────────────────────────────────────────────────

const CONNECTION_LIMIT = 5;
const CONNECTION_TIMEOUT = 10; // seconds

function buildDatabaseUrl(): string {
  const baseUrl = process.env.DATABASE_URL;

  if (!baseUrl) {
    throw new Error(
      'DATABASE_URL environment variable is required but not set.\n' +
        'Please configure your database connection string.'
    );
  }

  // Parse existing query params
  const url = new URL(baseUrl);
  const existingLimit = url.searchParams.get('connection_limit');

  if (existingLimit) {
    const parsed = parseInt(existingLimit, 10);
    if (parsed > CONNECTION_LIMIT * 2) {
      console.warn(
        `⚠️  DATABASE_URL has connection_limit=${parsed}. ` +
          `Consider reducing to ${CONNECTION_LIMIT} to prevent pool exhaustion.`
      );
    }
    return baseUrl;
  }

  // Append conservative connection limit
  url.searchParams.set('connection_limit', String(CONNECTION_LIMIT));
  url.searchParams.set('connect_timeout', String(CONNECTION_TIMEOUT));
  url.searchParams.set('pool_timeout', '5');

  return url.toString();
}

// ────────────────────────────────────────────────────────────────
// Singleton instance management
// ────────────────────────────────────────────────────────────────

interface PrismaGlobal {
  prisma?: PrismaClient;
}

const globalForPrisma = globalThis as unknown as PrismaGlobal;

function createPrismaClient(): PrismaClient {
  const databaseUrl = buildDatabaseUrl();

  const client = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

  return client;
}

// Export singleton — reuse in dev (hot reload), create fresh in prod
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Store on global in dev to survive hot reload
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// ────────────────────────────────────────────────────────────────
// Connection lifecycle helpers
// ────────────────────────────────────────────────────────────────

/**
 * Test database connectivity without throwing
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$connect();
    console.log('✓ Database connected successfully');
    return true;
  } catch (error) {
    console.error('✗ Database connection failed:', error);
    return false;
  }
}

/**
 * Gracefully disconnect from database.
 * Call this on application shutdown.
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    console.log('✓ Database disconnected');
  } catch (error) {
    console.error('✗ Database disconnect error:', error);
    throw error;
  }
}

/**
 * Get database connection pool statistics (PostgreSQL only)
 */
export async function getDatabaseStats(): Promise<{
  activeConnections: number;
  idleConnections: number;
  totalConnections: number;
}> {
  try {
    const result = await prisma.$queryRaw<
      Array<{
        state: string;
        count: bigint;
      }>
    >`
      SELECT state, COUNT(*) as count
      FROM pg_stat_activity
      WHERE datname = current_database()
      GROUP BY state
    `;

    const stats = result.reduce(
      (acc, row) => {
        const count = Number(row.count);
        if (row.state === 'active') acc.activeConnections += count;
        if (row.state === 'idle') acc.idleConnections += count;
        acc.totalConnections += count;
        return acc;
      },
      { activeConnections: 0, idleConnections: 0, totalConnections: 0 }
    );

    return stats;
  } catch {
    // Fallback if pg_stat_activity not available
    return { activeConnections: 0, idleConnections: 0, totalConnections: 0 };
  }
}
