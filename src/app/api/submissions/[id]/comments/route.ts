import { NextRequest, NextResponse } from 'next/server';
import { getSubmissionById, getSubmissionOwnerId, addComment } from '@/lib/db/database';
import { getTenantContextFromRequest } from '@/lib/auth/session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const orgId = auth.context.user.role === 'admin' ? undefined : auth.context.organizationId;
    const sub = getSubmissionById(id, orgId);
    if (!sub) return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });

    if (auth.context.orgRole === 'creator' && getSubmissionOwnerId(id) !== auth.context.user.id && auth.context.user.role !== 'admin') {
      return NextResponse.json({ error: 'You may only comment on your own submissions.' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 5000) {
      return NextResponse.json({ error: 'Comment must contain 1–5000 characters.' }, { status: 400 });
    }

    const authorRole = auth.context.orgRole === 'creator' ? 'Creator' : 'Brand Reviewer';
    const comment = addComment(id, auth.context.user.id, auth.context.user.name, authorRole, body.text.trim());
    return NextResponse.json({ ok: true, comment }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to add comment.' }, { status: 500 });
  }
}
