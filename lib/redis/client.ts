/**
 * Redis Client Configuration
 * 
 * Singleton Redis client for session management.
 * Handles connection, reconnection, and error handling.
 */

import Redis from 'ioredis';
import logger from '@/lib/logger';

// Redis configuration
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  
  // Connection settings
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: false,
  
  // Reconnection strategy
  retryStrategy: (times: number) => {
    if (times > 20) {
      logger.error('Redis reconnection limit reached; stopping retries');
      return null;
    }

    const delay = Math.min(250 * Math.pow(2, times - 1), 5000);
    if (times <= 3 || times % 5 === 0) {
      logger.warn(`Redis reconnection attempt ${times}, delay: ${delay}ms`);
    }
    return delay;
  },
  
  // Timeouts
  connectTimeout: 10000,
  lazyConnect: true,
};

/**
 * Redis client singleton
 */
class RedisClient {
  private static instance: Redis | null = null;
  private static isConnecting: boolean = false;

  /**
   * Get Redis client instance
   */
  static async getInstance(): Promise<Redis> {
    if (this.instance) {
      return this.instance;
    }

    if (this.isConnecting) {
      // Wait for connection to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this.getInstance();
    }

    this.isConnecting = true;

    try {
      logger.info('Initializing Redis connection...', {
        host: REDIS_CONFIG.host,
        port: REDIS_CONFIG.port,
        db: REDIS_CONFIG.db,
      });

      this.instance = new Redis(REDIS_CONFIG);

      // Event handlers
      this.instance.on('connect', () => {
        logger.info('Redis connected successfully');
      });

      this.instance.on('ready', () => {
        logger.info('Redis ready to accept commands');
      });

      this.instance.on('error', (error) => {
        logger.error('Redis error:', error);
      });

      this.instance.on('close', () => {
        logger.warn('Redis connection closed');
      });

      this.instance.on('reconnecting', () => {
        logger.info('Redis reconnecting...');
      });

      // Wait for connection before issuing commands. With offline queue disabled,
      // commands sent before the socket is writable fail immediately.
      await this.instance.connect();
      await this.instance.ping();
      logger.info('Redis ping successful');

      this.isConnecting = false;
      return this.instance;
      
    } catch (error) {
      this.isConnecting = false;
      this.instance = null;
      logger.error('Failed to connect to Redis:', error);
      throw new Error('Redis connection failed');
    }
  }

  /**
   * Close Redis connection
   */
  static async close(): Promise<void> {
    if (this.instance) {
      await this.instance.quit();
      this.instance = null;
      logger.info('Redis connection closed');
    }
  }

  /**
   * Check if Redis is connected
   */
  static isConnected(): boolean {
    return this.instance !== null && this.instance.status === 'ready';
  }

  /**
   * Health check
   */
  static async healthCheck(): Promise<boolean> {
    try {
      const client = await this.getInstance();
      const result = await client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return false;
    }
  }
}

/**
 * Get Redis client (convenience function)
 */
export async function getRedisClient(): Promise<Redis> {
  return RedisClient.getInstance();
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  return RedisClient.close();
}

/**
 * Health check
 */
export async function redisHealthCheck(): Promise<boolean> {
  return RedisClient.healthCheck();
}

export default RedisClient;
