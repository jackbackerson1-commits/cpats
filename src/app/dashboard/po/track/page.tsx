'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock3, PackageCheck } from 'lucide-react';
import { QueueFilters, useQueueFilters, WaitingTime } from '@/components/ui/QueueFilters';
import { matchesQueueFilters } from '@/shared/queue-insights';
import { matchesTrackingView, sortTrackingRecords, trackingPage, type TrackingSort, type TrackingView } from '@/shared/purchasing-tracking';
import { PaymentType, PRStatus, Role } from '@prisma/client';
import { ErrorBanner, PageShell, StageHeader } from '@/components/purchasing/PurchasingUI';
import '@/components/purchasing/po-tracking-workspace.css';

interface ItemNode {
  itemName: string;
  quantity: number;
  unitPrice: number;
}

interface AuditLogNode {
  id: string;
  previousState: PRStatus | null;
  newState: PRStatus;
  remarks: string | null;
  createdAt: string;
  actor: { email: string; role: Role };
}

interface PurchaseOrderNode {
  id: string;
  poNumber: string;
  paymentType: PaymentType;
  isCheckIssued: boolean;
  createdAt: string;
  receivingReports: Array<{
    condition: 'Good' | 'Damaged';
    remarks: string | null;
    createdAt: string;
  }>;
}

interface TrackingNode {
  id: string;
  justification: string;
  itemsPayload: unknown;
  status: PRStatus;
  isDirectPoBypass: boolean;
  createdAt: string;
  updatedAt: string;
  department: { code: string; name: string };
  purchaseOrders: PurchaseOrderNode[];
  auditLogs: AuditLogNode[];
}

const STAGES = [
  { label: 'PO Prep', description: 'Official PO preparation' },
  { label: 'Finance', description: 'Payment clearance' },
  { label: 'Purchase', description: 'Cleared for fulfillment' },
  { label: 'Received', description: 'Custodian intake' },
] as const;

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All purchasing stages' },
  { value: PRStatus.Approved_Awaiting_PO, label: 'PO preparation' },
  { value: PRStatus.Awaiting_Check_Issuance, label: 'Finance clearance' },
  { value: PRStatus.Ready_for_Purchase, label: 'Purchase / fulfillment' },
  { value: PRStatus.Received_and_Closed, label: 'Received and closed' },
] as const;

function stageIndex(status: PRStatus) {
  switch (status) {
    case PRStatus.Approved_Awaiting_PO: return 0;
    case PRStatus.Awaiting_Check_Issuance: return 1;
    case PRStatus.Ready_for_Purchase: return 2;
    case PRStatus.Received_and_Closed: return 3;
    default: return 0;
  }
}

function statusPresentation(status: PRStatus) {
  switch (status) {
    case PRStatus.Approved_Awaiting_PO:
      return { label: 'PO Preparation', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' };
    case PRStatus.Awaiting_Check_Issuance:
      return { label: 'Finance Clearance', className: 'border-blue-200 bg-blue-50 text-blue-800' };
    case PRStatus.Ready_for_Purchase:
      return { label: 'Ready for Purchase', className: 'border-indigo-200 bg-indigo-50 text-indigo-800' };
    case PRStatus.Received_and_Closed:
      return { label: 'Received & Closed', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' };
    default:
      return { label: status.replaceAll('_', ' '), className: 'border-slate-200 bg-slate-50 text-slate-700' };
  }
}

function normalizeItems(payload: unknown): ItemNode[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    const itemName = typeof item.itemName === 'string' ? item.itemName : '';
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    if (!itemName || !Number.isFinite(quantity)) return [];
    return [{
      itemName,
      quantity,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    }];
  });
}

