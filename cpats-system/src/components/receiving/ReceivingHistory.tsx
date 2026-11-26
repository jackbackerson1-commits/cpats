'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, History, LockKeyhole, Search } from 'lucide-react';
import { Card, ErrorBanner, inputClass, PageShell, StageHeader } from './ReceivingUI';
import { normalizeReportItems } from '@/shared/monthly-report';
import { deriveItemSummaryTitle } from '@/components/ui/WorkflowUI';
import { PurchaseOrderDocuments } from '@/components/purchasing/PurchaseOrderDocuments';
import { useUnsavedNavigation } from '@/components/ui/UnsavedChanges';
import './receiving-history-workspace.css';

interface ReceivingHistoryRecord {
  id: string; condition: 'Good' | 'Damaged'; remarks: string | null; createdAt: string;
  invoiceFilePath: string; asssetImageFilePath: string;
  purchaseOrder: { id: string; poNumber: string; purchaseRequest: {
    id: string; status: string; justification: string; itemsPayload: unknown; isDirectPoBypass: boolean;
    adminProofFilePath: string | null; department: { code: string; name: string };
    auditLogs: { id: string; createdAt: string; remarks: string | null; previousState: string; newState: string; actor: { email: string } }[];
  } };
}
interface SearchFilters { q: string; condition: string; page: number; prId: string }
const initialFilters: SearchFilters = { q: '', condition: '', page: 1, prId: '' };
const date = (value: string) => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
const status = (value: string) => value.replaceAll('_', ' ');
function EvidenceLink({ path, children }: { path: string | null; children: React.ReactNode }) {
  let href: string | undefined;
  try {
    if (path?.startsWith('/uploads/') && !path.includes('\\')) {
      const url = new URL(path, 'https://cpats.local');
      if (url.origin === 'https://cpats.local' && url.pathname.startsWith('/uploads/')) href = url.pathname + url.search;
    }
  } catch { /* Keep unsupported saved references as unavailable evidence. */ }
  return href ? <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">{children}<span className="sr-only"> (opens in a new tab)</span></a>
    : <p className="text-sm text-slate-600">{children}: no accessible saved reference.</p>;
}

