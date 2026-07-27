import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/client';
import { apiResponse, apiError } from '@/lib/utils';
import logger from '@/lib/logger';
import { redisHealthCheck } from '@/lib/redis/client';

export async function GET(request: NextRequest) {
  try {
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - startTime;

    const redisStartTime = Date.now();
    const redisHealthy = await redisHealthCheck();
    const redisLatency = Date.now() - redisStartTime;

    const status = redisHealthy ? 'healthy' : 'degraded';

    logger.info('Health check completed', { dbLatency, redisLatency, redisHealthy });

    return apiResponse({
      status,
      timestamp: new Date().toISOString(),
      database: {
        status: 'connected',
        latency_ms: dbLatency,
      },
      redis: {
        status: redisHealthy ? 'connected' : 'disconnected',
        latency_ms: redisLatency,
      },
      version: '1.0.0',
      environment: process.env.NODE_ENV,
    }, redisHealthy ? 200 : 503);
  } catch (error: any) {
    logger.error('Health check failed', { error: error.message });

    return apiError(
      'Service unhealthy',
      503,
      {
        database: 'disconnected',
        error: error.message,
      }
    );
  }
}
