'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { PRStatus, Role } from '@prisma/client';
import { Copy } from 'lucide-react';
import { AdminProgress, AdminStatusBadge } from './AdminPortalPresentation';
import { AdminWorkflowHistory } from './AdminWorkflowHistory';
import type { AdminContextEvent } from './AdminDecisionContext';
import { BusinessVerificationDetails } from '../business/BusinessVerificationDetails';

type Tab = 'overview' | 'reviews' | 'history';
const tabs = [{ id: 'overview', label: 'Overview' }, { id: 'reviews', label: 'Reviews & documents' }, { id: 'history', label: 'Workflow history' }] as const;
const control = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700';

export function AdminPendingReviews({ logs }: { logs: readonly AdminContextEvent[] }) {
  const reviews = logs.filter(log => log.actor.role === Role.Business_Office && [PRStatus.Pending_Admin_Approval, PRStatus.Returned_for_Correction, PRStatus.Declined].some(status => status === log.newState));
  return <section aria-label="Saved office reviews" className="admin-surface min-w-0 space-y-4 rounded-lg border border-slate-200 bg-white">
    <h2 className="text-base font-semibold">Saved office reviews</h2>
    {!reviews.length && <p className="text-sm text-slate-600">No saved fiscal review is available.</p>}
    {reviews.map((log, index) => <article key={log.id || index} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4 [overflow-wrap:anywhere]">
      <h3 className="text-sm font-semibold">Business Office · {log.newState.replaceAll('_', ' ')}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{log.remarks || 'No decision note was recorded.'}</p>
      <BusinessVerificationDetails decision={log} />
      <p className="mt-3 text-xs leading-5 text-slate-600">{log.actor.email} · <time dateTime={log.createdAt}>{new Date(log.createdAt).toLocaleString()}</time></p>
    </article>)}
  </section>;
}

export default function AdminRequestPanels({ requestId, title, status, departmentCode, readOnly, logs = [], notificationEventId, overview, reviews }: {
  requestId: string; title: string; status: PRStatus; departmentCode: string; readOnly: boolean;
  logs?: readonly AdminContextEvent[]; notificationEventId?: string; overview: ReactNode; reviews: ReactNode;
}) {
  const id = useId();
  const notification = logs.find(log => log.id === notificationEventId && notificationEventId);
  const [tab, setTab] = useState<Tab>(notification ? 'history' : 'overview');
  const [target, setTarget] = useState<{ id?: string; revision: number }>({ id: notification?.id, revision: 0 });
  const [copyFeedback, setCopyFeedback] = useState('');
  const root = useRef<HTMLDivElement>(null), summary = useRef<HTMLElement>(null), focused = useRef('');
  const returned = status === PRStatus.Returned_for_Correction ? logs.find(log => log.id && log.newState === PRStatus.Returned_for_Correction && log.previousState !== log.newState) : undefined;
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const header = document.querySelector<HTMLElement>('header.sticky');
    function measure() {
      if (!element) return;
      const headerHeight = header?.getBoundingClientRect().height || 0;
      const height = summary.current?.getBoundingClientRect().height || 0;
      element.style.setProperty('--admin-summary-height', height + 'px');
      element.dataset.summarySticky = String(window.innerHeight - headerHeight - height >= 240);
    }
    const observer = new ResizeObserver(measure);
    if (summary.current) observer.observe(summary.current);
    if (header) observer.observe(header);
    measure(); window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  useEffect(() => {
    if (tab !== 'history' || !target.id) return;
    const key = target.id + ':' + target.revision;
    if (focused.current === key) return;
    const frame = requestAnimationFrame(() => {
      focused.current = key;
      const event = document.getElementById('admin-event-' + target.id);
      event?.scrollIntoView({ block: 'start' }); event?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [tab, target]);
  async function copyReference() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Unavailable');
      await navigator.clipboard.writeText(requestId); setCopyFeedback('Request reference copied.');
    } catch { setCopyFeedback('Copy unavailable. Select the reference and copy it manually.'); }
  }
  return <div ref={root} data-notification-event={notification?.id} data-read-only={readOnly} className="admin-request-panels min-w-0 space-y-4">
    <section ref={summary} aria-label="Selected Admin request context" className="admin-request-summary min-w-0 space-y-2 rounded-lg border border-slate-200 bg-white p-4 [overflow-wrap:anywhere]">
      <div className="admin-request-title-row"><h2 title={title} className="line-clamp-2 min-w-0 text-base font-semibold leading-6">{title}</h2><AdminStatusBadge status={status} /></div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600"><span className="admin-office-chip">{departmentCode}</span><span>{readOnly ? 'Past Admin decision · Read-only' : 'Awaiting Admin review'}</span></div>
      {returned && <div className="flex flex-wrap gap-2">
        {returned && <button type="button" className={control} onClick={() => { setTab('history'); setTarget(previous => ({ id: returned.id, revision: previous.revision + 1 })); }}>View return feedback</button>}
      </div>}
      <div>
        <div className="admin-reference-row">
          <span className="text-xs font-medium text-slate-600">Request reference</span>
          <code className="min-w-0 select-all break-all text-xs text-slate-700">{requestId}</code>
          <button type="button" onClick={() => void copyReference()} aria-label="Copy reference" title="Copy reference" className={'admin-copy-button ' + control}><Copy className="size-4" aria-hidden="true" /></button>
        </div>
        <p role="status" className="text-xs leading-5 text-slate-600">{copyFeedback}</p>
      </div>
      <div role="tablist" aria-label="Admin request detail sections" className="admin-detail-tabs">
        {tabs.map((option, index) => <button key={option.id} type="button" role="tab" id={id + '-tab-' + option.id} aria-controls={id + '-panel-' + option.id} aria-selected={tab === option.id} tabIndex={tab === option.id ? 0 : -1} className="admin-detail-tab" onClick={() => setTab(option.id)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault(); setTab(tabs[next].id); document.getElementById(id + '-tab-' + tabs[next].id)?.focus();
        }}>{option.label}</button>)}
      </div>
    </section>
    <div role="tabpanel" id={id + '-panel-overview'} aria-labelledby={id + '-tab-overview'} hidden={tab !== 'overview'} tabIndex={0} className="min-w-0 space-y-4">
      <AdminProgress status={status} logs={logs} />
      {overview}
    </div>
    <div role="tabpanel" id={id + '-panel-reviews'} aria-labelledby={id + '-tab-reviews'} hidden={tab !== 'reviews'} tabIndex={0} className="min-w-0 space-y-4">{reviews}</div>
    <section role="tabpanel" id={id + '-panel-history'} aria-labelledby={id + '-tab-history'} hidden={tab !== 'history'} tabIndex={0} className="admin-surface min-w-0 rounded-lg border border-slate-200 bg-white"><h3 className="text-base font-semibold">Workflow history</h3><AdminWorkflowHistory logs={logs} embedded highlightedLogId={target.id} notificationLogId={notification?.id} /></section>
  </div>;
}
