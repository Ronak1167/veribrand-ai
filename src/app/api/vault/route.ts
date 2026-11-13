// VeriBrand AI — REST API Endpoint for Brand Vault
// Route: GET /api/vault

import { NextResponse } from 'next/server';
import {
  BRAND_RULES,
  VERIFIED_METRICS,
  APPROVED_PALETTE,
  FORBIDDEN_HEX_CODES,
  PRESET_DRAFTS,
} from '@/lib/engine/brand-vault-data';

export async function GET() {
  return NextResponse.json({
    brandName: 'Inkloom AI & VeriBrand AI',
    vaultVersion: 'FY26-Q4.1',
    rulesCount: BRAND_RULES.length,
    metricsCount: VERIFIED_METRICS.length,
    rules: BRAND_RULES,
    metrics: VERIFIED_METRICS,
    palette: APPROVED_PALETTE,
    forbiddenHexCodes: FORBIDDEN_HEX_CODES,
    presetDrafts: PRESET_DRAFTS,
  });
}
