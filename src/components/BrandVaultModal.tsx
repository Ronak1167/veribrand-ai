'use client';
import React, { useEffect, useState, useCallback } from 'react';
import type { BrandRule, VerifiedMetric, User, BrandAsset } from '@/types';
import {
  Play,
  Archive,
  Image as ImageIcon,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

type VaultData = {
  rules: BrandRule[];
  customRules: BrandRule[];
  metrics: VerifiedMetric[];
  rulesCount: number;
  metricsCount: number;
  palette: Array<{ name: string; hex: string; role: string }>;
  notice: string;
};

export const BrandVaultModal: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [vault, setVault] = useState<VaultData | null>(null);
  const [tab, setTab] = useState<'metrics' | 'rules' | 'tester' | 'visual' | 'palette'>('metrics');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Add rule form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [patterns, setPatterns] = useState('');
  const [alternative, setAlternative] = useState('');
  const [citation, setCitation] = useState('');
  const [category, setCategory] = useState<BrandRule['category']>('terminology');
  const [severity, setSeverity] = useState<BrandRule['severity']>('warning');

  // Rule Tester / Playground state
  const [testSampleText, setTestSampleText] = useState('We provide the #1 enterprise platform with 99.99% uptime.');
  const [testPatterns, setTestPatterns] = useState('#1 enterprise, unmatched, industry-leading');
  const [testAlternative, setTestAlternative] = useState('leading enterprise platform');
  const [testResult, setTestResult] = useState<{
    matched: boolean;
    matchCount: number;
    matches: Array<{ pattern: string; matchText: string; excerpt: string }>;
    suggestedRewrite?: string;
  } | null>(null);

  // Visual Assets state
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [inspectFile, setInspectFile] = useState<File | null>(null);
  const [inspectAssetType, setInspectAssetType] = useState('marketing_image');
  const [inspectResult, setInspectResult] = useState<{
    status: string;
    compliant: boolean | null;
    verificationScope?: string;
    limitations?: string[];
    findings: Array<{ category: string; severity: string; message: string; passed: boolean }>;
  } | null>(null);

  const refreshVault = useCallback(async () => {
    try {
      const response = await fetch('/api/vault', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load Brand Vault.');
      setVault(data);

      const assetRes = await fetch('/api/vision/assets');
      const assetData = await assetRes.json();
      if (assetRes.ok && Array.isArray(assetData.assets)) {
        setAssets(assetData.assets);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load Brand Vault.');
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const response = await fetch('/api/vault', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load Brand Vault.');
        if (!ignore) setVault(data);

        const assetRes = await fetch('/api/vision/assets');
        const assetData = await assetRes.json();
        if (!ignore && assetRes.ok && Array.isArray(assetData.assets)) {
          setAssets(assetData.assets);
        }
      } catch (e) {
        if (!ignore) setError(e instanceof Error ? e.message : 'Unable to load Brand Vault.');
      }
    }
    void init();
    return () => {
      ignore = true;
    };
  }, []);

  const saveRule = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const response = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          forbiddenPatterns: patterns.split(',').map((v) => v.trim()).filter(Boolean),
          approvedAlternative: alternative,
          citation,
          category,
          severity,
          authorityLevel: 2,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save rule.');
      setTitle('');
      setDescription('');
      setPatterns('');
      setAlternative('');
      setCitation('');
      await refreshVault();
      setNotice('Rule saved into version 1. It is now actively enforced by the deterministic verifier.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save rule.');
    } finally {
      setBusy(false);
    }
  };

  const archiveRule = async (ruleId: string) => {
    if (!window.confirm('Are you sure you want to archive this brand rule?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/vault/rules/${encodeURIComponent(ruleId)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to archive rule.');
      await refreshVault();
      setNotice('Rule archived.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to archive rule.');
    } finally {
      setBusy(false);
    }
  };

  const runRuleTest = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/vault/test-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sampleText: testSampleText,
          forbiddenPatterns: testPatterns.split(',').map((p) => p.trim()).filter(Boolean),
          approvedAlternative: testAlternative,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rule test failed.');
      setTestResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed.');
    } finally {
      setBusy(false);
    }
  };

  const runVisualInspection = async () => {
    setBusy(true);
    setError('');
    try {
      if (!inspectFile) throw new Error('Select an image file to inspect.');
      const form = new FormData();
      form.append('file', inspectFile);
      form.append('assetType', inspectAssetType);
      const res = await fetch('/api/vision/inspect', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Visual inspection failed.');
      setInspectResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Visual check failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Enterprise Brand Governance</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Brand Vault & Governance Studio</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Manage versioned brand rules, test prospective regex patterns before deployment, inspect approved factual metrics, and analyze actual uploaded image dimensions and sampled pixel colors. Logo identity and typography still require human review.
        </p>
        {vault && (
          <p className="mt-3 text-xs text-slate-500 font-medium">
            {vault.rulesCount} active rules · {vault.metricsCount} reviewer-approved facts · {assets.length} visual assets
          </p>
        )}
      </header>

      {/* Navigation tabs */}
      <nav className="flex flex-wrap gap-2" aria-label="Brand Vault sections">
        {(['metrics', 'rules', 'tester', 'visual', 'palette'] as const).map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            aria-pressed={tab === item}
            className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize transition-all ${
              tab === item ? 'bg-indigo-600 text-white shadow-xs' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {item === 'tester' ? 'Rule Playground' : item === 'visual' ? 'Visual Compliance' : item}
          </button>
        ))}
      </nav>

      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 border border-rose-200">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 border border-emerald-200">{notice}</p>}

      {!vault && <p className="rounded-lg border bg-white p-6 text-sm text-slate-500">Loading workspace configuration…</p>}

      {/* Tab: Metrics */}
      {vault && tab === 'metrics' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            No built-in demo metric is accepted as proof. Only active reviewer-approved facts linked to stored evidence appear here.
          </div>
          {vault.metrics.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No approved facts yet. Upload a source in Evidence Library and ask a reviewer to transcribe and approve the exact fact.
            </div>
          )}
          {vault.metrics.map((metric) => (
            <article key={metric.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex flex-wrap justify-between gap-2">
                <h2 className="font-semibold text-slate-900">{metric.metricName}</h2>
                <span className="text-xs font-bold uppercase text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Reviewer approved
                </span>
              </div>
              <p className="mt-1 text-xl font-bold text-slate-900">{metric.approvedValue}</p>
              <p className="mt-2 text-xs text-slate-600">{metric.sourceDoc} · {metric.section}</p>
              <p className="text-xs text-slate-500">Valid {metric.validFrom} to {metric.validUntil || 'indefinite'}</p>
            </article>
          ))}
        </div>
      )}

      {/* Tab: Rules */}
      {vault && tab === 'rules' && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
          <div className="space-y-3">
            {vault.rules.map((rule) => (
              <article key={rule.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold text-slate-900">{rule.title}</h2>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                      v{rule.version || 1}
                    </span>
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-700">
                      {rule.status || 'active'}
                    </span>
                    {rule.id.startsWith('RULE-') && currentUser.role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => archiveRule(rule.id)}
                        className="rounded p-1 text-slate-400 hover:text-rose-600"
                        title="Archive rule"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-600">{rule.description}</p>
                <p className="text-xs text-rose-700 font-medium">Flag: {rule.forbiddenPatterns.join(', ')}</p>
                <p className="text-xs text-emerald-700 font-medium">Suggested alternative: {rule.approvedAlternative}</p>
                <p className="text-[11px] text-slate-500">Source: {rule.citation}</p>
              </article>
            ))}
          </div>

          {currentUser.role === 'admin' && (
            <form onSubmit={saveRule} className="h-fit space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <h2 className="font-semibold text-slate-900">Add Brand Rule (v1)</h2>
              <label className="block text-xs font-medium text-slate-700">
                Rule title
                <input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mandatory Brand Name Spelling" className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                Description
                <textarea required maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Explain brand rationale and guidelines" className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                Forbidden terms (comma separated)
                <input required value={patterns} onChange={(e) => setPatterns(e.target.value)} placeholder="Inkloom, ink-loom, InkLoom" className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                Approved alternative
                <input required maxLength={300} value={alternative} onChange={(e) => setAlternative(e.target.value)} placeholder="Inkloom AI" className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                Authority citation
                <input required maxLength={300} value={citation} onChange={(e) => setCitation(e.target.value)} placeholder="Brand Style Guide 2026, Section 2.1" className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-medium text-slate-700">
                  Category
                  <select value={category} onChange={(e) => setCategory(e.target.value as BrandRule['category'])} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs">
                    <option value="terminology">Terminology</option>
                    <option value="tone_drift">Tone</option>
                    <option value="legal">Legal</option>
                    <option value="claim_verification">Claim</option>
                    <option value="visual_token">Visual</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-700">
                  Severity
                  <select value={severity} onChange={(e) => setSeverity(e.target.value as BrandRule['severity'])} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs">
                    <option value="critical">Critical</option>
                    <option value="warning">Warning</option>
                    <option value="info">Info</option>
                  </select>
                </label>
              </div>
              <button disabled={busy} type="submit" className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50">
                {busy ? 'Saving…' : 'Save Rule (v1)'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Tab: Rule Playground / Tester */}
      {tab === 'tester' && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2">
            <Play className="h-5 w-5 text-indigo-600" />
            <h2 className="font-semibold text-slate-900">Rule Testing Playground</h2>
          </div>
          <p className="text-sm text-slate-600">
            Test prospective forbidden patterns against sample marketing copy before adding them to production rules.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-700">
                Sample Text to Inspect
                <textarea
                  rows={4}
                  value={testSampleText}
                  onChange={(e) => setTestSampleText(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                />
              </label>

              <label className="block text-xs font-medium text-slate-700">
                Test Forbidden Patterns (comma-separated)
                <input
                  value={testPatterns}
                  onChange={(e) => setTestPatterns(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
              </label>

              <label className="block text-xs font-medium text-slate-700">
                Test Approved Alternative
                <input
                  value={testAlternative}
                  onChange={(e) => setTestAlternative(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
              </label>

              <button
                type="button"
                onClick={runRuleTest}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700"
              >
                <Play className="h-4 w-4" /> Run Test Pattern
              </button>
            </div>

            {/* Test Results Output */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Playground Simulation Results</h3>
              {testResult ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${testResult.matched ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {testResult.matched ? `Flagged (${testResult.matchCount} matches)` : 'Pass (No Flags)'}
                    </span>
                  </div>

                  {testResult.matches.map((m, i) => (
                    <div key={i} className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs">
                      <p className="font-semibold text-rose-700">Matched Pattern: “{m.pattern}”</p>
                      <p className="text-slate-600 mt-1 font-mono text-[11px]">{m.excerpt}</p>
                    </div>
                  ))}

                  {testResult.suggestedRewrite && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs">
                      <p className="font-semibold text-emerald-800">1-Click Rewrite Simulation:</p>
                      <p className="text-slate-800 mt-1">{testResult.suggestedRewrite}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">Click Run Test Pattern to evaluate.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Visual Compliance */}
      {tab === 'visual' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-indigo-600" />
              <h2 className="font-semibold text-slate-900">Visual Asset Pixel Inspector</h2>
            </div>
            <p className="text-sm text-slate-600">
              Upload an actual image to measure its dimensions, aspect ratio and dominant pixel colors. Logo identity, typography and text contrast are not automatically verified.
            </p>

            <div className="grid gap-4 sm:grid-cols-4">
              <label className="text-xs font-medium text-slate-700">
                Asset Type
                <select value={inspectAssetType} onChange={(e) => setInspectAssetType(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs">
                  <option value="marketing_image">Marketing Image / Banner</option>
                  <option value="logo_primary">Primary Logo (Horizontal)</option>
                  <option value="logo_icon">Logo Icon / Favicon</option>
                  <option value="logo_monochrome">Monochrome Logo</option>
                </select>
              </label>

              <label className="text-xs font-medium text-slate-700 sm:col-span-3">
                Image file (PNG, JPEG or WebP; max 10 MB)
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setInspectFile(e.target.files?.[0] || null)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs" />
              </label>
            </div>

            <button
              type="button"
              onClick={runVisualInspection}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700"
            >
              Analyze Uploaded Image
            </button>

            {inspectResult && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-slate-900">Inspection Result: {inspectResult.status}</h3>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    inspectResult.compliant === true ? 'bg-emerald-100 text-emerald-800' : inspectResult.compliant === false ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {inspectResult.compliant === true ? 'COMPLIANT' : inspectResult.compliant === false ? 'VIOLATIONS FOUND' : 'HUMAN REVIEW REQUIRED'}
                  </span>
                </div>
                {inspectResult.verificationScope && <p className="text-xs text-slate-600">Scope: {inspectResult.verificationScope}</p>}
                {inspectResult.limitations?.map((item, index) => <p key={index} className="text-xs text-amber-800">Limitation: {item}</p>)}

                <div className="space-y-2">
                  {inspectResult.findings.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs rounded-lg bg-white p-2.5 border border-slate-200">
                      {f.passed ? (
                        <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : f.severity === 'critical' ? (
                        <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-bold uppercase text-[10px] text-slate-500 mr-2">{f.category}</span>
                        <span className={f.passed ? 'text-slate-700' : f.severity === 'critical' ? 'text-rose-800 font-medium' : 'text-amber-800'}>
                          {f.message}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Palette */}
      {vault && tab === 'palette' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {vault.palette.map((color) => (
            <article key={color.hex} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="h-16 rounded-lg border border-slate-200" style={{ backgroundColor: color.hex }} />
              <h2 className="mt-2 font-semibold text-slate-900">{color.name}</h2>
              <p className="text-xs text-slate-600">{color.hex} · {color.role}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
