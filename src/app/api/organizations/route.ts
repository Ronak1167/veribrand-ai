import { NextRequest, NextResponse } from 'next/server';
import { getTenantContextFromRequest } from '@/lib/auth/session';
import { getOrganizationsForUser, createOrganization, getOrganizationBySlug } from '@/lib/db/database';

export async function GET(req: NextRequest) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  try {
    const orgs = getOrganizationsForUser(auth.context.user.id);
    return NextResponse.json({
      ok: true,
      activeOrganizationId: auth.context.organizationId,
      organizations: orgs,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Unable to retrieve organizations.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'A JSON object is required.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const slug = typeof body.slug === 'string'
    ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
    : name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const brandName = typeof body.brandName === 'string' ? body.brandName.trim() : `${name} Brand`;

  if (!name || name.length < 2 || name.length > 100) {
    return NextResponse.json({ ok: false, error: 'Organization name must be between 2 and 100 characters.' }, { status: 400 });
  }

  if (!slug || slug.length < 2 || slug.length > 50) {
    return NextResponse.json({ ok: false, error: 'Organization slug must be between 2 and 50 alphanumeric characters.' }, { status: 400 });
  }

  const existingSlug = getOrganizationBySlug(slug);
  if (existingSlug) {
    return NextResponse.json({ ok: false, error: 'An organization with this slug already exists.' }, { status: 409 });
  }

  try {
    const org = createOrganization({
      name,
      slug,
      userId: auth.context.user.id,
      brandName,
      settings: body.settings && typeof body.settings === 'object' ? body.settings : {},
    });

    return NextResponse.json({ ok: true, organization: org }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to create organization.' }, { status: 500 });
  }
}
