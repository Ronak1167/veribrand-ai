import { NextRequest, NextResponse } from 'next/server';
import { getSubmissionById, getSubmissionOwnerId, verifySubmissionApprovalIntegrity } from '@/lib/db/database';
import { getTenantContextFromRequest } from '@/lib/auth/session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  try {
    const { id } = await params;
    // Admins can inspect across tenants, otherwise enforce tenant scoping
    const orgId = auth.context.user.role === 'admin' ? undefined : auth.context.organizationId;
    const sub = getSubmissionById(id, orgId);
    if (!sub) {
      return NextResponse.json({ error: 'Submission not found in active organization.' }, { status: 404 });
    }

    if (auth.context.orgRole === 'creator' && getSubmissionOwnerId(id) !== auth.context.user.id) {
      return NextResponse.json({ error: 'You may only view your own submissions.' }, { status: 403 });
    }

    return NextResponse.json({
      ...sub,
      integrityVerified: sub.status === 'approved' ? verifySubmissionApprovalIntegrity(id) : null,
    });
  } catch {
    return NextResponse.json({ error: 'Unable to retrieve submission.' }, { status: 500 });
  }
}
