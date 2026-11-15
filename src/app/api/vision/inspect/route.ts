import { NextRequest, NextResponse } from 'next/server';
import { getTenantContextFromRequest } from '@/lib/auth/session';
import { getOrganizationById } from '@/lib/db/database';
import { FORBIDDEN_HEX_CODES } from '@/lib/engine/brand-vault-data';
import { calculateColorDistance } from '@/lib/engine/visual-verifier';

interface VisualRequirement {
  minWidth: number;
  minHeight: number;
  allowedAspectRatios: string[];
  maxAspectRatioTolerance: number;
}

const SPECIFICATIONS: Record<string, VisualRequirement> = {
  logo_icon: { minWidth: 128, minHeight: 128, allowedAspectRatios: ['1:1'], maxAspectRatioTolerance: 0.05 },
  logo_primary: { minWidth: 200, minHeight: 48, allowedAspectRatios: ['3:1', '4:1', '5:1', '2:1'], maxAspectRatioTolerance: 0.15 },
  logo_secondary: { minWidth: 200, minHeight: 48, allowedAspectRatios: ['3:1', '4:1', '5:1', '2:1', '1:1'], maxAspectRatioTolerance: 0.15 },
  logo_monochrome: { minWidth: 200, minHeight: 48, allowedAspectRatios: ['3:1', '4:1', '5:1', '2:1', '1:1'], maxAspectRatioTolerance: 0.15 },
  marketing_image: { minWidth: 800, minHeight: 450, allowedAspectRatios: ['16:9', '1:1', '4:3', '1.91:1', '1.90:1'], maxAspectRatioTolerance: 0.10 },
  banner: { minWidth: 1200, minHeight: 300, allowedAspectRatios: ['4:1', '3:1', '16:9'], maxAspectRatioTolerance: 0.15 },
};

