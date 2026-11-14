import { NextRequest, NextResponse } from 'next/server';
import { getSubmissionById } from '@/lib/db/database';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sub = getSubmissionById(id);
    if (!sub) {
      return NextResponse.json({ error: `Submission with ID '${id}' not found.` }, { status: 404 });
    }
    return NextResponse.json(sub);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
