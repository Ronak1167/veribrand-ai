import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';
import { deleteSession, logAuditEvent } from '@/lib/db/database';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (session) {
    deleteSession(session.token);
    const clientIp = req.headers.get('x-forwarded-for') || '127.0.0.1';
    logAuditEvent('LOGOUT', session.user.id, session.user.role, null, null, {}, clientIp);
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set('veribrand_session', '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });

  return res;
}
