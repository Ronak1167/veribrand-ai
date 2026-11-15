import { NextRequest, NextResponse } from 'next/server';
import { getTenantContextFromRequest } from '@/lib/auth/session';
import {
  getOrganizationById,
  updateOrganization,
  getUserMembership,
  getOrganizationInvitations,
} from '@/lib/db/database';
import type { OrganizationInvitation } from '@/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orgId } = await params;
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  // Verify access: caller must be global admin or member of this org
  let callerRole = 'readonly';
  if (auth.context.user.role === 'admin') {
    callerRole = 'owner';
  } else {
    const membership = getUserMembership(orgId, auth.context.user.id);
    if (!membership) {
      return NextResponse.json({ ok: false, error: 'Forbidden: Access denied to foreign organization.' }, { status: 403 });
    }
    callerRole = membership.role;
  }

  const org = getOrganizationById(orgId);
  if (!org) {
    return NextResponse.json({ ok: false, error: 'Organization not found.' }, { status: 404 });
  }

  // Include pending invitations if caller is owner or admin
  let invitations: OrganizationInvitation[] = [];
  if (callerRole === 'owner' || callerRole === 'admin') {
    invitations = getOrganizationInvitations(orgId);
  }

  return NextResponse.json({
    ok: true,
    organization: org,
    userRole: callerRole,
    invitations,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orgId } = await params;
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  // Verify caller has owner or admin role in this org
  if (auth.context.user.role !== 'admin') {
    const membership = getUserMembership(orgId, auth.context.user.id);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return NextResponse.json({ ok: false, error: 'Forbidden: Admin or Owner role required to update brand profile.' }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'Valid JSON body required.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' && body.name.trim().length >= 2 ? body.name.trim() : undefined;
  const brandName = typeof body.brandName === 'string' ? body.brandName.trim() : undefined;
  const logoUrl = typeof body.logoUrl === 'string' ? body.logoUrl.trim() : undefined;
  const settings = body.settings && typeof body.settings === 'object' ? body.settings : undefined;

  try {
    const updated = updateOrganization({
      id: orgId,
      name,
      brandName,
      logoUrl,
      settings,
      actorId: auth.context.user.id,
    });

    if (!updated) {
      return NextResponse.json({ ok: false, error: 'Organization not found.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, organization: updated });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to update organization.';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
