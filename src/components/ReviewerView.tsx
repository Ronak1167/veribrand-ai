'use client';

import React, { useState } from 'react';
import { ReviewSubmission } from '@/types';
import {
  CheckCircle2,
  Clock,
  ShieldCheck,
  User,
  MessageSquare,
  Send,
  Layers,
  Sparkles,
  FileCheck,
  ChevronRight,
  AlertCircle,
  Hash,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { generateContentHash } from '@/lib/engine/crypto-audit';

interface ReviewerViewProps {
  submissions: ReviewSubmission[];
  onApproveSubmission: (submissionId: string, sha256Hash: string, reviewerName: string) => void;
  onRequestChanges: (submissionId: string, commentText: string) => void;
}

export const ReviewerView: React.FC<ReviewerViewProps> = ({
  submissions,
  onApproveSubmission,
  onRequestChanges,
}) => {
  const [selectedId, setSelectedId] = useState<string>(
    submissions[0]?.id || ''
  );
  const [newComment, setNewComment] = useState<string>('');
  const [reviewerName, setReviewerName] = useState<string>('Sarah Chen (Brand Guardian)');
  const [feedbackNote, setFeedbackNote] = useState<string>('');
  const [changesModalOpen, setChangesModalOpen] = useState<boolean>(false);

  const activeItem = submissions.find((s) => s.id === selectedId) || submissions[0];

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
    onApproveSubmission(activeItem.id, hash, reviewerName);
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
            <span className="text-slate-400">Reviewer:</span>
            <input
              type="text"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none w-48"
            />
          </div>
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

                      <button
                        onClick={handleApprove}
                        className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-md shadow-emerald-600/30"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approve & Sign Off</span>
                      </button>
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
                      Timestamped: {activeItem.signedOffAt} • Immutable Audit Ledger Committed
                    </p>
                  </div>
                )}
              </div>

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
                      if (e.key === 'Enter' && newComment.trim()) {
                        activeItem.comments.push({
                          id: `COM-${Date.now()}`,
                          author: reviewerName,
                          role: 'Brand Reviewer',
                          text: newComment.trim(),
                          timestamp: new Date().toISOString(),
                        });
                        setNewComment('');
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (newComment.trim()) {
                        activeItem.comments.push({
                          id: `COM-${Date.now()}`,
                          author: reviewerName,
                          role: 'Brand Reviewer',
                          text: newComment.trim(),
                          timestamp: new Date().toISOString(),
                        });
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
    </div>
  );
};
