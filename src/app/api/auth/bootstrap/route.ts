import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createUser, hasUsers, logAuditEvent } from '@/lib/db/database';

export async function GET() {
  try { return NextResponse.json({ setupRequired: !hasUsers() }); }
  catch { return NextResponse.json({ error: 'Unable to inspect account setup.' }, { status: 500 }); }
}
export async function POST(req: NextRequest) {
  try {
    if (hasUsers()) return NextResponse.json({ error: 'Initial setup has already been completed.' }, { status: 409 });
    const expected = process.env.VERIBRAND_BOOTSTRAP_TOKEN;
    if (!expected || expected.length < 32) return NextResponse.json({ error: 'Configure a VERIBRAND_BOOTSTRAP_TOKEN of at least 32 characters.' }, { status: 503 });
    const body = await req.json().catch(() => null);
    if (!body || typeof body.token !== 'string') return NextResponse.json({ error: 'Bootstrap token is required.' }, { status: 400 });
    const a = Buffer.from(body.token); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return NextResponse.json({ error: 'Invalid bootstrap token.' }, { status: 403 });
    if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || typeof body.name !== 'string' || body.name.trim().length < 2 || typeof body.password !== 'string' || body.password.length < 14) return NextResponse.json({ error: 'Provide a valid email, name, and password of at least 14 characters.' }, { status: 400 });
    if (hasUsers()) return NextResponse.json({ error: 'Initial setup has already been completed.' }, { status: 409 });
    const user = createUser({ email: body.email, name: body.name, role: 'admin', password: body.password });
    logAuditEvent('INITIAL_ADMIN_CREATED', user.id, user.role, null, null, { email: user.email });
    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch { return NextResponse.json({ error: 'Unable to complete initial setup.' }, { status: 500 }); }
}
