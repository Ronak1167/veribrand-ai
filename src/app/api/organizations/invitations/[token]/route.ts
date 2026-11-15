import { NextRequest, NextResponse } from 'next/server';
import { getTenantContextFromRequest } from '@/lib/auth/session';
import {
  getOrganizationInvitationByToken,
  acceptOrganizationInvitation,
  getOrganizationById,
  getUserMembership,
  revokeOrganizationInvitation,
} from '@/lib/db/database';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const invite = getOrganizationInvitationByToken(token);
  if (!invite) {
    return NextResponse.json({ ok: false, error: 'Invitation not found, expired, or already used.' }, { status: 404 });
  }

  const org = getOrganizationById(invite.organizationId);

  return NextResponse.json({
    ok: true,
    invitation: {
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      organization: org ? { id: org.id, name: org.name, slug: org.slug } : null,
    },
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const invite = getOrganizationInvitationByToken(token);
  if (!invite) {
    return NextResponse.json({ ok: false, error: 'Invitation not found or already inactive.' }, { status: 404 });
  }

  // Verify caller has admin/owner rights in this org
  if (auth.context.user.role !== 'admin') {
    const membership = getUserMembership(invite.organizationId, auth.context.user.id);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return NextResponse.json({ ok: false, error: 'Forbidden: Admin or Owner role required to revoke invitations.' }, { status: 403 });
    }
  }

  const success = revokeOrganizationInvitation({
    token,
    actorId: auth.context.user.id,
  });

  if (!success) {
    return NextResponse.json({ ok: false, error: 'Failed to revoke invitation.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: 'Invitation revoked successfully.',
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const invite = getOrganizationInvitationByToken(token);
  if (!invite) {
    return NextResponse.json({ ok: false, error: 'Invitation not found, expired, or already used.' }, { status: 404 });
  }

  // Accept invitation
  const success = acceptOrganizationInvitation({
    token,
    userId: auth.context.user.id,
    email: auth.context.user.email,
  });

  if (!success) {
    return NextResponse.json({ ok: false, error: 'Failed to accept invitation or already accepted.' }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    organizationId: invite.organizationId,
    role: invite.role,
    message: 'Invitation accepted successfully.',
  });
}
