import { NextRequest, NextResponse } from 'next/server';
import { getTenantContextFromRequest, requireTenantRole } from '@/lib/auth/session';
import { createCustomBrandRule, getCustomBrandRules, getApprovedEvidenceMetrics, getOrganizationById } from '@/lib/db/database';
import { BRAND_RULES, APPROVED_PALETTE, FORBIDDEN_HEX_CODES, PRESET_DRAFTS } from '@/lib/engine/brand-vault-data';
import type { BrandRule } from '@/types';

export async function GET(req: NextRequest) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const orgId = auth.context.organizationId;
  const org = getOrganizationById(orgId);
  const customRules = getCustomBrandRules(orgId);
  const metrics = getApprovedEvidenceMetrics(orgId);

  return NextResponse.json({
    organizationId: orgId,
    brandName: org?.brandName || org?.name || 'Workspace Brand Vault',
    vaultVersion: 'DB-backed multi-tenant v2.0',
    rules: [...BRAND_RULES, ...customRules],
    customRules,
    metrics,
    rulesCount: BRAND_RULES.length + customRules.length,
    metricsCount: metrics.length,
    palette: APPROVED_PALETTE,
    forbiddenHexCodes: FORBIDDEN_HEX_CODES,
    presetDrafts: PRESET_DRAFTS,
    notice: 'Only reviewer-approved, checksum-intact uploaded evidence facts are trusted. Built-in Inkloom rules are reference templates; custom rules in active status are enforced for this organization.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const roleCheck = requireTenantRole(auth.context, ['admin', 'owner']);
  if (!roleCheck.allowed) {
    return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'A JSON object is required.' }, { status: 400 });
  }

  const categories: BrandRule['category'][] = ['claim_verification', 'tone_drift', 'terminology', 'visual_token', 'legal'];
  const severities: BrandRule['severity'][] = ['critical', 'warning', 'info', 'success'];
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const patterns = Array.isArray(body.forbiddenPatterns)
    ? body.forbiddenPatterns.filter((v: unknown): v is string => typeof v === 'string').map((v: string) => v.trim()).filter(Boolean)
    : [];
  const approvedAlternative = typeof body.approvedAlternative === 'string' ? body.approvedAlternative.trim() : '';
  const citation = typeof body.citation === 'string' ? body.citation.trim() : '';
  const category = body.category as BrandRule['category'];
  const severity = body.severity as BrandRule['severity'];
  const authorityLevel = body.authorityLevel;

  if (
    !title || title.length > 120 ||
    !description || description.length > 1000 ||
    !patterns.length || patterns.length > 30 || patterns.some((p: string) => p.length > 100) ||
    !approvedAlternative || approvedAlternative.length > 300 ||
    !citation || citation.length > 300 ||
    !categories.includes(category) ||
    !severities.includes(severity) ||
    ![1, 2, 3].includes(authorityLevel)
  ) {
    return NextResponse.json({
      error: 'Provide a valid title, description, category, severity, authority level, at least one short forbidden pattern, approved alternative and source citation.',
    }, { status: 400 });
  }

  try {
    const orgId = auth.context.organizationId;
    const rule = createCustomBrandRule({
      organizationId: orgId,
      title,
      description,
      category,
      severity,
      authorityLevel,
      forbiddenPatterns: patterns,
      approvedAlternative,
      citation,
      createdBy: auth.context.user.id,
      effectiveFrom: body.effectiveFrom,
      effectiveUntil: body.effectiveUntil,
    });
    return NextResponse.json({ ok: true, rule }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to save brand rule.' }, { status: 500 });
  }
}
