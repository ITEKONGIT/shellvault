// app/api/servers/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { updateServerSchema } from '@/lib/validation/server';
import { verifyAuth } from '@/lib/auth/middleware';
import { createAuditLog } from '@/lib/logger/audit';
import { z } from 'zod';

/**
 * GET /api/servers/:id
 * Get single server details
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> } // ✅ CHANGED: params is now Promise
) {
  // ✅ AWAIT params first
  const params = await context.params;

  try {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Authentication
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const authResult = await verifyAuth(request);
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = authResult.user.id;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Find server
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const server = await prisma.server.findFirst({
      where: {
        id: params.id,
        userId,
        isActive: true, // Only show active servers
      },
      select: {
        id: true,
        name: true,
        ipAddress: true,
        port: true,
        sshUsername: true,
        hostname: true,
        tags: true,
        notes: true,
        agentHealthStatus: true,
        agentInstalled: true,
        agentVersion: true,
        agentLastSeen: true,
        rotationEnabled: true,
        rotationInterval: true,
        lastRotated: true,
        lastConnected: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!server) {
      return NextResponse.json(
        { success: false, error: 'Server not found' },
        { status: 404 }
      );
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Return server
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    return NextResponse.json({
      success: true,
      server,
    });
  } catch (error) {
    console.error('Error fetching server:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/servers/:id
 * Update server details
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> } // ✅ CHANGED: params is now Promise
) {
  // ✅ AWAIT params first
  const params = await context.params;

  try {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Authentication
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const authResult = await verifyAuth(request);
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = authResult.user.id;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Verify server exists and belongs to user
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const existingServer = await prisma.server.findFirst({
      where: {
        id: params.id,
        userId,
        isActive: true,
      },
    });

    if (!existingServer) {
      return NextResponse.json(
        { success: false, error: 'Server not found' },
        { status: 404 }
      );
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Parse and validate request body
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const body = await request.json();
    const validatedData = updateServerSchema.parse(body);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Build update data (only include provided fields)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const updateData: any = {};

    if (validatedData.name !== undefined) {
      updateData.name = validatedData.name;
    }
    if (validatedData.port !== undefined) {
      updateData.port = validatedData.port;
    }
    if (validatedData.sshUsername !== undefined) {
      updateData.sshUsername = validatedData.sshUsername;
    }
    if (validatedData.hostname !== undefined) {
      updateData.hostname = validatedData.hostname;
    }
    if (validatedData.tags !== undefined) {
      updateData.tags = validatedData.tags;
    }
    if (validatedData.notes !== undefined) {
      updateData.notes = validatedData.notes;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Update server
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const updatedServer = await prisma.server.update({
      where: { id: params.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        ipAddress: true,
        port: true,
        sshUsername: true,
        hostname: true,
        tags: true,
        notes: true,
        agentHealthStatus: true,
        agentInstalled: true,
        agentLastSeen: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Audit log
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await createAuditLog({
      userId,
      eventType: 'server_updated',
      eventCategory: 'server_management',
      severity: 'info',
      message: `Server updated: ${updatedServer.name}`,
      details: {
        serverId: updatedServer.id,
        changes: Object.keys(updateData),
      },
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Return updated server
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    return NextResponse.json({
      success: true,
      server: updatedServer,
    });
  } catch (error) {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Handle validation errors
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation error',
          details: error.issues,
        },
        { status: 400 }
      );
    }

    console.error('Error updating server:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/servers/:id
 * Soft delete server (set isActive = false)
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> } // ✅ CHANGED: params is now Promise
) {
  // ✅ AWAIT params first
  const params = await context.params;

  try {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Authentication
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const authResult = await verifyAuth(request);
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = authResult.user.id;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Find server with active sessions
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const server = await prisma.server.findFirst({
      where: {
        id: params.id,
        userId,
        isActive: true,
      },
      include: {
        sessions: {
          where: {
            status: 'active',
          },
        },
      },
    });

    if (!server) {
      return NextResponse.json(
        { success: false, error: 'Server not found' },
        { status: 404 }
      );
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Close any active SSH sessions
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (server.sessions.length > 0) {
      await prisma.sshSession.updateMany({
        where: {
          serverId: server.id,
          status: 'active',
        },
        data: {
          status: 'closed',
          endedAt: new Date(),
          errorMessage: 'Server deleted by user',
        },
      });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Soft delete server (set isActive = false)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await prisma.server.update({
      where: { id: server.id },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Audit log
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await createAuditLog({
      userId,
      eventType: 'server_deleted',
      eventCategory: 'server_management',
      severity: 'warning',
      message: `Server deleted: ${server.name}`,
      details: {
        serverId: server.id,
        ipAddress: server.ipAddress,
        hostname: server.hostname,
        hadActiveSessions: server.sessions.length > 0,
        sessionsClosed: server.sessions.length,
      },
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Return success
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    return NextResponse.json({
      success: true,
      message: 'Server deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting server:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}