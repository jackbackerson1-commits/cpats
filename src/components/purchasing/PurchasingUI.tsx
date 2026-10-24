'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Building2, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, ClipboardList, LoaderCircle, Search, X } from 'lucide-react';
import { QueueFilters, useQueueFilters } from '@/components/ui/QueueFilters';
import { matchesQueueFilters } from '@/shared/queue-insights';
import type { QueueTask } from '@/components/ui/WorkflowUI';
import { ReviewPreviewCard, ReviewRecordHeader, useReviewViewport } from '@/components/ui/ReviewPresentation';
import '@/components/ui/review-workspace.css';
import waves from '@/components/requesting/requester-waves.module.css';

export type { QueueTask } from '@/components/ui/WorkflowUI';

// Local presentation primitives: other offices retain their existing components.
export function PageShell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <main className={`purchasing-workspace mx-auto w-full max-w-[1920px] space-y-6 px-4 py-6 text-slate-900 sm:px-6 sm:py-8 lg:px-8 ${className}`}>{children}</main>;
}

export function StageHeader({ title, description, meta }: {
  eyebrow?: string; title: string; description: string;
  meta?: { label: string; value: string };
}) {
  return (
    <header className={`purchasing-introduction ${waves.introduction} ${waves.adminIntroduction} shadow-xs`}>
      <p className="mb-3 flex items-center gap-2 text-xs font-medium text-emerald-800">
        <Building2 className="size-4 shrink-0" aria-hidden="true" />Purchasing Office
      </p>
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
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
  return <div className={`purchasing-card rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6 ${className}`}>{children}</div>;
}

export function ErrorBanner({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, [children]);
  return <div ref={ref} tabIndex={-1} role="alert" className="flex scroll-mt-40 items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900 focus:outline-2 focus:outline-rose-700">
    <CircleAlert className="mt-1 size-5 shrink-0" aria-hidden="true" /><div className="min-w-0 break-words [overflow-wrap:anywhere]">{children}</div>
  </div>;
}

export function SuccessBanner({ children }: { children: React.ReactNode }) {
  return <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
    <CheckCircle2 className="mt-1 size-5 shrink-0" aria-hidden="true" /><div className="min-w-0 break-words [overflow-wrap:anywhere]">{children}</div>
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
    <label htmlFor={id} className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border p-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-emerald-700 ${checked ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-emerald-800" aria-describedby={description ? `${id}-help` : undefined} />
      <span className="min-w-0"><span className="block text-sm font-medium leading-5 text-slate-900">{label}</span>{description && <span id={`${id}-help`} className="mt-1 block text-sm leading-6 text-slate-600">{description}</span>}</span>
    </label>
  );
}

export function PurchasingSection({ title, description, children, id }: {
  title: string; description?: string; children: React.ReactNode; id?: string;
}) {
  const uniqueId = useId();
  const titleId = id || uniqueId;
  return <section aria-labelledby={titleId} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6">
    <h2 id={titleId} className="text-base font-semibold text-slate-950">{title}</h2>
    {description && <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>}
    <div className="mt-5 min-w-0">{children}</div>
  </section>;
}

export function ReviewWorkspace({ queueTitle, tasks, loading, emptyMessage, selectedId, onSelect,
  selectionLabel = 'In review', selectedTaskLabel = 'Reviewing selected transaction', compact = false, children,
}: {
  queueTitle: string; tasks: QueueTask[]; loading: boolean; emptyMessage: string; selectedId: string;
  onSelect: (id: string) => void; selectionLabel?: string; selectedTaskLabel?: string; compact?: boolean; children: React.ReactNode;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useQueueFilters();
  const filtersActive = !!searchQuery || Object.values(filters).some(Boolean);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  useReviewViewport(workspaceRef, detailsRef, selectedId, compact);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef<{ page: number; scroll: number; trigger: HTMLElement | null } | null>(null);
  const queueId = useId();
  const currentTask = tasks.find((task) => task.id === selectedId);
  useEffect(() => {
    if (!compact || !selectedId) return;
    let focusFrame = 0;
    // Follow an accepted parent selection; a cancelled unsaved-change prompt keeps the queue open.
    const frame = requestAnimationFrame(() => {
      setQueueExpanded(false);
      focusFrame = requestAnimationFrame(() => {
        if (window.innerWidth < 1024) {
          detailsRef.current?.focus({ preventScroll: true });
          detailsRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
        }
      });
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(focusFrame); };
  }, [compact, selectedId]);
  // Preserve the existing queue's search fields and matching rules.
  const filteredTasks = tasks.filter((task) => {
    if (!matchesQueueFilters(task, filters)) return false;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return task.title.toLowerCase().includes(q) || task.subtitle.toLowerCase().includes(q) ||
      task.id.toLowerCase().includes(q) || task.department?.toLowerCase().includes(q) || (task.justificationPreview && task.justificationPreview.toLowerCase().includes(q));
  });

  const chooseTask = (id: string) => {
    if (compact) {
      positionRef.current = { page: window.scrollY, scroll: listScrollRef.current?.scrollTop || 0, trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null };
      if (id === selectedId) {
        setQueueExpanded(false);
        requestAnimationFrame(() => { detailsRef.current?.focus({ preventScroll: true }); detailsRef.current?.scrollIntoView({ block: 'start' }); });
      } else onSelect(id);
      return;
    }
    onSelect(id);
    setQueueExpanded(false);
    window.requestAnimationFrame(() => {
      if (window.innerWidth < 1280) {
        detailsRef.current?.focus({ preventScroll: true });
        detailsRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    });
  };

  const backToQueue = () => {
    setQueueExpanded(true);
    requestAnimationFrame(() => {
      if (positionRef.current) {
        if (listScrollRef.current) listScrollRef.current.scrollTop = positionRef.current.scroll;
        window.scrollTo({ top: positionRef.current.page, behavior: 'instant' });
      }
      const trigger = positionRef.current?.trigger?.isConnected ? positionRef.current.trigger : listRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
      (trigger || listRef.current)?.focus({ preventScroll: true });
    });
  };

  return (
    <section ref={workspaceRef} aria-label="Purchasing Office review workspace" data-mobile-view={compact ? currentTask && !queueExpanded ? 'detail' : 'queue' : undefined} className={`grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(280px,26%)_minmax(0,1fr)]${compact ? ' po-preparation-workspace' : ''}`}>
      <aside ref={listRef} tabIndex={compact ? -1 : undefined} aria-label={queueTitle} className={`min-w-0 xl:sticky xl:top-36${compact ? ' po-preparation-list' : ''}`}>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="space-y-3 border-b border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="min-w-0 text-base font-semibold leading-6 text-slate-950">{queueTitle}</h2>
              <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium tabular-nums text-slate-700">{loading ? 'Loading…' : `${filteredTasks.length} of ${tasks.length}`}</span>
            </div>
            {currentTask && <div className={compact ? 'po-preparation-selection' : 'xl:hidden'}>
              <p className="text-xs font-medium text-emerald-800">{selectionLabel}</p>
              <p className="mt-1 break-words text-sm font-medium leading-6 text-slate-900 [overflow-wrap:anywhere]">{currentTask.title}</p>
              <button type="button" aria-expanded={queueExpanded} aria-controls={queueId} onClick={() => setQueueExpanded((v) => !v)} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {queueExpanded ? 'Hide request list' : 'Choose another request'}<ChevronDown className={`size-4 ${queueExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
            </div>}
          </div>
          <div ref={listScrollRef} id={queueId} className={`${currentTask && !queueExpanded ? 'hidden xl:block' : ''}${compact ? ' po-preparation-list-content' : ''}`}>
            <div className="relative m-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-600" aria-hidden="true" />
              <input type="search" aria-label={`Search ${queueTitle}`} placeholder="Search items, office, or reference" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={`${inputClass()} pl-9 pr-12`} />
              {searchQuery && <button type="button" aria-label="Clear queue search" onClick={() => setSearchQuery('')} className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"><X className="size-4" aria-hidden="true" /></button>}
            </div>
            <div className="m-3"><details><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-emerald-700">Additional filters{Object.values(filters).some(Boolean) ? ' · applied' : ''}</summary><QueueFilters compact records={tasks} value={filters} onChange={setFilters} onClear={() => setSearchQuery('')} /></details>{currentTask && !filteredTasks.some(task => task.id === selectedId) && <p role="status" className="mt-3 text-xs leading-5 text-slate-600">The open record is outside these filters. Its form remains open.</p>}</div>
            <div className={`max-h-96 overflow-y-auto overscroll-contain p-2 xl:max-h-[calc(100dvh-20rem)]${compact ? ' po-preparation-list-scroll' : ''}`}>
              {loading ? <p role="status" className="flex items-center gap-2 px-3 py-8 text-sm text-slate-600"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Loading requests…</p> : filteredTasks.length === 0 ? <div className="px-3 py-7 text-center">
                <ClipboardList className="mx-auto size-7 text-slate-500" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-slate-800">{filtersActive ? 'No matching records' : 'Queue clear'}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{filtersActive ? 'Adjust the filters or clear them to see the full queue.' : emptyMessage}</p>
              </div> : <div className="space-y-2">{filteredTasks.map((task) => {
                const isSelected = task.id === selectedId;
                return <ReviewPreviewCard key={task.id} task={task} selected={isSelected} onSelect={chooseTask} />;
              })}</div>}
            </div>
          </div>
        </div>
      </aside>
      <div ref={detailsRef} tabIndex={-1} role="region" aria-label={selectedId ? selectedTaskLabel : 'Request details'} className={`min-w-0 scroll-mt-40 focus:outline-none${compact ? ' po-preparation-detail' : ''}`}>
        {compact && selectedId && <button type="button" onClick={backToQueue} className="po-preparation-back mb-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"><ChevronRight className="size-4 rotate-180" aria-hidden="true" />Back to requests</button>}{compact && currentTask && <ReviewRecordHeader task={currentTask} />}{children}
      </div>
    </section>
  );
}

export function ActionButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`purchasing-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-800 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700 ${className}`}>{children}</button>;
}

