'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, ChevronRight, Clock3, FilePlus, PackageCheck } from 'lucide-react';
import { QueueFilters, useQueueFilters, WaitingTime } from '@/components/ui/QueueFilters';
import { currentStageSince, emptyQueueFilters, matchesQueueFilters, waitingTimeLabel } from '@/shared/queue-insights';
import { matchesTrackingView, sortTrackingRecords, trackingPage, type TrackingSort, type TrackingView } from '@/shared/purchasing-tracking';
import { PaymentType, PRStatus, Role, type PurchaseMethod } from '@prisma/client';
import { ErrorBanner, PageShell, StageHeader } from '@/components/purchasing/PurchasingUI';
import { PurchaseOrderDocuments } from '@/components/purchasing/PurchaseOrderDocuments';
import { ONLINE_PURCHASE_STAGE_LABELS, type OnlinePurchaseStage } from '@/shared/online-purchase';
import { PURCHASE_METHOD_LABELS } from '@/shared/purchase-method';
import { useUnsavedNavigation } from '@/components/ui/UnsavedChanges';
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
  purchaseMethod?: PurchaseMethod | null;
  isCheckIssued: boolean;
  onlinePurchase?: { amount: string; stage: OnlinePurchaseStage } | null;
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
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

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
  const viewLabel = view === 'received' ? 'Received & closed' : view === 'active' ? 'In progress' : 'All records';
  const stageLabel = STATUS_OPTIONS.find(option => option.value === statusFilter)?.label;
  const advancedLabels = [
    queueFilters.department,
    queueFilters.from && 'From ' + queueFilters.from,
    queueFilters.to && 'Through ' + queueFilters.to,
  ].filter(Boolean);
  const activeFilters = [
    searchQuery.trim() && 'Search “' + searchQuery.trim() + '”',
    view !== 'all' && viewLabel,
    statusFilter !== 'ALL' && stageLabel,
    ...advancedLabels,
  ].filter(Boolean);
  const viewCount = financeFilterActive && view === 'all' ? counts.finance
    : view === 'active' ? counts.active : view === 'received' ? counts.received : counts.total;

  function resetRegisterFilters() {
    setSearchQuery('');
    setStatusFilter('ALL');
    setView('all');
    setPage(1);
  }

  return (
    <PageShell className="po-tracking-page">
      <StageHeader
        eyebrow="Purchasing Office · Read-only transaction visibility"
        title="Track purchase orders"
        description="Find orders and follow their progress from preparation to receipt."
      />

      {error && <div className=""><ErrorBanner>{error}</ErrorBanner></div>}

      <section className="po-tracking-filters rounded-xl border border-slate-200 bg-white p-4 shadow-xs" aria-label="Tracking filters">
        <div className="po-tracking-command-bar">
          <div className="relative po-tracking-search">
            <input id="tracking-search" type="search" value={searchQuery}
              onChange={(event) => { setSearchQuery(event.target.value); setPage(1); }}
              placeholder="Search PO, request ID, department, or item…" aria-label="Search purchasing tracking records"
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10" />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"><SearchIcon /></span>
          </div>
          <div className="po-tracking-field">
            <span id="tracking-view-label" className="text-xs font-medium text-slate-600">View <span className="font-normal">(register totals)</span></span>
            <div role="group" aria-labelledby="tracking-view-label" className="po-tracking-view-filters">
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
          </div>

          <label className="po-tracking-field text-xs font-medium text-slate-600">
            Stage within view
            <select
              value={statusFilter}
              onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}
              className="min-w-0 min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
            >
              {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
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
        <div className="po-tracking-utilities">
          <details className="min-w-0">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-700">
              Department and submitted-date filters
              {advancedLabels.length > 0 && <span className="ml-2 text-xs font-normal text-slate-600">{' '}{advancedLabels.join(' · ')}</span>}
            </summary>
            <QueueFilters records={records.map(record => ({ ...record, department: record.department.name }))} value={queueFilters} onChange={(value) => { setQueueFilters(value); setPage(1); }} showStatus={false} onClear={resetRegisterFilters} />
          </details>
          <Link href="/dashboard/po/online" className="inline-flex min-h-11 items-center text-sm text-emerald-800 underline">Manage provisional online cash purchases</Link>
        </div>
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
          <p role="status" className="text-sm font-semibold text-slate-700">{records.length === 0 ? 'No requests have reached Purchasing yet.' : 'No records match these filters.'}</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-600">
            {records.length === 0 ? 'Approved requests will appear here as soon as they enter the PO preparation stage.' : 'Adjust or clear the filters to see the full purchasing register.'}
          </p>
          {records.length > 0 && (
            <>
              <p className="mt-2 text-xs text-slate-600">{activeFilters.join(' · ')}</p>
              <button type="button" className="mt-3 min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700" onClick={() => {
                setQueueFilters({ ...emptyQueueFilters });
                resetRegisterFilters();
                document.getElementById('tracking-search')?.focus();
              }}>Clear filters</button>
            </>
          )}
        </div>
      ) : (
        <section aria-label="Order register" className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p role="status" className="text-xs font-semibold text-slate-600">
              {filteredRecords.length === 1
                ? '1 matching record'
                : `Showing ${pagination.start}–${pagination.end}${filteredRecords.length !== viewCount ? ' of ' + filteredRecords.length + ' matches' : ''}`}
            </p>
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
                <th scope="col" className="w-[30%] p-4">Item / PO</th><th scope="col" className="w-[15%] p-4">Office</th><th scope="col" className="w-[18%] p-4">Current stage</th><th scope="col" className="w-[14%] p-4">Stage age</th><th scope="col" className="w-[16%] p-4">Last updated</th><th scope="col" className="w-[7%] p-4"><span className="sr-only">Details</span></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {pagination.records.map(record => <tr key={record.id} className="po-tracking-record align-top" onClick={openFromRecordSurface}>
                  <td className="p-4 [overflow-wrap:anywhere]"><p className="line-clamp-2 font-semibold text-slate-950">{summarizeItems(normalizeItems(record.itemsPayload))}</p><RecordReference record={record} /></td>
                  <td className="p-4 [overflow-wrap:anywhere]"><p className="font-semibold">{record.department.code}</p><p className="mt-1 text-xs text-slate-600">{record.department.name}</p></td>
                  <td className="p-4"><StatusBadge status={record.status} register /></td>
                  <td className="p-4 text-xs text-slate-600"><RegisterTime value={currentStageSince(record)} label={waitingTimeLabel(record, now).replace('In current stage: ', '')} /></td>
                  <td className="p-4 text-xs leading-5 text-slate-600"><RegisterTime value={record.updatedAt} label={relativeUpdate(record.updatedAt, now)} /></td>
                  <td className="p-4"><ViewButton record={record} onOpen={setSelectedId} /></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="po-tracking-cards grid min-w-0 gap-3 md:grid-cols-2">
            {pagination.records.map(record => <article key={record.id} className="po-tracking-record min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-xs [overflow-wrap:anywhere]" onClick={openFromRecordSurface}>
              <h2 className="line-clamp-2 text-sm font-semibold text-slate-900">{summarizeItems(normalizeItems(record.itemsPayload))}</h2>
              <RecordReference record={record} />
              <p className="text-xs text-slate-600">{record.department.code} · {record.department.name}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusBadge status={record.status} register />
                <span className="text-xs text-slate-600">Stage age · <RegisterTime value={currentStageSince(record)} label={waitingTimeLabel(record, now).replace('In current stage: ', '')} /></span>
              </div>
              <p className="text-xs text-slate-600">Updated · <RegisterTime value={record.updatedAt} label={relativeUpdate(record.updatedAt, now)} /></p>
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

function StatusBadge({ status, register = false }: { status: PRStatus; register?: boolean }) {
  const presentation = statusPresentation(status);
  const Icon = status === PRStatus.Received_and_Closed ? PackageCheck : status === PRStatus.Approved_Awaiting_PO ? (register ? FilePlus : CheckCircle2) : register && status === PRStatus.Ready_for_Purchase ? ArrowRight : Clock3;
  return <span className={'purchasing-status max-w-full border text-xs font-semibold ' + presentation.className}><Icon className="size-4 shrink-0" aria-hidden="true" />{presentation.label}</span>;
}

function RecordReference({ record }: { record: TrackingNode }) {
  const po = record.purchaseOrders[0];
  return <p className="mt-1 text-xs text-slate-600">{po?.poNumber ?? 'PO not yet assigned'}</p>;
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en-PH', { numeric: 'always' });

function relativeUpdate(value: string, now: number) {
  const elapsed = now - Date.parse(value);
  if (!Number.isFinite(elapsed)) return 'Update time unavailable';
  const minutes = Math.floor(Math.abs(elapsed) / 60_000);
  if (minutes === 0) return 'Just now';
  const unit = minutes < 60 ? 'minute' : minutes < 1440 ? 'hour' : 'day';
  const amount = Math.floor(minutes / (unit === 'minute' ? 1 : unit === 'hour' ? 60 : 1440));
  return relativeTimeFormatter.format(elapsed >= 0 ? -amount : amount, unit);
}

function RegisterTime({ value, label }: { value?: string; label: string }) {
  if (!value || !Number.isFinite(Date.parse(value))) return <span>{label}</span>;
  const exact = formatDate(value);
  return <time dateTime={value} title={exact}><span className="po-tracking-relative">{label}</span><span className="po-tracking-exact">{exact}</span></time>;
}

function openFromRecordSurface(event: MouseEvent<HTMLElement>) {
  if (!(event.target instanceof Element) || event.target.closest('button, a')) return;
  const button = event.currentTarget.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
  button?.focus({ preventScroll: true });
  button?.click();
}

function ViewButton({ record, onOpen }: { record: TrackingNode; onOpen: (id: string) => void }) {
  const name = record.purchaseOrders[0]?.poNumber ?? summarizeItems(normalizeItems(record.itemsPayload)) + ', ' + record.department.name;
  return <button type="button" aria-haspopup="dialog" aria-label={'View details for ' + name} onClick={() => onOpen(record.id)}
    className="po-tracking-open inline-flex min-h-11 items-center justify-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-600">
    <span className="lg:sr-only">View details</span><ChevronRight aria-hidden="true" className="size-4 shrink-0" />
  </button>;
}

const onlineStageGuidance: Record<OnlinePurchaseStage, string> = {
  AWAITING_BO: 'Business Office reviews the submitted checkout amount and evidence.',
  AWAITING_ADMIN: 'Admin Office reviews the revision forwarded by Business Office.',
  AUTHORIZED: 'Business Office records check release for the approved revision.',
  RETURNED: 'Purchasing reviews the feedback and submits a revised checkout.',
  CHECK_RELEASED: 'Purchasing records the placed order before it goes to Receiving.',
  ORDERED: 'Receiving can inspect and record the delivery when it arrives.',
};

function stageGuidance(status: PRStatus, po?: PurchaseOrderNode) {
  if (status === PRStatus.Received_and_Closed) return 'This request is marked received and closed.';
  if (po?.onlinePurchase) return onlineStageGuidance[po.onlinePurchase.stage];
  switch (status) {
    case PRStatus.Approved_Awaiting_PO: return 'Purchasing prepares a purchase order for this approved request.';
    case PRStatus.Awaiting_Check_Issuance:
      return po?.purchaseMethod === 'ONLINE_CASH'
        ? 'Purchasing submits the final checkout amount and screenshot before Business Office review.'
        : 'Business Office records financial clearance for this PO.';
    case PRStatus.Ready_for_Purchase: return 'The order is cleared for fulfillment. Receiving records intake when it arrives.';
    default: return null;
  }
}

function TrackingItems({ items }: { items: ItemNode[] }) {
  return (
    <section aria-labelledby="tracking-items" className="po-tracking-panel-section">
      <h3 id="tracking-items" tabIndex={-1} className="font-semibold text-slate-950">Item breakdown</h3>
      {items.length === 0 ? <p className="mt-2 text-sm text-slate-600">No structured item data recorded.</p> : (
        <ul className="mt-2 divide-y divide-slate-200">
          {items.map((item, index) => (
            <li key={index} className="po-tracking-item grid min-w-0 gap-2 py-3">
              <h4 className="min-w-0 self-center font-semibold text-slate-900">{item.itemName}</h4>
              <dl className="grid min-w-0 grid-cols-3 gap-2 text-sm">
                <div><dt className="text-xs text-slate-600">Quantity</dt><dd className="tabular-nums">{item.quantity}</dd></div>
                <div><dt className="text-xs text-slate-600">Unit price</dt><dd className="tabular-nums">{item.unitPrice > 0 ? formatPeso(item.unitPrice) : '—'}</dd></div>
                <div><dt className="text-xs text-slate-600">Subtotal</dt><dd className="font-semibold tabular-nums">{item.unitPrice > 0 ? formatPeso(item.quantity * item.unitPrice) : '—'}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TrackingDetails({ record, onClose }: { record: TrackingNode; onClose: () => void }) {
  const requestNavigation = useUnsavedNavigation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const po = record.purchaseOrders[0];
  const receipt = po?.receivingReports[0];
  const unpricedCredit = po?.purchaseMethod === 'SUPPLIER_CREDIT';
  const showUnitPrices = !unpricedCredit && po?.purchaseMethod !== 'ONLINE_CASH';
  const items = normalizeItems(record.itemsPayload).map(item => showUnitPrices ? item : { ...item, unitPrice: 0 });
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const paymentMethodLabel = po?.purchaseMethod ? PURCHASE_METHOD_LABELS[po.purchaseMethod]
    : po?.paymentType === PaymentType.CREDIT_TERMS ? 'Credit / Charge Terms' : po ? 'Cash / Check' : 'Not assigned';
  const onlineLinkAvailable = po && (po.onlinePurchase || po.purchaseMethod === 'ONLINE_CASH' || (!po.purchaseMethod && po.paymentType === PaymentType.CASH_CHECK && !po.isCheckIssued));
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow; opener?.focus(); };
  }, []);
  const nextStep = stageGuidance(record.status, po);

  function jumpToSection(id: string) {
    const target = dialogRef.current?.querySelector<HTMLElement>(`#${id}`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start' });
  }

  return (
    <dialog ref={dialogRef} aria-labelledby="tracking-detail-title"
      onCancel={event => { event.preventDefault(); requestNavigation(onClose); }}
      className="po-tracking-dialog fixed inset-y-0 left-auto right-0 m-0 max-w-full overflow-hidden border-0 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/30">
      <div className="po-tracking-panel">
        <header className="po-tracking-panel-header flex items-center justify-between gap-3 border-b border-slate-200 bg-white">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-600">Order details</p>
            <h2 id="tracking-detail-title" className="font-semibold text-slate-950">{po?.poNumber ?? 'Request awaiting PO'}</h2>
          </div>
          <button autoFocus type="button" onClick={() => requestNavigation(onClose)} className="min-h-11 shrink-0 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50">Close</button>
        </header>

        <div className="po-tracking-panel-scroll">
          <section aria-label="Order overview" className="po-tracking-panel-section">
            <h3 className="text-base font-semibold text-slate-950">{summarizeItems(items)}</h3>
            <p className="mt-1 text-sm text-slate-600">{record.department.code} · {record.department.name}</p>
            <div className="po-tracking-status-summary mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <StatusBadge status={record.status} />
                <WaitingTime record={record} />
              </div>
              {po?.onlinePurchase && <p className="mt-2 text-sm font-semibold text-emerald-900">Online purchase · {ONLINE_PURCHASE_STAGE_LABELS[po.onlinePurchase.stage]}</p>}
              {nextStep && <p className="mt-2 text-sm leading-5 text-slate-700">{nextStep}</p>}
            </div>
            <dl className="po-tracking-facts mt-3 grid gap-x-4 gap-y-3 text-sm">
              <div><dt className="text-xs text-slate-600">Payment method</dt><dd className="font-semibold">{paymentMethodLabel}</dd></div>
              <div><dt className="text-xs text-slate-600">Finance clearance</dt><dd className="font-semibold">{po?.isCheckIssued ? 'Cleared' : 'Pending'}</dd></div>
              <div><dt className="text-xs text-slate-600">Total units</dt><dd className="font-semibold tabular-nums">{items.reduce((sum, item) => sum + item.quantity, 0)}</dd></div>
              <div><dt className="text-xs text-slate-600">Item total</dt><dd className="font-semibold">{unpricedCredit ? 'Awaiting supplier billing' : total > 0 ? formatPeso(total) : 'Not recorded'}</dd></div>
              <div><dt className="text-xs text-slate-600">Receiving condition</dt><dd className="font-semibold">{receipt ? 'Received · ' + receipt.condition : 'Awaiting intake'}</dd></div>
              {po?.onlinePurchase && <div><dt className="text-xs text-slate-600">Provisional online total</dt><dd className="font-semibold">{formatPeso(Number(po.onlinePurchase.amount))}</dd></div>}
            </dl>
            {po?.onlinePurchase && <p className="mt-2 text-xs text-slate-600">The online total is recorded separately from item prices.</p>}
            <div className="po-tracking-panel-links mt-3 flex flex-wrap gap-2" aria-label="Order detail shortcuts" role="group">
              <button type="button" onClick={() => jumpToSection('tracking-items')}>Items</button>
              {po && <button type="button" onClick={() => jumpToSection('tracking-documents')}>Supporting documents</button>}
              <button type="button" onClick={() => jumpToSection('tracking-history')}>History</button>
            </div>
            {po && <div className="mt-2 flex flex-wrap gap-x-4">
              {onlineLinkAvailable && <Link href={`/dashboard/po/online?poId=${po.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 underline">Open provisional online cash workflow</Link>}
              <Link href={`/dashboard/receiving/forms?poId=${po.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 underline">Prepare RR / MR for this PO</Link>
            </div>}
          </section>

          <section aria-labelledby="tracking-transaction" className="po-tracking-panel-section">
            <h3 id="tracking-transaction" className="font-semibold text-slate-950">Transaction details</h3>
            <dl className="po-tracking-facts mt-3 grid gap-x-4 gap-y-3 text-sm">
              <div><dt className="text-xs text-slate-600">Request reference</dt><dd className="font-mono text-xs">{record.id}</dd></div>
              <div><dt className="text-xs text-slate-600">PO created</dt><dd>{po ? <time dateTime={po.createdAt}>{formatDate(po.createdAt)}</time> : 'Pending preparation'}</dd></div>
              <div><dt className="text-xs text-slate-600">Last updated</dt><dd><time dateTime={record.updatedAt}>{formatDate(record.updatedAt)}</time></dd></div>
              {receipt && <div><dt className="text-xs text-slate-600">Receiving recorded</dt><dd><time dateTime={receipt.createdAt}>{formatDate(receipt.createdAt)}</time></dd></div>}
              <div className="po-tracking-wide-fact"><dt className="text-xs text-slate-600">Justification</dt><dd className="mt-1 whitespace-pre-wrap leading-6">{record.justification}</dd></div>
              {receipt?.remarks && <div className="po-tracking-wide-fact"><dt className="text-xs text-slate-600">Receiving remarks</dt><dd className="mt-1 whitespace-pre-wrap leading-6">{receipt.remarks}</dd></div>}
            </dl>
          </section>

          <TrackingItems items={items} />

          {po && <div id="tracking-documents" tabIndex={-1} role="region" aria-label="PO supporting documents">
            <PurchaseOrderDocuments key={po.id} poId={po.id} />
          </div>}

          <section aria-labelledby="tracking-history" className="po-tracking-panel-section">
            <h3 id="tracking-history" tabIndex={-1} className="font-semibold text-slate-950">Purchasing-stage history</h3>
            <div className="mt-3"><PurchasingProgress status={record.status} /></div>
            {record.auditLogs.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No purchasing-stage audit entries are recorded yet.</p>
            ) : (
              <ol className="mt-3 divide-y divide-slate-200">
                {record.auditLogs.map((log) => {
                  const logStatus = statusPresentation(log.newState);
                  return (
                    <li key={log.id} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${logStatus.className}`}>{logStatus.label}</span>
                        <time dateTime={log.createdAt} className="font-mono text-xs text-slate-600">{formatDate(log.createdAt)}</time>
                      </div>
                      {log.remarks && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{log.remarks}</p>}
                      <p className="mt-1 text-xs text-slate-600">{log.actor.role.replaceAll('_', ' ')} · {log.actor.email}</p>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </div>
    </dialog>
  );
}
