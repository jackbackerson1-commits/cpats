'use client';

import { actionFeedback, submissionFeedbackError } from '@/components/ui/action-feedback';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Role } from '@prisma/client';
import { Building2, CircleCheck, Clock3, LockKeyhole, Plus, RefreshCw, UserRoundPlus, UsersRound } from 'lucide-react';
import '@/components/account/system-accounts-workspace.css';

type Department = { id: string; name: string; code: string };
type StaffAccount = {
  id: string;
  email: string;
  role: Role;
  accountStatus: 'Pending' | 'Active' | 'Disabled';
  emailVerifiedAt: string | null;
  department: Department;
  createdAt: string;
};

const ASSIGNABLE_ROLES = [
  [Role.Requesting_Office, 'Requesting Office'],
  [Role.Business_Office, 'Business Office'],
  [Role.Admin_Office, 'Admin Office'],
  [Role.Purchasing_Office, 'Purchasing Office'],
  [Role.Receiving_Custodian, 'Receiving Custodian'],
  [Role.Global_Auditor, 'Global Auditor'],
] as const;

const FIXED_OFFICE: Partial<Record<Role, string>> = {
  [Role.Business_Office]: 'BFO',
  [Role.Admin_Office]: 'OVPA',
  [Role.Purchasing_Office]: 'PPO',
  [Role.Receiving_Custodian]: 'PAMU',
  [Role.Global_Auditor]: 'IAO',
};
const NON_REQUESTING_CODES = new Set(['BFO', 'OVPA', 'PPO', 'PAMU', 'IAO', 'SYS']);

function roleLabel(role: Role) {
  return ASSIGNABLE_ROLES.find(([value]) => value === role)?.[1] ?? 'System Administrator';
}

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}

