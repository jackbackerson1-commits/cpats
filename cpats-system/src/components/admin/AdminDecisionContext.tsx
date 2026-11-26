import { PRStatus, Role } from '@prisma/client';
import type { AdminWorkflowEvent } from './AdminWorkflowHistory';
import { BusinessVerificationDetails } from '../business/BusinessVerificationDetails';

export interface AdminContextEvent extends AdminWorkflowEvent {
  businessNecessityVerified?: boolean | null;
  businessBudgetAvailable?: boolean | null;
}

function office(event: AdminContextEvent) {
  return event.actor.role.replace(/_/g, ' ');
}
function outcome(event: AdminContextEvent) {
  return event.newState === PRStatus.Approved_Awaiting_PO || event.newState === PRStatus.Pending_Admin_Approval ? 'Approved'
    : event.newState === PRStatus.Returned_for_Correction ? 'Returned for correction'
    : event.newState.replace(/_/g, ' ');
}
function isReview(event: AdminContextEvent) {
  return event.actor.role === Role.Admin_Office && event.previousState === PRStatus.Pending_Admin_Approval &&
    [PRStatus.Approved_Awaiting_PO, PRStatus.Returned_for_Correction, PRStatus.Declined].some(state => state === event.newState)
    || event.actor.role === Role.Business_Office &&
    [PRStatus.Pending_Admin_Approval, PRStatus.Returned_for_Correction, PRStatus.Declined].some(state => state === event.newState);
}
function SavedDetails({ event }: { event: AdminContextEvent }) {
  return <>
    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{event.remarks || 'No decision note was recorded.'}</p>
    {event.actor.role === Role.Business_Office && <BusinessVerificationDetails decision={event} />}
    <p className="mt-4 break-words border-t border-current/15 pt-3 text-xs leading-5 [overflow-wrap:anywhere]">{event.actor.email} · <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></p>
  </>;
}

export function AdminDecisionContext({ status, logs = [] }: { status: PRStatus; logs?: readonly AdminContextEvent[] }) {
  // Keep the endpoint's newest-first order and never infer current status from an earlier review.
  const latest = logs[0];
  const mergedReview = latest && isReview(latest);
  const earlier = logs.filter(event => event !== latest && isReview(event));
  const tone = status === PRStatus.Declined ? 'border-rose-200 bg-rose-50 text-rose-950'
    : status === PRStatus.Returned_for_Correction ? 'border-amber-200 bg-amber-50 text-amber-950'
    : status === PRStatus.Approved_Awaiting_PO || status === PRStatus.Received_and_Closed ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
    : 'border-slate-200 bg-slate-100 text-slate-900';
  return <ol aria-label="Current status and saved office reviews" className="min-w-0 space-y-4">
    <li className={`min-w-0 rounded-xl border p-4 sm:p-6 ${tone}`}>
      <p className="text-xs font-semibold">1 · Current status and latest {mergedReview ? 'decision' : 'update'}</p>
      <p className="mt-2 text-xs">Admin decision history · Read only</p>
      <h2 className="mt-2 break-words text-lg font-semibold [overflow-wrap:anywhere]">Current request status: {status.replace(/_/g, ' ')}</h2>
      {latest && <>
        <p className="mt-2 text-sm font-semibold">{mergedReview ? 'Latest saved decision' : 'Latest saved update'}: {outcome(latest)} — {office(latest)}</p>
        {latest.newState !== status && <p className="mt-2 text-sm leading-6">The saved event above is historical context. The current request status remains authoritative.</p>}
        {status === PRStatus.Declined && <p className="mt-2 text-sm leading-6">This decline is final for this request. Reusing its details creates a separate request and does not change this decision.</p>}
        {status === PRStatus.Returned_for_Correction && <p className="mt-2 text-sm leading-6">This request was returned for correction. Earlier approvals do not replace the current returned status.</p>}
        <SavedDetails event={latest} />
      </>}
      {!latest && <p className="mt-3 text-sm">No saved decision details are available.</p>}
      <p className="mt-3 text-xs leading-5">This view does not offer decision actions. Earlier reviews below are historical.</p>
    </li>
    {earlier.map((event, index) => <li key={event.id || index} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-800 sm:p-6">
      <p className="text-xs font-semibold">{index + 2} · Earlier {office(event)} review · Historical</p>
      <h2 className="mt-2 text-base font-semibold">{outcome(event)}{event.actor.role === Role.Business_Office ? ' at the fiscal-review stage' : ' at the Admin-review stage'}</h2>
      <p className="mt-2 text-sm leading-6">This was the office’s decision at that stage. It does not replace the current request status shown above.</p>
      <SavedDetails event={event} />
    </li>)}
  </ol>;
}
