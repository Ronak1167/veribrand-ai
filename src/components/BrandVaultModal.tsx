'use client';

import React, { useState } from 'react';
import {
  Database,
  ShieldCheck,
  Palette,
  FileCode,
  Calendar,
  AlertTriangle,
  BookOpen,
  Search,
  ExternalLink,
} from 'lucide-react';
import {
  BRAND_RULES,
  VERIFIED_METRICS,
  APPROVED_PALETTE,
  FORBIDDEN_HEX_CODES,
} from '@/lib/engine/brand-vault-data';

export const BrandVaultModal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'metrics' | 'rules' | 'palette'>('metrics');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredMetrics = VERIFIED_METRICS.filter(
    (m) =>
      m.metricName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.approvedValue.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredRules = BRAND_RULES.filter(
    (r) =>
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 flex items-center gap-1">
              <Database className="w-3 h-3" /> Ground-Truth Repository
            </span>
            <h2 className="text-xl font-bold text-white">The Dynamic Brand Vault</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Centralized ground-truth repository storing brand style guides, verified statistical registries, trademark glossaries, and visual tokens used by the Two-Tier verification engine.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ground-truth metrics..."
            aria-label="Search ground-truth metrics"
            className="w-full bg-slate-950 text-xs text-slate-100 border border-slate-700 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('metrics')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'metrics'
              ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
              : 'text-slate-400 hover:text-white bg-slate-800/50'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Verified Metric Registry ({VERIFIED_METRICS.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'rules'
              ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
              : 'text-slate-400 hover:text-white bg-slate-800/50'
          }`}
        >
          <FileCode className="w-4 h-4" />
          <span>Brand Rules & Stylebook ({BRAND_RULES.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('palette')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'palette'
              ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
              : 'text-slate-400 hover:text-white bg-slate-800/50'
          }`}
        >
          <Palette className="w-4 h-4" />
          <span>Visual Swatches & Tokens</span>
        </button>
      </div>

      {/* METRICS TAB */}
      {activeTab === 'metrics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMetrics.map((metric) => (
            <div
              key={metric.id}
              className={`bg-slate-900 border rounded-xl p-4 space-y-3 transition-all ${
                metric.status === 'outdated'
                  ? 'border-amber-500/40 bg-amber-950/10'
                  : 'border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-cyan-400">{metric.id}</span>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    metric.status === 'active'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {metric.status}
                </span>
              </div>

              <div>
                <h4 className="font-extrabold text-sm text-white">{metric.metricName}</h4>
                <div className="mt-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Approved Value:</span>
                  <span className="text-sm font-black text-emerald-400 font-mono">
                    {metric.approvedValue}
                  </span>
                </div>
              </div>

              <div className="space-y-1 text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
                <p className="flex items-center gap-1">
                  <BookOpen className="w-3 h-3 text-indigo-400 shrink-0" />
                  <span className="truncate">{metric.sourceDoc}</span>
                </p>
                <p className="flex items-center gap-1 text-[10px] text-slate-500">
                  <Calendar className="w-3 h-3 shrink-0" />
                  <span>Valid: {metric.validFrom} to {metric.validUntil || 'Indefinite'}</span>
                </p>
              </div>

              <div className="bg-slate-950/60 p-2 rounded text-[10px] text-slate-400 italic">
                Note: {metric.toleranceNotes}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RULES TAB */}
      {activeTab === 'rules' && (
        <div className="space-y-3">
          {filteredRules.map((rule) => (
            <div
              key={rule.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono font-bold text-indigo-400">{rule.id}</span>
                  <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {rule.category.replace('_', ' ')}
                  </span>
                </div>
                <span className="text-xs text-slate-500 font-mono">
                  Authority Level {rule.authorityLevel} ({rule.authorityLevel === 1 ? 'Legal' : 'Stylebook'})
                </span>
              </div>

              <div>
                <h4 className="font-extrabold text-sm text-white">{rule.title}</h4>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">{rule.description}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div>
                  <span className="text-[10px] uppercase font-bold text-rose-400">Forbidden Patterns:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {rule.forbiddenPatterns.map((p) => (
                      <span
                        key={p}
                        className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 font-mono text-[11px]"
                      >
                        &quot;{p}&quot;
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-400">Approved Standard:</span>
                  <p className="text-slate-200 font-medium mt-1">{rule.approvedAlternative}</p>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 italic">Citation: {rule.citation}</p>
            </div>
          ))}
        </div>
      )}

      {/* PALETTE TAB */}
      {activeTab === 'palette' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Approved Brand Color Tokens (WCAG 2.1 AA Compliant)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {APPROVED_PALETTE.map((c) => (
                <div
                  key={c.hex}
                  className="bg-slate-950 rounded-xl border border-slate-800 p-3 space-y-2 text-center"
                >
                  <div
                    className="w-full h-12 rounded-lg shadow-inner border border-white/10"
                    style={{ backgroundColor: c.hex }}
                  />
                  <div>
                    <p className="text-xs font-bold text-white">{c.name}</p>
                    <p className="text-[11px] font-mono text-cyan-400 font-bold">{c.hex}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{c.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center space-x-2 text-rose-400">
              <AlertTriangle className="w-4 h-4" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                Detected Forbidden Rogue Colors (Auto-Flagged by Tier-1 Automaton)
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {FORBIDDEN_HEX_CODES.map((f) => (
                <div
                  key={f.hex}
                  className="bg-slate-950 rounded-xl border border-rose-500/30 p-3 space-y-2"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-10 h-10 rounded-lg shrink-0 border border-white/20"
                      style={{ backgroundColor: f.hex }}
                    />
                    <div>
                      <p className="text-xs font-bold text-rose-300">{f.name}</p>
                      <p className="text-[11px] font-mono text-slate-400">{f.hex}</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">{f.violation}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
