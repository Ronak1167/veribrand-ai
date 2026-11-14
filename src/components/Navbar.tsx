'use client';

import React from 'react';
import { Sparkles, CheckCircle2, Flame, Database, FileText } from 'lucide-react';
import { User } from '@/types';

interface NavbarProps {
  activeTab: 'editor' | 'reviewer' | 'heatmap' | 'vault';
  setActiveTab: (tab: 'editor' | 'reviewer' | 'heatmap' | 'vault') => void;
  pendingReviewsCount: number;
  onSelectPreset: (presetId: string) => void;
  currentUser?: User | null;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  pendingReviewsCount,
  onSelectPreset,
  currentUser,
  onLogout,
}) => {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 text-slate-900 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Event Badge */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-indigo-700 text-white shadow-md shadow-indigo-600/20 font-bold text-lg">
              VB
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg tracking-tight text-slate-900">
                  VeriBrand AI
                </span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Round 2 Build
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                CodeNova India 2026 • Inkloom AI Track • <span className="text-indigo-600 font-semibold">Team Deccans</span>
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveTab('editor')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'editor'
                  ? 'bg-white text-indigo-600 shadow-xs border border-slate-200 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Studio Editor</span>
            </button>

            <button
              onClick={() => setActiveTab('reviewer')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all relative ${
                activeTab === 'reviewer'
                  ? 'bg-white text-indigo-600 shadow-xs border border-slate-200 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
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
                  ? 'bg-white text-indigo-600 shadow-xs border border-slate-200 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              <span>Ambiguity Heatmap</span>
            </button>

            <button
              onClick={() => setActiveTab('vault')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'vault'
                  ? 'bg-white text-indigo-600 shadow-xs border border-slate-200 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-cyan-600" />
              <span>Brand Vault</span>
            </button>
          </nav>

          {/* Quick Demo Scenarios & Session Persona Switcher */}
          <div className="flex items-center space-x-2">
            <span className="hidden xl:inline text-xs text-slate-500 flex items-center gap-1 font-medium">
              <Sparkles className="w-3 h-3 text-indigo-500" /> Scenarios:
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
              className="bg-white text-slate-800 text-xs border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium shadow-xs"
            >
              <option value="" disabled>Load Scenario...</option>
              <option value="draft-broken-marketing">Scenario 1: Broken High-Risk (6 Flags)</option>
              <option value="draft-borderline">Scenario 2: Subtle Borderline (2 Flags)</option>
              <option value="draft-clean-compliant">Scenario 3: 100% Compliant (Green Pass)</option>
            </select>

            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="hidden sm:flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                <span className="text-[11px] font-semibold text-slate-800">{currentUser?.name?.split(' ')[0]}</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-indigo-100 text-indigo-700">{currentUser?.role}</span>
              </div>
              <button type="button" onClick={onLogout} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100" aria-label="Sign out">Sign out</button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Bar */}
      <nav aria-label="Mobile Navigation" className="flex md:hidden items-center justify-around px-2 py-2 border-t border-slate-200 bg-white/95 overflow-x-auto shadow-xs">
        <button
          onClick={() => setActiveTab('editor')}
          className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'editor'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Studio</span>
        </button>

        <button
          onClick={() => setActiveTab('reviewer')}
          className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all relative ${
            activeTab === 'reviewer'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Queue</span>
          {pendingReviewsCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-bold">
              {pendingReviewsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('heatmap')}
          className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'heatmap'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-amber-500" />
          <span>Heatmap</span>
        </button>

        <button
          onClick={() => setActiveTab('vault')}
          className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'vault'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Database className="w-3.5 h-3.5 text-cyan-600" />
          <span>Vault</span>
        </button>
      </nav>
    </header>
  );
};
