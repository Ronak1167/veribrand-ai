// VeriBrand AI — Server-Side Session & Role-Based Authorization
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/db/database';
import { User, UserRole } from '@/types';

export function getSessionFromRequest(req: NextRequest): { user: User; token: string } | null {
  // 1. Check Bearer Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const session = getSession(token);
    if (session) return { user: session.user, token: session.token };
  }

  // 2. Check veribrand_session cookie
  const cookie = req.cookies.get('veribrand_session');
  if (cookie && cookie.value) {
    const session = getSession(cookie.value);
    if (session) return { user: session.user, token: session.token };
  }

  return null;
}

export function requireRole(
  user: User | null,
  allowedRoles: UserRole[]
): { allowed: boolean; status: number; error: string } {
  if (!user) {
    return {
      allowed: false,
      status: 401,
      error: 'Authentication required. Please log in with a valid session.',
    };
  }

  if (user.role === 'admin' || allowedRoles.includes(user.role)) {
    return { allowed: true, status: 200, error: '' };
  }

  return {
    allowed: false,
    status: 403,
    error: `Forbidden: User role '${user.role}' lacks permission. Required roles: ${allowedRoles.join(', ')}.`,
  };
}
