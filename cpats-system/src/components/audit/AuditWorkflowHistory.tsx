'use client';

import { useId, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { AuditRecord } from './AuditWorkspace';
import { orderedAuditEvents } from '@/shared/audit-presentation';

const text = (value: string) => value.replaceAll('_', ' ');
const wrap = 'break-words [overflow-wrap:anywhere]';

export default function AuditWorkflowHistory({ logs, highlightedEventId, notificationEventId }: {
  logs: AuditRecord['auditLogs']; highlightedEventId?: string; notificationEventId?: string;
}) {
  const [order, setOrder] = useState<'latest' | 'oldest'>('latest');
  const controlId = useId();
  if (!logs.length) return <p className="mt-4 text-sm text-slate-600">No workflow events recorded.</p>;
  const events = orderedAuditEvents(logs, order);
  return <div className="mt-3 min-w-0 space-y-5">
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <p id={controlId + '-description'} role="status" className="min-w-0 flex-1 text-sm leading-6 text-slate-600">
        {order === 'latest' ? 'Latest update first. Earlier events follow below.' : 'Read from top to bottom: the first recorded event through the latest update.'} Numbers retain their chronological sequence, including returns and resubmissions.
      </p>
      <div className="w-full min-w-0 sm:w-44 sm:shrink-0">
        <label htmlFor={controlId} className="block text-xs font-semibold text-slate-700">Show history</label>
        <select id={controlId} value={order} onChange={event => setOrder(event.target.value === 'oldest' ? 'oldest' : 'latest')} aria-describedby={controlId + '-description'} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
          <option value="latest">Latest first</option><option value="oldest">Oldest first</option>
        </select>
      </div>
    </div>
    <ol aria-label={'Recorded workflow timeline, ' + (order === 'latest' ? 'latest' : 'oldest') + ' first'} className="ml-4 min-w-0 space-y-4 border-l-2 border-slate-200">
      {events.map(({ log, number }) => {
        const highlighted = log.id === highlightedEventId;
        const label = events.length === 1 ? 'First and latest recorded event' : number === 1 ? 'First recorded event' : number === events.length ? 'Latest recorded event' : 'Recorded event';
        return <li key={log.id} id={'audit-event-' + log.id} tabIndex={-1} className={'audit-detail-anchor relative min-w-0 pl-6 sm:pl-8 ' + (highlighted ? 'rounded-lg ring-2 ring-emerald-600 ring-offset-2' : '')}>
          <span aria-hidden="true" className="absolute -left-[17px] top-4 grid size-8 place-items-center rounded-full border border-slate-300 bg-white text-xs font-semibold tabular-nums text-slate-800">{number}</span>
          <div className={'min-w-0 rounded-lg border p-3 sm:p-4 ' + (highlighted ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white')}>
            <p className="text-xs font-semibold text-slate-600">Event {number} of {events.length} · {label}</p>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
              <p className={'text-sm font-semibold ' + wrap}>{log.previousState ? text(log.previousState) + ' → ' : ''}{text(log.newState)}</p>
              {highlighted && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800"><CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />{log.id === notificationEventId ? 'Notification event' : 'Return feedback'}</span>}
            </div>
            <p className={'mt-2 text-xs leading-5 text-slate-600 ' + wrap}><time dateTime={log.createdAt}>{new Date(log.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}</time> · {text(log.actor.role)} · {log.actor.email}</p>
            <p className={'mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 ' + wrap}>{log.remarks || 'No remarks recorded.'}</p>
          </div>
        </li>;
      })}
    </ol>
  </div>;
}
