'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ClipboardList, Copy, LoaderCircle, Search, X } from 'lucide-react';
import { QueueFilters, useQueueFilters } from '@/components/ui/QueueFilters';
import { matchesQueueFilters } from '@/shared/queue-insights';
import type { QueueTask } from '@/components/ui/WorkflowUI';
import './business-evaluation-workspace.css';
import { ReviewPreviewCard, ReviewRecordHeader, useReviewViewport } from '@/components/ui/ReviewPresentation';
import '@/components/ui/review-workspace.css';

export function BusinessEvaluationWorkspace({ queueTitle, tasks, loading, emptyMessage, emptyTitle, selectedId, onSelect, selectedTaskLabel, compactTools = false, historyFilters, clearanceLayout = false, hideRecordHeader = false, queueUnavailable = false, children }: {
  queueTitle: string; tasks: (QueueTask & { reviewCue?: string })[]; loading: boolean; emptyMessage: string; emptyTitle?: string; selectedId: string;
  onSelect: (id: string) => void; selectionLabel?: string; selectedTaskLabel?: string;
  clearanceLayout?: boolean; hideRecordHeader?: boolean; queueUnavailable?: boolean;
  renderTaskDetails?: (task: QueueTask) => ReactNode; compactTools?: boolean; historyFilters?: ReactNode; children: ReactNode;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useQueueFilters();
  const [listOpen, setListOpen] = useState(false);
  const root = useRef<HTMLElement>(null), list = useRef<HTMLElement>(null), scroll = useRef<HTMLDivElement>(null), detail = useRef<HTMLDivElement>(null);
  useReviewViewport(root, detail, selectedId, !clearanceLayout);
  const position = useRef<{ page: number; scroll: number; trigger: HTMLButtonElement | null } | null>(null);
  const lastSelected = useRef('');
  const currentTask = tasks.find(task => task.id === selectedId);
  const filtersActive = !!searchQuery || Object.values(filters).some(Boolean);
  const clearSearch = (event: React.MouseEvent<HTMLButtonElement>) => {
    setSearchQuery('');
    event.currentTarget.parentElement?.querySelector('input')?.focus();
  };
  // Same matching fields and rules as the original Business queue.
  const filteredTasks = tasks.filter(task => {
    if (!matchesQueueFilters(task, filters)) return false;
    const q = searchQuery.toLowerCase().trim();
    return !q || task.title.toLowerCase().includes(q) || task.subtitle.toLowerCase().includes(q) || task.id.toLowerCase().includes(q) || task.department?.toLowerCase().includes(q) || (task.justificationPreview && task.justificationPreview.toLowerCase().includes(q));
  });
  useEffect(() => {
    if (!selectedId || lastSelected.current === selectedId) return;
    const frame = requestAnimationFrame(() => {
      lastSelected.current = selectedId;
      setListOpen(false);
      if (clearanceLayout || !window.matchMedia('(min-width: 64rem)').matches) { detail.current?.focus({ preventScroll: true }); detail.current?.scrollIntoView({ block: 'start' }); }
    });
    return () => cancelAnimationFrame(frame);
  }, [clearanceLayout, selectedId]);
  useEffect(() => {
    const element = root.current, header = document.querySelector<HTMLElement>('header.sticky');
    if (!element) return;
    const measure = () => {
      const height = header?.getBoundingClientRect().height || 0;
      element.style.setProperty('--business-header-height', height + 'px');
      if (compactTools) element.closest('main')?.style.setProperty('--business-shell-height', height + 'px');
      element.dataset.sticky = String(window.innerHeight - height >= 400);
    };
    const observer = new ResizeObserver(measure);
    if (header) observer.observe(header);
    measure(); window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); if (compactTools) element.closest('main')?.style.removeProperty('--business-shell-height'); };
  }, [compactTools]);
  const dashboardScroller = () => clearanceLayout ? root.current?.closest('.cpats-dashboard-content') : null;
  const choose = (id: string) => {
    position.current = { page: dashboardScroller()?.scrollTop ?? window.scrollY, scroll: scroll.current?.scrollTop || 0, trigger: document.activeElement instanceof HTMLButtonElement ? document.activeElement : null };
    if (id === selectedId) {
      setListOpen(false);
      requestAnimationFrame(() => { detail.current?.focus({ preventScroll: true }); detail.current?.scrollIntoView({ block: 'start' }); });
      return;
    }
    // Visibility changes only after the parent's existing guard accepts selection.
    onSelect(id);
  };
  const back = () => {
    setListOpen(true);
    requestAnimationFrame(() => {
      if (position.current) {
        if (scroll.current) scroll.current.scrollTop = position.current.scroll;
        const scroller = dashboardScroller();
        if (scroller) scroller.scrollTop = position.current.page;
        else window.scrollTo({ top: position.current.page, behavior: 'instant' });
      }
      const trigger = position.current?.trigger?.isConnected ? position.current.trigger : scroll.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      if (trigger) trigger.focus({ preventScroll: true }); else list.current?.focus({ preventScroll: true });
    });
  };
  return <section ref={root} aria-label="Business Office review workspace" data-empty-queue={!loading && tasks.length === 0 && !selectedId} data-mobile-view={selectedId && !listOpen ? 'detail' : 'queue'} className="business-review-workspace">
    {compactTools && <div className="business-fiscal-list-tools">
        <div className="business-fiscal-search relative min-w-0"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-600" aria-hidden="true" /><input type="search" aria-label={`Search ${queueTitle}`} placeholder="Search items, office, or reference" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-12" />{searchQuery && <button type="button" aria-label="Clear queue search" onClick={clearSearch} className="business-clear-search absolute right-1 top-1/2 grid -translate-y-1/2 place-items-center"><X className="size-4" aria-hidden="true" /></button>}</div>
      {historyFilters}

        <div className="business-queue-filters"><details><summary className="cursor-pointer text-sm font-semibold text-slate-700">Additional filters{Object.values(filters).some(Boolean) ? ' · applied' : ''}</summary><QueueFilters compact records={tasks} value={filters} onChange={setFilters} onClear={() => setSearchQuery('')} /></details>{currentTask && !filteredTasks.some(task => task.id === selectedId) && <p role="status" className="mt-2 text-xs text-slate-600">The open record is outside these filters. Its form remains open.</p>}</div>
    </div>}
    <aside ref={list} tabIndex={-1} aria-label={queueTitle} className="business-review-list rounded-lg border border-slate-200 bg-white">
      <div className="space-y-1 border-b border-slate-200 p-4"><h2 className="text-sm font-semibold">{queueTitle}</h2>{(!compactTools || loading || filtersActive) && <p role="status" className="text-xs text-slate-600">{loading ? 'Loading…' : `${filteredTasks.length} of ${tasks.length} records`}</p>}</div>
      <div className="business-review-list-body">
        {!compactTools && <>
        <div className="relative m-3"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-600" aria-hidden="true" /><input type="search" aria-label={`Search ${queueTitle}`} placeholder="Search items, office, or reference" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-12" />{searchQuery && <button type="button" aria-label="Clear queue search" onClick={(event) => { setSearchQuery(''); if (clearanceLayout) event.currentTarget.parentElement?.querySelector('input')?.focus(); }} className="business-clear-search absolute right-1 top-1/2 grid -translate-y-1/2 place-items-center"><X className="size-4" aria-hidden="true" /></button>}</div>
        <div className="business-queue-filters mx-3 mb-3"><details><summary className="cursor-pointer text-sm font-semibold text-slate-700">Additional filters{Object.values(filters).some(Boolean) ? ' · applied' : ''}</summary><QueueFilters compact records={tasks} value={filters} onChange={setFilters} onClear={() => setSearchQuery('')} /></details>{currentTask && !filteredTasks.some(task => task.id === selectedId) && <p role="status" className="mt-2 text-xs text-slate-600">The open record is outside these filters. Its form remains open.</p>}</div>
        </>}
        {queueUnavailable && <p role="alert" className="mx-3 mb-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Could not load the queue. Refresh to check for pending orders.</p>}
        <div ref={scroll} tabIndex={0} role="region" aria-label={queueTitle + ' records'} className="business-review-list-scroll space-y-1 p-2">
          {loading ? <p role="status" className="flex items-center gap-2 px-3 py-8 text-sm text-slate-600"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Loading requests…</p> : !filteredTasks.length ? <div className="px-3 py-6 text-center"><ClipboardList className="mx-auto size-6 text-slate-500" aria-hidden="true" /><p className="mt-3 text-sm font-semibold">{emptyTitle || (queueUnavailable && !tasks.length ? 'Queue unavailable' : filtersActive ? 'No matching records' : 'Queue clear')}</p><p className="mt-1 text-sm leading-6 text-slate-600">{queueUnavailable && !tasks.length ? null : filtersActive && !emptyTitle ? 'Adjust the filters or clear them to see the full queue.' : emptyMessage}</p></div> : filteredTasks.map(task => <ReviewPreviewCard key={task.id} task={task} reviewCue={task.reviewCue} wrapTitle={compactTools} selected={task.id === selectedId} onSelect={choose} />)}
        </div>
      </div>
    </aside>
    <div ref={detail} tabIndex={-1} role="region" aria-label={selectedId ? selectedTaskLabel : 'Request details'} className="business-review-detail min-w-0">
      {selectedId && <button type="button" onClick={back} className="mb-3 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 lg:hidden">Back to records</button>}{!compactTools && !hideRecordHeader && currentTask && <ReviewRecordHeader task={currentTask} showJustification />}{children}
    </div>
  </section>;
}

