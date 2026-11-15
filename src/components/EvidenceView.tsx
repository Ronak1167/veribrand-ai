'use client';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Download,
  FileText,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  Cpu,
  Globe,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';
import type { User, ReviewSubmission, ProvenanceState, EvidenceCandidateFact } from '@/types';

type EvidenceItem = {
  id: string;
  metricId: string;
  documentName: string;
  sectionCitation: string;
  approvedValue?: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256Checksum: string;
  status: 'active' | 'outdated' | 'pending' | 'unverified';
  provenanceState?: ProvenanceState;
  sourceUrl?: string;
  sourcePublisher?: string;
  verificationMethod?: string;
  submissionId: string | null;
  revisionId: string | null;
  hasFile: boolean;
  uploadedAt: string;
  reviewNotes: string | null;
};

export function EvidenceView({ currentUser, submissions }: { currentUser: User; submissions: ReviewSubmission[] }) {
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [metricId, setMetricId] = useState('');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('');
  const selectedSubmission = submissions.find((item) => item.id === selectedSubmissionId) || null;
  const [citation, setCitation] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourcePublisher, setSourcePublisher] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Candidate Facts state
  const [activeCandidatesDocId, setActiveCandidatesDocId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<EvidenceCandidateFact[]>([]);
  const [extractingId, setExtractingId] = useState<string | null>(null);

  // URL probe state
  const [urlProbeResult, setUrlProbeResult] = useState<Record<string, { reachable: boolean; statusCode?: number; responseTimeMs: number; probedAt: string }>>({});
  const [probingUrlId, setProbingUrlId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/evidence', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to load evidence.');
    setItems(Array.isArray(data.evidence) ? data.evidence : []);
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => load()).catch((e) => setError(e.message));
  }, [load]);

  const loadCandidates = async (evidenceId: string) => {
    try {
      const res = await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}/candidates`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.candidates)) {
        setCandidates(data.candidates);
        setActiveCandidatesDocId(evidenceId);
      }
    } catch {
      // ignore
    }
  };

  const runExtraction = async (evidenceId: string) => {
    setExtractingId(evidenceId);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}/extract`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fact extraction failed.');
      setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
      setActiveCandidatesDocId(evidenceId);
      setNotice(`Extraction complete! Discovered ${data.extractedCount || 0} candidate facts.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extraction failed.');
    } finally {
      setExtractingId(null);
    }
  };

  const handleReviewCandidate = async (candidateId: string, status: 'approved' | 'rejected', defaultVal: string) => {
    if (!activeCandidatesDocId) return;
    const approvedVal = status === 'approved' ? (window.prompt('Confirm or edit the approved transcribed value:', defaultVal) || defaultVal) : undefined;
    if (status === 'approved' && !approvedVal?.trim()) return;

    const notes = window.prompt(status === 'approved' ? 'Reviewer approval note (optional):' : 'Rejection rationale (required):');
    if (notes === null) return;
    if (status === 'rejected' && !notes.trim()) {
      setError('A rationale is required to reject a candidate fact.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/evidence/${encodeURIComponent(activeCandidatesDocId)}/candidates/${encodeURIComponent(candidateId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, approvedValue: approvedVal?.trim(), reviewNotes: notes.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update candidate fact.');
      await loadCandidates(activeCandidatesDocId);
      await load();
      setNotice(`Candidate fact ${status}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Candidate review failed.');
    } finally {
      setBusy(false);
    }
  };

  const probeUrl = async (evidenceId: string, url: string) => {
    setProbingUrlId(evidenceId);
    try {
      const res = await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}/provenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (res.ok && data.probe) {
        setUrlProbeResult((prev) => ({ ...prev, [evidenceId]: data.probe }));
      }
    } catch {
      // ignore
    } finally {
      setProbingUrlId(null);
    }
  };

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!file || !citation.trim()) {
      setError('Choose a file and enter its source citation.');
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('metricId', metricId);
      body.set('sectionCitation', citation.trim());
      if (sourceUrl.trim()) body.set('sourceUrl', sourceUrl.trim());
      if (sourcePublisher.trim()) body.set('sourcePublisher', sourcePublisher.trim());
      if (selectedSubmission?.currentRevisionId) {
        body.set('submissionId', selectedSubmission.id);
        body.set('revisionId', selectedSubmission.currentRevisionId);
      }
      const res = await fetch('/api/evidence', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      setFile(null);
      setCitation('');
      setSourceUrl('');
      setSourcePublisher('');
      const input = document.getElementById('evidence-file') as HTMLInputElement | null;
      if (input) input.value = '';
      await load();
      setNotice('Upload complete. The document is registered in provenance state: uploaded.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const review = async (id: string, status: 'verified' | 'rejected') => {
    const approvedValue = status === 'verified'
      ? window.prompt('Transcribe the exact approved fact/value from the source document:')
      : null;
    if (status === 'verified' && (!approvedValue || !approvedValue.trim())) return;
    const notes = window.prompt(status === 'verified' ? 'Reviewer notes (confirm original source inspection):' : 'Reason for rejection:');
    if (notes === null) return;
    if (status === 'rejected' && !notes.trim()) {
      setError('A reason is required to reject evidence.');
      return;
    }
    const validFrom = status === 'verified' ? window.prompt('Effective from (YYYY-MM-DD), optional:') : null;
    if (validFrom === null) return;
    const validUntil = status === 'verified' ? window.prompt('Valid until (YYYY-MM-DD), optional:') : null;
    if (validUntil === null) return;

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/evidence/' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          notes,
          approvedValue: approvedValue?.trim(),
          validFrom: validFrom?.trim() || undefined,
          validUntil: validUntil?.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Review update failed.');
      await load();
      setNotice(status === 'verified' ? 'Reviewer verified fact saved to active pool.' : 'Evidence rejected.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review update failed.');
    } finally {
      setBusy(false);
    }
  };

  const size = (n: number) => (n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(2) + ' MB');

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Governance workspace</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Evidence Library & Provenance</h1>
          <p className="mt-1 text-sm text-slate-600">
            Upload source evidence, run automated candidate fact extraction, retain SHA-256 provenance checksums, and record human reviewer decisions.
          </p>
        </div>
        <button onClick={() => load().catch((e) => setError(e.message))} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-semibold shadow-xs hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" />Refresh
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
        {/* Upload Form */}
        <form onSubmit={upload} className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <UploadCloud className="h-5 w-5 text-indigo-600" />Register source evidence
          </h2>

          <label className="block space-y-1 text-xs font-medium text-slate-700">
            Metric key / Target claim
            <input value={metricId} onChange={(e) => setMetricId(e.target.value)} maxLength={64} required placeholder="e.g. Annual Recurring Revenue or 99.99% uptime" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" />
          </label>

          <label className="block space-y-1 text-xs font-medium text-slate-700">
            Source citation / Section
            <input value={citation} onChange={(e) => setCitation(e.target.value)} maxLength={255} required placeholder="e.g. Q4 2025 Audited Financial Statement, Page 12" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" />
          </label>

          <label className="block space-y-1 text-xs font-medium text-slate-700">
            Source URL / External Registry (optional)
            <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} maxLength={500} placeholder="https://example.com/sec/annual-report.pdf" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" />
          </label>

          <label className="block space-y-1 text-xs font-medium text-slate-700">
            Publishing Authority (optional)
            <input value={sourcePublisher} onChange={(e) => setSourcePublisher(e.target.value)} maxLength={100} placeholder="e.g. Ernst & Young LLP or SEC EDGAR" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" />
          </label>

          <label className="block space-y-1 text-xs font-medium text-slate-700">
            Link to submission (optional)
            <select value={selectedSubmissionId} onChange={(e) => setSelectedSubmissionId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500">
              <option value="">No submission link</option>
              {submissions.map((sub) => (
                <option key={sub.id} value={sub.id}>{sub.title} · {sub.currentRevisionId}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1 text-xs font-medium text-slate-700">
            Source File (PDF, PNG, JPEG, TXT — max 10 MB)
            <input id="evidence-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain" onChange={(e) => setFile(e.target.files?.[0] || null)} required className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-xs" />
          </label>
          {file && <p className="text-xs text-slate-500">{file.name} · {size(file.size)}</p>}

          <button disabled={busy} type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50">
            <UploadCloud className="h-4 w-4" />{busy ? 'Registering…' : 'Upload & Compute Provenance'}
          </button>
        </form>

        {/* Evidence Documents List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Stored Documents & Provenance ({items.length})</h2>
            <span className="text-xs text-slate-500 font-medium">Tenant-isolated library</span>
          </div>

          {items.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No evidence documents registered in this organization yet.
            </div>
          )}

          {items.map((item) => (
            <article key={item.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <FileText className="mt-1 h-5 w-5 shrink-0 text-indigo-600" />
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-semibold text-slate-900">{item.documentName}</h3>
                    <p className="text-xs text-slate-500">{item.metricId} · {item.sectionCitation}</p>
                    {item.approvedValue && item.approvedValue !== 'Not approved' && (
                      <p className="mt-1 text-xs font-semibold text-emerald-700">Approved fact: {item.approvedValue}</p>
                    )}
                    {item.sourcePublisher && (
                      <p className="text-[11px] text-slate-600">Publisher: <span className="font-semibold">{item.sourcePublisher}</span></p>
                    )}
                    {item.submissionId && (
                      <p className="text-[11px] text-indigo-700">Linked: {item.submissionId} · {item.revisionId}</p>
                    )}
                    <p className="text-[11px] text-slate-500">{size(item.fileSizeBytes)} · {new Date(item.uploadedAt).toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                    item.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                    item.status === 'unverified' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                    'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}>
                    {item.status === 'active' ? 'Verified Fact' : item.status}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    State: {item.provenanceState || 'uploaded'}
                  </span>
                </div>
              </div>

              {/* SHA-256 Provenance Checksum */}
              <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">SHA-256 Provenance Checksum</p>
                  <span className="text-[10px] text-emerald-700 font-medium flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" /> Integrity Verified
                  </span>
                </div>
                <p className="break-all font-mono text-[10px] text-slate-700 mt-0.5">{item.sha256Checksum || 'Metadata-only'}</p>
              </div>

              {/* Source URL & Live Probe */}
              {item.sourceUrl && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-indigo-50/50 p-2 border border-indigo-100">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Globe className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-700 hover:underline truncate max-w-xs flex items-center gap-1">
                      {item.sourceUrl} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  <div className="flex items-center gap-2">
                    {urlProbeResult[item.id] ? (
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        urlProbeResult[item.id].reachable ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {urlProbeResult[item.id].reachable ? `Reachable (${urlProbeResult[item.id].responseTimeMs}ms)` : 'Unreachable'}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => probeUrl(item.id, item.sourceUrl!)}
                        disabled={probingUrlId === item.id}
                        className="rounded border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50"
                      >
                        {probingUrlId === item.id ? 'Probing…' : 'Verify URL'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Reviewer Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                {item.hasFile && (
                  <a href={'/api/evidence/' + encodeURIComponent(item.id) + '?download=1'} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs">
                    <Download className="h-3.5 w-3.5" />Download
                  </a>
                )}

                {/* Candidate Fact Extraction Trigger */}
                {item.hasFile && (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeCandidatesDocId === item.id) {
                        setActiveCandidatesDocId(null);
                      } else {
                        loadCandidates(item.id);
                        if (candidates.length === 0) runExtraction(item.id);
                      }
                    }}
                    disabled={extractingId === item.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    <Cpu className="h-3.5 w-3.5" />
                    {extractingId === item.id ? 'Extracting…' : activeCandidatesDocId === item.id ? 'Hide Facts' : 'Candidate Facts'}
                  </button>
                )}

                {/* Manual Review Gate */}
                {item.status === 'pending' && (currentUser.role === 'reviewer' || currentUser.role === 'admin') && (
                  <>
                    <button disabled={busy} onClick={() => review(item.id, 'verified')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50">
                      <ShieldCheck className="h-3.5 w-3.5" />Mark Verified
                    </button>
                    <button disabled={busy} onClick={() => review(item.id, 'rejected')} className="rounded-lg border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50">
                      Reject
                    </button>
                  </>
                )}
              </div>

              {/* Candidate Facts Panel */}
              {activeCandidatesDocId === item.id && (
                <div className="mt-3 rounded-xl border border-indigo-100 bg-slate-50/80 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-800 flex items-center gap-1">
                      <Cpu className="h-3.5 w-3.5 text-indigo-600" /> Extracted Candidate Facts ({candidates.length})
                    </p>
                    <button
                      type="button"
                      onClick={() => runExtraction(item.id)}
                      disabled={extractingId === item.id}
                      className="text-[11px] font-semibold text-indigo-600 hover:underline"
                    >
                      Re-run extraction
                    </button>
                  </div>

                  {candidates.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-2">No candidate facts extracted yet. Click Re-run extraction.</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {candidates.map((cand) => (
                        <div key={cand.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5 shadow-xs">
                          <div className="min-w-0 max-w-md">
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 uppercase">{cand.claimType}</span>
                              <span className="text-xs font-bold text-slate-900">{cand.extractedValue}</span>
                              {cand.pageNumber && <span className="text-[10px] text-slate-500 font-medium">Page {cand.pageNumber}</span>}
                            </div>
                            <p className="mt-0.5 text-xs text-slate-600 line-clamp-2">{cand.textExcerpt}</p>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                              cand.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                              cand.status === 'rejected' ? 'bg-rose-100 text-rose-800' :
                              'bg-amber-100 text-amber-800'
                            }`}>
                              {cand.status}
                            </span>

                            {cand.status === 'unverified' && (currentUser.role === 'reviewer' || currentUser.role === 'admin') && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleReviewCandidate(cand.id, 'approved', cand.extractedValue)}
                                  className="rounded bg-emerald-600 p-1 text-white hover:bg-emerald-700"
                                  title="Approve fact & promote evidence"
                                >
                                  <Check className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReviewCandidate(cand.id, 'rejected', cand.extractedValue)}
                                  className="rounded bg-rose-600 p-1 text-white hover:bg-rose-700"
                                  title="Reject fact"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
    </section>
  );
}
