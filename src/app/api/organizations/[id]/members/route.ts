import { NextRequest, NextResponse } from 'next/server';
import { getTenantContextFromRequest } from '@/lib/auth/session';
import {
  getOrganizationById,
  getOrganizationMembers,
  addOrganizationMember,
  createOrganizationInvitation,
  getUserByEmail,
  getUserMembership,
} from '@/lib/db/database';
import { OrganizationRole } from '@/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orgId } = await params;
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  // Verify access to this org
  if (auth.context.user.role !== 'admin') {
    const membership = getUserMembership(orgId, auth.context.user.id);
    if (!membership) {
      return NextResponse.json({ ok: false, error: 'Access denied: Not a member of this organization.' }, { status: 403 });
    }
  }

  const org = getOrganizationById(orgId);
  if (!org) {
    return NextResponse.json({ ok: false, error: 'Organization not found.' }, { status: 404 });
  }

  const members = getOrganizationMembers(orgId);
  return NextResponse.json({ ok: true, organizationId: orgId, members });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orgId } = await params;
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  // Verify caller has admin/owner rights in this org
  if (auth.context.user.role !== 'admin') {
    const membership = getUserMembership(orgId, auth.context.user.id);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return NextResponse.json({ ok: false, error: 'Forbidden: Admin or Owner role required to manage members.' }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.email !== 'string') {
    return NextResponse.json({ ok: false, error: 'A valid email address is required.' }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  const validRoles: OrganizationRole[] = ['owner', 'admin', 'reviewer', 'creator', 'readonly'];
  const role: OrganizationRole = validRoles.includes(body.role) ? body.role : 'creator';
  const callerMembership = getUserMembership(orgId, auth.context.user.id);
  const isSystemAdmin = auth.context.user.role === 'admin';
  if (role === 'owner' && !isSystemAdmin && callerMembership?.role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'Only an organization owner may grant the owner role.' }, { status: 403 });
  }

  const org = getOrganizationById(orgId);
  if (!org) {
    return NextResponse.json({ ok: false, error: 'Organization not found.' }, { status: 404 });
  }

  // Check if existing user
  const existingUser = getUserByEmail(email);
  if (existingUser) {
    const existingMembership = getUserMembership(orgId, existingUser.id);
    if (existingMembership) {
      return NextResponse.json({ ok: false, error: 'User is already a member of this organization.' }, { status: 409 });
    }

    try {
      const membership = addOrganizationMember({
        orgId,
        userId: existingUser.id,
        role,
        actorId: auth.context.user.id,
      });
      return NextResponse.json({
        ok: true,
        mode: 'added',
        membership,
        user: { id: existingUser.id, name: existingUser.name, email: existingUser.email },
      }, { status: 201 });
    } catch {
      return NextResponse.json({ ok: false, error: 'Failed to add member.' }, { status: 500 });
    }
  }

  // If user does not exist yet, create invitation
  try {
    const invitation = createOrganizationInvitation({
      orgId,
      email,
      role,
      invitedBy: auth.context.user.id,
    });
    return NextResponse.json({
      ok: true,
      mode: 'invited',
      invitation,
    }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to create invitation.' }, { status: 500 });
  }
}