function summarizeItems(items: ItemNode[]) {
  if (items.length === 0) return 'Purchase requisition';
  const first = `${items[0].itemName} (x${items[0].quantity})`;
  return items.length === 1 ? first : `${first} +${items.length - 1} more item${items.length > 2 ? 's' : ''}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function formatPeso(value: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
}

async function fetchTrackingRecords(signal?: AbortSignal): Promise<TrackingNode[]> {
  const response = await fetch('/api/po/tracking', { cache: 'no-store', signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The tracking register could not be loaded.');
  return result.data || [];
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" strokeLinecap="round" /></svg>;
}

function RefreshIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4"><path d="M20 7v5h-5M4 17v-5h5" strokeLinecap="round" strokeLinejoin="round" /><path d="M6.1 9a7 7 0 0 1 11.5-2L20 9M4 15l2.4 2a7 7 0 0 0 11.5-2" strokeLinecap="round" /></svg>;
}

function CheckIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="size-3.5"><path d="m5 12.5 4.2 4.2L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function PurchasingProgress({ status }: { status: PRStatus }) {
  const activeIndex = stageIndex(status);
  const closed = status === PRStatus.Received_and_Closed;

  return (
    <nav aria-label="Purchasing transaction progress" className="po-tracking-progress relative pt-1">
      <div aria-hidden="true" className="absolute left-[12.5%] right-[12.5%] top-[17px] h-0.5 bg-slate-200" />
      <div
        aria-hidden="true"
        className="absolute left-[12.5%] top-[17px] h-0.5 bg-emerald-700 transition-all"
        style={{ width: `${closed ? 75 : (activeIndex / 3) * 75}%` }}
      />
      <ol className="relative grid grid-cols-4 gap-1">
        {STAGES.map((stage, index) => {
          const complete = closed || index < activeIndex;
          const current = !closed && index === activeIndex;
          return (
            <li key={stage.label} aria-current={current ? 'step' : undefined} className="flex min-w-0 flex-col items-center text-center">
              <span className={`z-10 flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold ${
                complete
                  ? 'border-emerald-700 bg-emerald-700 text-white'
                  : current
                    ? 'border-emerald-700 bg-white text-emerald-800 ring-4 ring-emerald-100'
                    : 'border-slate-200 bg-white text-slate-300'
              }`}>
                {complete ? <CheckIcon /> : index + 1}
              </span>
              <span className={`mt-2 text-xs font-semibold sm:text-sm ${complete || current ? 'text-slate-800' : 'text-slate-600'}`}>
                {stage.label}
              </span>
              <span className="mt-0.5 hidden text-xs leading-5 text-slate-600 sm:block">{stage.description}</span>
              <span className="sr-only">{complete ? 'Completed' : current ? 'Current stage' : 'Upcoming'}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function TrackingSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading tracking records" role="status">
      {[0, 1, 2].map((key) => (
        <div key={key} className="animate-pulse rounded-xl border border-slate-200 bg-white p-5">
          <div className="h-4 w-48 rounded bg-slate-100" />
          <div className="mt-3 h-3 w-72 max-w-full rounded bg-slate-100" />
          <div className="mt-6 h-14 rounded bg-slate-50" />
        </div>
      ))}
    </div>
  );
}

export default function PurchasingTrackingPage() {
  const [records, setRecords] = useState<TrackingNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [queueFilters, setQueueFilters] = useQueueFilters();
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<TrackingView>('all');
  const [sort, setSort] = useState<TrackingSort>('recent');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const controller = new AbortController();
    fetchTrackingRecords(controller.signal)
      .then(setRecords)
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'The tracking register could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setRecords(await fetchTrackingRecords());
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'The tracking register could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const filteredRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return records.filter((record) => {
      if (!matchesTrackingView(record, view)) return false;
      if (!matchesQueueFilters({ ...record, department: record.department.name }, queueFilters)) return false;
      if (statusFilter !== 'ALL' && record.status !== statusFilter) return false;
      if (!query) return true;
      const items = normalizeItems(record.itemsPayload);
      const searchable = [
        record.id,
        record.department.code,
        record.department.name,
        record.justification,
        ...record.purchaseOrders.map((po) => po.poNumber),
        ...items.map((item) => item.itemName),
      ].join(' ').toLowerCase();
      return searchable.includes(query);
    });
  }, [records, searchQuery, statusFilter, queueFilters, view]);

  const sortedRecords = useMemo(() => sortTrackingRecords(filteredRecords, sort), [filteredRecords, sort]);
  const pagination = trackingPage(sortedRecords, page, pageSize);
  const selectedRecord = records.find(record => record.id === selectedId);

  const counts = useMemo(() => ({
    total: records.length,
    active: records.filter((record) => record.status !== PRStatus.Received_and_Closed).length,
    finance: records.filter((record) => record.status === PRStatus.Awaiting_Check_Issuance).length,
    received: records.filter((record) => record.status === PRStatus.Received_and_Closed).length,
  }), [records]);
  const financeFilterActive = statusFilter === PRStatus.Awaiting_Check_Issuance && view !== 'received';

  return (
    <PageShell className="po-tracking-page">
      <StageHeader
        eyebrow="Purchasing Office · Read-only transaction visibility"
        title="Track purchase orders"
        description="Follow every request that has reached Purchasing—from official PO preparation through finance clearance, purchase readiness, and final receipt."
        meta={{ label: 'Visible scope', value: `${counts.total} purchasing record${counts.total === 1 ? '' : 's'}` }}
      />

      {error && <div className=""><ErrorBanner>{error}</ErrorBanner></div>}

      <section className="po-tracking-filters rounded-xl border border-slate-200 bg-white p-4 shadow-xs" aria-label="Tracking filters">
        <div className="po-tracking-command-bar">
          <div className="relative po-tracking-search">
            <input type="search" value={searchQuery}
              onChange={(event) => { setSearchQuery(event.target.value); setPage(1); }}
              placeholder="Search PO, request ID, department, or item…" aria-label="Search purchasing tracking records"
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10" />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"><SearchIcon /></span>
          </div>
          <div role="group" aria-label="Tracking view" className="po-tracking-view-filters">
            {([
              { id: 'all', view: 'all', stage: 'ALL', label: 'Total records', count: counts.total, hint: 'All purchasing stages' },
              { id: 'active', view: 'active', stage: 'ALL', label: 'In progress', count: counts.active, hint: 'Preparation to fulfillment' },
              { id: 'finance', view: 'all', stage: PRStatus.Awaiting_Check_Issuance, label: 'At finance', count: counts.finance, hint: 'Awaiting financial clearance' },
              { id: 'received', view: 'received', stage: 'ALL', label: 'Received & closed', count: counts.received, hint: 'Completed transactions' },
            ] as const).map(({ id, view: nextView, stage, label, count, hint }) => (
              <button key={id} type="button" title={hint}
                aria-pressed={id === 'finance' ? financeFilterActive : view === nextView && !financeFilterActive}
                onClick={() => { setView(nextView); setStatusFilter(stage); setPage(1); }}>
                <span>{label}</span><span className="tabular-nums">{count}</span>
              </button>
            ))}
          </div>

          <select
            value={statusFilter}
            onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}
            aria-label="Filter by purchasing stage"
            className="min-w-0 min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
          >
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshIcon />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-700">Department and submitted-date filters</summary><QueueFilters records={records.map(record => ({ ...record, department: record.department.name }))} value={queueFilters} onChange={(value) => { setQueueFilters(value); setPage(1); }} showStatus={false} onClear={() => { setSearchQuery(''); setStatusFilter('ALL'); setView('all'); setPage(1); }} /></details>
      </section>

      {loading && records.length === 0 ? (
        <TrackingSkeleton />
      ) : error && records.length === 0 ? (
        <div className="po-tracking-empty rounded-xl border border-dashed border-rose-200 bg-white px-6 py-16 text-center">
          <p className="text-sm font-semibold text-slate-700">Tracking records are temporarily unavailable.</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-600">Use Refresh to try loading the authoritative register again.</p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="po-tracking-empty rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <p className="text-sm font-semibold text-slate-700">{records.length === 0 ? 'No requests have reached Purchasing yet.' : 'No records match these filters.'}</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-600">
            {records.length === 0 ? 'Approved requests will appear here as soon as they enter the PO preparation stage.' : 'Adjust or clear the filters to see the full purchasing register.'}
          </p>
        </div>
      ) : (
        <section aria-label="Order register" className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p role="status" className="text-xs font-semibold text-slate-600">Showing {pagination.start}–{pagination.end} of {filteredRecords.length} matching records · {records.length} total</p>
            <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">Sort by
              <select value={sort} onChange={event => { setSort(event.target.value as TrackingSort); setPage(1); }} className="min-h-11 min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                <option value="recent">Recently updated</option><option value="waiting">Longest waiting in current stage</option>
              </select>
            </label>
          </div>
          <div className="po-tracking-table overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">Purchasing orders. Open View details for the full progress and transaction history.</caption>
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600"><tr>
                <th scope="col" className="w-[22%] p-4">Reference / items</th><th scope="col" className="w-[15%] p-4">Office</th><th scope="col" className="w-[18%] p-4">Current stage</th><th scope="col" className="w-[16%] p-4">Time in stage</th><th scope="col" className="w-[16%] p-4">Last updated</th><th scope="col" className="w-[13%] p-4">Details</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {pagination.records.map(record => <tr key={record.id} className="align-top hover:bg-emerald-50/40">
                  <td className="p-4 [overflow-wrap:anywhere]"><RecordReference record={record} /><p className="mt-2 line-clamp-2 text-slate-800">{summarizeItems(normalizeItems(record.itemsPayload))}</p></td>
                  <td className="p-4 [overflow-wrap:anywhere]"><p className="font-semibold">{record.department.code}</p><p className="mt-1 text-xs text-slate-600">{record.department.name}</p></td>
                  <td className="p-4"><StatusBadge status={record.status} /></td>
                  <td className="p-4"><WaitingTime record={record} /></td>
                  <td className="p-4 text-xs leading-5 text-slate-600"><time dateTime={record.updatedAt}>{formatDate(record.updatedAt)}</time></td>
                  <td className="p-4"><ViewButton record={record} onOpen={setSelectedId} /></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="po-tracking-cards grid min-w-0 gap-3 md:grid-cols-2">
            {pagination.records.map(record => <article key={record.id} className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs [overflow-wrap:anywhere]">
              <RecordReference record={record} />
              <h2 className="line-clamp-2 text-sm font-semibold text-slate-900">{summarizeItems(normalizeItems(record.itemsPayload))}</h2>
              <p className="text-xs text-slate-600">{record.department.code} · {record.department.name}</p>
              <StatusBadge status={record.status} /><WaitingTime record={record} />
              <p className="text-xs text-slate-600">Updated <time dateTime={record.updatedAt}>{formatDate(record.updatedAt)}</time></p>
              <ViewButton record={record} onOpen={setSelectedId} />
            </article>)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">Orders per page <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }} className="min-h-11 rounded-lg border border-slate-300 px-3"><option value={10}>10</option><option value={25}>25</option></select></label>
            <nav aria-label="Order register pagination" className="flex flex-wrap items-center gap-2 text-sm">
              <button type="button" disabled={pagination.page === 1} onClick={() => setPage(pagination.page - 1)} className="min-h-11 rounded-lg border border-slate-300 px-3 disabled:opacity-40">Previous</button>
              <span aria-current="page" className="px-2">Page {pagination.page} of {pagination.totalPages}</span>
              <button type="button" disabled={pagination.page === pagination.totalPages} onClick={() => setPage(pagination.page + 1)} className="min-h-11 rounded-lg border border-slate-300 px-3 disabled:opacity-40">Next</button>
            </nav>
          </div>
        </section>
      )}
      {selectedRecord && <TrackingDetails key={selectedRecord.id} record={selectedRecord} onClose={() => setSelectedId(null)} />}
    </PageShell>
  );
}

function StatusBadge({ status }: { status: PRStatus }) {
  const presentation = statusPresentation(status);
  const Icon = status === PRStatus.Received_and_Closed ? PackageCheck : status === PRStatus.Approved_Awaiting_PO ? CheckCircle2 : Clock3;
  return <span className={'purchasing-status max-w-full border text-xs font-semibold ' + presentation.className}><Icon className="size-4 shrink-0" aria-hidden="true" />{presentation.label}</span>;
}

function RecordReference({ record }: { record: TrackingNode }) {
  const po = record.purchaseOrders[0];
  return <div className="po-tracking-reference min-w-0 [overflow-wrap:anywhere]"><p title={po?.poNumber || record.id} className={`font-mono text-xs ${po ? 'font-semibold text-emerald-800' : 'text-slate-600'}`}>{po?.poNumber || record.id}</p>{!po && <p className="mt-1 text-xs text-slate-600">PO not yet assigned</p>}</div>;
}

function ViewButton({ record, onOpen }: { record: TrackingNode; onOpen: (id: string) => void }) {
  return <button type="button" aria-haspopup="dialog" aria-label={'View details for ' + (record.purchaseOrders[0]?.poNumber || record.id)} onClick={() => onOpen(record.id)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700">View details</button>;
}

function TrackingDetails({ record, onClose }: { record: TrackingNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const items = normalizeItems(record.itemsPayload);
  const po = record.purchaseOrders[0];
  const receipt = po?.receivingReports[0];
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow; opener?.focus(); };
  }, []);
  return <dialog ref={dialogRef} aria-labelledby="tracking-detail-title" onCancel={event => { event.preventDefault(); onClose(); }} className="po-tracking-dialog fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-full overflow-y-auto border-0 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/30 [overflow-wrap:anywhere]">
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5"><h2 id="tracking-detail-title" className="text-lg font-semibold">Order details</h2><button autoFocus type="button" onClick={onClose} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold">Close</button></div>
    <div className="space-y-4 p-4 sm:p-5"><RecordReference record={record} /><h3 className="font-semibold">{summarizeItems(items)}</h3><p className="text-xs text-slate-600">{record.department.code} · {record.department.name}</p><StatusBadge status={record.status} /><WaitingTime record={record} /><PurchasingProgress status={record.status} />
      <p className="text-xs text-slate-600">Last updated <time dateTime={record.updatedAt}>{formatDate(record.updatedAt)}</time></p>
      <dl className="grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-600">Total units</dt><dd className="font-semibold">{items.reduce((sum, item) => sum + item.quantity, 0)}</dd></div><div><dt className="text-xs text-slate-600">Billed value</dt><dd className="font-semibold">{total > 0 ? formatPeso(total) : 'Not recorded'}</dd></div><div><dt className="text-xs text-slate-600">Receiving condition</dt><dd className="font-semibold">{receipt ? 'Received — ' + receipt.condition : 'Awaiting intake'}</dd></div></dl>
    </div>
                  <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-5 sm:px-5">
                    <div className="grid min-w-0 gap-5">
                      <div className="space-y-5">
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Transaction details</h3>
                          <dl className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
                            <div><dt className="text-xs font-semibold uppercase text-slate-600">Request reference</dt><dd className="mt-1 break-all font-mono text-xs text-slate-700">{record.id}</dd></div>
                            <div><dt className="text-xs font-semibold uppercase text-slate-600">PO created</dt><dd className="mt-1 text-sm font-semibold text-slate-700">{po ? formatDate(po.createdAt) : 'Pending preparation'}</dd></div>
                            <div><dt className="text-xs font-semibold uppercase text-slate-600">Payment method</dt><dd className="mt-1 text-sm font-semibold text-slate-700">{po?.paymentType === PaymentType.CREDIT_TERMS ? 'Credit / Charge Terms' : po ? 'Cash / Check' : 'Not assigned'}</dd></div>
                            <div><dt className="text-xs font-semibold uppercase text-slate-600">Finance clearance</dt><dd className="mt-1 text-sm font-semibold text-slate-700">{po?.isCheckIssued ? 'Cleared' : 'Pending'}</dd></div>
                            <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase text-slate-600">Justification</dt><dd className="mt-1 text-sm leading-6 text-slate-600">{record.justification}</dd></div>
                          </dl>
                        </div>

                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Item breakdown</h3>
                          <div className="mt-3 space-y-3 sm:hidden">
                            {items.length === 0 ? <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">No structured item data recorded.</p> : items.map((item, index) => <article key={index} className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
                              <h4 className="break-words text-sm font-semibold leading-6 text-slate-900 [overflow-wrap:anywhere]">{item.itemName}</h4>
                              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-600">Quantity</dt><dd className="mt-1 font-medium">{item.quantity}</dd></div><div><dt className="text-xs text-slate-600">Unit price</dt><dd className="mt-1 break-words font-medium">{item.unitPrice > 0 ? formatPeso(item.unitPrice) : '—'}</dd></div><div className="col-span-2"><dt className="text-xs text-slate-600">Subtotal</dt><dd className="mt-1 break-words font-medium">{item.unitPrice > 0 ? formatPeso(item.quantity * item.unitPrice) : '—'}</dd></div></dl>
                            </article>)}
                          </div>
                          <div className="mt-3 hidden rounded-xl border border-slate-200 bg-white sm:block"><p className="border-b border-slate-200 px-4 py-2 text-xs text-slate-600">Scroll horizontally to see all item columns if needed.</p><div tabIndex={0} role="region" aria-label="Item breakdown table" className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-emerald-700">
                            <table className="w-full min-w-[520px] text-left text-xs">
                              <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600"><th className="px-4 py-2.5">Item</th><th className="px-4 py-2.5 text-right">Qty</th><th className="px-4 py-2.5 text-right">Unit price</th><th className="px-4 py-2.5 text-right">Subtotal</th></tr></thead>
                              <tbody className="divide-y divide-slate-100">
                                {items.length === 0 ? <tr><td colSpan={4} className="px-4 py-5 text-center text-slate-600">No structured item data recorded.</td></tr> : items.map((item, index) => (
                                  <tr key={`${item.itemName}-${index}`}><td className="max-w-xs break-words px-4 py-3 font-semibold text-slate-700 [overflow-wrap:anywhere]">{item.itemName}</td><td className="px-4 py-3 text-right font-mono">{item.quantity}</td><td className="px-4 py-3 text-right font-mono">{item.unitPrice > 0 ? formatPeso(item.unitPrice) : '—'}</td><td className="px-4 py-3 text-right font-mono font-semibold">{item.unitPrice > 0 ? formatPeso(item.quantity * item.unitPrice) : '—'}</td></tr>
                                ))}
                              </tbody>
                            </table>
                          </div></div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Purchasing-stage history</h3>
                        {record.auditLogs.length === 0 ? (
                          <p className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">No purchasing-stage audit entries are recorded yet.</p>
                        ) : (
                          <ol className="relative mt-3 space-y-3 border-l-2 border-slate-200 pl-4">
                            {record.auditLogs.map((log) => {
                              const logStatus = statusPresentation(log.newState);
                              return (
                                <li key={log.id} className="relative rounded-xl border border-slate-200 bg-white p-3">
                                  <span aria-hidden="true" className="absolute -left-[21px] top-4 size-2.5 rounded-full border-2 border-white bg-emerald-700" />
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${logStatus.className}`}>{logStatus.label}</span>
                                    <time className="font-mono text-xs text-slate-600">{formatDate(log.createdAt)}</time>
                                  </div>
                                  {log.remarks && <p className="mt-2 text-xs leading-4 text-slate-600">{log.remarks}</p>}
                                  <p className="mt-2 break-all text-xs text-slate-600">{log.actor.role.replaceAll('_', ' ')} · {log.actor.email}</p>
                                </li>
                              );
                            })}
                          </ol>
                        )}
                      </div>
                    </div>
                  </div>
  </dialog>;
}
