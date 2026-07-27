import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { prisma } from '@/lib/db/client';

export async function requireAdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;

  if (!token) {
    redirect('/login');
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: {
      id: true,
      username: true,
      email: true,
      isAdmin: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive || !user.isAdmin) {
    redirect('/dashboard');
  }

  return user;
}
