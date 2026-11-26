import { PRStatus, Role } from '@prisma/client';
import { ChevronDown } from 'lucide-react';

interface AdminEvent {
  id?: string; createdAt: string; newState: PRStatus;
  remarks: string | null; actor: { email: string; role: Role };
}
const wrap = 'min-w-0 break-words [overflow-wrap:anywhere]';
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
function reason(event: AdminEvent) {
  const remark = event.remarks;
  if (!remark) return 'No specific reason recorded.';
  return remark.startsWith('Admin Execution Node [') && remark.includes('Reason: ')
    ? remark.slice(remark.indexOf('Reason: ') + 'Reason: '.length) : remark;
}

export function AdminFeedbackContext({ auditLogs = [], status, sections = 'all' }: { auditLogs?: AdminEvent[]; status: PRStatus; sections?: 'all' | 'latest' | 'previous' }) {
  // Both callers provide server-ordered events, newest first, including tied timestamps.
  const decisions = auditLogs.filter(event => event.actor.role === Role.Admin_Office &&
    (event.newState === PRStatus.Approved_Awaiting_PO || event.newState === PRStatus.Returned_for_Correction || event.newState === PRStatus.Declined));
  const latest = decisions[0];
  const negatives = decisions.filter(event => event.newState !== PRStatus.Approved_Awaiting_PO);
  if (!negatives.length && sections !== 'latest') return null;
  const visibleNegatives = sections === 'latest' ? negatives.filter(event => event === latest)
    : sections === 'previous' ? negatives.filter(event => event !== latest) : negatives;
  return <div className="min-w-0 space-y-4">
    {sections !== 'previous' && latest?.newState === PRStatus.Approved_Awaiting_PO && <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
      <h2 className="text-base font-semibold text-emerald-950">Latest Admin decision · Approved</h2>
      <p className="mt-2 text-sm leading-6 text-emerald-950">Admin approved this request on {date(latest.createdAt)}. {sections === 'all' ? 'Earlier returns or declines below are historical.' : 'The current request status is shown above; this is the saved Admin decision.'}</p>
      <p className={`${wrap} mt-3 text-xs leading-5 text-emerald-900`}>{latest.actor.email} · {new Date(latest.createdAt).toLocaleString()}</p>
    </section>}
    {visibleNegatives.map((event, index) => {
      const declined = event.newState === PRStatus.Declined;
      const current = event === latest && status === event.newState && auditLogs[0] === event;
      const laterDecision = event !== latest ? latest : undefined;
      const title = current ? declined ? 'Admin Office decision · Declined' : 'Admin Office feedback · Corrections required'
        : `Previous Admin ${declined ? 'decline' : 'return'} · Historical`;
      const content = <>
        <p className={`${wrap} whitespace-pre-wrap text-sm leading-6`}>{declined ? 'Declined' : 'Returned'} {date(event.createdAt)}: “{reason(event)}”</p>
        {!current && <p className="mt-3 text-sm leading-6">{laterDecision
          ? `Admin subsequently ${laterDecision.newState === PRStatus.Approved_Awaiting_PO ? 'approved' : laterDecision.newState === PRStatus.Declined ? 'declined' : 'returned'} this request on ${date(laterDecision.createdAt)}. This earlier ${declined ? 'decline' : 'return'} does not represent its current status.`
          : `Current request status: ${status.replace(/_/g, ' ')}. No later Admin decision is recorded; this feedback belongs to an earlier review.`}</p>}
        {current && declined && <p className="mt-3 text-sm leading-6">This decline is final for this request. Reusing its details creates a separate request and does not change this decision.</p>}
        <p className={`${wrap} mt-3 border-t border-current/15 pt-3 text-xs leading-5`}>{event.actor.email} · {new Date(event.createdAt).toLocaleString()}</p>
      </>;
      return current ? <section key={event.id || index} className={`rounded-xl border p-4 sm:p-5 ${declined ? 'border-rose-200 bg-rose-50 text-rose-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
        <h2 className="text-base font-semibold">{title}</h2><div className="mt-3">{content}</div>
      </section> : <details key={event.id || index} className="group min-w-0 rounded-xl border border-slate-200 bg-white text-slate-700">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl p-4 text-sm font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:px-5 [&::-webkit-details-marker]:hidden"><span className={wrap}>{title}<span className="mt-1 block text-xs font-normal text-slate-600">{date(event.createdAt)} · Expand for reason and later decision</span></span><ChevronDown className="size-4 shrink-0 transition group-open:rotate-180" aria-hidden="true" /></summary>
        <div className="min-w-0 border-t border-slate-200 p-4 sm:p-5">{content}</div>
      </details>;
    })}
  </div>;
}
