'use client';

import { useEffect, useState } from 'react';
import type { User, UserRole } from '@/types';

export function AdminUsersPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('creator');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadUsers() {
    const response = await fetch('/api/auth/users', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load accounts.');
    setUsers(data.users || []);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/users', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load accounts.');
        if (!controller.signal.aborted) setUsers(data.users || []);
      })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load accounts.'); });
    return () => controller.abort();
  }, []);

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Account creation failed.');
      setName(''); setEmail(''); setPassword('');
      setMessage('Account created successfully.');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account creation failed.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
    <header>
      <h2 className="text-xl font-bold text-slate-900">User & role management</h2>
      <p className="mt-1 text-sm text-slate-600">Create individual accounts for content creators and reviewers. Passwords are stored as per-account scrypt hashes.</p>
    </header>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form onSubmit={createAccount} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <h3 className="font-semibold text-slate-900">Create account</h3>
        <label className="block text-sm font-medium text-slate-700">Full name<input required minLength={2} value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /></label>
        <label className="block text-sm font-medium text-slate-700">Email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /></label>
        <label className="block text-sm font-medium text-slate-700">Role<select value={role} onChange={e=>setRole(e.target.value as UserRole)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"><option value="creator">Creator</option><option value="reviewer">Reviewer</option><option value="admin">Administrator</option></select></label>
        <label className="block text-sm font-medium text-slate-700">Temporary password<input required type="password" minLength={14} maxLength={1024} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /><span className="mt-1 block text-xs text-slate-500">At least 14 characters. Share it securely with the account owner.</span></label>
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="font-semibold text-slate-900">Existing accounts ({users.length})</h3>
        <ul className="mt-3 divide-y divide-slate-100">
          {users.map(user => <li key={user.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{user.name}</p><p className="truncate text-xs text-slate-500">{user.email}</p></div>
            <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">{user.role}</span>
          </li>)}
          {!users.length && <li className="py-4 text-sm text-slate-500">No accounts found.</li>}
        </ul>
      </div>
    </div>
  </section>;
}
