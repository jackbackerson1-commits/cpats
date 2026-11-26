'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Role } from '@prisma/client';
import { PageShell } from './PurchasingUI';
import { PurchaseOrderDocuments } from './PurchaseOrderDocuments';
import PrintOnlinePurchase from './PrintOnlinePurchase';
import { useUnsavedForm, useUnsavedNavigation } from '@/components/ui/UnsavedChanges';
import { ONLINE_PURCHASE_POLICY, ONLINE_PURCHASE_STAGE_LABELS, type OnlinePurchaseAction, type OnlinePurchaseRecord } from '@/shared/online-purchase';

const field = 'block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-emerald-700';
const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50';
const money = (value: string) => Number(value).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });

export default function OnlinePurchaseWorkspace() {
  const [records, setRecords] = useState<OnlinePurchaseRecord[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const navigate = useUnsavedNavigation();
  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams(window.location.search);
      params.set('page', String(page));
      const response = await fetch(`/api/po/online-purchase?${params}`, { signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Online purchases could not be loaded.');
      if (controller.signal.aborted) return;
      setRecords(result.data); setRole(result.role); setTotal(result.total);
      setSelectedId(previous => result.data.some((record: OnlinePurchaseRecord) => record.id === previous) ? previous : result.data[0]?.id || '');
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Online purchases could not be loaded.');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [page]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) return load(); });
    return () => { active = false; abortRef.current?.abort(); };
  }, [load]);
  const selected = records.find(record => record.id === selectedId);
  return <PageShell>
    <header className="mb-5"><h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Online cash purchases</h1><p className="mt-2 text-sm leading-6 text-slate-600">Review the checkout amount, authorize a check, and record ordering before delivery inspection.</p></header>
    <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>{ONLINE_PURCHASE_POLICY.title} · version {ONLINE_PURCHASE_POLICY.version}.</strong> This temporary sequence is awaiting BO confirmation. A checkout quotation or unpaid checkout screenshot supports the amount before check release. Revised amounts require fresh BO and Admin review. Changes after check release require manual BO resolution.</p>
    <div className="my-5 flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">Purchase order
        <select value={selectedId} disabled={loading} onChange={event => navigate(() => setSelectedId(event.target.value))} className={`${field} mt-2`}>
          {!records.length && <option value="">No eligible purchase orders</option>}
          {records.map(record => <option key={record.id} value={record.id}>{record.poNumber} · {record.purchaseRequest.department.code} · {record.onlinePurchase ? ONLINE_PURCHASE_STAGE_LABELS[record.onlinePurchase.stage] : 'Not enrolled'}</option>)}
        </select>
      </label>
      <button type="button" disabled={loading} onClick={() => navigate(() => void load())} className={button}>Refresh purchases</button>
      <Link href="/dashboard/po/online" className={button}>All pending orders</Link>
    </div>
    {loading && <p role="status" className="my-3 text-sm text-slate-600">Loading online purchases…</p>}
    {error && <p role="alert" className="my-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
    {success && <p role="status" className="my-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
    {!loading && !error && !records.length && <p className="my-5 text-sm text-slate-600">{role === Role.Purchasing_Office ? 'No pending or submitted online POs match this view.' : 'No submitted online POs match this view. Orders appear after Purchasing submits the amount and checkout evidence.'}</p>}
    {selected && role && <OnlinePurchaseForm key={`${selected.id}-${selected.onlinePurchase?.version ?? 0}`} record={selected} role={role} refreshing={loading || Boolean(error)} refresh={() => void load()} onSaved={() => setSuccess('Action recorded. The latest stage and revision appear below after refresh.')} />}
    {total > 20 && <nav aria-label="Online purchase pages" className="mt-5 flex flex-wrap items-center gap-3">
      <button type="button" disabled={page === 1 || loading} onClick={() => navigate(() => setPage(page - 1))} className={button}>Previous</button>
      <span className="text-sm text-slate-600">Page {page} of {Math.ceil(total / 20)}</span>
      <button type="button" disabled={page * 20 >= total || loading} onClick={() => navigate(() => setPage(page + 1))} className={button}>Next</button>
    </nav>}
  </PageShell>;
}

function OnlinePurchaseForm({ record, role, refreshing, refresh, onSaved }: { record: OnlinePurchaseRecord; role: Role; refreshing: boolean; refresh: () => void; onSaved: () => void }) {
  const plan = record.onlinePurchase;
  const selectedOnlineCash = record.purchaseMethod === 'ONLINE_CASH';
  const [amount, setAmount] = useState(plan?.amount || '');
  const [documentId, setDocumentId] = useState(plan?.quoteDocumentId || '');
  const [notes, setNotes] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [payee, setPayee] = useState('');
  const [orderReference, setOrderReference] = useState('');
  const [actualAmount, setActualAmount] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const guard = useUnsavedForm(`${record.id}-${plan?.version ?? 0}`, { amount, documentId, notes, checkNumber, payee, orderReference, actualAmount, confirmed }, { blocked: saving });
  const canSubmit = role === Role.Purchasing_Office && !record.isCheckIssued && record.paymentType === 'CASH_CHECK' && (!plan || ['AWAITING_BO', 'AWAITING_ADMIN', 'AUTHORIZED', 'RETURNED'].includes(plan.stage));
  const canReviewBO = role === Role.Business_Office && plan?.stage === 'AWAITING_BO';
  const canReviewAdmin = role === Role.Admin_Office && plan?.stage === 'AWAITING_ADMIN';
  const canRelease = role === Role.Business_Office && plan?.stage === 'AUTHORIZED';
  const canOrder = role === Role.Purchasing_Office && plan?.stage === 'CHECK_RELEASED';
  const canAct = canSubmit || canReviewBO || canReviewAdmin || canRelease || canOrder;

  async function act(action: OnlinePurchaseAction['action']) {
    if (pending.current) return;
    setError('');
    if (!formRef.current?.reportValidity()) return;
    if ((action === 'RELEASE_CHECK' || action === 'RECORD_ORDER') && !confirmed) { setError('Confirm the check release or placed order before recording it.'); return; }
    if ((action === 'BO_RETURN' || action === 'ADMIN_RETURN') && notes.trim().length < 5) { setError('Please explain what Purchasing must correct in at least 5 characters.'); return; }
    pending.current = true; setSaving(true);
    try {
      const details = action === 'SUBMIT' ? { amount, documentId } : action === 'RELEASE_CHECK' ? { checkNumber, payee } : action === 'RECORD_ORDER' ? { orderReference, actualAmount, documentId } : {};
      const response = await fetch('/api/po/online-purchase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poId: record.id, version: plan?.version ?? 0, action, notes, ...details }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'The action could not be saved.');
      guard.clear(); onSaved(); refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The save response could not be confirmed. Refresh and check the latest revision before retrying.'); }
    finally { pending.current = false; setSaving(false); }
  }

  return <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-slate-950">{record.poNumber}</h2>
      <p className="mt-2 text-sm text-slate-600">{record.purchaseRequest.department.name}</p>
      <p className="mt-3 font-semibold text-emerald-900">{plan ? ONLINE_PURCHASE_STAGE_LABELS[plan.stage] : selectedOnlineCash ? 'Awaiting the checkout amount and screenshot from Purchasing' : 'Purchasing can start the provisional online workflow'}</p>
      {plan && <>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-600">Current submitted amount</dt><dd className="font-semibold">{money(plan.amount)}</dd></div>
          <div><dt className="text-slate-600">Revision</dt><dd>{plan.revision} · provisional policy v{plan.policyVersion}</dd></div>
          <div><dt className="text-slate-600">First submitted amount</dt><dd>{money(plan.initialAmount)}</dd></div>
          <div><dt className="text-slate-600">Check</dt><dd>{plan.checkNumber ? `${plan.checkNumber} · ${plan.payee}` : 'Awaiting release'}</dd></div>
        </dl>
        <a href={plan.quoteDocument.filePath} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center break-all text-sm font-medium text-emerald-800 underline">{plan.quoteDocument.fileName}<span className="sr-only"> (opens in a new tab)</span></a>
        <div className="mt-2"><PrintOnlinePurchase record={record} disabled={refreshing || saving} /></div>
        {plan.orderReference && <p className="mt-2 text-sm">Recorded order reference: {plan.orderReference}</p>}
      </>}
      {canAct && <form ref={formRef} onSubmit={event => event.preventDefault()} className="mt-5 space-y-4 border-t border-slate-200 pt-4">
        <fieldset disabled={saving} className="min-w-0 space-y-4">
          <legend className="sr-only">Provisional online purchase action</legend>
          {canSubmit && <label className="block text-sm font-medium">{selectedOnlineCash ? 'Final checkout total (PHP)' : 'Final checkout quotation total (PHP)'}
            <input value={amount} onChange={event => setAmount(event.target.value)} required inputMode="decimal" maxLength={15} placeholder="1000.00" className={`${field} mt-2`} />
          </label>}
          {(canSubmit || canOrder) && <label className="block text-sm font-medium">{canOrder ? 'Actual order confirmation' : selectedOnlineCash ? 'Saved screenshot showing the final total' : 'Saved checkout quotation or screenshot'}
            <select value={documentId} required onChange={event => setDocumentId(event.target.value)} className={`${field} mt-2`}>
              <option value="">Choose evidence saved below</option>
              {plan && !record.documents.some(document => document.id === plan.quoteDocumentId) && <option value={plan.quoteDocumentId}>{plan.quoteDocument.fileName}</option>}
              {record.documents.map(document => <option key={document.id} value={document.id}>{document.fileName}</option>)}
            </select>
          </label>}
          {canSubmit && !plan && <p className="text-sm leading-6 text-slate-600">Save your screenshot under PO supporting documents below, then select it here and submit it with the amount for Business Office review.</p>}
          {canRelease && <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">Issued check number<input required minLength={4} maxLength={100} value={checkNumber} onChange={event => setCheckNumber(event.target.value)} className={`${field} mt-2`} /></label>
            <label className="block text-sm font-medium">Check payee<input required minLength={2} maxLength={180} value={payee} onChange={event => setPayee(event.target.value)} className={`${field} mt-2`} /></label>
          </div>}
          {canOrder && <>
            <label className="block text-sm font-medium">Actual order total (PHP)<input required inputMode="decimal" maxLength={15} value={actualAmount} onChange={event => setActualAmount(event.target.value)} className={`${field} mt-2`} /></label>
            <p className="text-sm leading-6 text-slate-600">The total must match the released check amount. If the price changed, pause ordering and ask BO to resolve it manually.</p>
            <label className="block text-sm font-medium">Placed order reference<input required minLength={3} maxLength={180} value={orderReference} onChange={event => setOrderReference(event.target.value)} className={`${field} mt-2`} /></label>
          </>}
          <label className="block text-sm font-medium">{canSubmit && plan ? 'Reason for the revised amount or evidence' : 'Review notes'}
            <textarea rows={3} required={Boolean(canSubmit && plan)} minLength={canSubmit && plan ? 5 : undefined} maxLength={1000} value={notes} onChange={event => setNotes(event.target.value)} className={`${field} mt-2`} />
          </label>
          {(canRelease || canOrder) && <label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-5 shrink-0" />{canRelease ? `I confirm the authorized check was issued for ${money(plan!.amount)} to the named payee.` : 'I confirm the order has been placed after check release and the selected evidence records that order.'}</label>}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {canSubmit && <button type="button" onClick={() => void act('SUBMIT')} className={`${button} bg-emerald-800 text-white`}>{plan ? 'Submit new revision for BO and Admin review' : 'Submit checkout for BO review'}</button>}
            {canReviewBO && <><button type="button" onClick={() => void act('BO_APPROVE')} className={`${button} bg-emerald-800 text-white`}>BO review complete · send to Admin</button><button type="button" onClick={() => void act('BO_RETURN')} className={button}>Return to Purchasing</button></>}
            {canReviewAdmin && <><button type="button" onClick={() => void act('ADMIN_APPROVE')} className={`${button} bg-emerald-800 text-white`}>Authorize this revision for check release</button><button type="button" onClick={() => void act('ADMIN_RETURN')} className={button}>Return to Purchasing</button></>}
            {canRelease && <button type="button" onClick={() => void act('RELEASE_CHECK')} className={`${button} bg-emerald-800 text-white`}>Record check release</button>}
            {canOrder && <button type="button" onClick={() => void act('RECORD_ORDER')} className={`${button} bg-emerald-800 text-white`}>Record order and send to Receiving</button>}
          </div>
        </fieldset>
        {saving && <p role="status" className="text-sm text-slate-600">Saving the online purchase action…</p>}
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
      </form>}
      {!canAct && <p className="mt-4 text-sm leading-6 text-slate-600">The next action belongs to the office shown in the current stage. Refresh to see the latest decision.</p>}
    </section>
    <PurchaseOrderDocuments key={record.id} poId={record.id} onSaved={refresh} />
    {plan && <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h3 className="font-semibold">Online purchase decisions</h3>
      <ol className="mt-4 space-y-3">{plan.events.map(event => <li key={event.id} className="min-w-0 border-l-2 border-slate-200 pl-3 text-sm leading-6">
        <p className="font-medium">{event.onlinePurchaseAction.replaceAll('_', ' ')} · revision {event.onlinePurchaseRevision} · {money(event.onlinePurchaseAmount)}</p>
        <p className="whitespace-pre-wrap text-slate-700">{event.remarks}</p>
        <p className="text-xs text-slate-600">{event.actor.role.replaceAll('_', ' ')} · {event.actor.email} · <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</time></p>
      </li>)}</ol>
    </section>}
  </div>;
}
