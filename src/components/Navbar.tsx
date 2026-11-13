'use client';

import React from 'react';
import { Sparkles, CheckCircle2, Flame, Database, FileText } from 'lucide-react';

interface NavbarProps {
  activeTab: 'editor' | 'reviewer' | 'heatmap' | 'vault';
  setActiveTab: (tab: 'editor' | 'reviewer' | 'heatmap' | 'vault') => void;
  pendingReviewsCount: number;
  onSelectPreset: (presetId: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  pendingReviewsCount,
  onSelectPreset,
}) => {
  return (
    <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Event Badge */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 text-white shadow-lg shadow-indigo-500/20 font-bold text-lg">
              VB
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                  VeriBrand AI
                </span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Round 2 Build
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                CodeNova India 2026 • Inkloom AI Track • <span className="text-cyan-400">Team Deccans</span>
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1 bg-slate-800/60 p-1 rounded-xl border border-slate-700/50">
            <button
              onClick={() => setActiveTab('editor')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'editor'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Studio Editor</span>
            </button>

            <button
              onClick={() => setActiveTab('reviewer')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all relative ${
                activeTab === 'reviewer'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Reviewer Queue</span>
              {pendingReviewsCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-bold">
                  {pendingReviewsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('heatmap')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'heatmap'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>Ambiguity Heatmap</span>
            </button>

            <button
              onClick={() => setActiveTab('vault')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'vault'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <span>Brand Vault</span>
            </button>
          </nav>

          {/* Quick Demo Scenarios for Judges */}
          <div className="flex items-center space-x-2">
            <span className="hidden lg:inline text-xs text-slate-400 flex items-center gap-1 font-medium">
              <Sparkles className="w-3 h-3 text-cyan-400" /> Quick Scenarios:
            </span>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  onSelectPreset(e.target.value);
                  setActiveTab('editor');
                }
              }}
              defaultValue=""
              aria-label="Load demo scenario for testing"
              className="bg-slate-800 text-slate-200 text-xs border border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
            >
              <option value="" disabled>Load Test Scenario...</option>
              <option value="draft-broken-marketing">Scenario 1: Broken High-Risk (6 Flags)</option>
              <option value="draft-borderline">Scenario 2: Subtle Borderline (2 Flags)</option>
              <option value="draft-clean-compliant">Scenario 3: 100% Compliant (Green Pass)</option>
            </select>
          </div>
        </div>
      </div>
    </header>
  );
};
