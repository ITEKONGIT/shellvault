import { requireAdminPage } from '@/lib/auth/admin-session';

export default async function AdminAuditPage() {
  await requireAdminPage();

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="mx-auto max-w-4xl">
        <p className="mb-2 text-sm text-amber-500">Admin</p>
        <h1 className="mb-4 text-3xl font-semibold">Audit</h1>
        <p className="text-zinc-400">
          Audit explorer is reserved for the admin hardening phase.
        </p>
      </div>
    </main>
  );
}
