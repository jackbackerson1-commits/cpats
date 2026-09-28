'use client';

import { useState } from 'react';
import Link from 'next/link';

type Purpose = 'Activation' | 'Password_Reset';

export default function AccountTokenPanel({ purpose, token }: { purpose: Purpose; token?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(''); setMessage('');
    if (token && password !== confirmPassword) { setError('The passwords do not match.'); return; }
    setBusy(true);
    try {
      const response = await fetch(token ? '/api/auth/complete-token' : '/api/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(token ? { token, purpose, newPassword: password } : { email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to complete the request.');
      setMessage(result.message);
      setPassword(''); setConfirmPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to complete the request.');
    } finally { setBusy(false); }
  }

  const title = purpose === 'Activation' ? 'Activate your account' : token ? 'Choose a new password' : 'Reset your password';
  const inputClass = 'mt-1.5 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100';

  return <main className="flex min-h-[100svh] items-center justify-center bg-[#f4f8f5] px-4 py-8 text-slate-900">
    <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-700">CPATS staff access</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{token ? 'Set a password of at least 16 characters. This link can be used once.' : purpose === 'Activation' ? 'This activation link is missing. Ask the account administrator to resend your invitation.' : 'Enter the email address assigned to your CPATS account. If recovery is available, instructions will be sent.'}</p>

      {error && <div role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {message && <div role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div>}

      {(token || purpose === 'Password_Reset') && !message && <form onSubmit={submit} className="mt-6 space-y-4">
        {token ? <>
          <label className="block text-sm font-semibold">New password<input required type="password" autoComplete="new-password" minLength={16} maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} /></label>
          <label className="block text-sm font-semibold">Confirm password<input required type="password" autoComplete="new-password" minLength={16} maxLength={256} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass} /></label>
        </> : <label className="block text-sm font-semibold">Staff account email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} placeholder="name@dmc.edu.ph" /></label>}
        <button disabled={busy} className="min-h-12 w-full rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">{busy ? 'Working…' : token ? 'Save new password' : 'Request reset link'}</button>
      </form>}

      <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-emerald-800 underline underline-offset-4">Back to sign in</Link>
    </section>
  </main>;
}
