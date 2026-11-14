'use client';

import React from 'react';
import { AmbiguityMetric } from '@/types';
import {
  Flame,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Sparkles,
  BarChart3,
  Shield,
  Info,
} from 'lucide-react';

interface AmbiguityHeatmapViewProps {
  metrics: AmbiguityMetric[];
}

export const AmbiguityHeatmapView: React.FC<AmbiguityHeatmapViewProps> = ({ metrics }) => {
  const getStatusBadge = (status: AmbiguityMetric['status']) => {
    switch (status) {
      case 'ambiguous':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
            <Flame className="w-3 h-3 text-rose-600" /> AMBIGUOUS (Action Required)
          </span>
        );
      case 'monitor':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-600" /> MONITORING
          </span>
        );
      case 'clear':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
            <Shield className="w-3 h-3 text-emerald-600" /> CLEAR & PRECISE
          </span>
        );
    }
  };

  const getHeatmapColor = (score: number) => {
    if (score >= 70) return 'bg-rose-50/70 border-rose-200 text-rose-900';
    if (score >= 40) return 'bg-amber-50/70 border-amber-200 text-amber-900';
    return 'bg-emerald-50/70 border-emerald-200 text-emerald-900';
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 shadow-xs rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-600" /> The 3rd Named Improvement
            </span>
            <h2 className="text-xl font-bold text-slate-900">Reverse Brand Intelligence: Guideline Ambiguity Heatmap</h2>
          </div>
          <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
            Unlike traditional linters that merely punish writers, VeriBrand AI analyzes recurring review redlines and creator appeals to diagnose which brand guidelines are inherently confusing and require organizational clarification. Cards combine seeded benchmark baselines with triggers from the current draft scan and overrides recorded in this browser. They are not enterprise-wide analytics.
          </p>
        </div>

        <div className="flex items-center space-x-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
          <BarChart3 className="w-4 h-4 text-indigo-600" />
          <span className="text-slate-800 font-semibold">Leadership Intelligence Mode</span>
        </div>
      </div>

      {/* Insight Highlight Cards (Seeded Demo Telemetry Baseline) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Practitioner Survey (Seeded Baseline)</span>
            <Info className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">100% of Brand Leads</p>
          <p className="text-xs text-slate-600">
            Seeded research finding: Brand leads confirm repeated rejections stem from ambiguous stylebook wording.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>High-Friction Cluster (Seeded Telemetry)</span>
            <Flame className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <p className="text-2xl font-black text-rose-600">42.8% Override Rate</p>
          <p className="text-xs text-slate-600">
            Seeded benchmark: Conversational tone rules and terminology trigger high creator appeal volume.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Adoption Velocity (Seeded Telemetry)</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-600">96.3% 1-Click Fix Rate</p>
          <p className="text-xs text-slate-600">
            Seeded benchmark: Unambiguous deterministic rules (e.g. Inkloom AI trademark casing) are resolved instantly.
          </p>
        </div>
      </div>

      {/* Heatmap Grid & Diagnostic Recommendations */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5 shadow-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-600" />
            <span>Organizational Rule Ambiguity Index (Seeded Baseline + Current Draft Scan)</span>
          </h3>
          <span className="text-xs text-slate-500">Sorted by Confusion Index</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {metrics.map((m) => (
            <div
              key={m.ruleId}
              className={`${getHeatmapColor(
                m.confusionScore
              )} p-4 rounded-xl border space-y-3 shadow-xs`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-mono font-bold text-slate-600">{m.ruleId}</span>
                {getStatusBadge(m.status)}
              </div>

              {/* Title & Category */}
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">{m.ruleTitle}</h4>
                <p className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold mt-0.5">
                  Category: {m.category.replace('_', ' ')}
                </p>
              </div>

              {/* Score Matrix */}
              <div className="grid grid-cols-3 gap-2 bg-white/90 p-2.5 rounded-lg border border-slate-200 text-center shadow-xs">
                <div>
                  <p className="text-[10px] text-slate-500">Total Flags</p>
                  <p className="font-black text-sm text-slate-900">{m.totalTriggers}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">Overrides</p>
                  <p className="font-black text-sm text-amber-700">{m.overrideCount}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">Override %</p>
                  <p className="font-black text-sm text-rose-700">{m.overrideRatePct}%</p>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 text-center font-medium">
                Seeded Baseline + Current Draft Findings
              </p>

              {/* AI Diagnostic Recommendation */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs space-y-1 shadow-xs">
                <div className="flex items-center space-x-1 text-indigo-700 font-bold text-[11px]">
                  <Lightbulb className="w-3.5 h-3.5" />
                  <span>Actionable Recommendation:</span>
                </div>
                <p className="text-slate-700 leading-relaxed text-[11px]">
                  {m.recommendedClarification}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
