'use client';

import { useId, useState } from 'react';
import { PRStatus, Role } from '@prisma/client';

export interface RequestAuditEvent {
  id?: string;
  createdAt: string;
  previousState: PRStatus | null;
  newState: PRStatus;
  remarks: string | null;
  actor: { email: string; role: Role };
}

export function orderedRequestAuditEvents(logs: readonly RequestAuditEvent[], order: 'latest' | 'oldest') {
  const numbered = logs.map((log, index) => ({ log, number: logs.length - index }));
  return order === 'latest' ? numbered : numbered.reverse();
}

export function RequestAuditTimeline({ logs, highlightedLogId, statusBadge }: {
  logs: readonly RequestAuditEvent[];
  highlightedLogId?: string | null;
  statusBadge: (status: PRStatus) => { label: string; badgeClass: string; dotClass: string };
}) {
  const [order, setOrder] = useState<'latest' | 'oldest'>('latest');
  const controlId = useId();
  if (!logs.length) return <p className="py-2 text-sm italic text-slate-600">No decision entries have been logged yet for this requisition.</p>;
  const events = orderedRequestAuditEvents(logs, order);
  return <div className="min-w-0 space-y-5">
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <p id={`${controlId}-description`} role="status" className="min-w-0 flex-1 text-sm leading-6 text-slate-600">{order === 'latest' ? 'Latest update first. Earlier events follow below.' : 'Read from top to bottom: the first recorded event through the latest update.'} Numbers retain their chronological sequence, including returns and resubmissions.</p>
      <div className="w-full min-w-0 sm:w-44 sm:shrink-0">
        <label htmlFor={controlId} className="mb-1 block text-xs font-semibold text-slate-700">Show history</label>
        <select id={controlId} value={order} onChange={event => setOrder(event.target.value === 'oldest' ? 'oldest' : 'latest')} aria-describedby={`${controlId}-description`} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15">
          <option value="latest">Latest first</option><option value="oldest">Oldest first</option>
        </select>
      </div>
    </div>
    <ol aria-label={`Decision and progress history, ${order === 'latest' ? 'latest' : 'oldest'} first`} className="ml-4 min-w-0 space-y-4 border-l-2 border-slate-200">
      {events.map(({ log, number }) => {
        const badgeInfo = statusBadge(log.newState);
        const label = events.length === 1 ? 'First and latest recorded event' : number === events.length ? 'Latest recorded event' : number === 1 ? 'First recorded event' : 'Recorded event';
        return <li key={log.id ?? number} id={log.id ? `audit-${log.id}` : undefined} className={`relative min-w-0 scroll-mt-36 pl-6 sm:pl-8 ${log.id === highlightedLogId ? 'rounded-xl ring-2 ring-emerald-500 ring-offset-2' : ''}`}>
          <span aria-hidden="true" className="absolute -left-[17px] top-4 grid size-8 place-items-center rounded-full border border-slate-300 bg-white text-xs font-semibold tabular-nums text-slate-800">{number}</span>
          <div className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
            <p className="text-xs font-semibold text-slate-600">Event {number} of {events.length} · {label}</p>
            <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <span className={`inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium leading-5 ${badgeInfo.badgeClass}`}>
                <span className={`size-1.5 shrink-0 rounded-full ${badgeInfo.dotClass}`} />{badgeInfo.label}
              </span>
              <time dateTime={log.createdAt} className="break-words font-mono text-[12px] tabular-nums text-slate-600">{new Date(log.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
              <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">{log.actor.role.replace(/_/g, ' ')}</span>
              <span className="text-slate-600">·</span><span className="min-w-0 break-all sm:break-normal">{log.actor.email}</span>
            </div>
            {log.remarks && log.remarks.trim().length > 0 && <p className="break-words rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700 [overflow-wrap:anywhere]">&ldquo;{log.remarks}&rdquo;</p>}
          </div>
        </li>;
      })}
    </ol>
  </div>;
}
