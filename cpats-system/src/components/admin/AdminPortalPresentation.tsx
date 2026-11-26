import { PRStatus } from '@prisma/client';
import { Check, CheckCircle2, Circle, Clock3, Undo2, XCircle } from 'lucide-react';
import { adminProgress, type ProgressEvent } from '@/shared/admin-progress';
import type { AdminContextEvent } from './AdminDecisionContext';

export function AdminStatusBadge({ status, label }: { status: PRStatus; label?: string }) {
  const tone = status === PRStatus.Returned_for_Correction ? 'returned' : status === PRStatus.Declined ? 'declined'
    : status === PRStatus.Approved_Awaiting_PO || status === PRStatus.Received_and_Closed ? 'approved' : 'progress';
  const Icon = tone === 'returned' ? Undo2 : tone === 'declined' ? XCircle : tone === 'approved' ? CheckCircle2 : Clock3;
  return <span className="admin-portal-badge" data-tone={tone}><Icon className="size-4 shrink-0" aria-hidden="true" />{label || (status === PRStatus.Pending_Admin_Approval ? 'Awaiting review' : status === PRStatus.Returned_for_Correction ? 'Returned' : status.replaceAll('_', ' '))}</span>;
}

export function AdminProgress({ status, logs }: { status: PRStatus; logs: readonly ProgressEvent[] }) {
  return <ol aria-label="Procurement progress" className="admin-portal-progress">{adminProgress(status, logs).map(step => {
    const Icon = step.state === 'complete' ? Check : step.state === 'current' ? Clock3 : Circle;
    return <li key={step.label} data-state={step.state} aria-current={step.current ? 'step' : undefined}>
      <Icon className="size-4 shrink-0" aria-hidden="true" /><span>{step.label}<small>{step.state === 'complete' ? 'Recorded' : step.state === 'current' ? 'Current' : 'Upcoming'}</small></span>
    </li>;
  })}</ol>;
}

export function AdminRecordedDecision({ decision }: { decision?: AdminContextEvent }) {
  return <section aria-label="Recorded Admin decision" className="admin-surface admin-recorded-decision">
    <h3 className="text-sm font-semibold">Recorded Admin decision</h3>
    {decision ? <><div className="mt-3"><AdminStatusBadge status={decision.newState} label={decision.newState === PRStatus.Approved_Awaiting_PO ? 'Approved' : undefined} /></div>
      <p className="mt-3 break-words text-xs text-slate-600">{decision.actor.email} · <time dateTime={decision.createdAt}>{new Date(decision.createdAt).toLocaleString()}</time></p>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{decision.remarks || 'No reason was recorded.'}</p></> : <p className="mt-2 text-sm text-slate-600">No recorded decision details are available.</p>}
  </section>;
}
