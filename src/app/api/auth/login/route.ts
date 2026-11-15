import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getUserByEmail, verifyPassword, createSession, logAuditEvent } from '@/lib/db/database';

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > 8192) return NextResponse.json({ error: 'Request body too large.' }, { status: 413 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.email !== 'string' || typeof body.password !== 'string' || body.email.length > 254 || body.password.length > 1024) return NextResponse.json({ error: 'Valid email and password are required.' }, { status: 400 });
  for (const [attemptKey, value] of attempts) if (value.resetAt <= Date.now()) attempts.delete(attemptKey);
  const key = crypto.createHash('sha256').update(body.email.trim().toLowerCase()).digest('hex');
  const state = attempts.get(key);
  if (state && state.resetAt > Date.now() && state.count >= MAX_ATTEMPTS) return NextResponse.json({ error: 'Too many login attempts. Try again in 15 minutes.' }, { status: 429 });
  const user = getUserByEmail(body.email.trim());
  const valid = !!user && verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    const next = !state || state.resetAt <= Date.now() ? { count: 1, resetAt: Date.now() + WINDOW_MS } : { ...state, count: state.count + 1 };
    attempts.set(key, next);
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }
  attempts.delete(key);
  const session = createSession(user!.id);
  logAuditEvent('LOGIN_SUCCESS', user!.id, user!.role, null, null, { method: 'password' }, ip);
  const res = NextResponse.json({
    ok: true,
    user: session.user,
    activeOrganizationId: session.activeOrganizationId,
    activeRole: session.activeRole,
    organizations: session.organizations,
    expiresAt: session.expiresAt,
  });
  res.cookies.set('veribrand_session', session.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 8 * 60 * 60 });
  return res;
}
