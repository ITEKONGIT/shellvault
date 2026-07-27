import Link from 'next/link';
import { requireAdminPage } from '@/lib/auth/admin-session';

export default async function AdminPage() {
  const user = await requireAdminPage();

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="mx-auto max-w-4xl">
        <p className="mb-2 text-sm text-amber-500">Admin</p>
        <h1 className="mb-4 text-3xl font-semibold">ShellVault Admin</h1>
        <p className="mb-8 text-zinc-400">
          Signed in as {user.username}. Administrative tools are intentionally
          minimal until RBAC and audit controls are fully implemented.
        </p>
        <div className="flex gap-3">
          <Link className="rounded bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800" href="/admin/audit">
            Audit
          </Link>
          <Link className="rounded bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800" href="/admin/users">
            Users
          </Link>
          <Link className="rounded bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800" href="/dashboard">
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
