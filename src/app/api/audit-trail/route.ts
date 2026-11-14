// VeriBrand AI — Audit Trail API Endpoint
import { NextRequest, NextResponse } from 'next/server';
import { getAuditTrail } from '@/lib/db/database';
import { getSessionFromRequest, requireRole } from '@/lib/auth/session';

export async function GET(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    const authCheck = requireRole(session?.user || null, ['reviewer', 'admin']);
    if (!authCheck.allowed) {
      return NextResponse.json({ ok: false, error: authCheck.error }, { status: authCheck.status });
    }

    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 500) : 100;

    const trail = getAuditTrail(limit);

    return NextResponse.json({
      ok: true,
      count: trail.length,
      auditTrail: trail,
    });
  } catch (err: unknown) {
    console.error('Audit trail API error:', err);
    return NextResponse.json(
      { ok: false, error: 'Internal server error retrieving audit trail' },
      { status: 500 }
    );
  }
}
