import { NextRequest, NextResponse } from 'next/server';
import { getTenantContextFromRequest } from '@/lib/auth/session';
import { updateSessionActiveOrganization, getOrganizationById, getUserMembership } from '@/lib/db/database';

export async function POST(req: NextRequest) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.organizationId !== 'string') {
    return NextResponse.json({ ok: false, error: 'A valid organizationId string is required.' }, { status: 400 });
  }

  const targetOrgId = body.organizationId.trim();
  const org = getOrganizationById(targetOrgId);
  if (!org) {
    return NextResponse.json({ ok: false, error: 'Organization not found.' }, { status: 404 });
  }

  // System admin can switch to any organization
  if (auth.context.user.role !== 'admin') {
    const membership = getUserMembership(targetOrgId, auth.context.user.id);
    if (!membership) {
      return NextResponse.json({ ok: false, error: 'You are not a member of this organization.' }, { status: 403 });
    }
  }

  const success = updateSessionActiveOrganization(auth.context.token, auth.context.user.id, targetOrgId);
  if (!success && auth.context.user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Failed to update active organization.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    activeOrganizationId: targetOrgId,
    organization: org,
  });
}
