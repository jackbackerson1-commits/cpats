import { PRStatus, Role } from '@prisma/client';
import { AdminFeedbackContext } from './AdminFeedbackContext';
import { BusinessVerificationDetails } from './BusinessVerificationDetails';

export interface BusinessReviewEvent {
  id?: string;
  createdAt: string;
  newState: PRStatus;
  remarks: string | null;
  actor: { email: string; role: Role };
  businessNecessityVerified?: boolean | null;
  businessBudgetAvailable?: boolean | null;
}

function outcome(event: BusinessReviewEvent) {
  return event.newState === PRStatus.Pending_Admin_Approval ? 'Approved'
    : event.newState === PRStatus.Declined ? 'Declined'
    : event.newState === PRStatus.Returned_for_Correction ? 'Returned' : 'Decision recorded';
}

export function BusinessDecisionChronology({ status, auditLogs = [], businessDecision }: {
  status: PRStatus; auditLogs?: BusinessReviewEvent[]; businessDecision?: BusinessReviewEvent;
}) {
  // Keep the history endpoint's authoritative newest-first order, including timestamp ties.
  const adminIndex = auditLogs.findIndex(event => event.actor.role === Role.Admin_Office &&
    [PRStatus.Approved_Awaiting_PO, PRStatus.Returned_for_Correction, PRStatus.Declined].some(state => state === event.newState));
  const businessIndex = businessDecision ? auditLogs.findIndex(event => event === businessDecision || Boolean(event.id && event.id === businessDecision.id)) : -1;
  const adminFirst = adminIndex >= 0 && (businessIndex < 0 || adminIndex < businessIndex);
  const historicalBusiness = businessIndex > 0;
  const tone = status === PRStatus.Declined ? 'border-rose-300 bg-rose-50 text-rose-950'
    : status === PRStatus.Returned_for_Correction ? 'border-amber-300 bg-amber-50 text-amber-950'
    : status === PRStatus.Approved_Awaiting_PO || status === PRStatus.Received_and_Closed ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
    : 'border-slate-300 bg-slate-50 text-slate-950';
  const businessTone = historicalBusiness ? 'border-slate-200 bg-slate-50 text-slate-800'
    : businessDecision?.newState === PRStatus.Declined ? 'border-rose-200 bg-rose-50 text-rose-950'
    : businessDecision?.newState === PRStatus.Returned_for_Correction ? 'border-amber-200 bg-amber-50 text-amber-950'
    : 'border-emerald-200 bg-emerald-50 text-emerald-950';
  const business = businessDecision && <section aria-label="Saved Business Office evaluation" className={`min-w-0 rounded-xl border p-4 sm:p-5 ${businessTone}`}>
    <h2 className="text-base font-semibold">{historicalBusiness ? 'Earlier Business Office decision · Historical' : 'Recorded Business Office decision'}</h2>
    <p className="mt-2 text-sm font-semibold">Recorded outcome: {outcome(businessDecision)}</p>
    {historicalBusiness && <p className="mt-2 text-sm leading-6">This was the Business Office’s decision at that stage. Later events determine the current request status shown above.</p>}
    {businessDecision.remarks && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{businessDecision.remarks}</p>}
    <BusinessVerificationDetails decision={businessDecision} />
    <p className="mt-3 break-words border-t border-current/15 pt-3 text-xs leading-5 [overflow-wrap:anywhere]">{businessDecision.actor.email} · {new Date(businessDecision.createdAt).toLocaleString()}</p>
  </section>;
  const admin = adminIndex >= 0 && <AdminFeedbackContext auditLogs={auditLogs} status={status} sections="latest" />;
  const cards = adminFirst ? [admin, business] : [business, admin];
  return <div className="min-w-0 space-y-5">
    <section aria-label="Current request status" className={`min-w-0 rounded-xl border p-4 sm:p-5 ${tone}`}>
      <p className="text-xs font-semibold">Evaluation history · Read only</p>
      <h2 className="mt-2 break-words text-lg font-semibold [overflow-wrap:anywhere]">Current request status: {status.replace(/_/g, ' ')}</h2>
      <p className="mt-2 text-sm leading-6">Saved office decisions are shown newest first. An earlier approval does not replace the current request status.</p>
      <p className="mt-1 text-xs leading-5">This view does not offer evaluation actions.</p>
    </section>
    <ol aria-label="Saved review decisions, newest first" className="min-w-0 space-y-4">{cards.filter(Boolean).map((card, index) => <li key={index} className="min-w-0">
      <p className="mb-2 text-xs font-semibold text-slate-600">{index + 1} · {index === 0 ? 'Most recent saved review' : 'Earlier review · Historical'}</p>
      {card}
    </li>)}</ol>
    <AdminFeedbackContext auditLogs={auditLogs} status={status} sections="previous" />
  </div>;
}
