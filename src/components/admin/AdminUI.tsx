'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Building2, Check, CheckCircle2, CircleAlert, ClipboardList, LoaderCircle, Search, Undo2, X } from 'lucide-react';
import { QueueFilters, useQueueFilters } from '@/components/ui/QueueFilters';
import { matchesQueueFilters } from '@/shared/queue-insights';
import type { QueueTask } from '@/components/ui/WorkflowUI';
import { adminReviewPage } from '@/shared/admin-presentation';
import './admin-review-workspace.css';
import { ReviewPreviewCard, useReviewViewport } from '@/components/ui/ReviewPresentation';
import '@/components/ui/review-workspace.css';
import { PRStatus } from '@prisma/client';

export type { QueueTask } from '@/components/ui/WorkflowUI';

// Local presentation primitives: other offices retain their existing components.
export function PageShell({ children }: { children: React.ReactNode }) {
  const page = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = document.querySelector('header.sticky');
    const measure = () => page.current?.style.setProperty('--admin-shell-height', `${header?.getBoundingClientRect().height || 0}px`);
    const observer = new ResizeObserver(measure);
    if (header) observer.observe(header);
    measure();
    return () => observer.disconnect();
  }, []);
  return <main ref={page} className="requester-workspace admin-portal-workspace admin-approval-page mx-auto w-full text-slate-900">{children}</main>;
}

export function StageHeader({ title, description, meta }: {
  eyebrow?: string; title: string; description?: string;
  meta?: { label: string; value: string };
}) {
  return (
    <header className="admin-page-introduction">
      <p className="mb-1 flex items-center gap-2 text-xs font-medium text-emerald-800">
        <Building2 className="size-4 shrink-0" aria-hidden="true" />Admin Office
      </p>
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-2xl">
          <h1 className="admin-page-title font-semibold tracking-tight text-slate-950">{title}</h1>
          {description && <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>}
        </div>
        {meta && <dl className="min-w-0 sm:max-w-64 sm:text-right">
          <dt className="text-xs text-slate-600">{meta.label}</dt>
          <dd className="mt-1 break-words text-sm font-medium text-slate-800 [overflow-wrap:anywhere]">{meta.value}</dd>
        </dl>}
      </div>
    </header>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`admin-surface rounded-lg border border-slate-200 bg-white ${className}`}>{children}</div>;
}

export function ErrorBanner({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, [children]);
  return <div ref={ref} tabIndex={-1} role="alert" className="flex scroll-mt-40 items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900 focus:outline-2 focus:outline-rose-700">
    <CircleAlert className="mt-1 size-5 shrink-0" aria-hidden="true" /><div className="min-w-0 break-words [overflow-wrap:anywhere]">{children}</div>
  </div>;
}

export function SuccessBanner({ children, tone = 'success' }: { children: React.ReactNode; tone?: 'success' | 'warning' | 'decline' }) {
  const colors = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    decline: 'border-rose-200 bg-rose-50 text-rose-800',
  };
  const Icon = tone === 'warning' ? Undo2 : tone === 'decline' ? X : CheckCircle2;
  return <div role="status" className={`flex items-start gap-3 rounded-xl border p-4 text-sm leading-6 ${colors[tone]}`}>
    <Icon className="mt-1 size-5 shrink-0" aria-hidden="true" /><div className="min-w-0 break-words [overflow-wrap:anywhere]">{children}</div>
  </div>;
}

export function FieldLabel({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...props} className="mb-2 block text-sm font-medium text-slate-800">{children}</label>;
}

export function FieldError({ children, id }: { children: React.ReactNode; id?: string }) {
  return <p id={id} className="mt-2 flex items-start gap-2 text-sm leading-5 text-rose-800"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{children}</span></p>;
}

export const inputClass = (hasError?: boolean) => `w-full min-w-0 min-h-11 rounded-lg border bg-white px-3 py-3 text-sm leading-6 text-slate-900 placeholder:text-slate-500 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 disabled:bg-slate-100 ${hasError ? 'border-rose-600' : 'border-slate-300'}`;

