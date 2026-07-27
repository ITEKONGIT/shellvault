/**
 * Cookie Utilities
 * 
 * Manages HTTP-only cookies for secure token storage.
 * Tokens are stored in separate cookies for access and refresh.
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';

// Cookie names
export const COOKIE_NAMES = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
} as const;

function isLocalHttpAppUrl(): boolean {
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;

  if (!appUrl) {
    return false;
  }

  try {
    const url = new URL(appUrl);
    return (
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function shouldUseSecureCookies(): boolean {
  const explicitSetting = process.env.AUTH_COOKIE_SECURE?.toLowerCase();

  if (explicitSetting === 'true') {
    return true;
  }

  if (explicitSetting === 'false') {
    return false;
  }

  if (isLocalHttpAppUrl()) {
    return false;
  }

  return process.env.NODE_ENV === 'production';
}

// Cookie configuration
const COOKIE_CONFIG = {
  httpOnly: true,
  secure: shouldUseSecureCookies(),
  sameSite: 'strict' as const,
  path: '/',
};

/**
 * Set authentication cookies
 * 
 * @param response - Next.js response object
 * @param accessToken - JWT access token
 * @param refreshToken - JWT refresh token
 */
export function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string
): void {
  // Access token cookie (15 minutes)
  response.cookies.set(COOKIE_NAMES.ACCESS_TOKEN, accessToken, {
    ...COOKIE_CONFIG,
    maxAge: 15 * 60, // 15 minutes in seconds
  });
  
  // Refresh token cookie (7 days)
  response.cookies.set(COOKIE_NAMES.REFRESH_TOKEN, refreshToken, {
    ...COOKIE_CONFIG,
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  });
  
  logger.debug('Auth cookies set');
}

/**
 * Clear authentication cookies
 * 
 * @param response - Next.js response object
 */
export function clearAuthCookies(response: NextResponse): void {
  response.cookies.delete(COOKIE_NAMES.ACCESS_TOKEN);
  response.cookies.delete(COOKIE_NAMES.REFRESH_TOKEN);
  
  logger.debug('Auth cookies cleared');
}

/**
 * Get access token from cookies
 * 
 * @param request - Next.js request object
 * @returns Access token or null
 */
export function getAccessToken(request: NextRequest): string | null {
  const token = request.cookies.get(COOKIE_NAMES.ACCESS_TOKEN)?.value || null;
  return token;
}

/**
 * Get refresh token from cookies
 * 
 * @param request - Next.js request object
 * @returns Refresh token or null
 */
export function getRefreshToken(request: NextRequest): string | null {
  const token = request.cookies.get(COOKIE_NAMES.REFRESH_TOKEN)?.value || null;
  return token;
}

/**
 * Get both tokens from cookies
 * 
 * @param request - Next.js request object
 * @returns Object with both tokens (may be null)
 */
export function getTokensFromCookies(request: NextRequest): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  return {
    accessToken: getAccessToken(request),
    refreshToken: getRefreshToken(request),
  };
}

/**
 * Check if user has authentication cookies
 * 
 * @param request - Next.js request object
 * @returns True if both cookies present
 */
export function hasAuthCookies(request: NextRequest): boolean {
  return !!(getAccessToken(request) && getRefreshToken(request));
}
