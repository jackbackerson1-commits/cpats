'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { QueueFilters, useQueueFilters, WaitingTime } from '@/components/ui/QueueFilters';
import { matchesQueueFilters } from '@/shared/queue-insights';
import Link from 'next/link';
import { auditPage, latestRecordedReturn } from '@/shared/audit-presentation';
import { PRStatus, Role } from '@prisma/client';
import { ArrowLeft, Building2, Camera, ChevronRight, CircleAlert, CircleCheck, CircleX, Clock3, Undo2, Copy, FileSearch, LockKeyhole, QrCode, RefreshCw, X } from 'lucide-react';
import QRCodeSVG from '@/components/ui/QRCodeSVG';
import { normalizeReportItems } from '@/shared/monthly-report';
import { deriveItemSummaryTitle } from '@/components/ui/WorkflowUI';
import './audit-workspace.css';
import AuditWorkflowHistory from './AuditWorkflowHistory';

export interface AuditRecord {
  id: string; justification: string; itemsPayload?: unknown; status: PRStatus; isDirectPoBypass: boolean;
  createdAt: string; adminProofFilePath?: string | null; department: { name: string; code: string };
  purchaseOrders: { poNumber: string; qrCodeToken?: string; isCheckIssued: boolean; paymentType?: string;
    receivingReports?: { id: string; createdAt: string; condition: string; remarks: string | null; asssetImageFilePath: string; invoiceFilePath: string }[] }[];
  auditLogs: { id: string; createdAt: string; previousState: PRStatus | null; newState: PRStatus; remarks: string | null; actor: { email: string; role: Role } }[];
}
const text = (value: string) => value.replaceAll('_', ' ');
const date = (value: string) => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
const control = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700';
const button = `${control} inline-flex items-center justify-center gap-2 font-semibold hover:bg-slate-50 disabled:opacity-50`;
const card = 'min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6';
const wrap = 'break-words [overflow-wrap:anywhere]';
export function computeAuditMatch(node: AuditRecord) {
  if (node.status === PRStatus.Declined) return { score: 0, label: 'Declined', badge: 'border-rose-200 bg-rose-50 text-rose-800' };
  const approved = node.status !== PRStatus.Draft && node.status !== PRStatus.Pending_Business_Approval && node.status !== PRStatus.Pending_Admin_Approval && node.status !== PRStatus.Returned_for_Correction;
  const checkIssued = node.purchaseOrders.some(po => po.isCheckIssued);
  const receivedGood = node.purchaseOrders.some(po => po.receivingReports?.some(report => report.condition === 'Good'));
  const score = Number(approved) + Number(checkIssued) + Number(receivedGood);
  if (score === 3) return { score: 3, label: '3/3 fully matched', badge: 'border-emerald-200 bg-emerald-50 text-emerald-900' };
  if (score === 2) return { score: 2, label: '2/3 in progress', badge: 'border-slate-200 bg-slate-50 text-slate-700' };
  return { score: 1, label: '1/3 initialized', badge: 'border-slate-200 bg-slate-50 text-slate-700' };
}
function Status({ value }: { value: PRStatus }) {
  const approved = value === PRStatus.Approved_Awaiting_PO || value === PRStatus.Received_and_Closed;
  const tone = value === PRStatus.Declined ? 'border-rose-200 bg-rose-50 text-rose-800' : value === PRStatus.Returned_for_Correction ? 'border-amber-200 bg-amber-50 text-amber-900' : approved ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-slate-50 text-slate-700';
  const Icon = value === PRStatus.Declined ? CircleX : value === PRStatus.Returned_for_Correction ? Undo2 : approved ? CircleCheck : Clock3;
  return <span className={`audit-status inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${wrap} ${tone}`}><Icon className="size-4 shrink-0" aria-hidden="true" />{text(value)}</span>;
}
function upload(path?: string | null) {
  try {
    if (!path?.startsWith('/uploads/') || path.includes('\\')) return null;
    const url = new URL(path, 'https://cpats.local');
    return url.origin === 'https://cpats.local' && url.pathname.startsWith('/uploads/') ? url.pathname + url.search : null;
  } catch { return null; }
}
function Evidence({ path, label }: { path?: string | null; label: string }) {
  const href = upload(path);
  return href ? <a className={button} href={href} target="_blank" rel="noopener noreferrer">{label}<span className="sr-only"> (opens in a new tab)</span></a> : <p className="text-sm text-slate-600">{label}: no accessible saved reference.</p>;
}
function Preview({ media, close }: { media: { type: 'QR' | 'IMAGE'; title: string; payload: string }; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const dialog = ref.current, trigger = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); trigger?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} onCancel={event => { event.preventDefault(); close(); }} aria-labelledby="audit-preview-title" className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-950/50 sm:p-6">
    <div className="flex items-start justify-between gap-3"><h2 id="audit-preview-title" className={`text-lg font-semibold ${wrap}`}>{media.title}</h2><button type="button" onClick={close} className={button} aria-label="Close preview"><X className="size-4" aria-hidden="true" /></button></div>
    {media.type === 'QR' ? <div className="mt-5 space-y-4"><div className="flex justify-center"><QRCodeSVG value={media.payload} size={180} /></div><p className="text-sm leading-6 text-slate-600">This QR identifies the whole purchase order. Individual equipment labels are available in the asset register.</p><p className="break-all rounded-lg bg-slate-50 p-3 font-mono text-xs leading-6">{media.payload}</p></div> : <div className="mt-5">{failed ? <p role="alert" className="rounded-lg bg-rose-50 p-4 text-sm text-rose-800">The saved delivery photo could not be displayed. Try opening its saved reference.</p> : <img src={media.payload} alt="Saved delivery inspection photo" onError={() => setFailed(true)} className="mx-auto max-h-[50dvh] max-w-full rounded-lg object-contain" />}<div className="mt-4"><Evidence path={media.payload} label="Open delivery photo" /></div></div>}
    <div className="mt-5 border-t border-slate-200 pt-4"><button type="button" className={button} onClick={close}>Close preview</button></div>
  </dialog>;
}

