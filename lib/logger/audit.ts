// lib/logger/audit.ts

import { prisma } from '@/lib/db/client';
import logger from './index';

/**
 * Audit log input type
 */
export interface AuditLogInput {
  userId?: string;
  eventType: string;
  eventCategory: 'auth' | 'server' | 'session' | 'admin' | 'system' | 'server_management';
  severity?: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  message: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Simplified audit log data type (for backward compatibility)
 */
export interface AuditLogData {
  userId?: string;
  eventType: string;
  eventCategory: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Write an audit log entry
 * 
 * Logs to both Winston (console/file) and database (Prisma).
 * If database write fails, still logs to Winston.
 * 
 * @param input - Audit log data
 */
export async function auditLog({
  userId,
  eventType,
  eventCategory,
  severity = 'info',
  message,
  details,
  ipAddress,
  userAgent,
}: AuditLogInput): Promise<void> {
  try {
    // Log to Winston (console/file)
    logger.log(severity, message, {
      userId,
      eventType,
      eventCategory,
      ...details,
    });

    // Save to database
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        eventType,
        eventCategory,
        severity,
        message,
        details: details || {},
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });
  } catch (error) {
    // If database write fails, log to console but don't throw
    // Audit logging should never break the application
    logger.error('Failed to write audit log:', error);
  }
}

/**
 * Create audit log (alias for backward compatibility)
 * 
 * @param data - Audit log data
 */
export async function createAuditLog(data: AuditLogData): Promise<void> {
  return auditLog({
    userId: data.userId,
    eventType: data.eventType,
    eventCategory: data.eventCategory as AuditLogInput['eventCategory'],
    severity: data.severity,
    message: data.message,
    details: data.details,
    ipAddress: data.ipAddress,
    userAgent: data.userAgent,
  });
}

/**
 * Get audit logs for a user
 * 
 * @param userId - User ID to get logs for
 * @param options - Query options
 */
export async function getUserAuditLogs(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    eventType?: string;
    eventCategory?: string;
    severity?: string;
  }
) {
  return await prisma.auditLog.findMany({
    where: {
      userId,
      ...(options?.eventType && { eventType: options.eventType }),
      ...(options?.eventCategory && { eventCategory: options.eventCategory }),
      ...(options?.severity && { severity: options.severity }),
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: options?.limit || 50,
    skip: options?.offset || 0,
  });
}

/**
 * Get all audit logs (admin only)
 * 
 * @param options - Query options
 */
export async function getAllAuditLogs(options?: {
  limit?: number;
  offset?: number;
  userId?: string;
  eventType?: string;
  eventCategory?: string;
  severity?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  return await prisma.auditLog.findMany({
    where: {
      ...(options?.userId && { userId: options.userId }),
      ...(options?.eventType && { eventType: options.eventType }),
      ...(options?.eventCategory && { eventCategory: options.eventCategory }),
      ...(options?.severity && { severity: options.severity }),
      ...(options?.startDate &&
        options?.endDate && {
          createdAt: {
            gte: options.startDate,
            lte: options.endDate,
          },
        }),
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: options?.limit || 100,
    skip: options?.offset || 0,
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
        },
      },
    },
  });
}

/**
 * Get audit log statistics
 * 
 * @param userId - Optional user ID to filter by
 */
export async function getAuditLogStats(userId?: string) {
  const where = userId ? { userId } : {};

  const [total, byCategory, bySeverity] = await Promise.all([
    // Total count
    prisma.auditLog.count({ where }),

    // Count by category
    prisma.auditLog.groupBy({
      by: ['eventCategory'],
      where,
      _count: true,
    }),

    // Count by severity
    prisma.auditLog.groupBy({
      by: ['severity'],
      where,
      _count: true,
    }),
  ]);

  return {
    total,
    byCategory: Object.fromEntries(
      byCategory.map((item) => [item.eventCategory, item._count])
    ),
    bySeverity: Object.fromEntries(
      bySeverity.map((item) => [item.severity, item._count])
    ),
  };
}

/**
 * Delete old audit logs (cleanup job)
 * 
 * @param olderThanDays - Delete logs older than this many days
 * @returns Number of logs deleted
 */
export async function cleanupOldAuditLogs(olderThanDays: number = 90): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  try {
    const result = await prisma.auditLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    logger.info(`Cleaned up ${result.count} audit logs older than ${olderThanDays} days`);
    return result.count;
  } catch (error) {
    logger.error('Failed to cleanup old audit logs:', error);
    return 0;
  }
}