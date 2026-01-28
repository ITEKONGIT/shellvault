/**
 * Protected Route Example
 * 
 * Demonstrates how to use authentication middleware.
 * This route requires valid authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthenticationError } from '@/lib/auth/middleware';

/**
 * GET /api/auth/me
 * 
 * Returns current authenticated user information.
 * Protected route - requires authentication.
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const user = await requireAuth(request);

    // User is authenticated - return user info
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
      },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}