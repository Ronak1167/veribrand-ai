'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Users,
  Palette,
  Mail,
  Shield,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  X,
  ChevronRight,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { OrganizationRole } from '@/types';

interface OrgMember {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  globalRole: string;
  orgRole: OrganizationRole;
  joinedAt: string;
}

interface OrgInvitation {
  id: string;
  email: string;
  role: OrganizationRole;
  token: string;
  expiresAt: string;
  status: string;
}

interface OrganizationDetails {
  id: string;
  name: string;
  slug: string;
  brandName?: string;
  logoUrl?: string;
  settings?: {
    brandColors?: string[];
    brandPalette?: Array<{ name: string; hex: string; role: string }>;
    headingFont?: string;
    bodyFont?: string;
  };
}

interface OrganizationManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeOrgId: string;
  activeRole: string;
  onOrgCreatedOrUpdated?: () => void;
}

export const OrganizationManagementModal: React.FC<OrganizationManagementModalProps> = ({
  isOpen,
  onClose,
  activeOrgId,
  activeRole,
  onOrgCreatedOrUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'members' | 'invites' | 'create'>('profile');
  const [org, setOrg] = useState<OrganizationDetails | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<OrgInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Profile Form State
  const [brandName, setBrandName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#4F46E5');
  const [secondaryColor, setSecondaryColor] = useState('#06B6D4');
  const [headingFont, setHeadingFont] = useState('Plus Jakarta Sans');
  const [bodyFont, setBodyFont] = useState('Inter');
  const [logoUrl, setLogoUrl] = useState('');

  // Invite Form State
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrganizationRole>('creator');

  // Create Org Form State
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [newOrgBrandName, setNewOrgBrandName] = useState('');

  const isOwnerOrAdmin = activeRole === 'owner' || activeRole === 'admin';

  // Load Org Data & Members
  const loadOrgData = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    setFeedback(null);
    try {
      const [orgRes, membersRes] = await Promise.all([
        fetch(`/api/organizations/${activeOrgId}`, { cache: 'no-store' }),
        fetch(`/api/organizations/${activeOrgId}/members`, { cache: 'no-store' }),
      ]);

      if (orgRes.ok) {
        const data = await orgRes.json();
        if (data.organization) {
          setOrg(data.organization);
          setBrandName(data.organization.brandName || data.organization.name);
          setLogoUrl(data.organization.logoUrl || '');
          if (data.organization.settings?.brandColors?.[0]) {
            setPrimaryColor(data.organization.settings.brandColors[0]);
          }
          if (data.organization.settings?.brandColors?.[1]) {
            setSecondaryColor(data.organization.settings.brandColors[1]);
          }
          if (data.organization.settings?.headingFont) {
            setHeadingFont(data.organization.settings.headingFont);
          }
          if (data.organization.settings?.bodyFont) {
            setBodyFont(data.organization.settings.bodyFont);
          }
          if (data.invitations) {
            setInvitations(data.invitations);
          }
        }
      }

      if (membersRes.ok) {
        const memData = await membersRes.json();
        setMembers(memData.members || []);
      }
    } catch {
      setFeedback({ type: 'error', message: 'Failed to load organization settings.' });
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    if (isOpen && activeOrgId) {
      const timer = setTimeout(() => {
        loadOrgData();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeOrgId, loadOrgData]);

  if (!isOpen) return null;

  // Handle Profile Update
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/organizations/${activeOrgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandName,
          logoUrl,
          settings: {
            brandColors: [primaryColor, secondaryColor],
            headingFont,
            bodyFont,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update brand profile.');

      setFeedback({ type: 'success', message: 'Brand identity updated successfully.' });
      if (onOrgCreatedOrUpdated) onOrgCreatedOrUpdated();
      loadOrgData();
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  // Handle Send Invite
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/organizations/${activeOrgId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invitation.');

      setFeedback({
        type: 'success',
        message: data.mode === 'added' ? `User ${inviteEmail} was added to team directly!` : `Invitation created for ${inviteEmail}.`,
      });
      setInviteEmail('');
      loadOrgData();
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  // Handle Role Change
  const handleRoleChange = async (memberUserId: string, newRole: OrganizationRole) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/organizations/${activeOrgId}/members/${memberUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update member role.');

      setFeedback({ type: 'success', message: 'Member role updated.' });
      loadOrgData();
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  // Handle Remove Member
  const handleRemoveMember = async (memberUserId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from this organization?`)) return;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/organizations/${activeOrgId}/members/${memberUserId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove member.');

      setFeedback({ type: 'success', message: `Removed ${memberName} from organization.` });
      loadOrgData();
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  // Handle Revoke Invite
  const handleRevokeInvite = async (token: string) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/organizations/invitations/${token}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke invitation.');

      setFeedback({ type: 'success', message: 'Invitation revoked.' });
      loadOrgData();
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  // Handle Create Organization Wizard
  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName) return;
    setLoading(true);
    setFeedback(null);
    try {
      const slug = newOrgSlug || newOrgName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newOrgName,
          slug,
          brandName: newOrgBrandName || `${newOrgName} Brand`,
          settings: {
            brandColors: [primaryColor, secondaryColor],
            headingFont,
            bodyFont,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create organization.');

      // Switch to new organization
      await fetch('/api/organizations/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: data.organization.id }),
      });

      setFeedback({ type: 'success', message: `Organization "${newOrgName}" created! Switched active tenant.` });
      if (onOrgCreatedOrUpdated) onOrgCreatedOrUpdated();
      setTimeout(() => {
        onClose();
        window.location.reload();
      }, 1000);
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const copyInviteLink = (token: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const link = `${origin}/invite/${token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-600/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>{org?.name || 'Organization Settings'}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold uppercase">
                  {activeRole}
                </span>
              </h2>
              <p className="text-xs text-slate-500">Tenant: {activeOrgId} • Multi-Tenant RBAC & Brand Governance</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex border-b border-slate-200 px-6 bg-slate-50/50">
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'profile'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Palette className="w-4 h-4" /> Brand Profile
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'members'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" /> Team Members ({members.length})
          </button>
          <button
            onClick={() => setActiveTab('invites')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'invites'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Mail className="w-4 h-4" /> Invitations
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all ml-auto ${
              activeTab === 'create'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Plus className="w-4 h-4" /> New Organization
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mx-6 mt-4 p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Tab Content */}
        <div className="p-6 max-h-[65vh] overflow-y-auto">
          {/* TAB 1: BRAND PROFILE */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Brand Display Name</label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    disabled={!isOwnerOrAdmin}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. Inkloom Enterprise"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Used in external audit disclaimers and governance reports.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Logo Asset URL</label>
                  <input
                    type="text"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    disabled={!isOwnerOrAdmin}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none"
                    placeholder="https://cdn.example.com/logo.svg"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Direct SVG or PNG link for visual inspection alignment.</p>
                </div>
              </div>

              {/* Brand Palette */}
              <div className="border-t border-slate-200 pt-5">
                <h3 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-indigo-600" /> Organization Color Tokens
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      disabled={!isOwnerOrAdmin}
                      className="w-10 h-10 rounded cursor-pointer border border-slate-300 p-0.5"
                    />
                    <div className="flex-1">
                      <span className="block text-xs font-bold text-slate-800">Primary Brand Action</span>
                      <span className="text-[11px] text-slate-500 uppercase font-mono">{primaryColor}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      disabled={!isOwnerOrAdmin}
                      className="w-10 h-10 rounded cursor-pointer border border-slate-300 p-0.5"
                    />
                    <div className="flex-1">
                      <span className="block text-xs font-bold text-slate-800">Secondary Accent</span>
                      <span className="text-[11px] text-slate-500 uppercase font-mono">{secondaryColor}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Typography Rules */}
              <div className="border-t border-slate-200 pt-5">
                <h3 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-600" /> Typography Standards
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Heading Typeface</label>
                    <select
                      value={headingFont}
                      onChange={(e) => setHeadingFont(e.target.value)}
                      disabled={!isOwnerOrAdmin}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg outline-none"
                    >
                      <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                      <option value="Inter">Inter</option>
                      <option value="Geist">Geist</option>
                      <option value="Segoe UI">Segoe UI</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Body Typeface</label>
                    <select
                      value={bodyFont}
                      onChange={(e) => setBodyFont(e.target.value)}
                      disabled={!isOwnerOrAdmin}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg outline-none"
                    >
                      <option value="Inter">Inter</option>
                      <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                      <option value="Roboto">Roboto</option>
                      <option value="system-ui">system-ui</option>
                    </select>
                  </div>
                </div>
              </div>

              {isOwnerOrAdmin && (
                <div className="flex justify-end pt-4 border-t border-slate-200">
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
                  >
                    {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    Save Brand Profile
                  </button>
                </div>
              )}
            </form>
          )}

          {/* TAB 2: MEMBERS & ROLES */}
          {activeTab === 'members' && (
            <div className="space-y-6">
              {/* Quick Invite Bar */}
              {isOwnerOrAdmin && (
                <form onSubmit={handleSendInvite} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-indigo-600" /> Invite Team Member
                  </h3>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="teammate@company.com"
                      className="flex-1 text-xs px-3 py-2 border border-slate-300 rounded-lg outline-none"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as OrganizationRole)}
                      className="text-xs px-3 py-2 border border-slate-300 rounded-lg outline-none font-medium"
                    >
                      <option value="creator">Creator</option>
                      <option value="reviewer">Reviewer</option>
                      <option value="admin">Admin</option>
                      <option value="readonly">Read-Only</option>
                      {activeRole === 'owner' && <option value="owner">Owner</option>}
                    </select>
                    <button
                      type="submit"
                      disabled={loading || !inviteEmail}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg shadow-xs transition-all whitespace-nowrap"
                    >
                      Invite Member
                    </button>
                  </div>
                </form>
              )}

              {/* Members Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 font-semibold text-slate-700">
                    <tr>
                      <th className="py-3 px-4">Member</th>
                      <th className="py-3 px-4">Organization Role</th>
                      <th className="py-3 px-4">Global Role</th>
                      <th className="py-3 px-4">Joined</th>
                      {isOwnerOrAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {members.map((m) => {
                      const isSelf = m.orgRole === activeRole;
                      return (
                        <tr key={m.membershipId} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{m.name}</div>
                            <div className="text-[11px] text-slate-500 font-mono">{m.email}</div>
                          </td>
                          <td className="py-3 px-4">
                            {isOwnerOrAdmin && !isSelf ? (
                              <select
                                value={m.orgRole}
                                onChange={(e) => handleRoleChange(m.userId, e.target.value as OrganizationRole)}
                                className="text-xs px-2 py-1 border border-slate-200 rounded font-semibold bg-white"
                              >
                                <option value="creator">Creator</option>
                                <option value="reviewer">Reviewer</option>
                                <option value="admin">Admin</option>
                                <option value="readonly">Read-Only</option>
                                {activeRole === 'owner' && <option value="owner">Owner</option>}
                              </select>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full font-bold uppercase text-[10px] bg-slate-100 text-slate-700">
                                {m.orgRole}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-slate-600 capitalize">{m.globalRole}</span>
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-[11px]">
                            {new Date(m.joinedAt).toLocaleDateString()}
                          </td>
                          {isOwnerOrAdmin && (
                            <td className="py-3 px-4 text-right">
                              {m.orgRole !== 'owner' && (
                                <button
                                  onClick={() => handleRemoveMember(m.userId, m.name)}
                                  className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors"
                                  title="Remove member"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: INVITATIONS */}
          {activeTab === 'invites' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Pending invitations to join this organization. Tokens expire after 3 to 7 days.
              </p>

              {invitations.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <Mail className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">No pending invitations</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Invite new team members from the Team Members tab.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-slate-50 font-semibold text-slate-700">
                      <tr>
                        <th className="py-3 px-4">Invited Email</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Expires</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Link / Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {invitations.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-semibold text-slate-900">{inv.email}</td>
                          <td className="py-3 px-4 uppercase text-[10px] font-bold text-indigo-700">{inv.role}</td>
                          <td className="py-3 px-4 text-slate-500">{new Date(inv.expiresAt).toLocaleDateString()}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              {inv.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right space-x-2">
                            <button
                              onClick={() => copyInviteLink(inv.token)}
                              className="px-2.5 py-1 text-[11px] border border-slate-300 rounded hover:bg-slate-100 font-semibold text-slate-700 inline-flex items-center gap-1"
                            >
                              {copiedToken === inv.token ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              {copiedToken === inv.token ? 'Copied' : 'Copy Link'}
                            </button>
                            {isOwnerOrAdmin && inv.status === 'pending' && (
                              <button
                                onClick={() => handleRevokeInvite(inv.token)}
                                className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors"
                                title="Revoke Invitation"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CREATE NEW ORGANIZATION WIZARD */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateOrg} className="space-y-6">
              <div className="bg-gradient-to-r from-indigo-50 to-cyan-50 border border-indigo-100 p-4 rounded-xl">
                <h3 className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-indigo-600" /> New Tenant Onboarding
                </h3>
                <p className="text-[11px] text-indigo-700 mt-1">
                  Create an isolated tenant workspace. You will automatically become the Owner with complete RBAC authority.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Organization Name *</label>
                  <input
                    type="text"
                    required
                    value={newOrgName}
                    onChange={(e) => {
                      setNewOrgName(e.target.value);
                      if (!newOrgSlug) {
                        setNewOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
                      }
                    }}
                    placeholder="e.g. Acme Health Corp"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Workspace Slug * (URL Identifier)</label>
                  <input
                    type="text"
                    required
                    value={newOrgSlug}
                    onChange={(e) => setNewOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    placeholder="e.g. acme-health"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg outline-none font-mono text-[11px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Brand Name</label>
                  <input
                    type="text"
                    value={newOrgBrandName}
                    onChange={(e) => setNewOrgBrandName(e.target.value)}
                    placeholder="e.g. Acme Health Brand"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-200">
                <button
                  type="submit"
                  disabled={loading || !newOrgName}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
                >
                  {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Create & Launch Tenant Workspace
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
