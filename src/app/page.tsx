'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { LoginScreen } from '@/components/LoginScreen';
import { AdminUsersPanel } from '@/components/AdminUsersPanel';
import { EditorView } from '@/components/EditorView';
import { ReviewerView } from '@/components/ReviewerView';
import { AmbiguityHeatmapView } from '@/components/AmbiguityHeatmapView';
import { BrandVaultModal } from '@/components/BrandVaultModal';
import { auditContent } from '@/lib/engine/verifier';
import {
  ChannelType,
  LintFinding,
  ReviewSubmission,
  AmbiguityMetric,
  User,
} from '@/types';
import {
  PRESET_DRAFTS,
  INITIAL_AMBIGUITY_METRICS,
} from '@/lib/engine/brand-vault-data';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'editor' | 'reviewer' | 'heatmap' | 'vault'>('editor');
  const [channel, setChannel] = useState<ChannelType>('linkedin');

  // Client hydration safe state initialization matching SSR
  const [content, setContent] = useState<string>(PRESET_DRAFTS[0].content);
  const [ambiguityMetrics, setAmbiguityMetrics] = useState<AmbiguityMetric[]>(INITIAL_AMBIGUITY_METRICS);
  const [submissions, setSubmissions] = useState<ReviewSubmission[]>([]);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const [rewriteNotice, setRewriteNotice] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Restore only non-authoritative editor preferences locally; submissions and decisions come from SQLite.
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const saved = localStorage.getItem('veribrand_editor_content_v2');
        if (saved) setContent(saved);
        const savedMetrics = localStorage.getItem('veribrand_ambiguity_metrics_v2');
        if (savedMetrics) setAmbiguityMetrics(JSON.parse(savedMetrics));
      } catch { /* Ignore corrupt local preferences. */ }
      try {
        const response = await fetch('/api/auth/me');
        if (!response.ok) { if (!cancelled) setCurrentUser(null); return; }
        const data = await response.json();
        if (!cancelled && data.authenticated && data.user) {
          setCurrentUser(data.user);
          const list = await fetch('/api/submissions');
          const payload = await list.json();
          if (!list.ok) throw new Error(payload.error || 'Unable to load submissions.');
          if (!cancelled) setSubmissions(Array.isArray(payload.submissions) ? payload.submissions : []);
        }
      } catch (error) {
        if (!cancelled) setAuthError(error instanceof Error ? error.message : 'Unable to restore session.');
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    };
    restore();
    return () => { cancelled = true; };
  }, []);

  const handleAuthenticated = async (user: User) => {
    setCurrentUser(user);
    setAuthError(null);
    const response = await fetch('/api/submissions');
    const data = await response.json();
    if (!response.ok) { setAuthError(data.error || 'Unable to load submissions.'); return; }
    setSubmissions(Array.isArray(data.submissions) ? data.submissions : []);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setCurrentUser(null);
    setSubmissions([]);
    setActiveTab('editor');
  };

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem('veribrand_ambiguity_metrics_v2', JSON.stringify(ambiguityMetrics));
    } catch {}
  }, [ambiguityMetrics, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem('veribrand_editor_content_v2', content);
    } catch {}
  }, [content, isHydrated]);

  // Compute live audit in real time
  const auditResult = useMemo(() => {
    return auditContent(content, channel);
  }, [content, channel]);

  const getHeatmapRuleId = (finding: LintFinding): string | undefined => {
    if (finding.ruleId) return finding.ruleId;
    const metricId = finding.evidence?.metricId;
    if (!metricId) return undefined;
    if (metricId === 'MTR-007') return 'RULE-PRICE-07';
    if (['MTR-001', 'MTR-002', 'MTR-003', 'MTR-004', 'MTR-005', 'MTR-006', 'MTR-008'].includes(metricId)) return 'RULE-CLAIM-03';
    return undefined;
  };

  // Display seeded benchmark totals plus findings from the current live audit.
  const displayedAmbiguityMetrics = useMemo(() => ambiguityMetrics.map((metric) => {
    const liveTriggers = auditResult.findings.filter((finding) =>
      getHeatmapRuleId(finding) === metric.ruleId
    ).length;
    const totalTriggers = metric.totalTriggers + liveTriggers;
    return {
      ...metric,
      totalTriggers,
      overrideRatePct: totalTriggers > 0
        ? Math.round((metric.overrideCount / totalTriggers) * 1000) / 10
        : 0,
    };
  }), [ambiguityMetrics, auditResult]);

  // Handle Loading Preset Demo Scenarios
  const handleSelectPreset = (presetId: string) => {
    const draft = PRESET_DRAFTS.find((p) => p.id === presetId);
    if (draft) {
      setContent(draft.content);
      setChannel(draft.channel);
      setActiveTab('editor');
    }
  };

  // 1-Click Rewrite Application (The 2nd Named Improvement)
  const handleApplyRewrite = (finding: LintFinding, rewriteText: string) => {
    if (
      finding.startIndex !== undefined &&
      finding.endIndex !== undefined &&
      finding.startIndex >= 0 &&
      finding.endIndex <= content.length &&
      content.slice(finding.startIndex, finding.endIndex) === finding.matchedText
    ) {
      setContent(content.slice(0, finding.startIndex) + rewriteText + content.slice(finding.endIndex));
      setRewriteNotice(null);
      return;
    }
    setRewriteNotice('This rewrite is stale because the draft changed after the finding was created. Run a fresh audit and select the finding again.');
  };

  // Local drafting note only. This does not change a verdict or create an appeal decision.
  const handleCreatorOverride = (findingId: string, rationale: string) => {
    const finding = auditResult.findings.find(item => item.id === findingId);
    if (finding) finding.override = { overridden: true, rationale, timestamp: new Date().toISOString() };
  };

  const refreshSubmissions = async () => {
    const response = await fetch('/api/submissions');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to refresh submissions.');
    setSubmissions(Array.isArray(data.submissions) ? data.submissions : []);
  };

  // Persist first, then reflect the authoritative server-generated submission.
  const handleSubmitForReview = async (title: string) => {
    try {
      const response = await fetch('/api/submissions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, channel, text: content }),
      });
      const data = await response.json();
      if (!response.ok || !data.submission?.id) throw new Error(data.error || 'Submission was not saved.');
      setSubmissions((prev) => [data.submission, ...prev.filter((item) => item.id !== data.submission.id)]);
      setActiveTab('reviewer');
    } catch (error) {
      setRewriteNotice(error instanceof Error ? error.message : 'Submission failed.');
    }
  };

  const handleApproveSubmission = async (
    submissionId: string,
    _sha256Hash: string,
    _reviewerName: string,
    approvalMode: 'standard' | 'exception',
    exceptionRationale?: string
  ) => {
    try {
      const response = await fetch('/api/submissions/' + encodeURIComponent(submissionId) + '/review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', approvalMode, exceptionRationale }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Approval failed.');
      await refreshSubmissions();
    } catch (error) {
      setRewriteNotice(error instanceof Error ? error.message : 'Approval failed.');
    }
  };

  const handleResubmit = async (submissionId: string, revisedText: string) => {
    try {
      const response = await fetch('/api/submissions/' + encodeURIComponent(submissionId) + '/resubmit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revisedText }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Resubmission failed.');
      await refreshSubmissions();
    } catch (error) {
      setRewriteNotice(error instanceof Error ? error.message : 'Resubmission failed.');
    }
  };

  const handleDecideAppeal = async (
    submissionId: string,
    findingId: string,
    decision: 'accepted' | 'rejected',
    rationale: string,
    _reviewerName: string
  ) => {
    try {
      void _reviewerName;
      const current = submissions.find((item) => item.id === submissionId);
      if (!current) throw new Error('Submission no longer exists.');
      const response = await fetch('/api/submissions/' + encodeURIComponent(submissionId) + '/appeal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revisionId: current.currentRevisionId, findingId, decision, rationale }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Appeal decision failed.');
      await refreshSubmissions();
    } catch (error) {
      setRewriteNotice(error instanceof Error ? error.message : 'Appeal decision failed.');
    }
  };

  const handleRequestChanges = async (submissionId: string, commentText: string) => {
    try {
      const response = await fetch('/api/submissions/' + encodeURIComponent(submissionId) + '/review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_changes', commentText }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to request changes.');
      await refreshSubmissions();
    } catch (error) {
      setRewriteNotice(error instanceof Error ? error.message : 'Unable to request changes.');
    }
  };

  const handleAddComment = async (
    submissionId: string,
    commentText: string,
    _author: string,
    _role: 'Brand Reviewer' | 'Creator' | 'Legal Counsel'
  ) => {
    try {
      void _author;
      void _role;
      const response = await fetch('/api/submissions/' + encodeURIComponent(submissionId) + '/comments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: commentText }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save comment.');
      await refreshSubmissions();
    } catch (error) {
      setRewriteNotice(error instanceof Error ? error.message : 'Unable to save comment.');
    }
  };

  const pendingCount = submissions.filter((s) => s.status === 'pending_review').length;

  if (!isHydrated) return <main className="min-h-screen grid place-items-center bg-slate-50 text-slate-600">Loading VeriBrand AI…</main>;
  if (!currentUser) return <LoginScreen onAuthenticated={handleAuthenticated} />;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingReviewsCount={pendingCount}
        onSelectPreset={handleSelectPreset}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {authError && <div role="alert" className="mx-auto mt-4 max-w-7xl rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{authError}</div>}
        {activeTab === 'editor' && (
          <EditorView
            content={content}
            setContent={setContent}
            channel={channel}
            setChannel={setChannel}
            auditResult={auditResult}
            rewriteNotice={rewriteNotice}
            onApplyRewrite={handleApplyRewrite}
            onCreatorOverride={handleCreatorOverride}
            onSubmitForReview={handleSubmitForReview}
          />
        )}

        {activeTab === 'reviewer' && (
          <ReviewerView
            submissions={submissions}
            currentUser={currentUser}
            onApproveSubmission={handleApproveSubmission}
            onRequestChanges={handleRequestChanges}
            onAddComment={handleAddComment}
            onResubmit={handleResubmit}
            onDecideAppeal={handleDecideAppeal}
          />
        )}

        {activeTab === 'heatmap' && (
          <AmbiguityHeatmapView metrics={displayedAmbiguityMetrics} />
        )}

        {activeTab === 'vault' && <><BrandVaultModal />{currentUser.role === 'admin' && <AdminUsersPanel />}</>}
      </main>

      {/* Global Footer with Hackathon Credentials & Tech Stack Details */}
      <footer className="bg-white border-t border-slate-200 py-6 text-xs text-slate-500 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-slate-700">
              VeriBrand AI | Intelligent Pre-Publication Brand Governance & Explainable Compliance Engine
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              CodeNova India Hackathon 2026 | Problem Statement by Inkloom AI | Round 2 Build
            </p>
          </div>

          <div className="flex items-center space-x-4 text-[11px]">
            <span>Team: <strong className="text-slate-800">Team Deccans</strong></span>
            <span>|</span>
            <span>Solo Architect: <strong className="text-slate-800">Ronak Jain</strong></span>
            <span>|</span>
            <span>Status: <strong className="text-emerald-600 font-bold">Hackathon MVP | Demo Data</strong></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