export function CheckItem({ id, checked, onChange, label, description }: {
  id: string; checked: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  return (
    <label htmlFor={id} className={`admin-check-item flex cursor-pointer items-start gap-3 rounded-lg border p-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-emerald-700 ${checked ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-emerald-800" aria-describedby={description ? `${id}-help` : undefined} />
      <span className="min-w-0"><span className="block text-sm font-medium leading-5 text-slate-900">{label}</span>{description && <span id={`${id}-help`} className="mt-1 block text-sm leading-6 text-slate-600">{description}</span>}</span>
    </label>
  );
}

export function AdminSection({ title, description, children, id }: {
  title: string; description?: string; children: React.ReactNode; id?: string;
}) {
  const uniqueId = useId();
  const titleId = id || uniqueId;
  return <section aria-labelledby={titleId} className="admin-surface min-w-0 rounded-lg border border-slate-200 bg-white">
    <h2 id={titleId} className="text-base font-semibold text-slate-950">{title}</h2>
    {description && <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>}
    <div className="mt-3 min-w-0">{children}</div>
  </section>;
}

export function ReviewWorkspace({ queueTitle, tasks, loading, emptyMessage, selectedId, onSelect, toolbar,
  selectedTaskLabel = 'Reviewing selected transaction', viewKey = queueTitle, children,
}: {
  toolbar?: React.ReactNode; queueTitle: string; tasks: (QueueTask & { decisionStatus?: PRStatus; officeCode?: string; dateTime?: string })[]; loading: boolean; emptyMessage: string; selectedId: string;
  onSelect: (id: string) => void; selectionLabel?: string; selectedTaskLabel?: string; viewKey?: string; children: React.ReactNode;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useQueueFilters();
  const [pageState, setPageState] = useState({ view: viewKey, page: 1 });
  const [pageSize, setPageSize] = useState(10);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null), listRef = useRef<HTMLElement>(null), scrollRef = useRef<HTMLDivElement>(null), workspaceRef = useRef<HTMLElement>(null);
  useReviewViewport(workspaceRef, detailsRef, selectedId);
  const lastSelected = useRef('');
  const returnPosition = useRef<{ page: number; scroll: number; listPage: number; trigger: HTMLButtonElement | null } | null>(null);
  const queueId = useId();
  const filtersActive = !!searchQuery || Object.values(filters).some(Boolean);
  const currentTask = tasks.find(task => task.id === selectedId);
  const filteredTasks = useMemo(() => tasks.filter(task => {
    if (!matchesQueueFilters(task, filters)) return false;
    const q = searchQuery.toLowerCase().trim();
    return !q || task.title.toLowerCase().includes(q) || task.subtitle.toLowerCase().includes(q) || task.id.toLowerCase().includes(q) || !!task.department?.toLowerCase().includes(q) || !!task.justificationPreview?.toLowerCase().includes(q);
  }), [tasks, filters, searchQuery]);
  const pagination = adminReviewPage(filteredTasks, pageState.view === viewKey ? pageState.page : 1, pageSize);
  const setPage = (page: number) => setPageState({ view: viewKey, page });
  useEffect(() => {
    const key = viewKey + ':' + selectedId;
    if (!selectedId || lastSelected.current === key) return;
    const index = filteredTasks.findIndex(task => task.id === selectedId);
    const frame = requestAnimationFrame(() => {
      lastSelected.current = key;
      if (index >= 0) setPageState({ view: viewKey, page: Math.floor(index / pageSize) + 1 });
      setQueueExpanded(false);
      if (!window.matchMedia('(min-width: 64rem)').matches && !detailsRef.current?.querySelector('[data-notification-event]')) { detailsRef.current?.focus({ preventScroll: true }); detailsRef.current?.scrollIntoView({ block: 'start' }); }
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId, viewKey, filteredTasks, pageSize]);
  useEffect(() => {
    const workspace = workspaceRef.current, header = document.querySelector<HTMLElement>('header.sticky');
    if (!workspace) return;
    function measure() {
      if (!workspace) return;
      const height = header?.getBoundingClientRect().height || 0;
      workspace.style.setProperty('--admin-header-height', height + 'px');
      workspace.dataset.adminSticky = String(window.innerHeight - height >= 400);
    }
    const observer = new ResizeObserver(measure);
    if (header) observer.observe(header);
    measure(); window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  useEffect(() => {
    const scroller = scrollRef.current, active = scroller?.querySelector('button[aria-pressed="true"]');
    if (!scroller || !active) return;
    const bounds = scroller.getBoundingClientRect(), row = active.getBoundingClientRect();
    if (row.top < bounds.top || row.bottom > bounds.bottom) scroller.scrollTop += row.top - bounds.top - 8;
  }, [selectedId, pagination.page, loading]);
  function chooseTask(id: string) {
    returnPosition.current = { page: window.scrollY, scroll: scrollRef.current?.scrollTop || 0, listPage: pagination.page, trigger: document.activeElement instanceof HTMLButtonElement ? document.activeElement : null };
    // Reopen the mounted mobile detail without resetting an unfinished form.
    if (id === selectedId) {
      setQueueExpanded(false);
      requestAnimationFrame(() => { detailsRef.current?.focus({ preventScroll: true }); detailsRef.current?.scrollIntoView({ block: 'start' }); });
      return;
    }
    onSelect(id);
  }
  function backToRecords() {
    setQueueExpanded(true);
    const position = returnPosition.current;
    if (position) setPage(position.listPage);
    requestAnimationFrame(() => {
      if (scrollRef.current && position) scrollRef.current.scrollTop = position.scroll;
      if (position) window.scrollTo({ top: position.page, behavior: 'instant' });
      const trigger = position?.trigger?.isConnected ? position.trigger : scrollRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
      if (trigger) trigger.focus({ preventScroll: true });
      else { listRef.current?.focus({ preventScroll: true }); listRef.current?.scrollIntoView({ block: 'start' }); }
    });
  }
  function changePage(page: number) {
    setPage(page); if (scrollRef.current) scrollRef.current.scrollTop = 0;
    requestAnimationFrame(() => { listRef.current?.focus({ preventScroll: true }); listRef.current?.scrollIntoView({ block: 'start' }); });
  }
  const pagerButton = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-40';
  return <section ref={workspaceRef} aria-label="Admin Office review workspace" data-mobile-view={selectedId && !queueExpanded ? 'detail' : 'queue'} className="admin-review-workspace grid min-w-0 items-start">
        <div className="admin-portal-list-tools">
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-600" aria-hidden="true" /><input type="search" aria-label={'Search ' + queueTitle} placeholder="Search items, office, or reference" value={searchQuery} onChange={event => { setSearchQuery(event.target.value); setPage(1); }} className={inputClass() + ' pl-9 pr-12'} />{searchQuery && <button type="button" aria-label="Clear queue search" onClick={() => { setSearchQuery(''); setPage(1); }} className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center"><X className="size-4" aria-hidden="true" /></button>}</div>
          {toolbar}

        <div className="admin-queue-filters shrink-0"><details><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-700">Additional filters{Object.values(filters).some(Boolean) ? ' · applied' : ''}</summary><QueueFilters compact records={tasks} value={filters} onChange={value => { setFilters(value); setPage(1); }} onClear={() => { setSearchQuery(''); setPage(1); }} /></details>{currentTask && !filteredTasks.some(task => task.id === selectedId) && <p role="status" className="mt-2 text-xs text-slate-600">The open record is outside these filters. Its form remains open.</p>}</div>

        </div>
    <aside ref={listRef} tabIndex={-1} aria-label={queueTitle} className="admin-list min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs focus:outline-none">
      <div className="shrink-0 space-y-1 border-b border-slate-200 p-4"><h2 className="text-sm font-semibold">{queueTitle}</h2><p role="status" className="text-xs leading-5 text-slate-600">{loading ? 'Loading…' : 'Showing ' + pagination.start + '–' + pagination.end + ' of ' + filteredTasks.length + ' matching records · ' + tasks.length + ' loaded'}</p>
      </div>
      <div id={queueId} className="admin-list-body flex min-h-0 flex-col">
        <div ref={scrollRef} tabIndex={0} role="region" aria-label={queueTitle + ' records'} className="admin-list-scroll min-h-0 max-h-96 overflow-y-auto overscroll-contain p-2">
          {loading ? <p role="status" className="flex items-center gap-2 px-3 py-8 text-sm text-slate-600"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Loading requests…</p> : !filteredTasks.length ? <div className="px-3 py-6 text-center"><ClipboardList className="mx-auto size-6 text-slate-500" aria-hidden="true" /><p className="mt-3 text-sm font-semibold">{filtersActive ? 'No matching records' : 'Queue clear'}</p><p className="mt-1 text-sm leading-6 text-slate-600">{filtersActive ? 'Adjust the filters or clear them to see the full queue.' : emptyMessage}</p></div> : <div className="space-y-1">{pagination.records.map(task => <ReviewPreviewCard key={task.id} task={task} selected={task.id === selectedId} onSelect={chooseTask} />)}</div>}
        </div>
        <div className="admin-list-pagination shrink-0 space-y-3 border-t border-slate-200 p-3"><label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">Per page<select aria-label="Requests per page" value={pageSize} disabled={loading} onChange={event => { setPageSize(Number(event.target.value)); changePage(1); }} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3"><option value={10}>10</option><option value={25}>25</option></select></label><nav aria-label="Admin request pages" className="flex flex-wrap items-center justify-between gap-2 text-xs"><button type="button" disabled={loading || pagination.page === 1} onClick={() => changePage(pagination.page - 1)} className={pagerButton}>Previous</button><span aria-current="page">{pagination.page} / {pagination.totalPages}</span><button type="button" disabled={loading || pagination.page === pagination.totalPages} onClick={() => changePage(pagination.page + 1)} className={pagerButton}>Next</button></nav></div>
      </div>
    </aside>
    <div ref={detailsRef} tabIndex={-1} role="region" aria-label={selectedId ? selectedTaskLabel : 'Request details'} className="admin-details min-w-0 focus:outline-none">{selectedId && <button type="button" onClick={backToRecords} className={'admin-back-button mb-3 lg:hidden ' + pagerButton}>Back to records</button>}{children}</div>
  </section>;
}

export function DecisionButtonGroup({ value, onChange, approveLabel = 'Approve', returnLabel = 'Return for correction', declineLabel = 'Decline' }: {
  value: string; onChange: (v: 'APPROVE' | 'RETURN_FOR_CORRECTION' | 'DECLINE') => void;
  approveLabel?: string; returnLabel?: string; declineLabel?: string;
}) {
  return <div className="admin-decision-choices grid gap-2" role="group" aria-label="Decision selection">
    {([
      { value: 'APPROVE', label: approveLabel, icon: Check, selected: 'border-emerald-700 bg-emerald-50 text-emerald-950', description: 'Authorize purchase order preparation' },
      { value: 'RETURN_FOR_CORRECTION', label: returnLabel, icon: Undo2, selected: 'border-amber-600 bg-amber-50 text-amber-950', description: 'Request changes from the office' },
      { value: 'DECLINE', label: declineLabel, icon: X, selected: 'border-rose-700 bg-rose-50 text-rose-950', description: 'Close this request as declined' },
    ] as const).map((option) => <div key={option.value} className="min-w-0">
      <button type="button" aria-pressed={value === option.value} aria-describedby={'admin-choice-' + option.value} onClick={() => onChange(option.value)} data-decision={option.value} className={`admin-decision-choice w-full rounded-lg border text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${value === option.value ? option.selected : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
      <span className="flex items-center gap-2 text-sm font-semibold"><option.icon className="size-4 shrink-0" aria-hidden="true" />{option.label}</span>
      </button>
      <p id={'admin-choice-' + option.value} className="mt-1 text-xs leading-5 text-slate-600">{option.description}</p>
    </div>)}
  </div>;
}

export function ActionButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700 ${className}`}>{children}</button>;
}

export function AdminEmptySelection({ kind }: { kind: 'request' | 'order' }) {
  return <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
    <ClipboardList className="size-8 text-emerald-800" aria-hidden="true" />
    <h2 className="mt-4 text-base font-semibold text-slate-900">Select a {kind === 'order' ? 'purchase order' : 'request'} to review</h2>
    <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">Choose a record from the list to see its saved details and available {kind === 'order' ? 'financial clearance' : 'evaluation'} actions.</p>
  </div>;
}

export function AdminFinalAction({ title, description, children }: {
  title: string; description: string; children: React.ReactNode;
}) {
  const bar = useRef<HTMLElement>(null);
  const descriptionId = useId();
  useEffect(() => {
    const element = bar.current, form = element?.closest('form');
    if (!element || !form) return;
    const details = form.closest<HTMLElement>('.admin-details');
    const measure = () => {
      const height = element.getBoundingClientRect().height + 'px';
      form.style.setProperty('--admin-action-height', height);
      details?.style.setProperty('--admin-action-height', height);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element); measure();
    return () => { observer.disconnect(); form.style.removeProperty('--admin-action-height'); details?.style.removeProperty('--admin-action-height'); };
  }, []);
  return <section ref={bar} aria-label="Admin Office decision actions" aria-describedby={descriptionId} className="admin-action-bar">
    <div className="admin-action-context min-w-0"><h2 className="text-xs font-medium text-slate-600">Admin Office decision</h2><p className="text-sm font-semibold text-slate-950">{title}</p><p id={descriptionId} className="sr-only">{description}</p></div>
    <div className="admin-action-buttons">
      <button type="button" className="admin-jump-button rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => { const decision = document.getElementById('admin-decision-controls'); decision?.scrollIntoView({ block: 'start' }); decision?.focus({ preventScroll: true }); }}>Go to decision</button>
      {children}
    </div>
  </section>;
}
