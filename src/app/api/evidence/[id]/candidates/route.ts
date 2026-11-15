import { NextRequest, NextResponse } from 'next/server';
import {
  getEvidenceById,
  getEvidenceCandidateFacts,
  addEvidenceCandidateFact,
} from '@/lib/db/database';
import { getTenantContextFromRequest, requireTenantRole } from '@/lib/auth/session';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const orgId = auth.context.user.role === 'admin' ? undefined : auth.context.organizationId;
    const evidence = getEvidenceById(id, orgId);

    if (!evidence) {
      return NextResponse.json({ ok: false, error: 'Evidence document not found.' }, { status: 404 });
    }

    if (auth.context.orgRole === 'creator' && evidence.uploadedBy !== auth.context.user.id) {
      return NextResponse.json({ ok: false, error: 'Access denied to candidate facts.' }, { status: 403 });
    }

    const candidates = getEvidenceCandidateFacts(id, evidence.organizationId);
    return NextResponse.json({ ok: true, evidenceId: id, count: candidates.length, candidates });
  } catch {
    return NextResponse.json({ ok: false, error: 'Unable to retrieve candidate facts.' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const { id } = await params;
    const orgId = auth.context.user.role === 'admin' ? undefined : auth.context.organizationId;
    const evidence = getEvidenceById(id, orgId);

    if (!evidence) {
      return NextResponse.json({ ok: false, error: 'Evidence document not found.' }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: 'Invalid JSON request body.' }, { status: 400 });
    }

    const { claimType, extractedClaim, extractedValue, unit, pageNumber, textExcerpt } = body;
    if (!claimType || !extractedClaim || !extractedValue || !textExcerpt) {
      return NextResponse.json({
        ok: false,
        error: 'claimType, extractedClaim, extractedValue, and textExcerpt are required.',
      }, { status: 400 });
    }

    const fact = addEvidenceCandidateFact({
      organizationId: evidence.organizationId || auth.context.organizationId,
      evidenceId: id,
      metricId: evidence.metricId,
      claimType: String(claimType).trim(),
      extractedClaim: String(extractedClaim).trim(),
      extractedValue: String(extractedValue).trim(),
      unit: unit ? String(unit).trim() : undefined,
      pageNumber: typeof pageNumber === 'number' ? pageNumber : undefined,
      textExcerpt: String(textExcerpt).trim(),
      confidence: 1.0,
      extractionMethod: 'manual',
      status: 'unverified',
    });

    return NextResponse.json({ ok: true, candidate: fact }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to create candidate fact.' }, { status: 500 });
  }
}