export default function StaffAccountsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [departmentCode, setDepartmentCode] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>(Role.Requesting_Office);
  const [departmentId, setDepartmentId] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const [departmentResult, accountResult] = await Promise.all([
        jsonRequest('/api/system/departments'),
        jsonRequest('/api/system/accounts'),
      ]);
      setDepartments(departmentResult.data);
      setAccounts(accountResult.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load staff accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([jsonRequest('/api/system/departments'), jsonRequest('/api/system/accounts')])
      .then(([departmentResult, accountResult]) => {
        setDepartments(departmentResult.data);
        setAccounts(accountResult.data);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load staff accounts.'))
      .finally(() => setLoading(false));
  }, []);

  const availableDepartments = useMemo(() => departments.filter((department) =>
    role === Role.Requesting_Office
      ? !NON_REQUESTING_CODES.has(department.code)
      : department.code === FIXED_OFFICE[role]
  ), [departments, role]);

  const selectedDepartmentId = availableDepartments.some((department) => department.id === departmentId)
    ? departmentId : availableDepartments[0]?.id ?? '';

  async function addDepartment(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      await jsonRequest('/api/system/departments', {
        method: 'POST', body: JSON.stringify({ name: departmentName, code: departmentCode }),
      });
      setDepartmentName(''); setDepartmentCode('');
      setNotice('Department added. You can now assign staff to it.');
      actionFeedback('Department added', `${departmentName} (${departmentCode}) is available for staff assignment.`);
      await load();
    } catch (cause) {
      submissionFeedbackError(cause);
      setError(cause instanceof Error ? cause.message : 'Unable to add department.');
    } finally { setSaving(false); }
  }

  async function addAccount(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await jsonRequest('/api/system/accounts', {
        method: 'POST', body: JSON.stringify({ email, role, departmentId: selectedDepartmentId }),
      });
      setEmail('');
      setNotice(result.warning || result.message || 'Account created.');
      actionFeedback('Account created', result.warning || result.message || 'The account is pending activation.', result.warning ? 'warning' : 'success');
      await load();
    } catch (cause) {
      submissionFeedbackError(cause);
      setError(cause instanceof Error ? cause.message : 'Unable to add account.');
    } finally { setSaving(false); }
  }

  async function sendLink(account: StaffAccount) {
    setSaving(true); setError(''); setNotice('');
    try {
      const purpose = account.accountStatus === 'Pending' ? 'Activation' : 'Password_Reset';
      const result = await jsonRequest(`/api/system/accounts/${encodeURIComponent(account.id)}/send-link`, {
        method: 'POST', body: JSON.stringify({ purpose }),
      });
      setNotice(`${account.email}: ${result.message}`);
      actionFeedback(purpose === 'Activation' ? 'Invitation processed' : 'Reset link processed', `${account.email}: ${result.message}`);
    } catch (cause) {
      submissionFeedbackError(cause);
      setError(cause instanceof Error ? cause.message : 'Unable to send the link.');
    } finally { setSaving(false); }
  }

  async function changeAccess(account: StaffAccount) {
    const status = account.accountStatus === 'Disabled' ? 'Active' : 'Disabled';
    if (status === 'Disabled' && !window.confirm(`Disable access for ${account.email}?`)) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await jsonRequest(`/api/system/accounts/${encodeURIComponent(account.id)}`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
      setNotice(`${account.email}: access ${status === 'Active' ? 'restored' : 'disabled'}.`);
      actionFeedback(status === 'Active' ? 'Account access restored' : 'Account access disabled', account.email, status === 'Active' ? 'success' : 'warning');
      await load();
    } catch (cause) {
      submissionFeedbackError(cause);
      setError(cause instanceof Error ? cause.message : 'Unable to change account access.');
    } finally { setSaving(false); }
  }

  const inputClass = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100';
  const actionClass = 'min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

  return <main className="system-accounts-page mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <div className="system-page-introduction mb-7">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-700"><Building2 className="size-4 shrink-0" aria-hidden="true" />System administration</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Departments and staff accounts</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Assign each staff member an individual account, role, and department. Department codes identify offices; program codes such as BSN belong to degree programs. {process.env.NODE_ENV !== 'production' ? 'For this local demonstration, account links appear in the development server log.' : 'Account links require the configured institutional mail service.'}</p>
    </div>

    {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
    {notice && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</div>}

    <div className="system-accounts-forms grid gap-5 lg:grid-cols-2">
      <form onSubmit={addDepartment} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-slate-950"><Building2 className="size-5 shrink-0" aria-hidden="true" />Add a department</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">Use the name and stable office code approved by DMC. Existing departments are preserved.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <label className="block text-xs font-semibold text-slate-700">Department name<input required minLength={3} maxLength={120} value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} className={`mt-1.5 ${inputClass}`} placeholder="College of Nursing" /></label>
          <label className="block text-xs font-semibold text-slate-700">Office code<input required minLength={2} maxLength={12} value={departmentCode} onChange={(event) => setDepartmentCode(event.target.value.toUpperCase())} className={`mt-1.5 ${inputClass}`} placeholder="Approved code" /></label>
        </div>
        <button disabled={saving} className="mt-5 min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><Plus className="size-4 shrink-0" aria-hidden="true" />Add department</button>
        <details className="system-accounts-departments mt-4"><summary className="cursor-pointer font-semibold text-slate-700">Existing departments ({departments.length})</summary><div className="mt-2 flex flex-wrap gap-2" aria-label="Existing departments">
          {departments.map((department) => <span key={department.id} className="max-w-full break-words rounded-md bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700"><strong>{department.code}</strong> · {department.name}</span>)}
        </div></details>
      </form>

      <form onSubmit={addAccount} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-slate-950"><UserRoundPlus className="size-5 shrink-0" aria-hidden="true" />Create a staff account</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">The account stays pending until the staff member opens the activation link and sets a password.</p>
        <div className="mt-5 grid gap-4">
          <label className="block text-xs font-semibold text-slate-700">Staff email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={`mt-1.5 ${inputClass}`} placeholder="name@dmc.edu.ph" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-700">Role<select value={role} onChange={(event) => setRole(event.target.value as Role)} className={`mt-1.5 ${inputClass}`}>{ASSIGNABLE_ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="block text-xs font-semibold text-slate-700">Department<select required value={selectedDepartmentId} onChange={(event) => setDepartmentId(event.target.value)} className={`mt-1.5 ${inputClass}`}><option value="">Choose an office</option>{availableDepartments.map((department) => <option key={department.id} value={department.id}>{department.code} · {department.name}</option>)}</select></label>
          </div>
        </div>
        <button disabled={saving || !selectedDepartmentId} className="mt-5 min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><UserRoundPlus className="size-4 shrink-0" aria-hidden="true" />Create and invite</button>
      </form>
    </div>

    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="account-list-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 id="account-list-heading" className="text-lg font-semibold text-slate-950"><UsersRound className="size-5 shrink-0" aria-hidden="true" />Staff accounts</h2><p className="mt-1 text-xs text-slate-500">Account actions are separate from procurement decisions.</p></div>
        <button type="button" onClick={() => void load()} className={actionClass}><RefreshCw className="size-4 shrink-0" aria-hidden="true" />Refresh list</button>
      </div>
      {loading ? <p className="mt-5 text-sm text-slate-600">Loading accounts…</p> : accounts.length === 0 ? <p className="mt-5 text-sm text-slate-600">No accounts found.</p> :
        <div className="system-accounts-list mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => <article key={account.id} className="min-w-0 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 break-all text-sm font-semibold text-slate-950">{account.email}</h3><span className={`system-account-status rounded-full px-2 py-1 text-[10px] font-bold uppercase ${account.accountStatus === 'Active' ? 'bg-emerald-100 text-emerald-800' : account.accountStatus === 'Pending' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'}`}>{account.accountStatus === 'Active' ? <CircleCheck className="size-4 shrink-0" aria-hidden="true" /> : account.accountStatus === 'Pending' ? <Clock3 className="size-4 shrink-0" aria-hidden="true" /> : <LockKeyhole className="size-4 shrink-0" aria-hidden="true" />}{account.accountStatus}</span></div>
            <p className="mt-2 text-xs text-slate-700">{roleLabel(account.role)} · {account.department.code}</p>
            <p className="mt-1 break-words text-xs text-slate-500">{account.department.name}</p>
            {account.role !== Role.System_Administrator && <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {account.accountStatus !== 'Disabled' && <button type="button" disabled={saving} onClick={() => void sendLink(account)} className={actionClass}>{account.accountStatus === 'Pending' ? 'Resend invitation' : 'Send reset link'}</button>}
              {account.accountStatus !== 'Pending' && <button type="button" disabled={saving} onClick={() => void changeAccess(account)} className={actionClass}>{account.accountStatus === 'Disabled' ? 'Enable access' : 'Disable access'}</button>}
            </div>}
          </article>)}
        </div>}
    </section>
  </main>;
}
