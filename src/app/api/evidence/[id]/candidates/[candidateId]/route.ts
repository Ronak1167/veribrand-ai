import { NextRequest, NextResponse } from 'next/server';
import {
  getEvidenceById,
  reviewEvidenceCandidateFact,
} from '@/lib/db/database';
import { getTenantContextFromRequest, requireTenantRole } from '@/lib/auth/session';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; candidateId: string }> }
) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const roleCheck = requireTenantRole(auth.context, ['reviewer', 'admin']);
  if (!roleCheck.allowed) {
    return NextResponse.json({ ok: false, error: roleCheck.error }, { status: roleCheck.status });
  }

  try {
    const { id: evidenceId, candidateId } = await params;
    const orgId = auth.context.user.role === 'admin' ? undefined : auth.context.organizationId;
    const evidence = getEvidenceById(evidenceId, orgId);

    if (!evidence) {
      return NextResponse.json({ ok: false, error: 'Evidence document not found.' }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { status, reviewNotes, approvedValue, validFrom, validUntil } = body;
    if (status !== 'approved' && status !== 'rejected') {
      return NextResponse.json({
        ok: false,
        error: 'Status must be "approved" or "rejected".',
      }, { status: 400 });
    }

    if (validFrom && (typeof validFrom !== 'string' || Number.isNaN(Date.parse(validFrom)))) {
      return NextResponse.json({ ok: false, error: 'validFrom must be a valid date.' }, { status: 400 });
    }
    if (validUntil && (typeof validUntil !== 'string' || Number.isNaN(Date.parse(validUntil)))) {
      return NextResponse.json({ ok: false, error: 'validUntil must be a valid date.' }, { status: 400 });
    }
    if (validFrom && validUntil && Date.parse(validUntil) < Date.parse(validFrom)) {
      return NextResponse.json({ ok: false, error: 'validUntil cannot precede validFrom.' }, { status: 400 });
    }

    const success = reviewEvidenceCandidateFact({
      factId: candidateId,
      orgId: evidence.organizationId || auth.context.organizationId,
      reviewerId: auth.context.user.id,
      status,
      reviewNotes: typeof reviewNotes === 'string' ? reviewNotes.trim() : undefined,
      approvedValue: typeof approvedValue === 'string' ? approvedValue.trim() : undefined,
      validFrom: typeof validFrom === 'string' ? validFrom : undefined,
      validUntil: typeof validUntil === 'string' ? validUntil : undefined,
    });

    if (!success) {
      return NextResponse.json({ ok: false, error: 'Candidate fact not found or failed to update.' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      candidateId,
      evidenceId,
      status,
      approvedValue: approvedValue || undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to review candidate fact.';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
