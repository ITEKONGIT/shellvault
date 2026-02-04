// app/servers/[id]/page.tsx
// Updated with Connect Terminal functionality via Broker
// ✅ FIXED: Next.js 16 params Promise handling

'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { StatusBadge, DeleteServerModal } from '@/components/ui/server-components';

// Dynamic import for terminal (client-side only)
const SSHTerminal = dynamic(() => import('@/components/terminal/SSHTerminal'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96 bg-zinc-900">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm text-zinc-400">Loading terminal...</p>
      </div>
    </div>
  ),
});

// ✅ ADDED: Broker URL for SSH connect
const BROKER_URL = process.env.NEXT_PUBLIC_BROKER_URL || 'http://localhost:8080';

interface Server {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  sshUsername: string;
  hostname?: string | null;
  tags: string[];
  notes?: string | null;
  agentHealthStatus: string;
  agentInstalled: boolean;
  agentVersion?: string | null;
  agentLastSeen?: Date | null;
  rotationEnabled: boolean;
  rotationInterval: number;
  lastRotated?: Date | null;
  lastConnected?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TerminalSession {
  sessionId: string;
  serverName: string;
}

export default function ServerDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;  // ✅ FIXED: params is a Promise in Next.js 16
}) {
  const router = useRouter();
  const resolvedParams = use(params);  // ✅ FIXED: Unwrap Promise with use()
  const [server, setServer] = useState<Server | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Terminal state
  const [terminalSession, setTerminalSession] = useState<TerminalSession | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Fetch server details
  useEffect(() => {
    const fetchServer = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/servers/${resolvedParams.id}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch server');
        }

        setServer(data.server);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchServer();
  }, [resolvedParams.id]);

  // Handle Connect - Request credentials and spawn terminal
  const handleConnect = async () => {
    if (!server) return;

    try {
      setConnecting(true);
      setConnectError(null);

      // Step 1: Request credentials via Next.js API (which calls broker for credentials)
      const spawnResponse = await fetch(`/api/servers/${server.id}/terminal/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const spawnData = await spawnResponse.json();

      if (!spawnResponse.ok) {
        throw new Error(spawnData.error || spawnData.details || 'Failed to get credentials');
      }

      console.log('Credentials received:', spawnData);

      // ✅ CHANGED: Step 2: Establish SSH connection via BROKER (not Next.js)
      const connectResponse = await fetch(`${BROKER_URL}/api/ssh/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: spawnData.sessionId,
          credentials: {
            username: spawnData.credentials.username,
            auth_method: spawnData.credentials.authMethod,
            credential: spawnData.credentials.keyPath || '',
            ip_address: spawnData.server.ipAddress,
            port: server.port,
            hostname: spawnData.server.hostname,
          },
        }),
      });

      const connectData = await connectResponse.json();

      if (!connectResponse.ok || !connectData.success) {
        throw new Error(connectData.error || 'Failed to establish SSH connection');
      }

      console.log('SSH connection established:', connectData);

      // Success! Open terminal
      setTerminalSession({
        sessionId: spawnData.sessionId,
        serverName: server.name,
      });

    } catch (err: any) {
      console.error('Connect error:', err);
      setConnectError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  // Handle terminal close
  const handleTerminalClose = () => {
    setTerminalSession(null);
  };

  // Handle terminal error
  const handleTerminalError = (error: string) => {
    console.error('Terminal error:', error);
  };

  // Handle delete
  const handleDelete = async () => {
    if (!server) return;

    try {
      setIsDeleting(true);

      const response = await fetch(`/api/servers/${server.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete server');
      }

      router.push('/dashboard');
    } catch (err: any) {
      alert(err.message);
      setIsDeleting(false);
    }
  };

  // Format date
  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return 'Never';
    const d = new Date(date);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-zinc-400">Loading server details...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !server) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-light mb-2">Server Not Found</h2>
          <p className="text-zinc-400 mb-6">{error || 'This server does not exist'}</p>
          <Link
            href="/dashboard"
            className="inline-block px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Terminal view (full screen when connected)
  if (terminalSession) {
    return (
      <div className="h-screen bg-zinc-950">
        <SSHTerminal
          sessionId={terminalSession.sessionId}
          serverName={terminalSession.serverName}
          onClose={handleTerminalClose}
          onError={handleTerminalError}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-zinc-950/80 backdrop-blur-sm border-b border-zinc-800/50 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-600 to-amber-800 rounded-md flex items-center justify-center font-mono text-sm font-bold">
              SV
            </div>
            <span className="text-xl font-light tracking-tight">
              Shell<span className="font-semibold text-amber-600">Vault</span>
            </span>
          </div>

          <div className="flex items-center space-x-6">
            <Link
              href="/dashboard"
              className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-24 pb-12 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/dashboard"
              className="inline-flex items-center text-sm text-zinc-400 hover:text-amber-600 transition-colors mb-4"
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to Dashboard
            </Link>

            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-4 mb-2">
                  <h1 className="text-4xl font-light tracking-tight">
                    {server.name}
                  </h1>
                  <StatusBadge status={server.agentHealthStatus as any} />
                </div>
                <p className="text-zinc-400">Server details and management</p>
              </div>

              {/* Connect Button */}
              <div className="flex flex-col items-end gap-2">
                <button
                  onClick={handleConnect}
                  disabled={connecting || !server.agentInstalled || server.agentHealthStatus !== 'online'}
                  className={`
                    px-6 py-3 rounded-lg font-medium transition-all flex items-center gap-2
                    ${server.agentInstalled && server.agentHealthStatus === 'online'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    }
                    ${connecting ? 'opacity-75' : ''}
                  `}
                >
                  {connecting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Connect Terminal
                    </>
                  )}
                </button>

                {!server.agentInstalled && (
                  <span className="text-xs text-amber-500">Agent not installed</span>
                )}
                {server.agentInstalled && server.agentHealthStatus !== 'online' && (
                  <span className="text-xs text-amber-500">Agent is {server.agentHealthStatus}</span>
                )}
              </div>
            </div>

            {/* Connect Error */}
            {connectError && (
              <div className="mt-4 p-4 bg-red-900/20 border border-red-900/50 rounded-lg">
                <p className="text-red-400 text-sm">
                  <strong>Connection failed:</strong> {connectError}
                </p>
              </div>
            )}
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Connection Details */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>📍</span>
                Connection Details
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-zinc-500 mb-1">IP Address</p>
                  <p className="text-zinc-100 font-mono">{server.ipAddress}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500 mb-1">Port</p>
                  <p className="text-zinc-100 font-mono">{server.port}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500 mb-1">Username</p>
                  <p className="text-zinc-100 font-mono">{server.sshUsername}</p>
                </div>
                {server.hostname && (
                  <div>
                    <p className="text-sm text-zinc-500 mb-1">Hostname</p>
                    <p className="text-zinc-100 font-mono">{server.hostname}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Agent Status */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>🤖</span>
                Agent Status
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-zinc-500 mb-1">Installed</p>
                  <p className="text-zinc-100">
                    {server.agentInstalled ? (
                      <span className="text-emerald-500">✓ Yes</span>
                    ) : (
                      <span className="text-amber-500">⚠ Not installed</span>
                    )}
                  </p>
                </div>
                {server.agentVersion && (
                  <div>
                    <p className="text-sm text-zinc-500 mb-1">Version</p>
                    <p className="text-zinc-100 font-mono">{server.agentVersion}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-zinc-500 mb-1">Health Status</p>
                 <div className="text-zinc-100">
  <StatusBadge status={server.agentHealthStatus as any} />
</div>
                </div>
                <div>
                  <p className="text-sm text-zinc-500 mb-1">Last Seen</p>
                  <p className="text-zinc-100">{formatDate(server.agentLastSeen)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tags */}
          {server.tags.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>🏷️</span>
                Tags
              </h2>
              <div className="flex flex-wrap gap-2">
                {server.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-zinc-800 text-zinc-300 rounded-full text-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {server.notes && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>📝</span>
                Notes
              </h2>
              <p className="text-zinc-300 whitespace-pre-wrap">{server.notes}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span>⏱️</span>
              Metadata
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-zinc-500 mb-1">Created</p>
                <p className="text-zinc-100">{formatDate(server.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500 mb-1">Last Updated</p>
                <p className="text-zinc-100">{formatDate(server.updatedAt)}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500 mb-1">Last Connected</p>
                <p className="text-zinc-100">{formatDate(server.lastConnected)}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500 mb-1">Rotation Interval</p>
                <p className="text-zinc-100">{server.rotationInterval} hours</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span>🔧</span>
              Actions
            </h2>
            <div className="flex gap-4">
              <button
                onClick={() => router.push(`/servers/${server.id}/edit`)}
                className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg transition-colors"
              >
                Edit Server
              </button>
              <button
                onClick={() => setDeleteModalOpen(true)}
                className="px-6 py-2 bg-red-900/20 hover:bg-red-900/30 text-red-400 rounded-lg transition-colors"
              >
                Delete Server
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Delete Modal */}
      <DeleteServerModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        serverName={server.name}
        ipAddress={server.ipAddress}
        isDeleting={isDeleting}
      />
    </div>
  );
}