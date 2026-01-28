// components/ui/server-components.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Status Badge Component
 */
interface StatusBadgeProps {
  status: 'pending' | 'online' | 'offline' | 'degraded';
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const colors = {
    pending: 'bg-zinc-400',
    online: 'bg-emerald-500',
    offline: 'bg-red-500',
    degraded: 'bg-amber-500',
  };

  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`${sizeClasses[size]} ${colors[status]} rounded-full`} />
      <span className="text-sm text-zinc-400 capitalize">{status}</span>
    </div>
  );
}

/**
 * ✅ NEW: Helper function to format "last seen" time
 */
function getTimeSince(date: Date | null): string {
  if (!date) return 'Never';
  
  const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Server Card Component
 */
interface ServerCardProps {
  server: {
    id: string;
    name: string;
    ipAddress: string;
    port: number;
    sshUsername: string;
    hostname?: string | null;
    tags: string[];
    agentHealthStatus: string;
    agentInstalled: boolean;
    agentLastSeen?: Date | null; // ✅ NEW
    agentVersion?: string | null; // ✅ NEW
    createdAt: Date | string;
  };
  onEdit?: () => void;
  onDelete?: () => void;
}

export function ServerCard({ server, onEdit, onDelete }: ServerCardProps) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);

  const handleView = () => {
    router.push(`/servers/${server.id}`);
  };

  // Format created date
  const createdDate = new Date(server.createdAt);
  const now = new Date();
  const diffMs = now.getTime() - createdDate.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  let timeAgo = '';
  if (diffDays > 0) {
    timeAgo = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else if (diffHours > 0) {
    timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else {
    timeAgo = 'Just now';
  }

  return (
    <div
      className={`
        bg-zinc-900 rounded-lg p-6 border transition-all duration-200
        ${isHovered ? 'border-amber-600 shadow-lg' : 'border-zinc-800'}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ✅ UPDATED: Status, Name, and Last Seen */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <StatusBadge status={server.agentHealthStatus as any} size="sm" />
            {/* ✅ NEW: Show last seen time for online agents */}
            {server.agentInstalled && server.agentLastSeen && (
              <span className="text-xs text-zinc-500">
                • {getTimeSince(server.agentLastSeen)}
              </span>
            )}
          </div>
          <h3 className="text-xl font-semibold text-zinc-100 mt-2">
            {server.name}
          </h3>
        </div>
      </div>

      {/* Connection Info */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span>📍</span>
          <span>
            {server.ipAddress}:{server.port} • {server.sshUsername}
          </span>
        </div>

        {server.hostname && (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span>🖥️</span>
            <span>{server.hostname}</span>
          </div>
        )}

        {/* ✅ NEW: Show agent version if installed */}
        {server.agentInstalled && server.agentVersion && (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span>🤖</span>
            <span>Agent v{server.agentVersion}</span>
          </div>
        )}
      </div>

      {/* Tags */}
      {server.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-sm text-zinc-500">🏷️</span>
          {server.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-1 text-xs bg-zinc-800 text-zinc-300 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
        <span className="text-xs text-zinc-500">Added {timeAgo}</span>
        <div className="flex gap-2">
          <button
            onClick={handleView}
            className="px-3 py-1 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded transition-colors"
          >
            View
          </button>
          {onEdit && (
            <button
              onClick={onEdit}
              className="px-3 py-1 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded transition-colors"
            >
              Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="px-3 py-1 text-sm bg-red-900/20 hover:bg-red-900/30 text-red-400 rounded transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Empty State Component
 */
export function EmptyServersState() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-6xl mb-4">🖥️</div>
      <h3 className="text-2xl font-light text-zinc-100 mb-2">No servers yet</h3>
      <p className="text-zinc-400 mb-6 max-w-md">
        Add your first server to start managing SSH access with ShellVault
      </p>
      <button
        onClick={() => router.push('/servers/add')}
        className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-zinc-950 font-medium rounded-lg transition-colors"
      >
        + Add Server
      </button>
    </div>
  );
}

/**
 * Loading Skeleton
 */
export function ServerCardSkeleton() {
  return (
    <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800 animate-pulse">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-3 h-3 bg-zinc-700 rounded-full" />
        <div className="h-4 bg-zinc-700 rounded w-20" />
      </div>
      <div className="h-6 bg-zinc-700 rounded w-3/4 mb-4" />
      <div className="h-4 bg-zinc-700 rounded w-1/2 mb-2" />
      <div className="h-4 bg-zinc-700 rounded w-2/3" />
    </div>
  );
}

/**
 * Delete Confirmation Modal
 */
interface DeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  serverName: string;
  ipAddress: string;
  isDeleting: boolean;
}

export function DeleteServerModal({
  isOpen,
  onClose,
  onConfirm,
  serverName,
  ipAddress,
  isDeleting,
}: DeleteModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-xl font-semibold text-zinc-100 mb-4">
          ⚠️ Delete Server?
        </h3>

        <p className="text-zinc-400 mb-4">
          Are you sure you want to delete this server?
        </p>

        <div className="bg-zinc-950 border border-zinc-800 rounded p-3 mb-4">
          <p className="text-sm text-zinc-300">Server: {serverName}</p>
          <p className="text-sm text-zinc-300">IP: {ipAddress}</p>
        </div>

        <p className="text-sm text-red-400 mb-6">
          This action cannot be undone. Any active sessions will be closed.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete Server'}
          </button>
        </div>
      </div>
    </div>
  );
}