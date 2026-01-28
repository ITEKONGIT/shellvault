// lib/auth/session.ts
/**
 * Session management utilities
 * Extracts user from JWT token in cookies
 */

import { cookies } from 'next/headers';
import { verifyAccessToken } from './jwt';
import { prisma } from '@/lib/db/client'; // ✅ CORRECT IMPORT

export interface CurrentUser {
  id: string;
  email: string;
  username: string;
}

/**
 * Get current authenticated user from JWT token
 * 
 * Note: JWT tokens contain ONLY userId for security
 * We fetch full user details from database
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) {
      return null;
    }

    // ✅ FIX 1: No await - verifyAccessToken is synchronous
    const decoded = verifyAccessToken(token);

    if (!decoded) {
      return null;
    }

    // ✅ FIX 2: Fetch user details from database
    // JWT only contains userId, not email/username
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        username: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
    };
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * Require authenticated user or throw error
 */
export async function requireAuth(): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  return user;
}

/**
 * Get user ID from token without database lookup (faster)
 * Use this when you only need the user ID
 */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) {
      return null;
    }

    const decoded = verifyAccessToken(token);
    return decoded?.userId || null;
  } catch (error) {
    console.error('Error getting current user ID:', error);
    return null;
  }
}