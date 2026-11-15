import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationAnalytics, getOrganizationById } from '@/lib/db/database';
import { getTenantContextFromRequest } from '@/lib/auth/session';

export async function GET(req: NextRequest) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  try {
    const orgId = auth.context.organizationId;
    const org = getOrganizationById(orgId);
    const analytics = getOrganizationAnalytics(orgId);

    return NextResponse.json({
      ok: true,
      organization: org ? { id: org.id, name: org.name, slug: org.slug } : null,
      analytics,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to compute organization analytics.';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
