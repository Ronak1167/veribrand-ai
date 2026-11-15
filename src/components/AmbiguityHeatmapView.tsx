'use client';
import React, { useEffect, useState } from 'react';
import { BarChart3, RefreshCw, Info, AlertOctagon, Clock, ShieldCheck } from 'lucide-react';
import type { OrganizationAnalytics } from '@/types';

type Metric = {
  ruleId: string;
  ruleTitle: string;
  category: string;
  totalTriggers: number;
  overrideRatePct: number;
  appealCount: number;
  acceptedAppeals: number;
  rejectedAppeals: number;
};

export const AmbiguityHeatmapView: React.FC = () => {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [sampleSize, setSampleSize] = useState(0);
  const [analytics, setAnalytics] = useState<OrganizationAnalytics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const [ambiguityRes, overviewRes] = await Promise.all([
        fetch('/api/analytics/ambiguity', { cache: 'no-store' }),
        fetch('/api/analytics/overview', { cache: 'no-store' }),
      ]);

      const ambData = await ambiguityRes.json();
      if (!ambiguityRes.ok) throw new Error(ambData.error || 'Unable to load ambiguity analytics.');
      setMetrics(Array.isArray(ambData.metrics) ? ambData.metrics : []);
      setSampleSize(Number(ambData.sampleSize) || 0);

      const overviewData = await overviewRes.json();
      if (overviewRes.ok && overviewData.analytics) {
        setAnalytics(overviewData.analytics);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const [ambiguityRes, overviewRes] = await Promise.all([
          fetch('/api/analytics/ambiguity', { cache: 'no-store' }),
          fetch('/api/analytics/overview', { cache: 'no-store' }),
        ]);

        const ambData = await ambiguityRes.json();
        if (!ambiguityRes.ok) throw new Error(ambData.error || 'Unable to load ambiguity analytics.');

        const overviewData = await overviewRes.json();
        if (!ignore) {
          setMetrics(Array.isArray(ambData.metrics) ? ambData.metrics : []);
          setSampleSize(Number(ambData.sampleSize) || 0);
          if (overviewRes.ok && overviewData.analytics) {
            setAnalytics(overviewData.analytics);
          }
          setLoading(false);
        }
      } catch (e) {
        if (!ignore) {
          setError(e instanceof Error ? e.message : 'Unable to load analytics.');
          setLoading(false);
        }
      }
    }
    void init();
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <section className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Reverse Brand Intelligence</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">Organization Governance Analytics</h1>
          </div>
          <button
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />Refresh
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Derived 100% from persisted submission records, cryptographic audit results, and reviewer appeal decisions. Zero synthetic or hardcoded metrics.
        </p>
      </header>

      {/* KPI Overview Cards */}
      {analytics && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase text-slate-500">Total Submissions</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-900">{analytics.totalSubmissions}</p>
            <p className="mt-1 text-xs text-slate-500">
              {analytics.submissionsByStatus.approved} approved · {analytics.submissionsByStatus.pending_review} pending
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-slate-500">Verified Facts Pool</p>
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-3xl font-extrabold text-emerald-600">{analytics.claimsByVerdict.VERIFIED}</p>
            <p className="mt-1 text-xs text-slate-500">
              {analytics.evidenceActiveCount} active source documents
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-slate-500">Contradictions / Conflicts</p>
              <AlertOctagon className="h-4 w-4 text-rose-600" />
            </div>
            <p className="mt-2 text-3xl font-extrabold text-rose-600">{analytics.claimsByVerdict.CONFLICT}</p>
            <p className="mt-1 text-xs text-slate-500">
              Blocked from publication
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-slate-500">Appeals Resolution Rate</p>
              <Clock className="h-4 w-4 text-indigo-600" />
            </div>
            <p className="mt-2 text-3xl font-extrabold text-indigo-600">{analytics.appealResolutionRate}%</p>
            <p className="mt-1 text-xs text-slate-500">
              Turnaround: ~{analytics.averageTurnaroundMinutes} mins
            </p>
          </div>
        </div>
      )}

      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 border border-rose-200">{error}</p>}
      {loading && <p className="rounded-lg border bg-white p-6 text-sm text-slate-500">Calculating from stored review activity…</p>}

      {/* Ambiguity Heatmap Rule Friction Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Rule Friction & Ambiguity Heatmap</h2>
        {!loading && metrics.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <BarChart3 className="mx-auto h-8 w-8 text-slate-400" />
            <h3 className="mt-3 font-semibold text-slate-800">Not enough review activity yet</h3>
            <p className="mt-1 text-sm text-slate-600">
              Analytics appear after submissions contain findings and reviewers record appeal decisions.
            </p>
          </div>
        )}

        {!loading && metrics.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {metrics.map((metric) => (
              <article key={metric.ruleId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">{metric.ruleTitle}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                    {metric.category.replace('_', ' ')}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-xl font-bold text-slate-900">{metric.totalTriggers}</p>
                    <p className="text-[10px] text-slate-500 font-medium">Triggers</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-xl font-bold text-slate-900">{metric.appealCount || 0}</p>
                    <p className="text-[10px] text-slate-500 font-medium">Appeals</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-xl font-bold text-indigo-600">{metric.overrideRatePct}%</p>
                    <p className="text-[10px] text-slate-500 font-medium">Override Rate</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-600 pt-1 border-t border-slate-100">
                  <span>Accepted: <strong className="text-emerald-700">{metric.acceptedAppeals || 0}</strong></span>
                  <span>Rejected: <strong className="text-rose-700">{metric.rejectedAppeals || 0}</strong></span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <p className="flex items-start gap-2 text-xs text-slate-500">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        Analyzed {sampleSize} audited submission{sampleSize === 1 ? '' : 's'} across the organization. All metrics reflect real, persisted database events. Low sample sizes in newly created organizations should not be generalized.
      </p>
    </section>
  );
};
