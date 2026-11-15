// VeriBrand AI — Server-Side Session & Multi-Tenant Role-Based Authorization
import { NextRequest } from 'next/server';
import { getSession, getUserMembership } from '@/lib/db/database';
import { User, UserRole, OrganizationRole } from '@/types';

export interface TenantContext {
  user: User;
  token: string;
  organizationId: string;
  orgRole: OrganizationRole;
  organizations: Array<{ id: string; name: string; slug: string; role: OrganizationRole }>;
}

export function getSessionFromRequest(req: NextRequest): {
  user: User;
  token: string;
  activeOrganizationId: string;
  activeRole: OrganizationRole;
  organizations: Array<{ id: string; name: string; slug: string; role: OrganizationRole }>;
} | null {
  let token: string | null = null;

  // 1. Check Bearer Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  // 2. Check veribrand_session cookie
  if (!token) {
    const cookie = req.cookies.get('veribrand_session');
    if (cookie && cookie.value) {
      token = cookie.value;
    }
  }

  if (!token) return null;

  const session = getSession(token);
  if (!session) return null;

  return {
    user: session.user,
    token: session.token,
    activeOrganizationId: session.activeOrganizationId,
    activeRole: session.activeRole,
    organizations: session.organizations,
  };
}

export function getTenantContextFromRequest(req: NextRequest): {
  authorized: boolean;
  status: number;
  error?: string;
  context?: TenantContext;
} {
  const session = getSessionFromRequest(req);
  if (!session) {
    return {
      authorized: false,
      status: 401,
      error: 'Authentication required. Please sign in with a valid session.',
    };
  }

  // Determine requested organization ID from header, query param, or active session org
  const requestedOrg = req.headers.get('x-organization-id')?.trim()
    || new URL(req.url).searchParams.get('organizationId')?.trim()
    || session.activeOrganizationId
    || 'ORG-DEFAULT';

  // System admin role check: Admins have owner privileges across orgs
  if (session.user.role === 'admin') {
    return {
      authorized: true,
      status: 200,
      context: {
        user: session.user,
        token: session.token,
        organizationId: requestedOrg,
        orgRole: 'owner',
        organizations: session.organizations,
      },
    };
  }

  // Verify membership in requested tenant
  const membership = getUserMembership(requestedOrg, session.user.id);
  if (!membership) {
    return {
      authorized: false,
      status: 403,
      error: `Access denied: You do not belong to organization '${requestedOrg}'.`,
    };
  }

  return {
    authorized: true,
    status: 200,
    context: {
      user: session.user,
      token: session.token,
      organizationId: requestedOrg,
      orgRole: membership.role,
      organizations: session.organizations,
    },
  };
}

export function requireTenantRole(
  context: TenantContext | undefined,
  allowedRoles: OrganizationRole[]
): { allowed: boolean; status: number; error: string } {
  if (!context) {
    return {
      allowed: false,
      status: 401,
      error: 'Authentication required. Please sign in with a valid session.',
    };
  }

  // Owner has full privileges for all operations
  if (context.orgRole === 'owner') {
    return { allowed: true, status: 200, error: '' };
  }

  // Admin has permissions for admin, reviewer, creator, and readonly operations
  if (context.orgRole === 'admin' && (allowedRoles.includes('admin') || allowedRoles.includes('reviewer') || allowedRoles.includes('creator') || allowedRoles.includes('readonly'))) {
    return { allowed: true, status: 200, error: '' };
  }

  // Check exact role membership
  if (allowedRoles.includes(context.orgRole)) {
    return { allowed: true, status: 200, error: '' };
  }

  return {
    allowed: false,
    status: 403,
    error: `Forbidden: Organization role '${context.orgRole}' lacks permission. Required roles: ${allowedRoles.join(', ')}.`,
  };
}

// Backward-compatible global role check
export function requireRole(
  user: User | null,
  allowedRoles: UserRole[]
): { allowed: boolean; status: number; error: string } {
  if (!user) {
    return {
      allowed: false,
      status: 401,
      error: 'Authentication required. Please log in with a valid session.',
    };
  }

  if (user.role === 'admin' || allowedRoles.includes(user.role)) {
    return { allowed: true, status: 200, error: '' };
  }

  return {
    allowed: false,
    status: 403,
    error: `Forbidden: User role '${user.role}' lacks permission. Required roles: ${allowedRoles.join(', ')}.`,
  };
}
