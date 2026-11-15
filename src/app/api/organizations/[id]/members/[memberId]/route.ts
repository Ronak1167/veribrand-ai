import { NextRequest, NextResponse } from 'next/server';
import { getTenantContextFromRequest } from '@/lib/auth/session';
import {
  getUserMembership,
  updateOrganizationMemberRole,
  removeOrganizationMember,
} from '@/lib/db/database';
import { OrganizationRole } from '@/types';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id: orgId, memberId } = await params;
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  // Verify caller's permissions
  let callerRole: OrganizationRole = 'readonly';
  if (auth.context.user.role === 'admin') {
    callerRole = 'owner';
  } else {
    const callerMembership = getUserMembership(orgId, auth.context.user.id);
    if (!callerMembership || (callerMembership.role !== 'owner' && callerMembership.role !== 'admin')) {
      return NextResponse.json({ ok: false, error: 'Forbidden: Admin or Owner role required.' }, { status: 403 });
    }
    callerRole = callerMembership.role;
  }

  const targetMembership = getUserMembership(orgId, memberId);
  if (!targetMembership) {
    return NextResponse.json({ ok: false, error: 'Member not found in organization.' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.role !== 'string') {
    return NextResponse.json({ ok: false, error: 'Valid role string required.' }, { status: 400 });
  }

  const validRoles: OrganizationRole[] = ['owner', 'admin', 'reviewer', 'creator', 'readonly'];
  const newRole: OrganizationRole = body.role as OrganizationRole;
  if (!validRoles.includes(newRole)) {
    return NextResponse.json({ ok: false, error: `Invalid role. Allowed roles: ${validRoles.join(', ')}` }, { status: 400 });
  }

  // Admins cannot alter owner roles or promote to owner
  if (callerRole === 'admin' && (targetMembership.role === 'owner' || newRole === 'owner')) {
    return NextResponse.json({ ok: false, error: 'Forbidden: Only owners can manage owner roles.' }, { status: 403 });
  }

  try {
    const success = updateOrganizationMemberRole({
      orgId,
      targetUserId: memberId,
      role: newRole,
      actorId: auth.context.user.id,
    });
    return NextResponse.json({ ok: success, updated: success, role: newRole });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to update member role.';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id: orgId, memberId } = await params;
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  // Verify caller's permissions
  let callerRole: OrganizationRole = 'readonly';
  if (auth.context.user.role === 'admin') {
    callerRole = 'owner';
  } else {
    const callerMembership = getUserMembership(orgId, auth.context.user.id);
    if (!callerMembership || (callerMembership.role !== 'owner' && callerMembership.role !== 'admin')) {
      return NextResponse.json({ ok: false, error: 'Forbidden: Admin or Owner role required.' }, { status: 403 });
    }
    callerRole = callerMembership.role;
  }

  const targetMembership = getUserMembership(orgId, memberId);
  if (!targetMembership) {
    return NextResponse.json({ ok: false, error: 'Member not found in organization.' }, { status: 404 });
  }

  // Admin cannot remove owner
  if (callerRole === 'admin' && targetMembership.role === 'owner') {
    return NextResponse.json({ ok: false, error: 'Forbidden: Only owners can remove another owner.' }, { status: 403 });
  }

  try {
    const success = removeOrganizationMember({
      orgId,
      targetUserId: memberId,
      actorId: auth.context.user.id,
    });
    return NextResponse.json({ ok: success, removed: success });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to remove member.';
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
