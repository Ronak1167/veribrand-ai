import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { getEvidenceById, getUserById, logAuditEvent } from '@/lib/db/database';
import { getTenantContextFromRequest, requireTenantRole } from '@/lib/auth/session';


function isBlockedAddress(address: string): boolean {
  const value = address.toLowerCase().split('%')[0];
  if (isIP(value) === 4) {
    const octets = value.split('.').map(Number);
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0 && octets[2] === 113);
  }
  if (isIP(value) === 6) {
    if (value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true;
    const mapped = value.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    return false;
  }
  return true;
}

async function validatePublicHttpUrl(raw: string): Promise<{ url: URL; address: string; family: number }> {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only HTTP and HTTPS protocols are permitted.');
  if (url.username || url.password) throw new Error('URLs containing credentials are not permitted.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Private and local network hosts are blocked.');
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(entry => isBlockedAddress(entry.address))) throw new Error('The URL resolves to a private, reserved or blocked network address.');
  const selected = addresses[0];
  return { url, address: selected.address, family: selected.family || isIP(selected.address) };
}


function requestPinned(url: URL, address: string, family: number, method: 'HEAD' | 'GET'): Promise<number> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const request = transport.request({
      hostname: address,
      family,
      port: url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method,
      headers: { Host: url.host, 'User-Agent': 'VeriBrand-Provenance-Auditor/2.0', Connection: 'close' },
      ...(url.protocol === 'https:' ? { servername: isIP(hostname) ? undefined : hostname } : {}),
      timeout: 6000,
    }, response => {
      const status = response.statusCode || 0;
      response.destroy();
      resolve(status);
    });
    request.on('timeout', () => request.destroy(new Error('Source URL probe timed out.')));
    request.on('error', reject);
    request.end();
  });
}

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
    const evidence = getEvidenceById(id, orgId);

    if (!evidence) {
      return NextResponse.json({ ok: false, error: 'Evidence document not found.' }, { status: 404 });
    }

    if (auth.context.orgRole === 'creator' && evidence.uploadedBy !== auth.context.user.id) {
      return NextResponse.json({ ok: false, error: 'Access denied.' }, { status: 403 });
    }

    // Verify physical file checksum on disk if present
    let checksumVerified = false;
    if (evidence.storagePath && fs.existsSync(evidence.storagePath)) {
      const diskBytes = fs.readFileSync(evidence.storagePath);
      const actualSha = crypto.createHash('sha256').update(diskBytes).digest('hex');
      checksumVerified = actualSha === evidence.sha256Checksum;
    }

    const uploader = getUserById(evidence.uploadedBy);
    const reviewer = evidence.reviewedBy ? getUserById(evidence.reviewedBy) : null;

    const dossier = {
      id: evidence.id,
      organizationId: evidence.organizationId,
      metricId: evidence.metricId,
      documentName: evidence.documentName,
      fileSizeBytes: evidence.fileSizeBytes,
      mimeType: evidence.mimeType,
      sha256Checksum: evidence.sha256Checksum,
      checksumVerified,
      hasFile: evidence.hasFile,
      provenanceState: evidence.provenanceState || 'uploaded',
      status: evidence.status,
      uploadedAt: evidence.uploadedAt,
      uploader: uploader ? { id: uploader.id, name: uploader.name, email: uploader.email } : { id: evidence.uploadedBy, name: 'Unknown' },
      reviewedAt: evidence.reviewedAt,
      reviewer: reviewer ? { id: reviewer.id, name: reviewer.name, email: reviewer.email } : null,
      approvedValue: evidence.approvedValue,
      validityPeriod: evidence.validityPeriod,
      sourceUrl: evidence.sourceUrl || null,
      sourcePublisher: evidence.sourcePublisher || null,
      verificationMethod: evidence.verificationMethod || 'manual_inspection',
      submissionId: evidence.submissionId,
      revisionId: evidence.revisionId,
    };

    return NextResponse.json({ ok: true, provenance: dossier });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to generate provenance dossier.' }, { status: 500 });
  }
}

// Probing source URL reachability with SSRF protection
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getTenantContextFromRequest(req);
  if (!auth.authorized || !auth.context) {
    return NextResponse.json({ ok: false, error: auth.error || 'Authentication required.' }, { status: auth.status });
  }

  const roleCheck = requireTenantRole(auth.context, ['reviewer', 'admin']);
  if (!roleCheck.allowed) return NextResponse.json({ ok: false, error: roleCheck.error }, { status: roleCheck.status });

  try {
    const { id } = await params;
    const orgId = auth.context.user.role === 'admin' ? undefined : auth.context.organizationId;
    const evidence = getEvidenceById(id, orgId);

    if (!evidence) {
      return NextResponse.json({ ok: false, error: 'Evidence document not found.' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const targetUrl = (typeof body.url === 'string' && body.url.trim()) ? body.url.trim() : evidence.sourceUrl;

    if (!targetUrl) {
      return NextResponse.json({ ok: false, error: 'No source URL provided or recorded for this evidence.' }, { status: 400 });
    }

    // Resolve once, reject private/reserved destinations, then pin the socket to that exact address.
    let validated: { url: URL; address: string; family: number };
    try {
      validated = await validatePublicHttpUrl(targetUrl);
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Unsafe source URL.' }, { status: 400 });
    }

    const startTime = Date.now();
    let reachable = false;
    let statusCode: number | undefined;
    const sslValid = validated.url.protocol === 'https:';

    try {
      statusCode = await requestPinned(validated.url, validated.address, validated.family, 'HEAD');
      if (statusCode === 405 || statusCode === 501) {
        statusCode = await requestPinned(validated.url, validated.address, validated.family, 'GET');
      }
      reachable = statusCode >= 200 && statusCode < 300;
    } catch {
      reachable = false;
    }

    const responseTimeMs = Date.now() - startTime;
    const probeResult = {
      url: targetUrl,
      domain: validated.url.hostname,
      reachable,
      statusCode,
      sslValid,
      responseTimeMs,
      probedAt: new Date().toISOString(),
    };

    logAuditEvent('EVIDENCE_URL_PROBED', auth.context.user.id, auth.context.orgRole, null, null, {
      evidenceId: id,
      ...probeResult,
      orgId: evidence.organizationId,
    });

    return NextResponse.json({ ok: true, probe: probeResult });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'URL reachability probe failed.';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
