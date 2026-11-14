import { NextRequest, NextResponse } from 'next/server';
import { getSubmissionById, getSubmissionOwnerId, addComment } from '@/lib/db/database';
import { getSessionFromRequest } from '@/lib/auth/session';
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { id } = await params;
    if (!getSubmissionById(id)) return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
    if (session.user.role === 'creator' && getSubmissionOwnerId(id) !== session.user.id) return NextResponse.json({ error: 'You may only comment on your own submissions.' }, { status: 403 });
    const body = await req.json().catch(() => null);
    if (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 5000) return NextResponse.json({ error: 'Comment must contain 1–5000 characters.' }, { status: 400 });
    const comment = addComment(id, session.user.id, session.user.name, session.user.role === 'creator' ? 'Creator' : 'Brand Reviewer', body.text.trim());
    return NextResponse.json({ ok: true, comment }, { status: 201 });
  } catch { return NextResponse.json({ error: 'Unable to add comment.' }, { status: 500 }); }
}
