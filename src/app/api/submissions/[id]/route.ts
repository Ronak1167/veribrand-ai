import { NextRequest, NextResponse } from 'next/server';
import { getSubmissionById, getSubmissionOwnerId, verifySubmissionApprovalIntegrity } from '@/lib/db/database';
import { getSessionFromRequest } from '@/lib/auth/session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { id } = await params;
    const sub = getSubmissionById(id);
    if (!sub) return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
    if (session.user.role === 'creator' && getSubmissionOwnerId(id) !== session.user.id) return NextResponse.json({ error: 'You may only view your own submissions.' }, { status: 403 });
    return NextResponse.json({ ...sub, integrityVerified: sub.status === 'approved' ? verifySubmissionApprovalIntegrity(id) : null });
  } catch {
    return NextResponse.json({ error: 'Unable to retrieve submission.' }, { status: 500 });
  }
}