interface Props {
  records: AuditRecord[]; loading: boolean; error: string | null; notificationError: string | null;
  status: string; order: 'asc' | 'desc'; onStatus: (value: string) => void; onOrder: (value: 'asc' | 'desc') => void;
  refresh: () => void; selectedId: string; onSelect: (id: string) => void; eventId: string | null; email?: string;
}
type DetailTab = 'overview' | 'documents' | 'history';
const detailTabs = [{ id: 'overview', label: 'Overview' }, { id: 'documents', label: 'Documents & receiving' }, { id: 'history', label: 'Workflow history' }] as const;

export default function AuditWorkspace(props: Props) {
  const { records, loading, error, notificationError, selectedId, eventId } = props;
  const [query, setQuery] = useState('');
  const [queueRequestId, setQueueRequestId] = useState<string | null>(null);
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10);
  const lastSelected = useRef('');
  const [detailTab, setDetailTab] = useState<{ requestId: string; tab: DetailTab }>({ requestId: '', tab: 'overview' });
  const [eventTarget, setEventTarget] = useState<{ requestId: string; eventId: string; revision: number }>({ requestId: '', eventId: '', revision: 0 });
  const eventFocusHandled = useRef('');
  const [copyFeedback, setCopyFeedback] = useState<{ requestId: string; message: string }>({ requestId: '', message: '' });
  const [queueFilters, setQueueFilters] = useQueueFilters();
  const [media, setMedia] = useState<{ type: 'QR' | 'IMAGE'; title: string; payload: string } | null>(null);
  const details = useRef<HTMLDivElement>(null), list = useRef<HTMLElement>(null);
  const workspace = useRef<HTMLElement>(null), summary = useRef<HTMLDivElement>(null);
  const recordScroll = useRef<HTMLDivElement>(null);
  const returnPosition = useRef<{ page: number; list: number; trigger: HTMLButtonElement | null } | null>(null);
  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => records.filter(record => matchesQueueFilters({ ...record, department: record.department.name }, queueFilters) && (!needle || [record.id, record.department.name, record.department.code, record.justification, ...record.purchaseOrders.map(po => po.poNumber), deriveItemSummaryTitle(record.itemsPayload, record.justification)].some(value => value.toLowerCase().includes(needle)))), [records, needle, queueFilters]);
  const selected = records.find(record => record.id === selectedId);
  const pagination = auditPage(visible, page, pageSize);
  const notificationEvent = selected?.auditLogs.find(log => log.id === eventId);
  const activeTab = detailTab.requestId === selectedId ? detailTab.tab : notificationEvent ? 'history' : 'overview';
  const highlightedEventId = eventTarget.requestId === selectedId ? eventTarget.eventId : notificationEvent?.id;
  const returnEvent = selected?.status === PRStatus.Returned_for_Correction ? latestRecordedReturn(selected.auditLogs) : undefined;
  const fullyMatched = records.filter(record => computeAuditMatch(record).score === 3).length;
  const inProgress = records.filter(record => computeAuditMatch(record).score === 2).length;
  useEffect(() => {
    if (!selectedId || lastSelected.current === selectedId) return;
    const index = visible.findIndex(record => record.id === selectedId);
    const frame = requestAnimationFrame(() => {
      lastSelected.current = selectedId;
      if (index >= 0) setPage(Math.floor(index / pageSize) + 1);
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId, visible, pageSize]);
  useEffect(() => {
    if (activeTab !== 'history' || !highlightedEventId) return;
    const focusKey = selectedId + ':' + highlightedEventId + ':' + eventTarget.revision;
    if (eventFocusHandled.current === focusKey) return;
    const frame = requestAnimationFrame(() => {
      eventFocusHandled.current = focusKey;
      const event = document.getElementById('audit-event-' + highlightedEventId);
      event?.scrollIntoView({ block: 'start' }); event?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, highlightedEventId, selectedId, eventTarget.revision]);
  function changeTab(tab: DetailTab) { setDetailTab({ requestId: selectedId, tab }); }
  function openReturnFeedback() {
    if (!returnEvent) return;
    setEventTarget(previous => ({ requestId: selectedId, eventId: returnEvent.id, revision: previous.revision + 1 })); changeTab('history');
  }
  async function copyReference() {
    if (!selected) return;
    const requestId = selected.id;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(requestId);
      setCopyFeedback({ requestId, message: 'Request reference copied.' });
    } catch {
      setCopyFeedback({ requestId, message: 'Copy unavailable. Select the reference above and copy it manually.' });
    }
  }
  function changeListPage(next: number) {
    setPage(next);
    if (recordScroll.current) recordScroll.current.scrollTop = 0;
    requestAnimationFrame(() => { list.current?.focus({ preventScroll: true }); list.current?.scrollIntoView({ block: 'start' }); });
  }
  useEffect(() => {
    const main = workspace.current;
    if (!main) return;
    const header = document.querySelector('nav[aria-label="Global Auditor navigation"]')?.closest('header')
      ?? document.querySelector<HTMLElement>('header.sticky');
    function measure() {
      if (!main) return;
      const headerHeight = header?.getBoundingClientRect().height ?? 0;
      const summaryHeight = summary.current?.getBoundingClientRect().height ?? 0;
      main.style.setProperty('--audit-header-height', `${headerHeight}px`);
      main.style.setProperty('--audit-summary-height', `${summaryHeight}px`);
      // Leave room to read and reach focused controls at zoom or short viewport heights.
      main.dataset.auditSticky = String(window.innerHeight - headerHeight - summaryHeight >= 240);
    }
    const observer = new ResizeObserver(measure);
    if (header) observer.observe(header);
    if (summary.current) observer.observe(summary.current);
    measure();
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [selectedId, loading, error]);
  useEffect(() => {
    const scroller = recordScroll.current;
    const active = scroller?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    if (!scroller || !active) return;
    const row = active.getBoundingClientRect(), bounds = scroller.getBoundingClientRect();
    if (row.top < bounds.top || row.bottom > bounds.bottom) {
      scroller.scrollTop += row.top - bounds.top - 12;
    }
  }, [selectedId, loading, pagination.page]);
  function choose(id: string) {
    returnPosition.current = {
      page: window.scrollY, list: recordScroll.current?.scrollTop ?? 0,
      trigger: document.activeElement instanceof HTMLButtonElement ? document.activeElement : null,
    };
    setQueueRequestId(null);
    props.onSelect(id);
    window.requestAnimationFrame(() => {
      if (window.innerWidth < 1024) details.current?.focus({ preventScroll: true });
      details.current?.scrollIntoView({ block: 'start' });
    });
  }
  function back() {
    setQueueRequestId(selectedId);
    requestAnimationFrame(() => {
      const position = returnPosition.current;
      if (position) {
        if (recordScroll.current) recordScroll.current.scrollTop = position.list;
        window.scrollTo({ top: position.page, behavior: 'instant' });
        if (position.trigger?.isConnected) position.trigger.focus({ preventScroll: true });
        else list.current?.focus({ preventScroll: true });
      } else {
        list.current?.focus({ preventScroll: true });
        list.current?.scrollIntoView({ block: 'start' });
      }
    });
  }
  function keepFocusVisible(target: EventTarget) {
    if (!(target instanceof HTMLElement) || target === details.current || summary.current?.contains(target)) return;
    window.requestAnimationFrame(() => {
      if (workspace.current?.dataset.auditSticky !== 'true' || document.activeElement !== target) return;
      const boundary = summary.current?.getBoundingClientRect().bottom ?? 0;
      const top = target.getBoundingClientRect().top;
      if (top < boundary + 8) window.scrollBy({ top: top - boundary - 8, behavior: 'instant' });
    });
  }
  return <main ref={workspace} data-mobile-view={selectedId && queueRequestId !== selectedId ? 'detail' : 'queue'} className="audit-workspace mx-auto w-full max-w-[1920px] space-y-6 px-4 py-6 text-slate-900 sm:px-6 sm:py-8 lg:px-8">
    <header className="auditor-page-introduction"><p className="mb-1 flex items-center gap-2 text-xs font-medium"><Building2 className="size-4" aria-hidden="true" />Global Auditor</p><h1 className="text-2xl font-semibold tracking-tight">Procurement audit ledger</h1><p className="mt-2 text-sm leading-6">Trace each request through its saved decisions, purchase orders and delivery evidence.</p></header>
    <div className="audit-metrics grid grid-cols-2 gap-3 lg:grid-cols-4">{[
      ['Requests in this view', records.length], ['3/3 fully matched', fullyMatched], ['2/3 in progress', inProgress], ['Fully matched share', records.length ? `${Math.round(fullyMatched / records.length * 100)}%` : '—'],
    ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><p className="text-xs leading-5 text-slate-600">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{loading || error ? '—' : value}</p></div>)}</div>
    <div className="audit-readonly-note flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600"><LockKeyhole className="mt-1 size-4 shrink-0" aria-hidden="true" /><p>Read-only review. Checkpoints reflect the existing approval, check-issued and good-receipt indicators; they are not an independent certification of compliance.</p></div>
    <section aria-label="Audit filters" className={card}><div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_14rem_auto]">
      <label className="min-w-0 text-sm font-medium">Find a record<input className={`mt-2 w-full ${control}`} type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="PO, department, item or request reference" /><span className="mt-2 block text-xs font-normal text-slate-600">Search within the loaded status view.</span></label>
      <label className="min-w-0 text-sm font-medium">Request status<select disabled={loading} className={`mt-2 w-full ${control}`} value={props.status} onChange={event => { setPage(1); props.onStatus(event.target.value); }}><option value="">All request statuses</option>{Object.values(PRStatus).map(value => <option key={value} value={value}>{text(value)}</option>)}</select></label>
      <label className="min-w-0 text-sm font-medium">Request order<select disabled={loading} className={`mt-2 w-full ${control}`} value={props.order} onChange={event => { setPage(1); props.onOrder(event.target.value as 'asc' | 'desc'); }}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></label>
      <button type="button" onClick={props.refresh} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50 lg:mt-7"><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />{loading ? 'Loading…' : 'Refresh ledger'}</button>
    </div></section>
    <details className={'audit-additional-filters ' + card}><summary className="cursor-pointer text-sm font-semibold text-slate-700">Additional filters{Object.values(queueFilters).some(Boolean) ? ' · applied' : ''}</summary><div className="mt-3"><QueueFilters records={records.map(record => ({ ...record, department: record.department.name }))} value={queueFilters} onChange={value => { setQueueFilters(value); setPage(1); }} showStatus={false} onClear={() => { setQuery(''); setPage(1); props.onStatus(''); }} /></div></details>
    {(error || notificationError) && <div role="alert" className={`flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800 ${wrap}`}><CircleAlert className="mt-1 size-5 shrink-0" aria-hidden="true" /><p>{error || notificationError}</p></div>}
    <div className="audit-master-detail grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(280px,28%)_minmax(0,1fr)]">
      <section ref={list} tabIndex={-1} aria-label="Audit records" className="audit-record-list min-w-0 rounded-xl border border-slate-200 bg-white shadow-xs focus:outline-none">
        <div className="shrink-0 border-b border-slate-200 p-4"><h2 className="text-base font-semibold">Request records</h2><p role="status" className="mt-2 text-xs text-slate-600">{loading ? 'Loading audit records…' : error ? 'Ledger unavailable. Refresh to try again.' : 'Showing ' + pagination.start + '–' + pagination.end + ' of ' + visible.length + ' matching records · ' + records.length + ' loaded'}</p>{query && <button type="button" onClick={() => { setQuery(''); setPage(1); }} className={'mt-3 ' + button}>Clear search</button>}</div>
        <div ref={recordScroll} aria-busy={loading} className="audit-record-scroll max-h-96 space-y-2 overflow-y-auto overscroll-contain p-3">
          {!loading && !error && !visible.length && <div className="p-4 text-sm leading-6 text-slate-600"><FileSearch className="mb-3 size-6" aria-hidden="true" /><p>No requests match this view. Try another status or clear your filters.</p></div>}
          {!loading && !error && pagination.records.map(record => <button type="button" key={record.id} onClick={() => choose(record.id)} aria-pressed={record.id === selectedId} aria-label={'Open request ' + record.id + ' · ' + deriveItemSummaryTitle(record.itemsPayload, record.justification)} className={'w-full min-w-0 rounded-lg border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ' + (record.id === selectedId ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50')}>
            <span className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium text-emerald-800">{record.department.code}</span><Status value={record.status} /></span>
            <span className="mt-2 flex items-start gap-2"><span className={'line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-5 ' + wrap}>{deriveItemSummaryTitle(record.itemsPayload, record.justification)}</span><ChevronRight className="mt-1 size-4 shrink-0" aria-hidden="true" /></span>
            <span className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-600"><time dateTime={record.createdAt}>{date(record.createdAt)}</time><span className="font-mono">Ref …{record.id.slice(-8)}</span></span>
          </button>)}
        </div>
        <div className="shrink-0 space-y-3 border-t border-slate-200 p-3">
          <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">Requests per page<select value={pageSize} disabled={loading} onChange={event => { setPageSize(Number(event.target.value)); changeListPage(1); }} className={control}><option value={10}>10</option><option value={25}>25</option></select></label>
          <nav aria-label="Audit record pages" className="flex flex-wrap items-center justify-between gap-2 text-xs"><button type="button" disabled={loading || Boolean(error) || pagination.page === 1} onClick={() => changeListPage(pagination.page - 1)} className={button}>Previous</button><span aria-current="page">{pagination.page} / {pagination.totalPages}</span><button type="button" disabled={loading || Boolean(error) || pagination.page === pagination.totalPages} onClick={() => changeListPage(pagination.page + 1)} className={button}>Next</button></nav>
        </div>
      </section>
      <div ref={details} tabIndex={-1} role="region" aria-label="Audit record details" onFocusCapture={event => keepFocusVisible(event.target)} className="audit-record-details min-w-0 space-y-5 focus:outline-none">
        {!loading && !error && selected ? <div ref={summary} role="region" aria-label="Selected request context" className="audit-selected-context rounded-xl border border-slate-200 bg-white p-3 shadow-xs sm:p-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><h2 className={'line-clamp-2 min-w-0 text-base font-semibold text-slate-900 ' + wrap}>{deriveItemSummaryTitle(selected.itemsPayload, selected.justification)}</h2><Status value={selected.status} /></div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-600">{selected.department.code} · Read-only</span><button type="button" onClick={back} className={button + ' audit-back'}><ArrowLeft className="size-4" aria-hidden="true" />Back to records</button></div>
          {returnEvent && <button type="button" onClick={openReturnFeedback} className={'mt-2 ' + button}>View return feedback</button>}
          <div role="tablist" aria-label="Request detail sections" className="audit-tabs mt-3 flex flex-wrap gap-1">
            {detailTabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={'audit-tab-' + tab.id} aria-controls={'audit-panel-' + tab.id} aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => changeTab(tab.id)} onKeyDown={event => {
              let next = index;
              if (event.key === 'ArrowRight') next = (index + 1) % detailTabs.length;
              else if (event.key === 'ArrowLeft') next = (index + detailTabs.length - 1) % detailTabs.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = detailTabs.length - 1;
              else return;
              event.preventDefault(); changeTab(detailTabs[next].id); document.getElementById('audit-tab-' + detailTabs[next].id)?.focus();
            }} className={button + (activeTab === tab.id ? ' border-emerald-700 bg-emerald-50 text-emerald-900' : '')}>{tab.label}</button>)}
          </div>
        </div> : <button type="button" onClick={back} className={`${button} audit-back`}><ArrowLeft className="size-4" aria-hidden="true" />Back to records</button>}
        {loading || error || !selected ? <div className={card}><FileSearch className="size-7 text-emerald-800" aria-hidden="true" /><h2 className="mt-4 text-lg font-semibold">{loading ? 'Loading ledger' : error ? 'Record details unavailable' : 'Select a request to review'}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{error ? 'Refresh the ledger to load the latest saved records.' : 'Choose a request to see its complete details, linked evidence and workflow history.'}</p></div> : <>
          <section id="audit-panel-overview" role="tabpanel" aria-labelledby="audit-tab-overview" tabIndex={0} hidden={activeTab !== 'overview'} className={card} key={'overview-' + selected.id}>
            <h3 className="text-base font-semibold">Request overview</h3>
            <div className="mt-3"><span className={'rounded-md border px-2 py-1 text-xs font-medium ' + computeAuditMatch(selected).badge}>{computeAuditMatch(selected).label}</span></div>
            <dl className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2"><div><dt className="text-xs text-slate-600">Requesting department</dt><dd className={'mt-1 text-sm ' + wrap}>{selected.department.name} ({selected.department.code})</dd></div><div><dt className="text-xs text-slate-600">Request created</dt><dd className="mt-1 text-sm">{date(selected.createdAt)}</dd></div><div><dt className="text-xs text-slate-600">Request type</dt><dd className="mt-1 text-sm">{selected.isDirectPoBypass ? 'Fast-track request' : 'Standard request'}</dd></div><div><dt className="text-xs text-slate-600">Time in current stage</dt><dd><WaitingTime record={selected} /></dd></div></dl>
            <div className="audit-reference mt-4"><span className="text-xs text-slate-600">Full request reference</span><span className="min-w-0 select-all break-all font-mono text-xs leading-6">{selected.id}</span><button type="button" onClick={() => void copyReference()} className={button} aria-label="Copy reference" title="Copy reference"><Copy className="size-4" aria-hidden="true" /></button><p role="status" className="text-xs leading-5 text-slate-600">{copyFeedback.requestId === selected.id ? copyFeedback.message : ''}</p></div>
            <div className="mt-3 rounded-lg border border-slate-200 p-3"><h4 className="mb-3 text-sm font-semibold">Saved justification</h4><p className={'whitespace-pre-wrap text-sm leading-6 text-slate-700 ' + wrap}>{selected.justification}</p></div>
            <div className="mt-3 rounded-lg border border-slate-200 p-3"><h4 className="mb-3 text-sm font-semibold">Items ({normalizeReportItems(selected.itemsPayload).length})</h4><ul className="space-y-3">{normalizeReportItems(selected.itemsPayload).map((item, index) => <li key={index} className={'rounded-lg border border-slate-200 p-3 text-sm leading-6 ' + wrap}><p className="font-medium">{item.itemName}</p><p className="text-slate-600">Quantity: {item.quantity}</p></li>)}</ul></div>
          </section>
          <section id="audit-panel-documents" role="tabpanel" aria-labelledby="audit-tab-documents" tabIndex={0} hidden={activeTab !== 'documents'} className={card}><h3 className="text-base font-semibold">Purchase orders and receiving evidence</h3>{selected.adminProofFilePath && <div className="mt-3"><Evidence path={selected.adminProofFilePath} label="Open approval proof" /></div>}<p className="mt-2 text-sm leading-6 text-slate-600">PO QR references identify an order. Equipment labels identify individual physical units.</p>{!selected.purchaseOrders.length ? <p className="mt-4 text-sm text-slate-600">No purchase order has been saved for this request.</p> : selected.purchaseOrders.map((po, index) => <article key={`${po.poNumber}-${index}`} className="mt-4 rounded-lg border border-slate-200 p-4"><h4 className={`text-sm font-semibold text-emerald-900 ${wrap}`}>{po.poNumber}</h4><p className="mt-2 text-sm text-slate-600">{po.paymentType === 'CREDIT_TERMS' ? 'Credit / charge terms' : 'Cash / check'} · Check issued: {po.isCheckIssued ? 'Yes' : 'No'}</p>{po.qrCodeToken && <button type="button" className={`mt-3 ${button}`} onClick={() => setMedia({ type: 'QR', title: `PO QR · ${po.poNumber}`, payload: po.qrCodeToken! })}><QrCode className="size-4" aria-hidden="true" />View PO QR</button>}
            {!po.receivingReports?.length ? <p className="mt-4 text-sm text-slate-600">No receiving report saved.</p> : po.receivingReports.map(report => <div key={report.id} className="mt-4 border-t border-slate-200 pt-4"><div className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-md px-2 py-1 font-medium ${report.condition === 'Damaged' ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>{report.condition === 'Damaged' ? 'Damage recorded' : 'Good condition'}</span><span className="text-slate-600">{date(report.createdAt)}</span></div><p className={`mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 ${wrap}`}>{report.remarks || 'No inspection remarks recorded.'}</p><div className="mt-3 flex flex-wrap items-center gap-3"><Evidence path={report.invoiceFilePath} label="Open supplier invoice" />{upload(report.asssetImageFilePath) ? <button type="button" className={button} onClick={() => setMedia({ type: 'IMAGE', title: `Delivery photo · ${po.poNumber}`, payload: upload(report.asssetImageFilePath)! })}><Camera className="size-4" aria-hidden="true" />View delivery photo</button> : <p className="text-sm text-slate-600">No accessible delivery photo reference.</p>}</div></div>)}
          </article>)}<Link className={`mt-4 ${button}`} href="/dashboard/assets">Open asset register</Link></section>
          <section id="audit-panel-history" role="tabpanel" aria-labelledby="audit-tab-history" tabIndex={0} hidden={activeTab !== 'history'} className={card}><h3 className="text-base font-semibold">Recorded workflow events</h3><AuditWorkflowHistory key={selected.id} logs={selected.auditLogs} highlightedEventId={highlightedEventId} notificationEventId={notificationEvent?.id} /></section>
        </>}
      </div>
    </div>
    {media && <Preview media={media} close={() => setMedia(null)} />}
  </main>;
}

