'use client';

import { useId, useState } from 'react';
import { ChevronDown, CheckCircle2 } from 'lucide-react';
import { PRStatus, Role } from '@prisma/client';

export interface AdminWorkflowEvent {
  id?: string;
  createdAt: string;
  previousState: PRStatus | null;
  newState: PRStatus;
  remarks: string | null;
  actor: { email: string; role: Role };
}

export function orderedAdminWorkflowEvents(logs: readonly AdminWorkflowEvent[], order: 'latest' | 'oldest') {
  const numbered = logs.map((log, index) => ({ log, number: logs.length - index }));
  return order === 'latest' ? numbered : numbered.reverse();
}

export function AdminWorkflowHistory({ logs, embedded = false, highlightedLogId, notificationLogId }: { logs: readonly AdminWorkflowEvent[]; embedded?: boolean; highlightedLogId?: string; notificationLogId?: string }) {
  const [order, setOrder] = useState<'latest' | 'oldest'>('latest');
  const controlId = useId();
  if (!logs.length) return embedded ? <p className="mt-3 text-sm text-slate-600">No workflow events recorded.</p> : null;
  const events = orderedAdminWorkflowEvents(logs, order);
  const orderLabel = order === 'latest' ? 'Latest first' : 'Oldest first';
  const content = <div className={embedded ? 'mt-4 min-w-0' : 'min-w-0 border-t border-slate-200 p-4 sm:p-6'}>
      <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p id={`${controlId}-description`} role="status" className="min-w-0 flex-1 text-sm leading-6 text-slate-600">{order === 'latest' ? 'Latest update first. Earlier events follow below.' : 'Read from top to bottom: the first recorded event through the latest update.'} Numbers retain their chronological sequence, including returns and resubmissions.</p>
        <div className="w-full min-w-0 sm:w-44 sm:shrink-0">
          <label htmlFor={controlId} className="mb-1 block text-xs font-semibold text-slate-700">Show history</label>
          <select id={controlId} value={order} onChange={event => setOrder(event.target.value === 'oldest' ? 'oldest' : 'latest')} aria-describedby={`${controlId}-description`} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15">
            <option value="latest">Latest first</option><option value="oldest">Oldest first</option>
          </select>
        </div>
      </div>
      <ol aria-label={`Workflow history, ${orderLabel.toLowerCase()}`} className="ml-4 min-w-0 space-y-4 border-l-2 border-slate-200">
        {events.map(({ log, number }) => {
          const latest = number === events.length;
          const label = events.length === 1 ? 'First and latest recorded event' : latest ? 'Latest recorded event' : number === 1 ? 'First recorded event' : 'Recorded event';
          const tone = latest && log.newState === PRStatus.Declined ? 'border-rose-200 bg-rose-50'
            : latest && log.newState === PRStatus.Returned_for_Correction ? 'border-amber-200 bg-amber-50'
            : latest ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50';
          return <li key={log.id || number} id={log.id ? 'admin-event-' + log.id : undefined} tabIndex={-1} className={'admin-history-event relative min-w-0 pl-6 sm:pl-8 ' + (log.id && log.id === highlightedLogId ? 'rounded-lg ring-2 ring-emerald-600 ring-offset-2' : '')}>
            <span aria-hidden="true" className="admin-event-number absolute top-4 grid size-8 place-items-center rounded-full border border-slate-300 bg-white text-xs font-semibold tabular-nums text-slate-800">{number}</span>
            <div className={`min-w-0 rounded-lg border p-4 ${tone}`}>
              <p className="text-xs font-semibold text-slate-600">Event {number} of {events.length} · {label}</p>
              <p className="mt-2 break-words text-sm font-semibold text-slate-900">{log.previousState ? log.previousState.replace(/_/g, ' ') + ' → ' : ''}{log.newState.replace(/_/g, ' ')}</p>
              {log.id && log.id === highlightedLogId && <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-800"><CheckCircle2 className="size-4" aria-hidden="true" />{log.id === notificationLogId ? 'Notification event' : 'Return feedback'}</p>}
              {log.remarks && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{log.remarks}</p>}
              <p className="mt-3 break-words text-xs leading-5 text-slate-600 [overflow-wrap:anywhere]">{log.actor.role.replace(/_/g, ' ')} · {log.actor.email} · <time dateTime={log.createdAt}>{new Date(log.createdAt).toLocaleString()}</time></p>
            </div>
          </li>;
        })}
      </ol>
    </div>;
  if (embedded) return content;
  return <details className="group min-w-0 rounded-xl border border-slate-200 bg-white">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold text-slate-800 sm:px-6">
      <span className="min-w-0">Workflow history<span className="mt-1 block text-xs font-normal text-slate-600">{events.length} recorded {events.length === 1 ? 'event' : 'events'} · {orderLabel}</span></span>
      <ChevronDown className="size-4 shrink-0 transition group-open:rotate-180" aria-hidden="true" />
    </summary>
    {content}
  </details>;
}
