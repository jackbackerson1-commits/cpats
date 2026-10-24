'use client';

import { useId, useState } from 'react';
import { actionFeedback, submissionFeedbackError } from '@/components/ui/action-feedback';

export interface ReceivedAssetOrder {
  reportId: string; purchaseOrderId: string; poNumber: string;
  lines: { lineIndex: number; itemName: string; quantity: number }[];
  taggedUnits: { lineIndex: number; unitNumber: number }[];
}

function unitRanges(numbers: number[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const unit of [...numbers].sort((a, b) => a - b)) {
    const last = ranges.at(-1);
    if (last && unit === last[1] + 1) last[1] = unit;
    else ranges.push([unit, unit]);
  }
  return ranges;
}

function missingRanges(quantity: number, tagged: [number, number][]): [number, number][] {
  const ranges: [number, number][] = [];
  let start = 1;
  for (const [from, to] of tagged) {
    if (start < from) ranges.push([start, from - 1]);
    start = to + 1;
  }
  if (start <= quantity) ranges.push([start, quantity]);
  return ranges;
}

function describeUnits(ranges: [number, number][]) {
  return ranges.map(([from, to]) => from === to ? `Unit ${from}` : `Units ${from}–${to}`).join(', ');
}

export default function AssetRegistration({ orders, reportId, loading, onOrderChange, onSaved }: {
  orders: ReceivedAssetOrder[]; reportId: string; loading: boolean; onOrderChange: (reportId: string) => void;
  onSaved: (ids: string[], order: ReceivedAssetOrder) => Promise<void>;
}) {
  const [lineIndex, setLineIndex] = useState('');
  const [countDraft, setCountDraft] = useState('1');
  const [serials, setSerials] = useState<Record<number, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const countId = useId();
  const order = orders.find((entry) => entry.reportId === reportId);
  const line = order?.lines.find((entry) => String(entry.lineIndex) === lineIndex);
  const used = new Set(order?.taggedUnits.filter((unit) => String(unit.lineIndex) === lineIndex).map((unit) => unit.unitNumber));
  const remaining = line ? line.quantity - used.size : 0;
  const limit = Math.min(remaining, 100);
  const count = /^[1-9]\d*$/.test(countDraft) ? Number(countDraft) : NaN;
  const validCount = Number.isSafeInteger(count) && count >= 1 && count <= limit;
  const countError = validCount || !line || remaining <= 0 ? '' : limit === 1 ? 'Enter 1 to register the remaining unit.' : !countDraft ? `Enter a whole number from 1 to ${limit}.` : `Choose a whole number from 1 to ${limit}. ${remaining} units still need QR tags.`;
  const taggedRanges = unitRanges([...used]);
  const nextUnits: number[] = [];
  if (line && validCount) for (let unit = 1; unit <= line.quantity && nextUnits.length < count; unit++) if (!used.has(unit)) nextUnits.push(unit);
  const field = 'mt-2 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm';
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (pending || loading) return;
    if (!order || !line || !validCount || nextUnits.length !== count) { setError(countError || 'Choose a received item and a valid number of units.'); return; }
    setPending(true);
    let committed = false;
    try {
      const response = await fetch('/api/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receivingReportId: reportId, lineIndex: line.lineIndex,
        units: nextUnits.map((unitNumber) => ({ unitNumber, serialNumber: serials[unitNumber]?.trim() || '' })) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Asset registration could not be confirmed.');
      committed = true;
      actionFeedback('Equipment tags registered', `${result.assets.length} individual units linked to ${order?.poNumber}.`);
      setSerials({}); setLineIndex(''); setCountDraft('1');
      await onSaved(result.assets.map((asset: { id: string }) => asset.id), order);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Refresh the register before retrying.');
      if (!committed) submissionFeedbackError(cause, 'Asset registration could not be confirmed');
      else actionFeedback('Tags saved; refresh needed', 'Refresh the register to find and reprint the saved labels.', 'info');
    } finally { setPending(false); }
  }
  return <section className="asset-registration-section rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 className="text-lg font-semibold text-slate-950">Register individual equipment</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">After receiving is finalized, choose an equipment line and identify its physical units. Leave consumables untagged. Each unit gets its own permanent ID; the PO QR still identifies the whole order.</p>
    {!orders.length ? <p className="mt-4 text-sm text-slate-600">No received orders match this search. Finalize receiving first, or search by PO number to find an older order.</p> : <form onSubmit={submit} className="mt-5 space-y-4">
      <fieldset disabled={pending || loading} className="space-y-4 disabled:opacity-60">
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <label className="min-w-0 text-sm font-medium">Received purchase order<select required className={field} value={reportId} onChange={(e) => { onOrderChange(e.target.value); setLineIndex(''); setSerials({}); setCountDraft('1'); setError(''); }}><option value="">Choose a received PO</option>{orders.map((entry) => <option key={entry.reportId} value={entry.reportId}>{entry.poNumber}</option>)}</select></label>
          <label className="min-w-0 text-sm font-medium">Equipment item line<select required className={field} value={lineIndex} onChange={(e) => { setLineIndex(e.target.value); setSerials({}); setCountDraft('1'); setError(''); }}><option value="">Choose equipment to tag</option>{order?.lines.map((entry) => {
            const untagged = entry.quantity - new Set(order.taggedUnits.filter(unit => unit.lineIndex === entry.lineIndex).map(unit => unit.unitNumber)).size;
            return <option key={entry.lineIndex} value={entry.lineIndex}>Line {entry.lineIndex + 1}: {entry.itemName} × {entry.quantity} · {untagged > 0 ? `${untagged} need QR tags` : 'All tagged'}</option>;
          })}</select></label>
        </div>
        {order && <p className="break-words rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900 [overflow-wrap:anywhere]">Registering and viewing units for <strong>{order.poNumber}</strong>. Other purchase orders are hidden from the unit list and label printing.</p>}
        {line && <>
          <section aria-label="Item tagging progress" className="min-w-0 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="break-words text-sm font-semibold leading-6 [overflow-wrap:anywhere]">Line {line.lineIndex + 1}: {line.itemName}</h3>
            <dl className="grid grid-cols-3 gap-3 text-sm"><div><dt className="text-xs text-slate-600">PO quantity</dt><dd className="mt-1 text-lg font-semibold">{line.quantity}</dd></div><div><dt className="text-xs text-slate-600">Already tagged</dt><dd className="mt-1 text-lg font-semibold">{used.size}</dd></div><div><dt className="text-xs text-slate-600">Need QR tags</dt><dd className="mt-1 text-lg font-semibold text-emerald-800">{remaining}</dd></div></dl>
            <p className="break-words text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]"><span className="font-medium text-slate-900">Already tagged: </span>{describeUnits(taggedRanges) || 'None yet'}</p>
            {remaining > 0 ? <p className="break-words text-sm leading-6 text-emerald-900 [overflow-wrap:anywhere]"><span className="font-semibold">Still need QR tags: </span>{describeUnits(missingRanges(line.quantity, taggedRanges))}</p> : <p role="status" className="text-sm leading-6 font-medium text-emerald-900">All units in this item line have QR tags. Use the registered unit list below to preview or reprint their labels.</p>}
          </section>
          {remaining > 0 && <>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
              <label htmlFor={countId} className="block min-w-0 w-full max-w-sm text-sm font-medium">Units to register in this batch<input id={countId} required type="text" inputMode="numeric" autoComplete="off" aria-invalid={Boolean(countError)} aria-describedby={`${countId}-help${countError ? ` ${countId}-error` : ''}`} className={`${field} ${countError ? 'border-rose-400' : ''}`} value={countDraft} onChange={(e) => { setCountDraft(e.target.value.replace(/^0+(?=\d)/, '')); }} /></label>
              <button type="button" onClick={() => setCountDraft(String(limit))} className="min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-emerald-700">{remaining <= 100 ? `Use all remaining (${limit})` : `Use maximum batch (${limit})`}</button>
            </div>
            <p id={`${countId}-help`} className="text-xs leading-5 text-slate-600">{limit === 1 ? 'Choose 1 unit for this batch.' : `Choose 1–${limit} units for this batch. You can tag part of the remaining quantity now.`}{remaining > 100 && ' Up to 100 units per batch; register the rest in another batch.'}</p>
            {countError && <p id={`${countId}-error`} role="status" className="text-sm leading-6 text-rose-800">{countError}</p>}
            <p role="status" className="break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{validCount ? <>This batch: <strong>{describeUnits(unitRanges(nextUnits))}</strong>. {remaining - count} untagged {remaining - count === 1 ? 'unit will' : 'units will'} remain after registration.</> : 'Enter a valid batch size to see which units will be registered.'}</p>
            <div className="grid min-w-0 gap-3 md:grid-cols-2">{nextUnits.map((unit) => <label key={unit} className="min-w-0 rounded-lg border border-slate-200 p-3 text-sm font-medium">Unit {unit} · serial number (optional)<input maxLength={120} className={field} value={serials[unit] || ''} placeholder="Enter the physical unit’s serial, if available" onChange={(e) => setSerials((previous) => ({ ...previous, [unit]: e.target.value }))} /></label>)}</div></>}
        </>}
        <button disabled={!line || !validCount || nextUnits.length !== count} className="min-h-11 rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending ? 'Registering…' : 'Register equipment tags'}</button>
      </fieldset>
    </form>}
    {error && <p role="alert" className="mt-4 text-sm leading-6 text-rose-800">{error}</p>}
  </section>;
}
