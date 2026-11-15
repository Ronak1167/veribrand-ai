import { NextRequest, NextResponse } from 'next/server';
import { getTenantContextFromRequest, requireTenantRole } from '@/lib/auth/session';
import { getAllSubmissions } from '@/lib/db/database';

export async function GET(req: NextRequest) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const roleCheck = requireTenantRole(auth.context, ['reviewer', 'admin', 'owner']);
  if (!roleCheck.allowed) {
    return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
  }

  const totals = new Map<string, { ruleId: string; ruleTitle: string; category: string; triggers: number; appeals: number; accepted: number; rejected: number }>();
  const submissions = getAllSubmissions(auth.context.organizationId);

  for (const submission of submissions) {
    const findings = submission.auditResult?.findings || [];
    for (const finding of findings) {
      const key = finding.ruleId || finding.guidelineTitle || finding.category;
      const row = totals.get(key) || { ruleId: key, ruleTitle: finding.guidelineTitle || key, category: finding.category, triggers: 0, appeals: 0, accepted: 0, rejected: 0 };
      row.triggers++;
      totals.set(key, row);
    }
    for (const decision of submission.appealDecisions || []) {
      const finding = findings.find((item) => item.id === decision.findingId);
      const key = finding?.ruleId || finding?.guidelineTitle || finding?.category;
      if (!key) continue;
      const row = totals.get(key);
      if (!row) continue;
      row.appeals++;
      if (decision.decision === 'accepted') row.accepted++;
      else row.rejected++;
    }
  }

  const metrics = [...totals.values()].map((row) => ({
    ruleId: row.ruleId,
    ruleTitle: row.ruleTitle,
    category: row.category,
    totalTriggers: row.triggers,
    overrideCount: row.accepted,
    overrideRatePct: row.triggers ? Math.round(row.accepted / row.triggers * 1000) / 10 : 0,
    confusionScore: row.triggers ? Math.round(row.appeals / row.triggers * 100) : 0,
    status: row.appeals > 0 ? 'monitor' : 'clear',
    recommendedClarification: 'Review appeal rationales and clarify the rule where decisions indicate uncertainty.',
    appealCount: row.appeals,
    acceptedAppeals: row.accepted,
    rejectedAppeals: row.rejected,
  })).sort((a, b) => b.totalTriggers - a.totalTriggers);

  return NextResponse.json({
    organizationId: auth.context.organizationId,
    metrics,
    source: 'persisted submission findings and reviewer appeal decisions',
    sampleSize: submissions.length,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
