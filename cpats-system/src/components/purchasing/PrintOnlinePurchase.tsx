'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { normalizeReportItems } from '@/shared/monthly-report';
import { ONLINE_PURCHASE_STAGE_LABELS, type OnlinePurchaseRecord } from '@/shared/online-purchase';
import './online-purchase-print.css';

export function OnlinePurchasePrintSheet({ record }: { record: OnlinePurchaseRecord }) {
  const plan = record.onlinePurchase;
  if (!plan) return null;
  const items = normalizeReportItems(record.purchaseRequest.itemsPayload);
  const authorizationStage = ['AUTHORIZED', 'CHECK_RELEASED', 'ORDERED'].includes(plan.stage);
  const decisions = plan.events.filter(event => event.onlinePurchaseRevision === plan.revision
    && Number(event.onlinePurchaseAmount) === Number(plan.amount));
  const boReview = authorizationStage || plan.stage === 'AWAITING_ADMIN'
    ? decisions.find(event => event.onlinePurchaseAction === 'BO_APPROVE')
    : undefined;
  const adminApproval = authorizationStage && boReview
    ? decisions.find(event => event.onlinePurchaseAction === 'ADMIN_APPROVE')
    : undefined;
  let authorization = 'Pending approval';
  if (plan.stage === 'RETURNED') authorization = 'Returned — authorization required';
  if (authorizationStage) authorization = adminApproval ? 'Admin authorization recorded' : 'Authorization could not be confirmed';
  const decisionDetails = (entry: typeof adminApproval) => entry
    ? <>{entry.actor.email}<br /><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} PHT</time></>
    : 'No active approval for this revision';

  return <article className="cpats-online-po-print">
    <div className="cpats-online-po-print-summary">
      <header>
        <p>DMC College Foundation, Inc. · CPATS</p>
        <h1>Online purchase order review copy</h1>
      </header>
      <p className="cpats-online-po-print-authorization"><strong>{authorization}</strong></p>
      <dl>
        <dt>Purchase order</dt><dd>{record.poNumber}</dd>
        <dt>Purchase request</dt><dd>{record.purchaseRequest.id}</dd>
        <dt>Requesting department</dt><dd>{record.purchaseRequest.department.name} ({record.purchaseRequest.department.code})</dd>
        <dt>Checkout revision</dt><dd>{plan.revision}</dd>
        <dt>Recorded stage</dt><dd>{authorizationStage && !adminApproval ? 'Verify this revision in CPATS' : ONLINE_PURCHASE_STAGE_LABELS[plan.stage]}</dd>
        <dt>Submitted checkout total</dt><dd><strong>{Number(plan.amount).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}</strong></dd>
        <dt>Checkout evidence</dt><dd>{plan.quoteDocument.fileName}<br />Document reference {plan.quoteDocumentId}</dd>
        <dt>Business Office review</dt><dd>{decisionDetails(boReview)}</dd>
        <dt>Admin authorization</dt><dd>{decisionDetails(adminApproval)}</dd>
      </dl>
    </div>
    <h2>Requested items</h2>
    {items.length ? <table>
      <thead><tr><th scope="col">Item</th><th scope="col">Requested quantity</th></tr></thead>
      <tbody>{items.map((item, index) => <tr key={index}><td>{item.itemName}</td><td>{item.quantity}</td></tr>)}</tbody>
    </table> : <p>No item lines are available on the linked request.</p>}
    <p>Internal CPATS review copy. See the saved checkout evidence for the supplier breakdown.</p>
  </article>;
}

export default function PrintOnlinePurchase({ record, disabled }: { record: OnlinePurchaseRecord; disabled: boolean }) {
  const [printRecord, setPrintRecord] = useState<OnlinePurchaseRecord | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const finish = () => setPrintRecord(null);
    window.addEventListener('afterprint', finish);
    return () => {
      window.removeEventListener('afterprint', finish);
      controller.current?.abort();
    };
  }, []);

  async function print() {
    if (controller.current || disabled || printRecord) return;
    const request = new AbortController();
    controller.current = request;
    setError('');
    setChecking(true);
    try {
      const params = new URLSearchParams({ poId: record.id });
      const response = await fetch(`/api/po/online-purchase?${params}`, { cache: 'no-store', signal: request.signal });
      if (!response.ok) throw new Error('Could not verify the PO for printing. Try again or refresh purchases.');
      const result: { success: boolean; data: OnlinePurchaseRecord[] } = await response.json();
      if (request.signal.aborted) return;
      const latest = result.success && result.data.find(item => item.id === record.id);
      if (!latest || !latest.onlinePurchase || latest.onlinePurchase.version !== record.onlinePurchase?.version) {
        throw new Error('This PO has changed or is unavailable. Refresh purchases before printing.');
      }
      // Mount the print portal before the browser takes its print snapshot.
      flushSync(() => setPrintRecord(latest));
      window.print();
    } catch (cause) {
      if (!request.signal.aborted) {
        setPrintRecord(null);
        setError(cause instanceof Error ? cause.message : 'The PO review copy could not be printed.');
      }
    } finally {
      controller.current = null;
      if (!request.signal.aborted) setChecking(false);
    }
  }

  return <>
    <button type="button" disabled={disabled || checking || Boolean(printRecord)} onClick={() => void print()} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50">Print PO review copy</button>
    {checking && <p role="status" className="mt-2 text-sm text-slate-600">Checking the latest PO revision.</p>}
    {error && <p role="alert" className="mt-2 text-sm text-rose-800">{error}</p>}
    {printRecord && createPortal(<OnlinePurchasePrintSheet record={printRecord} />, document.body)}
  </>;
}