export async function POST(req: NextRequest) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status || 401 });
  }

  const contentType = req.headers.get('content-type') || '';

  // Visual compliance must be derived from the uploaded image bytes. Client-supplied
  // dimensions, colors, bounding boxes, or typography are untrusted and cannot
  // produce a compliance verdict.
  if (contentType.includes('application/json')) {
    return NextResponse.json(
      { ok: false, error: 'Metadata-only visual inspection is disabled. Upload the actual image using multipart/form-data.' },
      { status: 415 }
    );
  }

  // 2. FormData Multipart File Upload Mode
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const assetType = String(form?.get('assetType') || 'marketing_image');
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'Upload an actual PNG, JPEG or WebP image for pixel analysis.' }, { status: 400 });
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) return NextResponse.json({ ok: false, error: 'Image must be between 1 byte and 10 MB.' }, { status: 413 });
  if (!SPECIFICATIONS[assetType]) return NextResponse.json({ ok: false, error: 'Unsupported asset type.' }, { status: 400 });

  const apiKey = process.env.VERIBRAND_PYTHON_API_KEY;
  const serviceUrl = process.env.PYTHON_ENGINE_URL;
  if (!apiKey || apiKey.length < 32 || !serviceUrl) return NextResponse.json({ ok: false, error: 'Visual analysis service is not configured.' }, { status: 503 });

  try {
    const upstream = new FormData();
    upstream.append('file', file, file.name || 'asset.png');
    const response = await fetch(`${serviceUrl.replace(/\/$/, '')}/api/vision/analyze`, {
      method: 'POST', headers: { 'X-API-Key': apiKey }, body: upstream,
      signal: AbortSignal.timeout(20000), cache: 'no-store',
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: 'Image analysis could not process this file.' }, { status: response.status });
    const analysis = await response.json() as { width: number; height: number; aspectRatio: number; dominantColors: Array<{hex:string;pixelShare:number}>; analysisMethod: string; limitations: string[] };

    const findings: Array<{category:string; severity:'critical'|'warning'|'info'; message:string; passed:boolean}> = [];
    const spec = SPECIFICATIONS[assetType];
    const dimsPass = analysis.width >= spec.minWidth && analysis.height >= spec.minHeight;
    findings.push({ category:'dimensions', severity:dimsPass?'info':'critical', passed:dimsPass, message:dimsPass?`Actual image dimensions ${analysis.width}x${analysis.height}px meet the ${spec.minWidth}x${spec.minHeight}px minimum.`:`Actual image dimensions ${analysis.width}x${analysis.height}px are below the ${spec.minWidth}x${spec.minHeight}px minimum.` });
    const ratioPass = spec.allowedAspectRatios.some(value => { const [a,b]=value.split(':').map(Number); const target=a/b; return Math.abs(analysis.aspectRatio-target)/target <= spec.maxAspectRatioTolerance; });
    findings.push({ category:'aspect_ratio', severity:ratioPass?'info':'warning', passed:ratioPass, message:ratioPass?`Actual aspect ratio ${analysis.aspectRatio.toFixed(2)}:1 matches an allowed preset.`:`Actual aspect ratio ${analysis.aspectRatio.toFixed(2)}:1 is outside allowed presets (${spec.allowedAspectRatios.join(', ')}).` });

    // Check forbidden colors from extracted palette
    const detectedForbidden = analysis.dominantColors.filter(color =>
      FORBIDDEN_HEX_CODES.some(f => calculateColorDistance(f.hex, color.hex) < 18)
    );
    if (detectedForbidden.length > 0) {
      findings.push({
        category: 'forbidden_colors',
        severity: 'critical',
        passed: false,
        message: `Detected ${detectedForbidden.length} forbidden hex color(s) in raster pixels: ${detectedForbidden.map(d => d.hex).join(', ')}`
      });
    } else {
      findings.push({
        category: 'forbidden_colors',
        severity: 'info',
        passed: true,
        message: 'No forbidden colors detected in raster image.'
      });
    }

    const org = getOrganizationById(auth.context.organizationId);
    const settings = org?.settings as Record<string, unknown> | undefined;
    const rawPalette = settings?.brandColors ?? settings?.brandPalette;
    const palette = Array.isArray(rawPalette) ? rawPalette.map(item => typeof item === 'string' ? item : (item && typeof item === 'object' && 'hex' in item ? String((item as {hex:unknown}).hex) : '')).filter(value => /^#?[0-9a-fA-F]{6}$/.test(value)).map(value => value.startsWith('#')?value:`#${value}`) : [];
    if (palette.length) {
      const unmatched = analysis.dominantColors.filter(color => color.pixelShare >= 0.05 && Math.min(...palette.map(approved => calculateColorDistance(color.hex, approved))) > 75);
      findings.push({ category:'brand_palette', severity:unmatched.length?'warning':'info', passed:unmatched.length===0, message:unmatched.length?`Pixel sampling found ${unmatched.length} dominant color(s) outside the configured organization palette.`:'Sampled dominant colors are reasonably close to the configured organization palette.' });
    } else {
      findings.push({ category:'brand_palette', severity:'warning', passed:false, message:'No organization brandColors/brandPalette setting is configured; palette compliance cannot be evaluated.' });
    }

    const criticalViolations = findings.filter(item => item.severity==='critical' && !item.passed).length;
    const warningViolations = findings.filter(item => item.severity==='warning' && !item.passed).length;
    return NextResponse.json({ ok:true, organizationId:auth.context.organizationId, assetType, status:criticalViolations?'FAIL':warningViolations?'WARN':'REVIEW_REQUIRED', compliant:null, requiresHumanReview:true, verificationScope:'Actual raster dimensions and sampled dominant pixel colors were inspected. Logo identity, typography, text/background contrast and semantic layout remain human-review items.', analysisMethod:analysis.analysisMethod, width:analysis.width, height:analysis.height, computedAspectRatio:`${analysis.aspectRatio.toFixed(2)}:1`, dominantColors:analysis.dominantColors, criticalViolations, warningViolations, findings, limitations:analysis.limitations });
  } catch {
    return NextResponse.json({ ok:false, error:'Visual analysis failed.' }, { status:502 });
  }
}
