import { NextRequest, NextResponse } from 'next/server';
import { getBrandRuleById, getBrandRuleVersions, updateCustomBrandRule } from '@/lib/db/database';
import { getTenantContextFromRequest } from '@/lib/auth/session';

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
    const rule = getBrandRuleById(id, orgId);

    if (!rule) {
      return NextResponse.json({ ok: false, error: 'Brand rule not found.' }, { status: 404 });
    }

    const versions = getBrandRuleVersions(id, rule.organizationId);
    return NextResponse.json({ ok: true, ruleId: id, currentVersion: rule.version, versions });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to retrieve rule versions.' }, { status: 500 });
  }
}


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status || 401 });
  }
  if (!['owner', 'admin'].includes(auth.context.orgRole)) {
    return NextResponse.json({ ok: false, error: 'Only organization owners and admins can restore rule versions.' }, { status: 403 });
  }
  try {
    const { id } = await params;
    const rule = getBrandRuleById(id, auth.context.organizationId);
    if (!rule) return NextResponse.json({ ok: false, error: 'Brand rule not found.' }, { status: 404 });
    const body = await req.json().catch(() => null);
    const versionNumber = Number(body?.version);
    if (!Number.isInteger(versionNumber) || versionNumber < 1) {
      return NextResponse.json({ ok: false, error: 'A valid historical version number is required.' }, { status: 400 });
    }
    const historical = getBrandRuleVersions(id, auth.context.organizationId).find(item => item.version === versionNumber);
    if (!historical) return NextResponse.json({ ok: false, error: 'Historical version not found.' }, { status: 404 });
    const restored = updateCustomBrandRule({
      id,
      organizationId: auth.context.organizationId,
      category: historical.category,
      title: historical.title,
      description: historical.description,
      authorityLevel: historical.authorityLevel,
      severity: historical.severity,
      forbiddenPatterns: historical.forbiddenPatterns,
      approvedAlternative: historical.approvedAlternative,
      citation: historical.citation,
      status: historical.status === 'archived' ? 'inactive' : historical.status,
      changeRationale: `Restored historical version ${versionNumber}; recorded as a new version.`,
      updatedBy: auth.context.user.id,
    });
    return NextResponse.json({ ok: true, restoredFromVersion: versionNumber, rule: restored });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to restore historical rule version.' }, { status: 500 });
  }
}
