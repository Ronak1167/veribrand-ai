'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
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
} from '@/types';
import {
  PRESET_DRAFTS,
  INITIAL_AMBIGUITY_METRICS,
} from '@/lib/engine/brand-vault-data';

const INITIAL_SUBMISSIONS: ReviewSubmission[] = [
  {
    id: 'SUB-INIT-01',
    title: 'Q4 Product Launch Press Release',
    channel: 'press_release',
    creatorName: 'Elena Rostova (Senior Copywriter)',
    submittedAt: '2026-11-13T09:00:00.000Z',
    status: 'pending_review',
    originalText: PRESET_DRAFTS[1].content,
    currentText: PRESET_DRAFTS[1].content,
    auditResult: auditContent(PRESET_DRAFTS[1].content, 'press_release'),
    comments: [
      {
        id: 'C-1',
        author: 'Elena Rostova',
        role: 'Creator',
        text: 'Draft calibrated for enterprise buyers. The trademark phrasing and 99.9% uptime have been validated.',
        timestamp: '2026-11-13T09:15:00.000Z',
      },
    ],
  },
  {
    id: 'SUB-INIT-02',
    title: 'Global Social Ad Campaign',
    channel: 'linkedin',
    creatorName: 'Marcus Vance (Growth Lead)',
    submittedAt: '2026-11-13T08:00:00.000Z',
    status: 'approved',
    originalText: PRESET_DRAFTS[2].content,
    currentText: PRESET_DRAFTS[2].content,
    auditResult: auditContent(PRESET_DRAFTS[2].content, 'linkedin'),
    sha256Hash: 'sha256-a79f32e981bc881d723fae991206d44ef30198ca118ef4a78103bd29f8c1092e',
    signedOffAt: '2026-11-13T08:30:00.000Z',
    signedOffBy: 'Brand Guardian (Demo Reviewer)',
    comments: [
      {
        id: 'C-2',
        author: 'Brand Guardian (Demo Reviewer)',
        role: 'Brand Reviewer',
        text: 'Clean audit pass. Approved for public syndication.',
        timestamp: '2026-11-13T08:30:00.000Z',
      },
    ],
  },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<'editor' | 'reviewer' | 'heatmap' | 'vault'>('editor');
  const [channel, setChannel] = useState<ChannelType>('linkedin');

  // Client hydration safe state initialization matching SSR
  const [content, setContent] = useState<string>(PRESET_DRAFTS[0].content);
  const [ambiguityMetrics, setAmbiguityMetrics] = useState<AmbiguityMetric[]>(INITIAL_AMBIGUITY_METRICS);
  const [submissions, setSubmissions] = useState<ReviewSubmission[]>(INITIAL_SUBMISSIONS);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const [rewriteNotice, setRewriteNotice] = useState<string | null>(null);

  // Restore persistent state after hydration without causing SSR mismatch or synchronous render cascades
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem('veribrand_editor_content_v2');
        if (saved) setContent(saved);
        const savedMetrics = localStorage.getItem('veribrand_ambiguity_metrics_v2');
        if (savedMetrics) setAmbiguityMetrics(JSON.parse(savedMetrics));
        const savedSubs = localStorage.getItem('veribrand_submissions_v2');
        if (savedSubs) setSubmissions(JSON.parse(savedSubs));
      } catch {}
      setIsHydrated(true);
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  // Sync state changes to localStorage after hydration
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem('veribrand_submissions_v2', JSON.stringify(submissions));
    } catch {}
  }, [submissions, isHydrated]);

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

  // Creator Appeal & Override with Rationale
  const handleCreatorOverride = (findingId: string, rationale: string) => {
    const finding = auditResult.findings.find((f) => f.id === findingId);
    if (finding) {
      finding.override = {
        overridden: true,
        rationale,
        timestamp: new Date().toISOString(),
      };

      // Attribute the appeal to the stable rule identity; do not count it as a new scan trigger.
      const targetRuleId = getHeatmapRuleId(finding);
      if (targetRuleId) {
        setAmbiguityMetrics((prev) => prev.map((metric) => {
          if (metric.ruleId !== targetRuleId) return metric;
          const overrideCount = metric.overrideCount + 1;
          const liveTriggers = auditResult.findings.filter((item) =>
            getHeatmapRuleId(item) === targetRuleId
          ).length;
          const denominator = metric.totalTriggers + liveTriggers;
          const overrideRatePct = denominator > 0
            ? Math.round((overrideCount / denominator) * 1000) / 10
            : 0;
          return {
            ...metric,
            overrideCount,
            overrideRatePct,
            confusionScore: Math.min(100, Math.round(metric.confusionScore + 3)),
            status: overrideRatePct > 40 ? 'ambiguous' : 'monitor',
          };
        }));
      }
    }
  };

  // Submit Draft to Reviewer Queue
  const handleSubmitForReview = (title: string, creatorName: string) => {
    const newSubmission: ReviewSubmission = {
      id: `SUB-${Date.now().toString(36).toUpperCase()}`,
      title,
      channel,
      creatorName,
      submittedAt: new Date().toISOString(),
      status: 'pending_review',
      originalText: content,
      currentText: content,
      auditResult: { ...auditResult },
      revisionHistory: [{ version: 1, text: content, auditResult: { ...auditResult }, submittedAt: new Date().toISOString(), submittedBy: creatorName }],
      appealDecisions: [],
      comments: [
        {
          id: `COM-${Date.now()}`,
          author: creatorName,
          role: 'Creator',
          text: `Submitted draft for review across ${channel.replace('_', ' ')} with compliance score of ${auditResult.complianceScore}/100.`,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    setSubmissions((prev) => [newSubmission, ...prev]);
    setActiveTab('reviewer');
  };

  // Brand Reviewer Approval with SHA-256 Hash
  const handleApproveSubmission = (
    submissionId: string,
    sha256Hash: string,
    reviewerName: string,
    approvalMode: 'standard' | 'exception',
    exceptionRationale?: string
  ) => {
    setSubmissions((prev) =>
      prev.map((sub) => {
        if (sub.id === submissionId) {
          const acceptedAppealIds = new Set(
            (sub.appealDecisions ?? [])
              .filter((decision) => decision.decision === 'accepted')
              .map((decision) => decision.findingId)
          );
          const hasCriticalUnresolved = sub.auditResult.findings.some(
            (finding) => finding.severity === 'critical' &&
              finding.verdict !== 'VERIFIED' &&
              !acceptedAppealIds.has(finding.id)
          );
          if (hasCriticalUnresolved && (approvalMode !== 'exception' || !exceptionRationale?.trim())) return sub;
          if (!hasCriticalUnresolved && approvalMode === 'exception' && !exceptionRationale?.trim()) return sub;
          return {
            ...sub,
            status: 'approved',
            approvalMode,
            exceptionRationale: approvalMode === 'exception' ? exceptionRationale?.trim() : undefined,
            sha256Hash,
            signedOffAt: new Date().toISOString(),
            signedOffBy: reviewerName,
            comments: [
              ...sub.comments,
              {
                id: `COM-${Date.now()}`,
                author: reviewerName,
                role: 'Brand Reviewer',
                text: approvalMode === 'exception' ? 'Exception approval: ' + (exceptionRationale ?? '') + '. SHA-256: ' + sha256Hash.slice(0, 20) + '...' : 'Approved content and committed SHA-256 integrity hash: ' + sha256Hash.slice(0, 20) + '...',
                timestamp: new Date().toISOString(),
              },
            ],
          };
        }
        return sub;
      })
    );
  };

  // Creator resubmission creates a new revision and a fresh audit.
  const handleResubmit = (submissionId: string, revisedText: string, creatorName: string) => {
    const current = submissions.find((item) => item.id === submissionId);
    if (!current || current.status !== 'changes_requested' || !revisedText.trim()) return;
    const revisedAudit = auditContent(revisedText, current.channel);
    const submittedAt = new Date().toISOString();
    setSubmissions((prev) => prev.map((sub) => {
      if (sub.id !== submissionId || sub.status !== 'changes_requested') return sub;
      const history = sub.revisionHistory ?? [{
        version: 1, text: sub.originalText, auditResult: sub.auditResult,
        submittedAt: sub.submittedAt, submittedBy: sub.creatorName,
      }];
      return {
        ...sub,
        status: 'pending_review',
        currentText: revisedText,
        auditResult: revisedAudit,
        submittedAt,
        sha256Hash: undefined,
        signedOffAt: undefined,
        signedOffBy: undefined,
        approvalMode: undefined,
        exceptionRationale: undefined,
        revisionHistory: [...history, {
          version: history.length + 1,
          text: revisedText,
          auditResult: revisedAudit,
          submittedAt,
          submittedBy: creatorName,
        }],
        comments: [...sub.comments, {
          id: 'COM-' + Date.now(),
          author: creatorName,
          role: 'Creator',
          text: 'Resubmitted revision ' + (history.length + 1) + ' for review. New compliance score: ' + revisedAudit.complianceScore + '/100.',
          timestamp: submittedAt,
        }],
      };
    }));
  };

  const handleDecideAppeal = (
    submissionId: string,
    findingId: string,
    decision: 'accepted' | 'rejected',
    rationale: string,
    reviewerName: string
  ) => {
    if (!rationale.trim()) return;
    const decidedAt = new Date().toISOString();
    setSubmissions((prev) => prev.map((sub) => {
      if (sub.id !== submissionId) return sub;
      const decisions = sub.appealDecisions ?? [];
      if (decisions.some((item) => item.findingId === findingId)) return sub;
      return {
        ...sub,
        appealDecisions: [...decisions, { findingId, decision, rationale: rationale.trim(), reviewerName, decidedAt }],
        comments: [...sub.comments, {
          id: 'COM-' + Date.now(),
          author: reviewerName,
          role: 'Brand Reviewer',
          text: 'Creator appeal ' + decision + ' for finding ' + findingId + ': ' + rationale.trim(),
          timestamp: decidedAt,
        }],
      };
    }));
  };

  // Brand Reviewer Request Changes
  const handleRequestChanges = (submissionId: string, commentText: string) => {
    setSubmissions((prev) =>
      prev.map((sub) => {
        if (sub.id === submissionId) {
          return {
            ...sub,
            status: 'changes_requested',
            comments: [
              ...sub.comments,
              {
                id: `COM-${Date.now()}`,
                author: 'Brand Reviewer',
                role: 'Brand Reviewer',
                text: `Changes Requested: ${commentText}`,
                timestamp: new Date().toISOString(),
              },
            ],
          };
        }
        return sub;
      })
    );
  };

  // Add Comment to Review Thread
  const handleAddComment = (
    submissionId: string,
    commentText: string,
    author: string,
    role: 'Brand Reviewer' | 'Creator' | 'Legal Counsel'
  ) => {
    setSubmissions((prev) =>
      prev.map((sub) => {
        if (sub.id === submissionId) {
          return {
            ...sub,
            comments: [
              ...sub.comments,
              {
                id: `COM-${Date.now()}`,
                author,
                role,
                text: commentText,
                timestamp: new Date().toISOString(),
              },
            ],
          };
        }
        return sub;
      })
    );
  };

  const pendingCount = submissions.filter((s) => s.status === 'pending_review').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingReviewsCount={pendingCount}
        onSelectPreset={handleSelectPreset}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
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

        {activeTab === 'vault' && <BrandVaultModal />}
      </main>

      {/* Global Footer with Hackathon Credentials & Tech Stack Details */}
      <footer className="bg-slate-900 border-t border-slate-800/80 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-slate-400">
              VeriBrand AI • Intelligent Pre-Publication Brand Governance & Explainable Compliance Engine
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              CodeNova India Hackathon 2026 • Problem Statement by Inkloom AI • Round 2 Build
            </p>
          </div>

          <div className="flex items-center space-x-4 text-[11px]">
            <span>Team: <strong className="text-slate-300">Team Deccans</strong></span>
            <span>•</span>
            <span>Solo Architect: <strong className="text-slate-300">Ronak Jain</strong></span>
            <span>•</span>
            <span>Status: <strong className="text-emerald-400">Hackathon MVP · Demo Data</strong></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
