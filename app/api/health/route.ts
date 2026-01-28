import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/client';
import { apiResponse, apiError } from '@/lib/utils';
import logger from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // Test database connection
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - startTime;

    logger.info('Health check passed', { dbLatency });

    return apiResponse({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        status: 'connected',
        latency_ms: dbLatency,
      },
      version: '1.0.0',
      environment: process.env.NODE_ENV,
    });
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