'use client';

import React, { useState } from 'react';
import { ReviewSubmission } from '@/types';
import {
  CheckCircle2,
  ShieldCheck,
  User,
  MessageSquare,
  AlertCircle,
  AlertTriangle,
  Hash,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { generateContentHash } from '@/lib/engine/crypto-audit';

interface ReviewerViewProps {
  submissions: ReviewSubmission[];
  onApproveSubmission: (submissionId: string, sha256Hash: string, reviewerName: string, approvalMode: 'standard' | 'exception', exceptionRationale?: string) => void;
  onRequestChanges: (submissionId: string, commentText: string) => void;
  onAddComment?: (submissionId: string, commentText: string, author: string, role: 'Brand Reviewer' | 'Creator' | 'Legal Counsel') => void;
  onResubmit: (submissionId: string, revisedText: string, creatorName: string) => void;
  onDecideAppeal: (submissionId: string, findingId: string, decision: 'accepted' | 'rejected', rationale: string, reviewerName: string) => void;
}

export const ReviewerView: React.FC<ReviewerViewProps> = ({
  submissions,
  onApproveSubmission,
  onRequestChanges,
  onAddComment,
  onResubmit,
  onDecideAppeal,
}) => {
  const [selectedId, setSelectedId] = useState<string>(
    submissions[0]?.id || ''
  );
  const [newComment, setNewComment] = useState<string>('');
  const [reviewerName, setReviewerName] = useState<string>('Brand Guardian (Demo Reviewer)');
  const [feedbackNote, setFeedbackNote] = useState<string>('');
  const [changesModalOpen, setChangesModalOpen] = useState<boolean>(false);
  const [exceptionModalOpen, setExceptionModalOpen] = useState<boolean>(false);
  const [exceptionRationale, setExceptionRationale] = useState<string>('');
  const [creatorRevisionText, setCreatorRevisionText] = useState<string>('');
  const [appealRationale, setAppealRationale] = useState<string>('');

  const activeItem = submissions.find((s) => s.id === selectedId) || submissions[0];

  const acceptedAppealIds = new Set(
    (activeItem?.appealDecisions ?? [])
      .filter((decision) => decision.decision === 'accepted')
      .map((decision) => decision.findingId)
  );
  const criticalConflicts = activeItem?.auditResult.findings.filter(
    (f) => f.severity === 'critical' && f.verdict !== 'VERIFIED' && !acceptedAppealIds.has(f.id)
  ) || [];
  const hasCriticalConflicts = criticalConflicts.length > 0;

  const handleApprove = async () => {
    if (!activeItem) return;

    // Trigger celebration confetti
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {
      // fallback
    }

    const timestamp = new Date().toISOString();
    const hash = await generateContentHash(activeItem.currentText, reviewerName, timestamp);
    onApproveSubmission(activeItem.id, hash, reviewerName, 'standard');
  };

  const handleApproveWithException = async () => {
    if (!activeItem || !exceptionRationale.trim()) return;

    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {
      // fallback
    }

    const timestamp = new Date().toISOString();
    const hash = await generateContentHash(activeItem.currentText, reviewerName, timestamp);

    onApproveSubmission(activeItem.id, hash, reviewerName, 'exception', exceptionRationale.trim());
    setExceptionModalOpen(false);
    setExceptionRationale('');
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
              Stage 5 Workflow
            </span>
            <h2 className="text-xl font-bold text-white">Brand Reviewer & Sign-Off Hub</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Human-in-the-loop governance: inspect creator overrides, verify source evidence, and commit cryptographic approvals.
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center space-x-2">
            <User className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-400">Reviewer (Demo Mode):</span>
            <input
              type="text"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              title="Input-based demo reviewer identity (Enterprise SSO/RBAC scheduled for Round 3)"
              className="bg-transparent text-slate-200 font-semibold focus:outline-none w-52 border-b border-dashed border-slate-700 hover:border-indigo-400 focus:border-indigo-500"
            />
          </div>
          <span className="text-[10px] text-amber-400/90 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
            Editable Demo Identity
          </span>
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400 space-y-3">
          <CheckCircle2 className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-300">No Submissions Pending Review</h3>
          <p className="text-xs max-w-md mx-auto">
            Switch to the Studio Editor, draft or edit content, and click &quot;Submit for Human Review&quot; to queue an item here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Submissions List Sidebar */}
          <div className="lg:col-span-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
              Pending Submissions ({submissions.length})
            </h3>

            <div className="space-y-2">
              {submissions.map((sub) => {
                const isSelected = sub.id === activeItem?.id;
                return (
                  <div
                    key={sub.id}
                    onClick={() => setSelectedId(sub.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-2 ${
                      isSelected
                        ? 'bg-slate-800/90 border-indigo-500 shadow-md shadow-indigo-500/10'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-xs font-bold text-slate-100 truncate max-w-[200px]">
                        {sub.title}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          sub.status === 'approved'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : sub.status === 'changes_requested'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                        }`}
                      >
                        {sub.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>By {sub.creatorName}</span>
                      <span className="capitalize">{sub.channel.replace('_', ' ')}</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
                      <span>Score: {sub.auditResult.complianceScore}/100</span>
                      <span>{sub.auditResult.findings.length} flags</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detailed Review Workspace */}
          {activeItem && (
            <div className="lg:col-span-8 space-y-5">
              {/* Submission Header Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-extrabold text-white">{activeItem.title}</h3>
                    <p className="text-xs text-slate-400">
                      Submitted by <strong className="text-slate-200">{activeItem.creatorName}</strong> on {new Date(activeItem.submittedAt).toLocaleTimeString()}
                    </p>
                  </div>

                  {activeItem.status === 'approved' ? (
                    <div className="flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-emerald-400 text-xs font-bold">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Approved by {activeItem.signedOffBy}</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setChangesModalOpen(true)}
                        className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 font-semibold text-xs border border-rose-500/30 transition-all"
                      >
                        Request Changes
                      </button>

                      {hasCriticalConflicts ? (
                        <button
                          onClick={() => setExceptionModalOpen(true)}
                          className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition-all shadow-md shadow-amber-600/30"
                          title="Critical governance conflicts exist. Explicit reviewer exception rationale required."
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Approve with Exception Override</span>
                        </button>
                      ) : (
                        <button
                          onClick={handleApprove}
                          className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-md shadow-emerald-600/30"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve & Sign Off</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Cryptographic Ledger Stamped Hash (if approved) */}
                {activeItem.sha256Hash && (
                  <div className="bg-slate-950 p-3 rounded-lg border border-emerald-500/20 text-xs space-y-1">
                    <div className="flex items-center space-x-1.5 text-emerald-400 font-bold">
                      <Hash className="w-3.5 h-3.5" />
                      <span>SHA-256 Content-Integrity Verification Record</span>
                    </div>
                    <p className="font-mono text-[11px] text-slate-300 break-all">
                      {activeItem.sha256Hash}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Timestamped: {activeItem.signedOffAt} • Browser-Side Content-Integrity Record Committed (SHA-256)
                    </p>
                    {activeItem.approvalMode === 'exception' && (
                      <div className="mt-2 rounded border border-amber-500/30 bg-amber-950/20 p-2 text-[11px] text-amber-200">
                        <strong>Exception approval:</strong> {activeItem.exceptionRationale}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Critical Conflicts Warning Banner */}
              {hasCriticalConflicts && activeItem.status !== 'approved' && (
                <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-4 flex items-start space-x-3 text-xs">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="font-bold text-amber-200">
                      Unresolved Critical Governance Findings Detected ({criticalConflicts.length})
                    </h4>
                    <p className="text-amber-300/80 leading-relaxed">
                      Standard approval is locked. This submission contains critical unresolved brand/regulatory findings. To sign off, the reviewer must provide an explicit exception rationale or request creator changes.
                    </p>
                  </div>
                </div>
              )}

              {/* Audit Findings & Creator Appeals */}
              {activeItem.auditResult.findings.length > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                    <span>Audit Findings & Creator Appeals ({activeItem.auditResult.findings.length})</span>
                    <span className="text-[11px] font-mono text-slate-400">Score: {activeItem.auditResult.complianceScore}/100</span>
                  </h4>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {activeItem.auditResult.findings.map((f, idx) => (
                      <div
                        key={f.id || idx}
                        className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                          f.verdict === 'CONFLICT'
                            ? 'bg-rose-950/20 border-rose-800/40 text-rose-200'
                            : f.verdict === 'UNVERIFIED'
                            ? 'bg-amber-950/20 border-amber-800/40 text-amber-200'
                            : f.verdict === 'VERIFIED'
                            ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                            : 'bg-slate-950/60 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold">{f.guidelineTitle}</span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-black/40">
                            {f.verdict} ({f.severity})
                          </span>
                        </div>
                        <p className="text-slate-300 text-[11px] leading-relaxed">{f.explanation}</p>
                        {f.override?.overridden && (
                          <div className="mt-1.5 p-2 rounded bg-indigo-950/40 border border-indigo-500/30 text-[11px] space-y-1">
                            <span className="text-indigo-300 font-bold flex items-center gap-1">
                              Creator Appeal Justification:
                            </span>
                            <p className="text-indigo-200 italic">&ldquo;{f.override.rationale}&rdquo;</p>
                            {(() => {
                              const decision = activeItem.appealDecisions?.find((item) => item.findingId === f.id);
                              return decision ? (
                                <p className="text-[10px] text-cyan-200">Appeal {decision.decision} by {decision.reviewerName}: {decision.rationale}</p>
                              ) : (
                                <div className="space-y-2 pt-1">
                                  <input value={appealRationale} onChange={(e) => setAppealRationale(e.target.value)} placeholder="Reviewer rationale for appeal decision" className="w-full bg-slate-950 text-slate-100 text-[11px] border border-slate-700 rounded p-2" />
                                  <div className="flex gap-2">
                                    <button onClick={() => { if (appealRationale.trim()) { onDecideAppeal(activeItem.id, f.id, 'accepted', appealRationale, reviewerName); setAppealRationale(''); } }} className="px-2 py-1 rounded bg-emerald-700 text-white text-[10px]">Accept Appeal</button>
                                    <button onClick={() => { if (appealRationale.trim()) { onDecideAppeal(activeItem.id, f.id, 'rejected', appealRationale, reviewerName); setAppealRationale(''); } }} className="px-2 py-1 rounded bg-rose-700 text-white text-[10px]">Reject Appeal</button>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Side-by-Side Content Inspection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Original Copy */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-400 pb-2 border-b border-slate-800">
                    <span>Original Creator Draft</span>
                    <span className="text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">
                      Unsanctioned Copy
                    </span>
                  </div>
                  <div className="bg-slate-950/70 p-3 rounded-lg text-xs font-mono text-slate-300 min-h-[160px] whitespace-pre-wrap leading-relaxed border border-slate-800/60">
                    {activeItem.originalText}
                  </div>
                </div>

                {/* Revised Approved Copy */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-400 pb-2 border-b border-slate-800">
                    <span>Current Content (With Rewrites)</span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                      Compliance Score: {activeItem.auditResult.complianceScore}/100
                    </span>
                  </div>
                  <div className="bg-slate-950/70 p-3 rounded-lg text-xs font-mono text-emerald-200 min-h-[160px] whitespace-pre-wrap leading-relaxed border border-emerald-500/20">
                    {activeItem.currentText}
                  </div>
                </div>
              </div>

              {activeItem.status === 'changes_requested' && (
                <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-5 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">Creator Revision & Resubmission</h4>
                  <p className="text-xs text-slate-400">Edit the current draft in response to reviewer feedback. Resubmission creates a new version and runs a fresh audit.</p>
                  <textarea value={creatorRevisionText || activeItem.currentText} onChange={(e) => setCreatorRevisionText(e.target.value)} rows={7} className="w-full bg-slate-950 text-slate-100 text-xs font-mono border border-slate-700 rounded-lg p-3" />
                  <button onClick={() => { const revised = creatorRevisionText || activeItem.currentText; if (revised.trim()) { onResubmit(activeItem.id, revised, activeItem.creatorName); setCreatorRevisionText(''); } }} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold">Resubmit New Revision</button>
                </div>
              )}

              {activeItem.revisionHistory && activeItem.revisionHistory.length > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Revision History ({activeItem.revisionHistory.length})</h4>
                  {activeItem.revisionHistory.map((revision) => (
                    <div key={revision.version} className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-2">
                      <span>Version {revision.version} · {revision.submittedBy}</span>
                      <span>{revision.auditResult.complianceScore}/100 · {new Date(revision.submittedAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Reviewer Comments & Discussion Thread */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Review Comments & Audit Log ({activeItem.comments.length})</span>
                </h4>

                <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                  {activeItem.comments.map((c) => (
                    <div
                      key={c.id}
                      className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-indigo-300">
                          {c.author} <span className="font-normal text-slate-400">({c.role})</span>
                        </span>
                        <span className="text-slate-500">{new Date(c.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-slate-200 leading-relaxed">{c.text}</p>
                    </div>
                  ))}
                </div>

                {/* Add new review comment */}
                <div className="flex items-center space-x-2 pt-2 border-t border-slate-800">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add feedback note or approval justification..."
                    className="flex-1 bg-slate-950 text-xs text-slate-100 border border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newComment.trim() && activeItem) {
                        if (onAddComment) {
                          onAddComment(activeItem.id, newComment.trim(), reviewerName, 'Brand Reviewer');
                        }
                        setNewComment('');
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (newComment.trim() && activeItem) {
                        if (onAddComment) {
                          onAddComment(activeItem.id, newComment.trim(), reviewerName, 'Brand Reviewer');
                        }
                        setNewComment('');
                      }
                    }}
                    className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs"
                  >
                    Post Note
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Request Changes Modal */}
      {changesModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-2 text-rose-400">
              <AlertCircle className="w-5 h-5" />
              <h3 className="font-bold text-base text-white">Request Revisions from Creator</h3>
            </div>
            <p className="text-xs text-slate-400">
              Explain why this draft cannot be signed off yet and specify which claims or terms must be revised.
            </p>

            <textarea
              value={feedbackNote}
              onChange={(e) => setFeedbackNote(e.target.value)}
              placeholder="e.g. Please verify the ARR figure with finance or adopt the $18.5M audited rewrite..."
              rows={3}
              className="w-full bg-slate-950 text-slate-100 text-xs border border-slate-700 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setChangesModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (feedbackNote.trim() && activeItem) {
                    onRequestChanges(activeItem.id, feedbackNote.trim());
                    setFeedbackNote('');
                    setChangesModalOpen(false);
                  }
                }}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all"
              >
                Send Revision Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Critical Exception Override Modal */}
      {exceptionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-base text-white">Approve with Exception Override</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              This draft contains {criticalConflicts.length} unresolved critical conflicts. Under regulatory compliance standards, signing off requires mandatory documentation of the business or legal exception rationale.
            </p>

            <textarea
              value={exceptionRationale}
              onChange={(e) => setExceptionRationale(e.target.value)}
              placeholder="e.g. Exception authorized by VP Marketing for closed beta partner preview under NDA..."
              rows={3}
              className="w-full bg-slate-950 text-slate-100 text-xs border border-amber-500/40 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setExceptionModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                disabled={!exceptionRationale.trim()}
                onClick={handleApproveWithException}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs transition-all shadow-md shadow-amber-600/30"
              >
                Confirm Exception Sign-Off
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
