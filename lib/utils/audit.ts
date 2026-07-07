/**
 * Audit Logging Utility
 * 
 * Provides helper function for logging audit events to the database.
 */

import logger from '@/lib/logger';
import { prisma } from '@/lib/db/client';

export interface AuditEventData {
  userId?: string;
  eventType: string;
  eventCategory: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log an audit event to the database
 * 
 * @param data - Audit event data
 */
export async function logAuditEvent(data: AuditEventData): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: data.userId || null,
        eventType: data.eventType,
        eventCategory: data.eventCategory,
        severity: data.severity,
        message: data.message,
        details: data.details || undefined,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
      },
    });
  } catch (error) {
    // Don't throw - audit logging should never break the main flow
    logger.error('Failed to log audit event:', error);
  }
}