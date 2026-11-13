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
  Layers,
  ArrowUpRight,
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
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
            <Flame className="w-3 h-3 text-rose-400" /> AMBIGUOUS (Action Required)
          </span>
        );
      case 'monitor':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-400" /> MONITORING
          </span>
        );
      case 'clear':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <Shield className="w-3 h-3 text-emerald-400" /> CLEAR & PRECISE
          </span>
        );
    }
  };

  const getHeatmapColor = (score: number) => {
    if (score >= 70) return 'from-rose-500/20 to-rose-900/30 border-rose-500/40 text-rose-400';
    if (score >= 40) return 'from-amber-500/20 to-amber-900/30 border-amber-500/40 text-amber-400';
    return 'from-emerald-500/20 to-emerald-900/30 border-emerald-500/40 text-emerald-400';
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> The 3rd Named Improvement
            </span>
            <h2 className="text-xl font-bold text-white">Reverse Brand Intelligence: Guideline Ambiguity Heatmap</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
            Unlike traditional linters that merely punish writers, VeriBrand AI analyzes recurring review redlines and creator appeals to diagnose which brand guidelines are inherently confusing and require organizational clarification.
          </p>
        </div>

        <div className="flex items-center space-x-2 bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs">
          <BarChart3 className="w-4 h-4 text-indigo-400" />
          <span className="text-slate-300 font-semibold">Leadership Intelligence Mode</span>
        </div>
      </div>

      {/* Insight Highlight Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Exploratory Practitioner Survey Finding</span>
            <Info className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <p className="text-2xl font-black text-white">100% of Brand Leads</p>
          <p className="text-xs text-slate-400">
            Confirmed that repeated draft rejections stem from ambiguous stylebook wording, not writer incompetence.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>High-Friction Guideline Cluster</span>
            <Flame className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <p className="text-2xl font-black text-rose-400">42.8% Override Rate</p>
          <p className="text-xs text-slate-400">
            On conversational B2B tone rules and AI terminology jargon; writers find current policies overly rigid.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Automated Adoption Velocity</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400">96.3% 1-Click Fix Rate</p>
          <p className="text-xs text-slate-400">
            For unambiguous deterministic rules (e.g. Inkloom AI trademark casing), proving clear rules get fixed instantly.
          </p>
        </div>
      </div>

      {/* Heatmap Grid & Diagnostic Recommendations */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            <span>Organizational Rule Ambiguity Index (Real-Time Diagnostics)</span>
          </h3>
          <span className="text-xs text-slate-400">Sorted by Confusion Index</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {metrics.map((m) => (
            <div
              key={m.ruleId}
              className={`bg-gradient-to-br ${getHeatmapColor(
                m.confusionScore
              )} p-4 rounded-xl border space-y-3 shadow-lg`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-mono font-bold text-slate-300">{m.ruleId}</span>
                {getStatusBadge(m.status)}
              </div>

              {/* Title & Category */}
              <div>
                <h4 className="font-extrabold text-sm text-slate-100">{m.ruleTitle}</h4>
                <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mt-0.5">
                  Category: {m.category.replace('_', ' ')}
                </p>
              </div>

              {/* Score Matrix */}
              <div className="grid grid-cols-3 gap-2 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/60 text-center">
                <div>
                  <p className="text-[10px] text-slate-400">Total Flags</p>
                  <p className="font-black text-sm text-white">{m.totalTriggers}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Overrides</p>
                  <p className="font-black text-sm text-amber-300">{m.overrideCount}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Override %</p>
                  <p className="font-black text-sm text-rose-400">{m.overrideRatePct}%</p>
                </div>
              </div>

              {/* AI Diagnostic Recommendation */}
              <div className="bg-slate-950/90 p-3 rounded-lg border border-slate-800 text-xs space-y-1">
                <div className="flex items-center space-x-1 text-cyan-400 font-bold text-[11px]">
                  <Lightbulb className="w-3.5 h-3.5" />
                  <span>Actionable Recommendation:</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px]">
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
