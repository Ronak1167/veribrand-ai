import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';
import { deleteSession, logAuditEvent } from '@/lib/db/database';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (session) { deleteSession(session.token); logAuditEvent('LOGOUT', session.user.id, session.user.role, null, null, {}); }
  const res = NextResponse.json({ success: true });
  res.cookies.set('veribrand_session', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 });
  return res;
}
