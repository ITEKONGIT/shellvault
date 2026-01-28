// app/api/agent/heartbeat/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import logger from '@/lib/logger';

/**
 * POST /api/agent/heartbeat
 * Agent sends heartbeat to report health
 * 
 * ✅ This is the integration point - agent → ShellVault communication
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Basic validation
    if (!body.serverId || !body.agentVersion) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { serverId, agentVersion, hostname, timestamp } = body;

    logger.info('Agent heartbeat received', {
      serverId,
      agentVersion,
      hostname,
      timestamp,
    });

    // Find server
    const server = await prisma.server.findUnique({
      where: { id: serverId },
    });

    if (!server) {
      logger.warn('Heartbeat from unknown server', { serverId });
      return NextResponse.json(
        { success: false, error: 'Server not found' },
        { status: 404 }
      );
    }

    // ✅ Update server status
    await prisma.server.update({
      where: { id: serverId },
      data: {
        agentHealthStatus: 'online',
        agentLastSeen: new Date(),
        agentVersion: agentVersion,
        hostname: hostname || server.hostname,
      },
    });

    logger.info('Server status updated', {
      serverId,
      status: 'online',
    });

    return NextResponse.json({
      success: true,
      message: 'Heartbeat received',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Heartbeat error', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}