import { NextRequest } from 'next/server';
import { apiResponse } from '@/lib/utils';

export async function GET(request: NextRequest) {
  return apiResponse({
    name: 'ShellVault API',
    version: '1.0.0',
    description: 'Secure SSH connection broker with passwordless authentication',
    environment: process.env.NODE_ENV,
    endpoints: {
      health: '/api/health',
      auth: {
        register: '/api/auth/register',
        login: '/api/auth/login',
        me: '/api/auth/me',
      },
      servers: '/api/servers',
      sessions: '/api/sessions',
    },
  });
}