// lib/broker/queue.ts (COMPLETE PROPER FIX)

import { v4 as uuid } from 'uuid';
import { QueuedCommand } from '@/types/broker';
import RedisClient from '@/lib/redis/client'; // ✅ Import the class
import logger from '@/lib/logger';

/**
 * Command Queue
 * Queues commands for offline agents and delivers when they connect
 */
export class CommandQueue {
  private queue: Map<string, QueuedCommand[]> = new Map();

  /**
   * Add command to queue
   */
  async enqueue(
    userId: string,
    serverId: string,
    command: string,
    priority: 'low' | 'normal' | 'high' = 'normal',
    ttlMs: number = 3600000 // 1 hour default
  ): Promise<QueuedCommand> {
    const commandId = uuid();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const queuedCommand: QueuedCommand = {
      id: commandId,
      serverId,
      userId,
      command,
      priority,
      createdAt: now,
      expiresAt,
      status: 'pending',
    };

    // Add to memory queue
    const serverQueue = this.queue.get(serverId) || [];
    serverQueue.push(queuedCommand);
    
    // Sort by priority (high > normal > low)
    serverQueue.sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
    
    this.queue.set(serverId, serverQueue);

    // Persist to Redis
    const redis = await RedisClient.getInstance(); // ✅ Get instance
    await redis.lpush(
      `broker:queue:${serverId}`,
      JSON.stringify(queuedCommand)
    );
    await redis.expire(`broker:queue:${serverId}`, Math.floor(ttlMs / 1000));

    logger.info('Command queued', {
      commandId,
      serverId,
      userId,
      priority,
      queueSize: serverQueue.length,
    });

    return queuedCommand;
  }

  /**
   * Get all pending commands for a server
   */
  async getPendingCommands(serverId: string): Promise<QueuedCommand[]> {
    // Check memory first
    let commands = this.queue.get(serverId) || [];

    // If not in memory, check Redis
    if (commands.length === 0) {
      const redis = await RedisClient.getInstance(); // ✅ Get instance
      const redisCommands = await redis.lrange(`broker:queue:${serverId}`, 0, -1);
      commands = redisCommands
        .map((cmd: string) => {
          try {
            return JSON.parse(cmd);
          } catch {
            return null;
          }
        })
        .filter((cmd: QueuedCommand | null): cmd is QueuedCommand => cmd !== null);

      if (commands.length > 0) {
        this.queue.set(serverId, commands);
      }
    }

    // Filter expired commands
    const now = new Date();
    const validCommands = commands.filter((cmd: QueuedCommand) => {
      if (new Date(cmd.expiresAt) <= now) {
        cmd.status = 'expired';
        return false;
      }
      return cmd.status === 'pending';
    });

    return validCommands;
  }

  /**
   * Dequeue and get next command for server
   */
  async dequeue(serverId: string): Promise<QueuedCommand | null> {
    const commands = await this.getPendingCommands(serverId);

    if (commands.length === 0) {
      return null;
    }

    // Get highest priority command
    const command = commands[0];
    command.status = 'delivered';

    // Remove from queue
    const serverQueue = this.queue.get(serverId) || [];
    const index = serverQueue.findIndex((cmd) => cmd.id === command.id);
    if (index !== -1) {
      serverQueue.splice(index, 1);
      this.queue.set(serverId, serverQueue);
    }

    // Remove from Redis
    const redis = await RedisClient.getInstance(); // ✅ Get instance
    await redis.lrem(`broker:queue:${serverId}`, 1, JSON.stringify(command));

    logger.info('Command dequeued', {
      commandId: command.id,
      serverId,
      remainingInQueue: serverQueue.length,
    });

    return command;
  }

  /**
   * Get queue size for server
   */
  async getQueueSize(serverId: string): Promise<number> {
    const commands = await this.getPendingCommands(serverId);
    return commands.length;
  }

  /**
   * Clear queue for server
   */
  async clearQueue(serverId: string): Promise<void> {
    this.queue.delete(serverId);
    const redis = await RedisClient.getInstance(); // ✅ Get instance
    await redis.del(`broker:queue:${serverId}`);

    logger.info('Queue cleared', { serverId });
  }

  /**
   * Cleanup expired commands
   */
  async cleanupExpiredCommands(): Promise<number> {
    let count = 0;
    const now = new Date();

    for (const [serverId, commands] of this.queue.entries()) {
      const validCommands = commands.filter((cmd) => {
        if (new Date(cmd.expiresAt) <= now) {
          count++;
          return false;
        }
        return true;
      });

      if (validCommands.length !== commands.length) {
        this.queue.set(serverId, validCommands);

        // Update Redis
        const redis = await RedisClient.getInstance(); // ✅ Get instance
        await redis.del(`broker:queue:${serverId}`);
        for (const cmd of validCommands) {
          await redis.rpush(`broker:queue:${serverId}`, JSON.stringify(cmd));
        }
      }
    }

    if (count > 0) {
      logger.info('Expired commands cleaned up', { count });
    }

    return count;
  }

  /**
   * Get total queue size across all servers
   */
  getTotalQueueSize(): number {
    let total = 0;
    for (const commands of this.queue.values()) {
      total += commands.length;
    }
    return total;
  }
}

// Export singleton instance
export const commandQueue = new CommandQueue();

// Auto-cleanup expired commands every 5 minutes
setInterval(() => {
  commandQueue.cleanupExpiredCommands().catch((error) => {
    logger.error('Command cleanup error', error);
  });
}, 5 * 60 * 1000);