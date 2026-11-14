import { NextRequest, NextResponse } from 'next/server';
import { createUser, getAllUsers, logAuditEvent } from '@/lib/db/database';
import { getSessionFromRequest, requireRole } from '@/lib/auth/session';

function adminSession(req: NextRequest) {
  const session = getSessionFromRequest(req);
  const access = requireRole(session?.user || null, ['admin']);
  return { session, access };
}

export async function GET(req: NextRequest) {
  const { access } = adminSession(req);
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json({ users: getAllUsers() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const { session, access } = adminSession(req);
  if (!access.allowed || !session) return NextResponse.json({ error: access.error }, { status: access.status });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.email !== 'string' || typeof body.name !== 'string' || !['creator', 'reviewer', 'admin'].includes(body.role) || typeof body.password !== 'string') return NextResponse.json({ error: 'Invalid user details.' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.name.trim().length < 2 || body.password.length < 14 || body.password.length > 1024) return NextResponse.json({ error: 'Valid email/name and a password of 14–1024 characters are required.' }, { status: 400 });
  try {
    const user = createUser({ email: body.email, name: body.name, role: body.role, password: body.password });
    logAuditEvent('USER_CREATED', session.user.id, session.user.role, null, null, { userId: user.id, email: user.email, role: user.role });
    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint/.test(error.message)) return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    return NextResponse.json({ error: 'Unable to create user.' }, { status: 500 });
  }
}
