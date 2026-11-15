#!/usr/bin/env node
// VeriBrand AI — Advanced Visual Verification Test Suite
import assert from 'node:assert/strict';
import {
  VisualVerifier,
  calculateContrastRatio,
  suggestAccessibleColor,
} from '../src/lib/engine/visual-verifier.ts';

console.log('='.repeat(70));
console.log('  VERIBRAND AI — ADVANCED VISUAL VERIFICATION TEST SUITE');
console.log('='.repeat(70));

const verifier = new VisualVerifier();

// -----------------------------------------------------------------------------
// TEST 1: WCAG 2.2 AA Contrast & Remediation Suggestion
// -----------------------------------------------------------------------------
console.log('\n[TEST 1] WCAG 2.2 AA Contrast & Remediation Calculation...');
const blackOnWhite = calculateContrastRatio('#000000', '#FFFFFF');
assert.equal(blackOnWhite, 21.0, 'Pure black on white must be 21:1');

const lowContrastGray = calculateContrastRatio('#888888', '#FFFFFF');
assert.ok(lowContrastGray < 4.5, `Low contrast gray should fail AA: got ${lowContrastGray}:1`);

const suggested = suggestAccessibleColor('#888888', '#FFFFFF', 4.5);
const remediatedRatio = calculateContrastRatio(suggested, '#FFFFFF');
assert.ok(remediatedRatio >= 4.5, `Remediated color ${suggested} must meet or exceed 4.5:1 (got ${remediatedRatio}:1)`);
console.log(`  ✓ Contrast: #888888 on #FFFFFF was ${lowContrastGray}:1 -> Remediated to ${suggested} (${remediatedRatio}:1)`);

// -----------------------------------------------------------------------------
// TEST 2: Forbidden Hex Colors Detection
// -----------------------------------------------------------------------------
console.log('\n[TEST 2] Forbidden Hex Colors Detection (#FF0033 Rogue Crimson)...');
const forbiddenRes = verifier.verify({
  assetType: 'marketing_image',
  canvasWidth: 1200,
  canvasHeight: 630,
  backgroundColor: '#FFFFFF',
  dominantColors: ['#0066FF', '#FF0033'], // #FF0033 is forbidden
});
assert.equal(forbiddenRes.verdict, 'FAIL', 'Forbidden color must cause FAIL verdict');
const forbiddenFinding = forbiddenRes.findings.find((f) => f.category === 'forbidden_colors');
assert.ok(forbiddenFinding, 'Must report forbidden_colors finding');
assert.equal(forbiddenFinding.severity, 'critical');
console.log(`  ✓ Successfully caught forbidden color with critical severity: "${forbiddenFinding.message}"`);

// -----------------------------------------------------------------------------
// TEST 3: Logo Identity & Clear Space Violation
// -----------------------------------------------------------------------------
console.log('\n[TEST 3] Logo Clear Space Boundary Enforcement...');
// Logo placed at top-left x=4, y=4 of a 1200x630 canvas (violates 12% padding of 200px = 24px)
const logoClearSpaceViolation = verifier.verify({
  assetType: 'marketing_image',
  canvasWidth: 1200,
  canvasHeight: 630,
  logoBoundingBox: {
    id: 'main-logo',
    role: 'logo',
    x: 4, // too close to left margin!
    y: 4, // too close to top margin!
    width: 200,
    height: 60,
  },
  dominantColors: ['#0066FF'],
});
const logoFinding = logoClearSpaceViolation.findings.find((f) => f.category === 'logo_identity');
assert.ok(logoFinding, 'Must report logo_identity finding');
assert.equal(logoFinding.passed, false, 'Clear space check must fail');
console.log(`  ✓ Caught clear space boundary violation: "${logoFinding.message}"`);