export default function ReceivingHistory() {
  const [records, setRecords] = useState<ReceivingHistoryRecord[]>([]);
  const [filters, setFilters] = useState(initialFilters);
  const [query, setQuery] = useState('');
  const [conditionCounts, setConditionCounts] = useState<{ all: number; Good: number; Damaged: number } | null>(null);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestNumber = useRef(0);
  const requestNavigation = useUnsavedNavigation();
  const detailsRef = useRef<HTMLDivElement>(null);
  const load = useCallback(async (next: SearchFilters) => {
    const current = ++requestNumber.current;
    await Promise.resolve();
    setLoading(true); setError(''); setConditionCounts(null);
    try {
      const params = new URLSearchParams({ q: next.q, condition: next.condition, page: String(next.page) });
      if (next.prId) params.set('prId', next.prId);
      const response = await fetch(`/api/receiving/history?${params}`, { cache: 'no-store' });
      const result = await response.json();
      if (current !== requestNumber.current) return;
      if (!response.ok) throw new Error(result.error || 'Receiving history could not be loaded.');
      setRecords(result.data); setTotal(result.total); setPageSize(result.pageSize); setConditionCounts(result.conditionCounts ?? null);
      setSelectedId((previous) => result.data.some((record: ReceivingHistoryRecord) => record.id === previous) ? previous : next.prId ? result.data[0]?.id || '' : '');
    } catch (cause) {
      if (current === requestNumber.current) { setError(cause instanceof Error ? cause.message : 'Receiving history could not be loaded.'); setRecords([]); setSelectedId(''); }
    } finally { if (current === requestNumber.current) setLoading(false); }
  }, []);
  useEffect(() => {
    let mounted = true; const counter = requestNumber;
    void Promise.resolve().then(() => {
      if (!mounted) return;
      const next = { ...initialFilters, prId: new URLSearchParams(window.location.search).get('prId') || '' };
      setFilters(next); return load(next);
    });
    return () => { mounted = false; counter.current++; };
  }, [load]);
  function apply(next: SearchFilters) { requestNavigation(() => { setFilters(next); setSelectedId(''); void load(next); }); }
  function clear() {
    requestNavigation(() => {
      setQuery('');
      window.history.replaceState(null, '', window.location.pathname);
      apply(initialFilters);
    });
  }
  function select(id: string) {
    requestNavigation(() => {
      setSelectedId(id);
      window.requestAnimationFrame(() => { if (window.innerWidth < 1280) { detailsRef.current?.focus({ preventScroll: true }); detailsRef.current?.scrollIntoView({ block: 'start' }); } });
    });
  }
  const selected = loading ? undefined : records.find((record) => record.id === selectedId);
  const request = selected?.purchaseOrder.purchaseRequest;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <PageShell className="receiving-history-page">
    <StageHeader waveBackground title="Receiving history" description="Review completed delivery inspections, their saved evidence, and the receiving events recorded for each request." />
    <p className="mb-4 text-sm"><Link href="/dashboard/receiving/forms" className="inline-flex min-h-11 items-center font-semibold text-emerald-800 underline">Prepare RR / MR documents</Link></p>
    <nav aria-label="Receiving records" className="receiving-history-nav flex flex-wrap gap-3">
      <Link href="/dashboard/receiving/new" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700">Awaiting inspection</Link>
      <span aria-current="page" className="inline-flex min-h-11 items-center rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white">Receiving history</span>
    </nav>
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600"><LockKeyhole aria-hidden="true" className="mt-1 size-4 shrink-0" /><p>Saved inspections are read-only. Viewing history does not reopen a delivery or change its condition, request status, or equipment tags.</p></div>
    <Card className="receiving-history-filters">
      <form onSubmit={(event) => { event.preventDefault(); apply({ ...filters, q: query.trim(), page: 1 }); }} className="receiving-history-toolbar">
        <div className="receiving-history-search">
          <label htmlFor="receiving-history-search" className="sr-only">PO, department or request reference</label>
          <Search aria-hidden="true" className="receiving-history-search-icon size-4" />
          <input id="receiving-history-search" type="search" maxLength={160} value={query} onChange={(event) => setQuery(event.target.value)} className={inputClass()} placeholder="Search PO, department or request reference" />
        </div>
        <button disabled={loading} className="receiving-history-find min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-emerald-800 disabled:opacity-50">Find records</button>
        <div role="group" aria-label="Receiving history condition categories" className="receiving-history-categories">
          {([['', 'All'], ['Good', 'Good condition'], ['Damaged', 'Damage recorded']] as const).map(([value, label]) => {
            const count = conditionCounts?.[value || 'all'];
            return <button key={value} type="button" aria-pressed={filters.condition === value} disabled={loading}
              aria-label={label + (count === undefined ? '' : ' ' + count + ' inspections')}
              onClick={() => apply({ ...filters, q: query.trim(), condition: value, page: 1 })}
              className="receiving-history-category min-h-11 rounded-lg border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50">
              {label} <span className="tabular-nums">{loading ? '…' : count ?? '—'}</span>
            </button>;
          })}
        </div>
        <button type="button" disabled={loading} onClick={clear} className="receiving-history-clear min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:opacity-50">Clear filters</button>
      </form>
      {filters.prId && <p className="mt-3 break-words text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">Showing the request opened from its receiving link. Clear filters to browse all receiving history.</p>}
    </Card>
    {error && <ErrorBanner>{error}<button type="button" onClick={() => void load(filters)} className="ml-3 min-h-11 rounded-lg border border-rose-300 px-3 font-semibold">Try again</button></ErrorBanner>}
    <div className="receiving-history-workspace grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(280px,26%)_minmax(0,1fr)]">
      <section aria-label="Completed inspections" className="receiving-history-list min-w-0 rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-200 p-4"><h2 className="text-base font-semibold">Completed inspections</h2><p role="status" className="mt-2 text-sm text-slate-600">{loading ? 'Loading receiving history…' : error ? 'History unavailable' : `${total} matching inspections · Page ${filters.page} of ${pages}`}</p></div>
        <div className="receiving-history-list-scroll max-h-96 space-y-2 overflow-y-auto overscroll-contain p-3 xl:max-h-[calc(100dvh-22rem)]">
          {!loading && !error && !records.length && <div className="p-4 text-sm leading-6 text-slate-600"><History className="mb-3 size-6" aria-hidden="true" /><p>{filters.prId ? 'No saved inspection is available for this request. It may still be awaiting receiving.' : 'No completed inspections match these filters.'}</p></div>}
          {!loading && records.map((record) => <button type="button" key={record.id} onClick={() => select(record.id)} aria-pressed={record.id === selectedId} className={`w-full min-w-0 rounded-lg border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${record.id === selectedId ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}>
            <span className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs"><span className="break-words font-medium text-emerald-800 [overflow-wrap:anywhere]">{record.purchaseOrder.poNumber}</span><span className={`rounded-md px-2 py-1 font-medium ${record.condition === 'Damaged' ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>{record.condition === 'Damaged' ? 'Damage recorded' : 'Good condition'}</span></span>
            <span className="mt-2 flex gap-2"><span className="min-w-0 flex-1 break-words text-sm font-semibold leading-6 [overflow-wrap:anywhere]">{deriveItemSummaryTitle(record.purchaseOrder.purchaseRequest.itemsPayload, record.purchaseOrder.purchaseRequest.justification)}</span><ChevronRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-slate-500" /></span>
            <span className="mt-2 block break-words text-xs leading-5 text-slate-600 [overflow-wrap:anywhere]">{record.purchaseOrder.purchaseRequest.department.name} · {date(record.createdAt)}</span>
          </button>)}
        </div>
        <div className="flex flex-wrap justify-between gap-3 border-t border-slate-200 p-3">
          <button type="button" disabled={loading || filters.page <= 1} onClick={() => apply({ ...filters, page: filters.page - 1 })} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-medium disabled:opacity-50">Previous</button>
          <button type="button" disabled={loading || filters.page >= pages} onClick={() => apply({ ...filters, page: filters.page + 1 })} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-medium disabled:opacity-50">Next</button>
        </div>
      </section>
      <div ref={detailsRef} tabIndex={-1} role="region" aria-label="Saved inspection details" className="receiving-history-detail min-w-0 scroll-mt-44 space-y-5 focus:outline-none">
        {!selected || !request ? <Card><h2 className="text-lg font-semibold">Select a completed inspection</h2><p className="mt-2 text-sm leading-6 text-slate-600">Choose a saved report to review its delivery condition, evidence and request details.</p></Card> : <>
          <Card>
            <p className="text-xs font-medium text-emerald-800">Saved receiving report · Read-only</p><h2 className="mt-2 break-words text-xl font-semibold [overflow-wrap:anywhere]">{selected.purchaseOrder.poNumber}</h2>
            <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2"><div><p className="text-xs text-slate-600">Condition at receipt</p><p className={`mt-1 text-sm font-semibold ${selected.condition === 'Damaged' ? 'text-amber-900' : 'text-emerald-900'}`}>{selected.condition === 'Damaged' ? 'Damaged · Damage recorded' : 'Good condition'}</p></div><div><p className="text-xs text-slate-600">Inspection recorded</p><p className="mt-1 text-sm">{date(selected.createdAt)}</p></div><div><p className="text-xs text-slate-600">Current request status</p><p className="mt-1 break-words text-sm">{status(request.status)}</p></div><div><p className="text-xs text-slate-600">Requesting department</p><p className="mt-1 break-words text-sm [overflow-wrap:anywhere]">{request.department.name} ({request.department.code})</p></div></div>
            <h3 className="mt-5 text-sm font-semibold">Saved inspection remarks</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{selected.remarks || 'No inspection remarks recorded.'}</p>
            <div className="mt-5 flex flex-wrap gap-3"><EvidenceLink path={selected.invoiceFilePath}>Open supplier invoice</EvidenceLink><EvidenceLink path={selected.asssetImageFilePath}>Open delivery photo</EvidenceLink></div>
          </Card>
          <Link href={`/dashboard/receiving/forms?poId=${selected.purchaseOrder.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 underline">Prepare RR / MR for this PO</Link>
          <PurchaseOrderDocuments key={selected.purchaseOrder.id} poId={selected.purchaseOrder.id} />
          <Card>
            <h3 className="text-base font-semibold">Request and equipment details</h3>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{request.justification}</p>
            <ul className="mt-4 space-y-3">{normalizeReportItems(request.itemsPayload).map((item, index) => <li key={index} className="break-words rounded-lg border border-slate-200 p-3 text-sm leading-6 [overflow-wrap:anywhere]"><span className="font-medium">{item.itemName}</span><span className="mt-1 block text-slate-600">Quantity: {item.quantity}</span></li>)}</ul>
            <dl className="mt-5 space-y-3 text-sm"><div><dt className="text-slate-600">Request reference</dt><dd className="mt-1 break-all font-mono text-xs leading-6">{request.id}</dd></div><div><dt className="text-slate-600">Receiving report reference</dt><dd className="mt-1 break-all font-mono text-xs leading-6">{selected.id}</dd></div><div><dt className="text-slate-600">Request route</dt><dd className="mt-1">{request.isDirectPoBypass ? 'Fast-track request' : 'Standard request'}</dd></div></dl>
            {request.adminProofFilePath && <div className="mt-4"><EvidenceLink path={request.adminProofFilePath}>Open approval proof</EvidenceLink></div>}
            <Link href="/dashboard/assets" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-emerald-800">Open asset register</Link>
          </Card>
          <Card><h3 className="text-base font-semibold">Receiving events for this request</h3><p className="mt-2 text-sm leading-6 text-slate-600">These saved workflow events belong to the request. Inspection details above come from the selected receiving report.</p>
            {!request.auditLogs.length ? <p className="mt-3 text-sm text-slate-600">No receiving audit event is available for this saved report.</p> : <ol className="mt-4 space-y-4">{request.auditLogs.map(event => <li key={event.id} className="break-words border-l-2 border-emerald-200 pl-4 text-sm leading-6 [overflow-wrap:anywhere]"><p className="font-medium">{status(event.previousState)} → {status(event.newState)}</p><p className="text-slate-600">{date(event.createdAt)} · {event.actor.email}</p><p className="mt-1 whitespace-pre-wrap">{event.remarks || 'No workflow remarks recorded.'}</p></li>)}</ol>}
          </Card>
        </>}
      </div>
    </div>
  </PageShell>;
}
