'use client';

import React, { useEffect, useState } from 'react';
import type { User } from '@/types';

export function LoginScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [setupRequired, setSetupRequired] = useState(false);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<'login' | 'setup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/bootstrap').then(r => r.json()).then(d => {
      setSetupRequired(!!d.setupRequired);
      if (d.setupRequired) setMode('setup');
    }).catch(() => setError('Unable to connect to the authentication service.')).finally(() => setChecking(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const url = mode === 'setup' ? '/api/auth/bootstrap' : '/api/auth/login';
      const body = mode === 'setup' ? { token, email, name, password } : { email, password };
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Authentication failed.');
      if (mode === 'setup') {
        setSetupRequired(false); setMode('login'); setToken('');
        setNotice('Administrator created. Sign in with the new credentials.');
        return;
      }
      onAuthenticated(data.user as User);
    } catch (err) { setError(err instanceof Error ? err.message : 'Authentication failed.'); }
    finally { setBusy(false); }
  }

  if (checking) return <main className="min-h-screen grid place-items-center bg-slate-50 text-slate-600">Checking secure sign-in…</main>;
  return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-5">
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl space-y-5">
      <div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-600 text-white font-black text-lg">VB</div><div><h1 className="text-xl font-extrabold text-slate-900">VeriBrand AI</h1><p className="text-xs text-slate-500">Secure brand governance workspace</p></div></div>
      <div><h2 className="text-lg font-bold text-slate-900">{mode === 'setup' ? 'Initial administrator setup' : 'Sign in'}</h2><p className="mt-1 text-sm text-slate-500">{mode === 'setup' ? 'Create the first administrator account using your server bootstrap token.' : 'Use your account credentials to continue.'}</p></div>
      {mode === 'setup' && <><label className="block text-sm font-medium text-slate-700">Bootstrap token<input required value={token} onChange={e=>setToken(e.target.value)} type="password" autoComplete="off" className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm" /></label><label className="block text-sm font-medium text-slate-700">Full name<input required value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm" /></label></>}
      <label className="block text-sm font-medium text-slate-700">Email<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm" /></label>
      <label className="block text-sm font-medium text-slate-700">Password<input required type="password" autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} minLength={mode === 'setup' ? 14 : 1} value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm" /></label>
      {error && <p role="alert" className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-900">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">{notice}</p>}
      <button disabled={busy} className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Please wait…' : mode === 'setup' ? 'Create administrator' : 'Sign in'}</button>
      {setupRequired && mode === 'login' && <button type="button" onClick={()=>{setMode('setup');setError('')}} className="w-full text-sm text-indigo-700">Set up first administrator</button>}
    </form>
  </main>;
}
