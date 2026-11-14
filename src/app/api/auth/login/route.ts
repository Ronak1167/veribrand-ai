import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, verifyPassword, createSession, logAuditEvent } from '@/lib/db/database';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body || {};

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Both "email" and "password" are required fields.' },
        { status: 400 }
      );
    }

    const userWithSecret = getUserByEmail(email.trim());
    if (!userWithSecret) {
      return NextResponse.json(
        { error: 'Invalid email or password credentials.' },
        { status: 401 }
      );
    }

    const clientIp = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const valid = verifyPassword(password, userWithSecret.passwordHash);
    if (!valid) {
      logAuditEvent('LOGIN_FAILED', userWithSecret.id, userWithSecret.role, null, null, { email }, clientIp);
      return NextResponse.json(
        { error: 'Invalid email or password credentials.' },
        { status: 401 }
      );
    }

    const session = createSession(userWithSecret.id);
    logAuditEvent('LOGIN_SUCCESS', userWithSecret.id, userWithSecret.role, null, null, { email }, clientIp);

    const res = NextResponse.json({
      user: session.user,
      token: session.token,
      expiresAt: session.expiresAt,
    });

    res.cookies.set('veribrand_session', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