export function BusinessRequestPanels({ requestId, title, status, context, reviewLabel, hideContext = false, compactReference = false, overview, history }: {
  requestId: string; title: string; status: string; context: string; reviewLabel: string; hideContext?: boolean; compactReference?: boolean; overview: ReactNode; history: ReactNode;
}) {
  const [tab, setTab] = useState('overview'), [copyFeedback, setCopyFeedback] = useState('');
  const id = useId();
  const tabs = [{ id: 'overview', label: 'Overview' }, { id: 'history', label: 'Workflow history' }];
  const copy = async () => {
    try { if (!navigator.clipboard?.writeText) throw new Error('Unavailable'); await navigator.clipboard.writeText(requestId); setCopyFeedback('Request reference copied.'); }
    catch { setCopyFeedback(compactReference ? 'Copy unavailable. Open the reference to copy it manually.' : 'Copy unavailable. Select the reference and copy it manually.'); }
  };
  return <div className="business-request-panels space-y-4">
    <section aria-label="Selected Business request context" className="business-request-summary rounded-lg border border-slate-200 bg-white p-4">
      <div className="business-request-title-row"><h2 title={title} className={`${compactReference ? 'break-words' : 'line-clamp-2'} min-w-0 text-base font-semibold leading-6`}>{title}</h2><span data-business-status={status} className="business-status-badge rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium">{status.replaceAll('_', ' ')}</span></div>
      {!hideContext && <p className="mt-2 text-xs text-slate-600">{context} · <span className="text-emerald-800">{reviewLabel}</span></p>}
      <div><div className="business-reference-row">{compactReference ? <details className="min-w-0 text-xs text-slate-700"><summary className="business-reference-toggle cursor-pointer">Reference …{requestId.slice(-8)}</summary><code className="select-all break-all">{requestId}</code></details> : <><span className="text-xs font-medium text-slate-600">Request reference</span><code className="min-w-0 select-all break-all text-xs text-slate-700">{requestId}</code></>}<button type="button" aria-label="Copy reference" title="Copy reference" onClick={() => void copy()} className="business-copy-button rounded-lg border border-slate-300 bg-white"><Copy className="size-4" aria-hidden="true" /></button></div><p role="status" className="text-xs leading-5 text-slate-600">{copyFeedback}</p></div>
      <div role="tablist" aria-label="Business request detail sections" className="business-detail-tabs mt-2">
        {tabs.map((option, index) => <button key={option.id} type="button" role="tab" id={`${id}-tab-${option.id}`} aria-controls={`${id}-panel-${option.id}`} aria-selected={tab === option.id} tabIndex={tab === option.id ? 0 : -1} className="business-detail-tab" onClick={() => setTab(option.id)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault(); setTab(tabs[next].id); document.getElementById(`${id}-tab-${tabs[next].id}`)?.focus();
        }}>{option.label}</button>)}
      </div>
    </section>
    <div role="tabpanel" id={`${id}-panel-overview`} aria-labelledby={`${id}-tab-overview`} hidden={tab !== 'overview'} tabIndex={0} className="space-y-4">

      {overview}
    </div>
    <div role="tabpanel" id={`${id}-panel-history`} aria-labelledby={`${id}-tab-history`} hidden={tab !== 'history'} tabIndex={0} className="space-y-4">{history}</div>
  </div>;
}

export function BusinessEvaluationActionBar({ title, children, description, label = 'Business Office decision', jumpLabel = 'Go to decision', targetId = 'business-decision-controls' }: {
  title: string; children: ReactNode; description?: string; label?: string; jumpLabel?: string; targetId?: string;
}) {
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = bar.current, form = element?.closest('form');
    if (!element || !form) return;
    const measure = () => form.style.setProperty('--business-action-height', element.getBoundingClientRect().height + 'px');
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => { observer.disconnect(); form.style.removeProperty('--business-action-height'); };
  }, []);
  return <section ref={bar} aria-label={`${label} actions`} className="business-action-bar">
    {description && <p id="business-decision-explanation" className="business-action-description text-xs leading-5 text-slate-700">{description}</p>}
    <div className="business-action-context min-w-0"><h2 className="text-xs font-medium text-slate-600">{label}</h2><p className="text-sm font-semibold text-slate-950">{title}</p></div>
    <div className="business-action-buttons"><button type="button" className="rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => { const decision = document.getElementById(targetId); decision?.scrollIntoView({ block: 'start' }); decision?.focus({ preventScroll: true }); }}>{jumpLabel}</button>{children}</div>
  </section>;
}
