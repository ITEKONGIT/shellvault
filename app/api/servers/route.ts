// app/api/servers/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { createServerSchema, listServersSchema } from '@/lib/validation/server';
import { verifyAuth } from '@/lib/auth/middleware';
import { createAuditLog } from '@/lib/logger/audit';
import { AgentInstaller } from '@/lib/agent/installer';
import { z } from 'zod';
import logger from '@/lib/logger';

/**
 * POST /api/servers
 * Create a new server (with optional agent installation)
 */
export async function POST(request: NextRequest) {
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
    // Parse and validate request body
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const body = await request.json();
    
    // Extended validation for agent installation
    const extendedSchema = createServerSchema.extend({
      installAgent: z.boolean().optional(),
      sshPassword: z.string().optional(),
    });
    
    const validatedData = extendedSchema.parse(body);

    // Validate password if agent installation is requested
    if (validatedData.installAgent && !validatedData.sshPassword) {
      return NextResponse.json(
        {
          success: false,
          error: 'SSH password is required to install agent',
        },
        { status: 400 }
      );
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Check for duplicate IP address
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const existingServer = await prisma.server.findFirst({
      where: {
        userId,
        ipAddress: validatedData.ipAddress,
        isActive: true,
      },
    });

    if (existingServer) {
      return NextResponse.json(
        {
          success: false,
          error: 'A server with this IP address already exists',
        },
        { status: 409 }
      );
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Create server record (temporary - will update after agent install)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const server = await prisma.server.create({
      data: {
        userId,
        name: validatedData.name,
        ipAddress: validatedData.ipAddress,
        port: validatedData.port,
        sshUsername: validatedData.sshUsername,
        hostname: validatedData.hostname,
        tags: validatedData.tags,
        notes: validatedData.notes,
        agentHealthStatus: validatedData.installAgent ? 'installing' : 'pending',
        agentInstalled: false,
        isActive: true,
      },
    });

    let installResult = null;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Install agent if requested
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (validatedData.installAgent && validatedData.sshPassword) {
      try {
        logger.info('Starting agent installation', {
          serverId: server.id,
          userId,
          host: validatedData.ipAddress,
        });

        const installer = new AgentInstaller(
          {
            host: validatedData.ipAddress,
            port: validatedData.port,
            username: validatedData.sshUsername,
            password: validatedData.sshPassword, // ⚠️ IN MEMORY ONLY
          },
          {
            userId,
            serverId: server.id,
            handshakeUuid: server.handshakeUuid,
            brokerUrl: process.env.AGENT_BROKER_URL || 'wss://broker.shellvault.com',
          }
        );

        // Install agent (password used here, then discarded)
        installResult = await installer.install();

        // ⚠️ PASSWORD DISCARDED - installer.install() completes and password is gone

        if (installResult.success) {
          // Update server with agent info
          await prisma.server.update({
            where: { id: server.id },
            data: {
              agentInstalled: true,
              agentVersion: installResult.agentVersion,
              agentHealthStatus: 'online',
              agentLastSeen: new Date(),
              hostname: installResult.serverInfo.hostname || validatedData.hostname,
              osInfo: installResult.serverInfo.os,
            },
          });

          logger.info('Agent installed successfully', {
            serverId: server.id,
            version: installResult.agentVersion,
          });
        } else {
          // Installation failed - update status
          await prisma.server.update({
            where: { id: server.id },
            data: {
              agentHealthStatus: 'failed',
            },
          });

          logger.error('Agent installation failed', {
            serverId: server.id,
            error: installResult.error,
          });
        }
      } catch (error: any) {
        logger.error('Agent installation error', error);
        
        // Update server status
        await prisma.server.update({
          where: { id: server.id },
          data: {
            agentHealthStatus: 'failed',
          },
        });

        // Don't fail the request - server is created, just agent failed
        installResult = {
          success: false,
          error: error.message || 'Unknown error',
          agentVersion: '',
          serverInfo: { hostname: '', os: '' },
        };
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Audit log
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await createAuditLog({
      userId,
      eventType: validatedData.installAgent ? 'server_created_with_agent' : 'server_created',
      eventCategory: 'server_management',
      severity: 'info',
      message: `Server created: ${server.name}${validatedData.installAgent ? ' (with agent)' : ''}`,
      details: {
        serverId: server.id,
        ipAddress: server.ipAddress,
        hostname: server.hostname,
        tags: server.tags,
        agentInstalled: installResult?.success || false,
      },
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Fetch updated server
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const updatedServer = await prisma.server.findUnique({
      where: { id: server.id },
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Return created server
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    return NextResponse.json(
      {
        success: true,
        server: {
          id: updatedServer!.id,
          name: updatedServer!.name,
          ipAddress: updatedServer!.ipAddress,
          port: updatedServer!.port,
          sshUsername: updatedServer!.sshUsername,
          hostname: updatedServer!.hostname,
          tags: updatedServer!.tags,
          notes: updatedServer!.notes,
          agentHealthStatus: updatedServer!.agentHealthStatus,
          agentInstalled: updatedServer!.agentInstalled,
          agentVersion: updatedServer!.agentVersion,
          createdAt: updatedServer!.createdAt,
          updatedAt: updatedServer!.updatedAt,
        },
        agentInstallation: installResult ? {
          success: installResult.success,
          error: installResult.error,
        } : null,
      },
      { status: 201 }
    );
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

    console.error('Error creating server:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/servers
 * List user's servers with pagination and filters
 */
export async function GET(request: NextRequest) {
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
    // Parse query parameters
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const { searchParams } = new URL(request.url);
    
    const query = listServersSchema.parse({
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '20'),
      status: searchParams.get('status') || 'all',
      tags: searchParams.get('tags') || undefined,
      search: searchParams.get('search') || undefined,
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Build where clause
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const where: any = {
      userId,
      isActive: true, // Only show active servers (soft delete)
    };

    // Status filter
    if (query.status !== 'all') {
      where.agentHealthStatus = query.status;
    }

    // Tags filter
    if (query.tags) {
      const tagArray = query.tags.split(',').map(t => t.trim());
      where.tags = {
        hasSome: tagArray,
      };
    }

    // Search filter (name, hostname, IP)
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { hostname: { contains: query.search, mode: 'insensitive' } },
        { ipAddress: { contains: query.search } },
      ];
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Get total count
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const total = await prisma.server.count({ where });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Get servers with pagination
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const servers = await prisma.server.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
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
    // Return servers with pagination
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    return NextResponse.json({
      success: true,
      servers,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid query parameters',
          details: error.issues,
        },
        { status: 400 }
      );
    }

    console.error('Error listing servers:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}