// -----------------------------------------------------------------------------
// TEST 4: Typography Hierarchy & Font Compliance
// -----------------------------------------------------------------------------
console.log('\n[TEST 4] Typography Verification (Hierarchy & Unapproved Font)...');
const typoViolation = verifier.verify({
  assetType: 'marketing_image',
  canvasWidth: 1200,
  canvasHeight: 630,
  typography: [
    { role: 'h1', fontFamily: 'Comic Sans MS', fontSizePx: 24, lineHeightPx: 28 }, // Unapproved font + too small for H1
    { role: 'h2', fontFamily: 'Inter', fontSizePx: 32, lineHeightPx: 40 }, // Inversion: H2 > H1!
    { role: 'body', fontFamily: 'Inter', fontSizePx: 12, lineHeightPx: 14 }, // Body < 14px!
  ],
  dominantColors: ['#0066FF'],
});
const fontFinding = typoViolation.findings.find((f) => f.id.includes('FIND-TYPO-FONT'));
assert.ok(fontFinding, 'Must flag unapproved font Comic Sans MS');

const hierarchyFinding = typoViolation.findings.find((f) => f.id === 'FIND-TYPO-HIERARCHY');
assert.ok(hierarchyFinding, 'Must flag hierarchy inversion where H2 > H1');

const bodySizeFinding = typoViolation.findings.find((f) => f.id.includes('FIND-TYPO-SIZE-body'));
assert.ok(bodySizeFinding, 'Must flag body font size under 14px');
console.log(`  ✓ Typography hierarchy inversion & unapproved font flagged correctly.`);

// -----------------------------------------------------------------------------
// TEST 5: Semantic Layout Collision (AABB Overlap)
// -----------------------------------------------------------------------------
console.log('\n[TEST 5] Layout Overlap & Collision Detection...');
const layoutCollision = verifier.verify({
  assetType: 'marketing_image',
  canvasWidth: 1200,
  canvasHeight: 630,
  elements: [
    { id: 'headline', role: 'headline', x: 50, y: 50, width: 400, height: 100 },
    { id: 'promo-badge', role: 'cta', x: 200, y: 80, width: 200, height: 80 }, // Overlaps headline!
  ],
  dominantColors: ['#0066FF'],
});
const collisionFinding = layoutCollision.findings.find((f) => f.category === 'semantic_layout' && f.severity === 'critical');
assert.ok(collisionFinding, 'Must detect severe element collision');
console.log(`  ✓ Detected severe layout collision: "${collisionFinding.message}"`);

// -----------------------------------------------------------------------------
// TEST 6: Perfect Compliant Asset
// -----------------------------------------------------------------------------
console.log('\n[TEST 6] Fully Compliant Brand Asset Verification...');
const perfectAsset = verifier.verify({
  assetType: 'marketing_image',
  canvasWidth: 1200,
  canvasHeight: 630,
  backgroundColor: '#FFFFFF',
  logoBoundingBox: {
    id: 'logo',
    role: 'logo',
    x: 48,
    y: 48,
    width: 180,
    height: 48,
  },
  typography: [
    { role: 'h1', fontFamily: 'Plus Jakarta Sans', fontSizePx: 36, lineHeightPx: 48 },
    { role: 'h2', fontFamily: 'Inter', fontSizePx: 24, lineHeightPx: 32 },
    { role: 'body', fontFamily: 'Inter', fontSizePx: 16, lineHeightPx: 24 },
  ],
  elements: [
    { id: 'logo-box', role: 'logo', x: 48, y: 48, width: 180, height: 48 },
    { id: 'headline', role: 'headline', x: 48, y: 140, width: 450, height: 80 },
    { id: 'cta-btn', role: 'cta', x: 48, y: 380, width: 180, height: 48 },
    { id: 'card-tr', role: 'image', x: 700, y: 60, width: 350, height: 200 },
    { id: 'card-br', role: 'image', x: 700, y: 340, width: 350, height: 200 },
  ],
  dominantColors: ['#0066FF', '#1E293B'],
});
assert.equal(perfectAsset.verdict, 'PASS', 'Clean asset should get PASS verdict');
assert.ok(perfectAsset.overallScore >= 85, `Score should be >= 85 (got ${perfectAsset.overallScore})`);
assert.equal(perfectAsset.compliant, true);
console.log(`  ✓ Compliant asset verified with score: ${perfectAsset.overallScore}/100, verdict: ${perfectAsset.verdict}`);

console.log('\n' + '='.repeat(70));
console.log('  ALL ADVANCED VISUAL VERIFICATION TESTS PASSED CLEANLY (6/6)');
console.log('='.repeat(70));
