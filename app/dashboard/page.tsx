// app/dashboard/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ServerCard,
  EmptyServersState,
  ServerCardSkeleton,
  DeleteServerModal,
} from '@/components/ui/server-components';
import { EditServerModal } from '@/components/ui/edit-server-modal';

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
  agentLastSeen?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}


function getTimeSince(date: Date | null): string {
  if (!date) return 'Never';
  
  const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [servers, setServers] = useState<Server[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tagsFilter, setTagsFilter] = useState('');

  // Delete modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<Server | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [serverToEdit, setServerToEdit] = useState<Server | null>(null);

  // Fetch servers
  const fetchServers = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        status: statusFilter,
      });

      if (searchQuery) params.set('search', searchQuery);
      if (tagsFilter) params.set('tags', tagsFilter);

      const response = await fetch(`/api/servers?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch servers');
      }

      setServers(data.servers);
      setPagination(data.pagination);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchServers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, statusFilter, tagsFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== undefined) {
        fetchServers();
      }
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Handle delete
  const handleDeleteClick = (server: Server) => {
    setServerToDelete(server);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!serverToDelete) return;

    try {
      setIsDeleting(true);

      const response = await fetch(`/api/servers/${serverToDelete.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete server');
      }

      // Refresh list
      await fetchServers();
      setDeleteModalOpen(false);
      setServerToDelete(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle edit
  const handleEditClick = (server: Server) => {
    setServerToEdit(server);
    setEditModalOpen(true);
  };

  const handleEditSuccess = async () => {
    // Refresh server list after successful edit
    await fetchServers();
  };

  // Logout
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-zinc-950/80 backdrop-blur-sm border-b border-zinc-800/50 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-600 to-amber-800 rounded-md flex items-center justify-center font-mono text-sm font-bold">
              SV
            </div>
            <span className="text-xl font-light tracking-tight">
              Shell<span className="font-semibold text-amber-600">Vault</span>
            </span>
          </Link>

          <div className="flex items-center space-x-6">
            <Link
              href="/dashboard"
              className="text-sm text-amber-600 font-medium"
            >
              Dashboard
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-24 pb-12 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-4xl font-light tracking-tight mb-2">
              My <span className="font-semibold text-amber-600">Servers</span>
            </h1>
            <p className="text-zinc-400">
              Manage your infrastructure with fortress-grade security
            </p>
          </div>

          {/* Controls Bar */}
          <div className="mb-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 flex-1 w-full sm:w-auto">
              {/* Search */}
              <div className="relative flex-1 sm:max-w-md">
                <input
                  type="text"
                  placeholder="Search servers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-600 transition-colors"
                />
                <svg
                  className="absolute right-3 top-2.5 w-5 h-5 text-zinc-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-600 transition-colors"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
              </select>
            </div>

            {/* Add Server Button */}
            <Link
              href="/servers/add"
              className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2 rounded-lg font-medium transition-colors text-sm whitespace-nowrap"
            >
              + Add Server
            </Link>
          </div>

          {/* Error State */}
          {error && (
            <div className="mb-8 bg-red-900/20 border border-red-500/50 rounded-lg p-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <ServerCardSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loading && servers.length === 0 && !searchQuery && (
            <EmptyServersState />
          )}

          {/* No Results State */}
          {!loading && servers.length === 0 && searchQuery && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-2xl font-light text-zinc-100 mb-2">
                No servers found
              </h3>
              <p className="text-zinc-400 mb-6">
                Try adjusting your search or filters
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setTagsFilter('');
                }}
                className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg transition-colors text-sm"
              >
                Clear Filters
              </button>
            </div>
          )}

          {/* Server Grid */}
          {!loading && servers.length > 0 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {servers.map((server) => (
                  <ServerCard
                    key={server.id}
                    server={server}
                    onEdit={() => handleEditClick(server)}
                    onDelete={() => handleDeleteClick(server)}
                  />
                ))}
              </div>

              {/* Pagination */}
              {pagination.pages > 1 && (
                <div className="mt-12 flex items-center justify-center gap-2">
                  <button
                    onClick={() =>
                      setPagination((p) => ({ ...p, page: p.page - 1 }))
                    }
                    disabled={pagination.page === 1}
                    className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:border-amber-600 transition-colors"
                  >
                    ← Previous
                  </button>

                  <span className="text-sm text-zinc-400">
                    Page {pagination.page} of {pagination.pages}
                  </span>

                  <button
                    onClick={() =>
                      setPagination((p) => ({ ...p, page: p.page + 1 }))
                    }
                    disabled={pagination.page === pagination.pages}
                    className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:border-amber-600 transition-colors"
                  >
                    Next →
                  </button>
                </div>
              )}

              {/* Server Count */}
              <div className="mt-6 text-center text-sm text-zinc-500">
                Showing {servers.length} of {pagination.total} servers
              </div>
            </>
          )}
        </div>
      </main>

      {/* Delete Modal */}
      <DeleteServerModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setServerToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        serverName={serverToDelete?.name || ''}
        ipAddress={serverToDelete?.ipAddress || ''}
        isDeleting={isDeleting}
      />

      {/* Edit Modal */}
      {serverToEdit && (
        <EditServerModal
          isOpen={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setServerToEdit(null);
          }}
          onSuccess={handleEditSuccess}
          server={serverToEdit}
        />
      )}
    </div>
  );
}