import { NextRequest, NextResponse } from 'next/server';
import {
  getBrandRuleById,
  updateCustomBrandRule,
  archiveBrandRule,
} from '@/lib/db/database';
import { getTenantContextFromRequest, requireTenantRole } from '@/lib/auth/session';
import type { BrandRule } from '@/types';

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

    return NextResponse.json({ ok: true, rule });
  } catch {
    return NextResponse.json({ ok: false, error: 'Unable to retrieve brand rule.' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const roleCheck = requireTenantRole(auth.context, ['admin', 'owner']);
  if (!roleCheck.allowed) {
    return NextResponse.json({ ok: false, error: roleCheck.error }, { status: roleCheck.status });
  }

  try {
    const { id } = await params;
    const orgId = auth.context.user.role === 'admin' ? undefined : auth.context.organizationId;
    const existing = getBrandRuleById(id, orgId);

    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Brand rule not found in active organization.' }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
    }

    const updated = updateCustomBrandRule({
      id,
      organizationId: existing.organizationId,
      category: body.category as BrandRule['category'],
      title: typeof body.title === 'string' ? body.title.trim() : undefined,
      description: typeof body.description === 'string' ? body.description.trim() : undefined,
      authorityLevel: [1, 2, 3].includes(body.authorityLevel) ? body.authorityLevel : undefined,
      severity: ['critical', 'warning', 'info', 'success'].includes(body.severity) ? body.severity : undefined,
      forbiddenPatterns: Array.isArray(body.forbiddenPatterns) ? body.forbiddenPatterns : undefined,
      approvedAlternative: typeof body.approvedAlternative === 'string' ? body.approvedAlternative.trim() : undefined,
      citation: typeof body.citation === 'string' ? body.citation.trim() : undefined,
      status: ['draft', 'active', 'inactive', 'archived'].includes(body.status) ? body.status : undefined,
      changeRationale: typeof body.changeRationale === 'string' ? body.changeRationale.trim() : undefined,
      updatedBy: auth.context.user.id,
    });

    return NextResponse.json({ ok: true, rule: updated });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to update brand rule.';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const roleCheck = requireTenantRole(auth.context, ['admin', 'owner']);
  if (!roleCheck.allowed) {
    return NextResponse.json({ ok: false, error: roleCheck.error }, { status: roleCheck.status });
  }

  try {
    const { id } = await params;
    const orgId = auth.context.user.role === 'admin' ? undefined : auth.context.organizationId;
    const existing = getBrandRuleById(id, orgId);

    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Brand rule not found in active organization.' }, { status: 404 });
    }

    const archived = archiveBrandRule(id, auth.context.user.id, existing.organizationId);
    return NextResponse.json({ ok: archived, archived, ruleId: id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to archive brand rule.';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
