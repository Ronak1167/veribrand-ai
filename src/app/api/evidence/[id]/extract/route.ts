import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import {
  getEvidenceById,
  addEvidenceCandidateFact,
  getEvidenceCandidateFacts,
  updateEvidenceProvenanceState,
} from '@/lib/db/database';
import { getTenantContextFromRequest, requireTenantRole } from '@/lib/auth/session';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const roleCheck = requireTenantRole(auth.context, ['creator', 'reviewer', 'admin']);
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

    if (auth.context.orgRole === 'creator' && evidence.uploadedBy !== auth.context.user.id) {
      return NextResponse.json({ ok: false, error: 'You may only extract facts from your own evidence.' }, { status: 403 });
    }

    if (!evidence.storagePath || !fs.existsSync(evidence.storagePath)) {
      return NextResponse.json({
        ok: false,
        error: 'No uploaded source file attached to this evidence record.',
      }, { status: 400 });
    }

    const apiKey = process.env.VERIBRAND_PYTHON_API_KEY;
    const serviceUrl = process.env.PYTHON_ENGINE_URL;
    if (!apiKey || apiKey.length < 32 || !serviceUrl) {
      return NextResponse.json({ ok: false, error: 'Evidence extraction service is not configured.' }, { status: 503 });
    }
    const form = new FormData();
    const bytes = fs.readFileSync(evidence.storagePath);
    form.append('file', new Blob([bytes], { type: evidence.mimeType || 'application/octet-stream' }), evidence.documentName || 'evidence.bin');
    const extractionResponse = await fetch(`${serviceUrl.replace(/\/$/, '')}/api/extract`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey },
      body: form,
      signal: AbortSignal.timeout(45000),
      cache: 'no-store',
    });
    if (!extractionResponse.ok) {
      return NextResponse.json({ ok: false, error: 'Evidence extraction service could not process this document.' }, { status: extractionResponse.status === 415 ? 415 : 422 });
    }
    const parsed = await extractionResponse.json();
    if (!parsed || !Array.isArray(parsed.facts)) {
      return NextResponse.json({ ok: false, error: 'Fact extraction engine produced invalid output.' }, { status: 502 });
    }

    const existingCandidates = getEvidenceCandidateFacts(id, evidence.organizationId);
    const existingKeys = new Set(existingCandidates.map(c => `${c.claimType}:${c.extractedValue.toLowerCase()}:${c.pageNumber || 1}`));

    const insertedFacts = [];
    for (const fact of parsed.facts) {
      const factKey = `${fact.claimType}:${String(fact.extractedValue).toLowerCase()}:${fact.pageNumber || 1}`;
      if (existingKeys.has(factKey)) continue;

      const created = addEvidenceCandidateFact({
        organizationId: evidence.organizationId || auth.context.organizationId,
        evidenceId: id,
        metricId: evidence.metricId,
        claimType: fact.claimType,
        extractedClaim: fact.extractedClaim,
        extractedValue: fact.extractedValue,
        unit: fact.unit,
        pageNumber: fact.pageNumber,
        textExcerpt: fact.textExcerpt,
        confidence: fact.confidence,
        extractionMethod: fact.extractionMethod,
        status: 'unverified',
      });
      insertedFacts.push(created);
      existingKeys.add(factKey);
    }

    if (evidence.provenanceState === 'uploaded') {
      updateEvidenceProvenanceState(id, 'extracted');
    }

    const allCandidates = getEvidenceCandidateFacts(id, evidence.organizationId);

    return NextResponse.json({
      ok: true,
      extractedCount: parsed.facts.length,
      newInsertedCount: insertedFacts.length,
      candidates: allCandidates,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Fact extraction failed.';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
