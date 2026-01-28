/**
 * HARDENED Logout API Endpoint
 * 
 * POST /api/auth/logout
 * 
 * Logs out user by:
 * - Deleting Redis session
 * - Clearing HTTP-only cookies
 * - Logging audit event
 * 
 * Security features:
 * - Graceful handling of missing/invalid tokens
 * - Comprehensive audit logging
 * - Always clears cookies (even on error)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRefreshToken, clearAuthCookies } from '@/lib/auth/cookies';
import { deleteSession } from '@/lib/redis/session-store';
import { verifyRefreshToken } from '@/lib/auth/jwt';
import { isValidIP } from '@/lib/utils/validation-hardened';
import { apiResponse, apiError, getClientIp, getUserAgent } from '@/lib/utils';
import { auditLog } from '@/lib/logger/audit';
import logger from '@/lib/logger';

/**
 * Safe audit log wrapper
 */
async function safeAuditLog(data: Parameters<typeof auditLog>[0]) {
  try {
    await auditLog(data);
  } catch (error) {
    logger.error('Audit log failed (non-blocking):', error);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const clientIp = getClientIp(request);
  const userAgent = getUserAgent(request);

  // Validate IP format
  if (!isValidIP(clientIp)) {
    logger.warn('Invalid IP address format', { ip: clientIp });
    return apiError('Invalid request', 400);
  }

  let userId: string | undefined;
  let username: string | undefined;

  try {
    // ============================================
    // STEP 1: Get Refresh Token
    // ============================================
    const refreshToken = getRefreshToken(request);

    if (refreshToken) {
      try {
        // ============================================
        // STEP 2: Verify Token (to get user ID)
        // ============================================
        const tokenPayload = verifyRefreshToken(refreshToken);
        userId = tokenPayload.userId;

        // ============================================
        // STEP 3: Delete Redis Session
        // ============================================
        const deleted = await deleteSession(refreshToken);

        if (deleted) {
          logger.info('Session deleted from Redis', { userId });
        } else {
          logger.debug('No session found to delete', { userId });
        }

      } catch (error) {
        // Token might be expired or invalid
        // Still proceed with logout (clear cookies)
        logger.debug('Logout with invalid/expired token', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else {
      logger.debug('Logout without token');
    }

    // ============================================
    // STEP 4: Audit Logging
    // ============================================
    await safeAuditLog({
      userId,
      eventType: 'user_logged_out',
      eventCategory: 'auth',
      severity: 'info',
      message: userId ? `User logged out: ${userId}` : 'Anonymous logout',
      details: {
        processingTime: Date.now() - startTime,
      },
      ipAddress: clientIp,
      userAgent,
    });

    logger.info('User logged out', {
      userId: userId || 'anonymous',
      ip: clientIp,
    });

    // ============================================
    // STEP 5: Clear Cookies & Return
    // ============================================
    const response = NextResponse.json(
      apiResponse({
        success: true,
        message: 'Logged out successfully',
      })
    );

    // Clear auth cookies
    clearAuthCookies(response);

    return response;

  } catch (error) {
    logger.error('Logout error:', error);

    await safeAuditLog({
      userId,
      eventType: 'logout_error',
      eventCategory: 'auth',
      severity: 'error',
      message: 'Logout error',
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
      ipAddress: clientIp,
      userAgent,
    });

    // ============================================
    // STEP 6: Clear Cookies Even on Error
    // ============================================
    const response = NextResponse.json(
      apiError('Logout failed, but cookies cleared', 500)
    );

    // Always clear cookies, even on error
    clearAuthCookies(response);

    return response;
  }
}