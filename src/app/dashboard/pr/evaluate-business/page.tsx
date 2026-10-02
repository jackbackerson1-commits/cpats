'use client';

import React, { useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PRStatus, Role } from '@prisma/client';
import { AuthUser } from '@/shared/session';
import {
  PageShell, StageHeader, Card, ErrorBanner, SuccessBanner, FieldLabel, FieldError, BusinessSection, BusinessEmptySelection, BusinessFinalAction,
  inputClass, CheckItem, ReviewWorkspace, DecisionButtonGroup, ActionButton, QueueTask,
} from '@/components/business/BusinessUI';

interface ZodSubErrors { _errors?: string[] }
interface ZodFormErrors { prId?: ZodSubErrors; action?: ZodSubErrors; remarks?: ZodSubErrors }
interface ItemPayloadNode { itemName: string; quantity: number; unitPrice?: number }
interface AuditLogNode {
  id?: string; createdAt: string; previousState: PRStatus | null; newState: PRStatus;
  remarks: string | null; actor: { email: string; role: Role };
}
interface PendingPRNode {
  id: string; justification: string; status: PRStatus; isDirectPoBypass?: boolean;
  adminProofFilePath?: string | null; createdAt: string;
  department: { code: string; name: string }; itemsPayload?: ItemPayloadNode[] | unknown;
  auditLogs?: AuditLogNode[];
}

function deriveItemSummaryTitle(itemsPayload: unknown): string {
  if (!itemsPayload || !Array.isArray(itemsPayload) || itemsPayload.length === 0) return 'Purchase Requisition';
  const items = itemsPayload as ItemPayloadNode[];
  const firstItemName = items[0]?.itemName?.trim() || 'Item Requisition';
  const firstItemQty = items[0]?.quantity || 1;
  if (items.length === 1) return `${firstItemName} (x${firstItemQty})`;
  return `${firstItemName} (x${firstItemQty}) +${items.length - 1} more item${items.length - 1 > 1 ? 's' : ''}`;
}

function latestBusinessDecision(record: PendingPRNode): AuditLogNode | undefined {
  return record.auditLogs?.find((log) =>
    log.actor.role === Role.Business_Office &&
    (log.previousState === PRStatus.Pending_Business_Approval || log.previousState === PRStatus.Returned_for_Correction) &&
    (log.newState === PRStatus.Pending_Admin_Approval || log.newState === PRStatus.Returned_for_Correction || log.newState === PRStatus.Declined)
  );
}

function historyDecisionState(record: PendingPRNode): PRStatus | undefined {
  const adminDecision = record.auditLogs?.find((log) =>
    log.actor.role === Role.Admin_Office &&
    log.previousState === PRStatus.Pending_Admin_Approval &&
    (log.newState === PRStatus.Returned_for_Correction || log.newState === PRStatus.Declined)
  );
  if (record.status === adminDecision?.newState) return adminDecision.newState;
  return latestBusinessDecision(record)?.newState;
}

function isAdminReturnForBusiness(record: PendingPRNode): boolean {
  const latest = record.auditLogs?.[0];
  return record.status === PRStatus.Returned_for_Correction &&
    latest?.actor.role === Role.Admin_Office &&
    latest.previousState === PRStatus.Pending_Admin_Approval &&
    latest.newState === PRStatus.Returned_for_Correction;
}

function businessDecisionLabel(decision: AuditLogNode | undefined): string {
  if (decision?.newState === PRStatus.Pending_Admin_Approval) return 'Approved';
  if (decision?.newState === PRStatus.Returned_for_Correction) return 'Returned';
  if (decision?.newState === PRStatus.Declined) return 'Declined';
  return 'Decision recorded';
}

const Icon = ({ path, className = 'h-4 w-4' }: { path: string; className?: string }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

function OperationStateModal({ onReviewLatest }: { onReviewLatest: () => void }) {
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    reviewButtonRef.current?.focus();
    return () => { if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans" role="dialog" aria-modal="true" aria-labelledby="operation-state-title" aria-describedby="operation-state-description" onKeyDown={(event) => { if (event.key === 'Tab') { event.preventDefault(); reviewButtonRef.current?.focus(); } if (event.key === 'Escape') onReviewLatest(); }}>
      <div className="absolute inset-0 bg-slate-950/65" aria-hidden="true" />
      <section className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-amber-200 bg-white shadow-2xl">
        <div className="border-b border-amber-100 bg-amber-50 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-700">
              <Icon className="size-5" path="M12 8v4.5M12 16.5h.01M12 3.5 21 20H3L12 3.5Z" />
            </span>
            <div>
              <p className="text-xs font-medium text-amber-800">Evaluation not recorded</p>
              <h2 id="operation-state-title" className="mt-1 text-base font-semibold text-slate-950">This requisition is no longer awaiting review</h2>
            </div>
          </div>
        </div>
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <p id="operation-state-description" className="text-sm leading-6 text-slate-600">
            The request changed while this form was open. Your decision was not saved. Review its current status and office feedback before continuing with another evaluation.
          </p>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm leading-6 text-slate-600">
            Review the current status in Decision history before continuing with another requisition.
          </div>
        </div>
        <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <button ref={reviewButtonRef} type="button" onClick={onReviewLatest} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-900">
            <Icon className="size-4 shrink-0" path="M5 12h14M13 6l6 6-6 6" />
            <span>Review decision history</span>
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

export default function BusinessOfficeEvaluationPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeUser, setActiveUser] = useState<AuthUser | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [targetPrId, setTargetPrId] = useState('');
  const [evaluationAction, setEvaluationAction] = useState<'APPROVE' | 'DECLINE' | 'RETURN_FOR_CORRECTION' | ''>('');
  const [remarks, setRemarks] = useState('');
  const [necessityVerified, setNecessityVerified] = useState(false);
  const [budgetAvailable, setBudgetAvailable] = useState(false);
  const [activeQueue, setActiveQueue] = useState<PendingPRNode[]>([]);
  const [businessHistory, setBusinessHistory] = useState<PendingPRNode[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [primarySegment, setPrimarySegment] = useState<'ACTION_REQUIRED' | 'DECISION_HISTORY'>('ACTION_REQUIRED');
  const [historySubFilter, setHistorySubFilter] = useState<'ALL' | 'APPROVED' | 'RETURNED' | 'DECLINED'>('ALL');
  const [systemError, setSystemError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ZodFormErrors | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showOperationStateModal, setShowOperationStateModal] = useState(false);
  const notificationTargetHandled = useRef(false);

  const syncWorkspaceQueue = async (userRole: Role) => {
    try {
      const [queueResult, historyResult] = await Promise.allSettled([
        fetch('/api/pr/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: userRole }) }),
        fetch('/api/pr/business-history'),
      ]);
      let tasks: PendingPRNode[] = [];
      let history: PendingPRNode[] = [];
      if (queueResult.status === 'fulfilled' && queueResult.value.ok) {
        const resData = await queueResult.value.json();
        tasks = (resData.data || []).filter((item: PendingPRNode) => item.status === PRStatus.Pending_Business_Approval);
        setActiveQueue(tasks);
      } else setSystemError('Unable to load the Business Office review queue. Please refresh.');
      if (historyResult.status === 'fulfilled' && historyResult.value.ok) {
        const historyData = await historyResult.value.json();
        history = historyData.data || [];
        setBusinessHistory(history);
        setHistoryError(null);
      } else setHistoryError('Unable to load Business Office decision history. Please refresh.');
      if (!notificationTargetHandled.current) {
        notificationTargetHandled.current = true;
        const targetId = new URLSearchParams(window.location.search).get('prId');
        if (targetId) {
          const activeTarget = tasks.find((item) => item.id === targetId);
          const historyTarget = history.find((item) => item.id === targetId);
          if (activeTarget) {
            setTargetPrId(activeTarget.id);
            if (activeTarget.isDirectPoBypass) {
              setEvaluationAction('APPROVE');
              setNecessityVerified(true);
              setBudgetAvailable(true);
            }
          } else if (historyTarget) {
            setPrimarySegment(isAdminReturnForBusiness(historyTarget) ? 'ACTION_REQUIRED' : 'DECISION_HISTORY');
            setHistorySubFilter('ALL');
            setTargetPrId(historyTarget.id);
            if (isAdminReturnForBusiness(historyTarget)) {
              setEvaluationAction('APPROVE');
              setRemarks(latestBusinessDecision(historyTarget)?.remarks || 'Fiscal review revised following Admin Office feedback.');
              setNecessityVerified(true);
              setBudgetAvailable(true);
            }
          } else if (historyResult.status !== 'fulfilled' || !historyResult.value.ok) {
            setPrimarySegment('DECISION_HISTORY');
          } else {
            setSystemError('This request is not in the Business Office review queue or decision history.');
          }
        }
      }
    } catch (err) {
      console.error('Business Office workspace sync failed:', err);
      setSystemError('Unable to load the Business Office review queue. Please refresh.');
      setHistoryError('Unable to load Business Office decision history. Please refresh.');
    } finally { setQueueLoading(false); }
  };

  useEffect(() => {
    fetch('/api/auth/me').then((res) => res.json()).then((res) => {
      if (res.success && res.data) { setActiveUser(res.data); syncWorkspaceQueue(res.data.role); }
    }).catch(() => setSystemError('Could not load active session. Please refresh.')).finally(() => setUserLoading(false));
  }, []);

  const handleEvaluationSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSystemError(null); setFieldErrors(null); setSuccessMessage(null); setShowOperationStateModal(false);
    if (!activeUser || activeUser.role !== Role.Business_Office) { setSystemError('Only Business Office personnel can evaluate Purchase Requests.'); return; }
    const selectedPR = [...activeQueue, ...businessHistory].find((req) => req.id === targetPrId);
    const adminReturned = selectedPR ? isAdminReturnForBusiness(selectedPR) : false;
    if (!selectedPR || (selectedPR.status !== PRStatus.Pending_Business_Approval && !adminReturned)) {
      setSystemError('This requisition is in decision history and cannot receive another Business Office evaluation.'); return;
    }
    if (!necessityVerified || !budgetAvailable) { setSystemError('Please confirm both verification checks before recording your decision.'); return; }
    if (!evaluationAction) { setSystemError('Please select an evaluation action (Approve, Return for Correction, or Decline).'); return; }
    if (adminReturned && evaluationAction !== 'APPROVE') { setSystemError('Revise the evaluation and send it back to Admin approval.'); return; }
    const finalRemarks = evaluationAction === 'APPROVE'
      ? (adminReturned ? remarks : selectedPR?.isDirectPoBypass ? 'Fast-Track Logged: Verified with attached Executive Pre-Approved Letter. Budget allocation recorded.' : 'Approved by Business Office. Necessity and budget allocation verified.') : remarks;
    if ((adminReturned || evaluationAction !== 'APPROVE') && finalRemarks.trim().length < 5) {
      setSystemError('Compliance Exception: You must provide a clear reason for returning or rejecting this request (minimum 5 characters).'); return;
    }
    startTransition(async () => {
      try {
        const response = await fetch('/api/pr/evaluate-business', { method: adminReturned ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prId: targetPrId, action: evaluationAction, remarks: finalRemarks }) });
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 422 && result.errors) { setFieldErrors(result.errors); throw new Error('Please review highlighted fields.'); }
          const errorMessage = result.error || 'A transaction exception occurred while recording your decision.';
          if (/INVALID OPERATION STATE|currently in .* status|Returned_for_Correction/i.test(errorMessage)) {
            setShowOperationStateModal(true);
            await syncWorkspaceQueue(activeUser.role);
            return;
          }
          throw new Error(errorMessage);
        }
        setSuccessMessage('Evaluation committed successfully. Request status updated.');
        setTargetPrId(''); setEvaluationAction(''); setRemarks(''); setNecessityVerified(false); setBudgetAvailable(false);
        await syncWorkspaceQueue(activeUser.role); router.refresh();
      } catch (err: unknown) { setSystemError(err instanceof Error ? err.message : 'Something went wrong. Please try again.'); }
    });
  };

  if (userLoading) return <div className="flex min-h-[45vh] items-center justify-center text-sm text-slate-500">Loading session context…</div>;
  if (!activeUser || activeUser.role !== Role.Business_Office) return (
    <Card className="mx-auto my-12 w-full max-w-md text-center"><h2 className="text-sm font-bold text-rose-700">Access Restricted</h2>
      <p className="mt-2 text-sm text-slate-500">Your account ({activeUser?.role.replace(/_/g, ' ') || 'Guest'}) is not authorized for Business Office evaluation.</p></Card>
  );

  const actionRequiredQueue = [...activeQueue.filter((item) => item.status === PRStatus.Pending_Business_Approval), ...businessHistory.filter(isAdminReturnForBusiness)];
  const decisionHistoryQueue = businessHistory;
  const filteredHistoryQueue = decisionHistoryQueue.filter((item) => {
    const state = historyDecisionState(item);
    return historySubFilter === 'APPROVED' ? state === PRStatus.Pending_Admin_Approval
      : historySubFilter === 'RETURNED' ? state === PRStatus.Returned_for_Correction
      : historySubFilter === 'DECLINED' ? state === PRStatus.Declined : true;
  });
  const displayedQueueNodes = primarySegment === 'ACTION_REQUIRED' ? actionRequiredQueue : filteredHistoryQueue;
  const queueTasks: QueueTask[] = displayedQueueNodes.map((task) => ({
    id: task.id, title: deriveItemSummaryTitle(task.itemsPayload),
    subtitle: primarySegment === 'DECISION_HISTORY' ? `${task.department.code} • ${historyDecisionState(task) === PRStatus.Declined ? 'DECLINED' : historyDecisionState(task) === PRStatus.Returned_for_Correction ? 'RETURNED' : businessDecisionLabel(latestBusinessDecision(task)).toUpperCase()}` : isAdminReturnForBusiness(task) ? `${task.department.code} • ADMIN RETURN` : task.isDirectPoBypass ? `${task.department.code} • FAST-TRACK` : task.department.code,
    dateLabel: new Date(task.createdAt).toLocaleDateString(), justificationPreview: task.justification,
  }));
  const selectedPR = displayedQueueNodes.find((req) => req.id === targetPrId);
  const isDecisionHistoryRecord = primarySegment === 'DECISION_HISTORY';
  const selectedBusinessDecision = selectedPR ? latestBusinessDecision(selectedPR) : undefined;
  const selectedAdminReturn = selectedPR ? isAdminReturnForBusiness(selectedPR) && !isDecisionHistoryRecord : false;
  const itemsList: ItemPayloadNode[] = selectedPR && Array.isArray(selectedPR.itemsPayload) ? selectedPR.itemsPayload as ItemPayloadNode[] : [];
  const hasPrices = itemsList.some((item) => typeof item.unitPrice === 'number' && item.unitPrice > 0);
  const calculatedGrandTotal = itemsList.reduce((acc, item) => acc + (item.unitPrice || 0) * item.quantity, 0);
  const adminAuditFeedback = selectedPR?.auditLogs?.find((log) => log.actor.role === Role.Admin_Office && (log.newState === PRStatus.Returned_for_Correction || log.newState === PRStatus.Declined));
  const checksComplete = Number(necessityVerified) + Number(budgetAvailable);

  const reviewLatestDecisionHistory = () => {
    setShowOperationStateModal(false);
    setPrimarySegment('DECISION_HISTORY');
    setTargetPrId('');
    setEvaluationAction('');
    setRemarks('');
    setNecessityVerified(false);
    setBudgetAvailable(false);
  };

  return (
    <PageShell>
      <StageHeader title="Fiscal evaluation"
        description="Review each department’s request, confirm necessity and budget, and record your decision."
        meta={{ label: 'Signed in as', value: activeUser.email }} />
      {systemError && <ErrorBanner>{systemError}</ErrorBanner>}
      {successMessage && <SuccessBanner>{successMessage}</SuccessBanner>}
      {primarySegment === 'DECISION_HISTORY' && historyError && <ErrorBanner>{historyError}</ErrorBanner>}

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Queue view">
          {([['ACTION_REQUIRED', 'Action required', actionRequiredQueue.length], ['DECISION_HISTORY', 'Decision history', decisionHistoryQueue.length]] as const).map(([key, label, count]) => (
            <button key={key} type="button" aria-pressed={primarySegment === key}
              onClick={() => { setPrimarySegment(key); setTargetPrId(''); }}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition ${primarySegment === key ? 'border-emerald-800 bg-emerald-800 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
              {label}<span className={`rounded-md px-2 py-0.5 text-xs tabular-nums ${primarySegment === key ? 'bg-white/15' : 'bg-slate-100'}`}>{queueLoading ? '…' : count}</span>
            </button>
          ))}
        </div>
        {primarySegment === 'DECISION_HISTORY' && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Decision history filters">
            {([['ALL', 'All', decisionHistoryQueue.length], ['APPROVED', 'Approved', decisionHistoryQueue.filter(i => historyDecisionState(i) === PRStatus.Pending_Admin_Approval).length], ['RETURNED', 'Returned', decisionHistoryQueue.filter(i => historyDecisionState(i) === PRStatus.Returned_for_Correction).length], ['DECLINED', 'Declined', decisionHistoryQueue.filter(i => historyDecisionState(i) === PRStatus.Declined).length]] as const).map(([key, label, count]) => (
              <button key={key} type="button" aria-pressed={historySubFilter === key}
                onClick={() => { setHistorySubFilter(key); setTargetPrId(''); }}
                className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-medium transition ${historySubFilter === key ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                {label} <span className="ml-1 tabular-nums">{count}</span>
              </button>
            ))}
          </div>
        )}
        <p className="text-sm leading-6 text-slate-600">{primarySegment === 'DECISION_HISTORY'
          ? 'Review recorded decisions and the current status of each request. History is read only.'
          : 'Select a request to evaluate. Admin returns include your previous review and the requested changes.'}</p>
      </div>

      <ReviewWorkspace queueTitle={primarySegment === 'ACTION_REQUIRED' ? 'Fiscal review queue' : 'Decision history'} tasks={queueTasks}
        loading={queueLoading} emptyMessage={primarySegment === 'ACTION_REQUIRED' ? 'No requisitions are awaiting fiscal evaluation.' : 'No matching records found in decision history.'}
        selectionLabel={primarySegment === 'DECISION_HISTORY' ? 'Viewing' : 'In review'}
        selectedTaskLabel={primarySegment === 'DECISION_HISTORY' ? 'Viewing past decision' : 'Reviewing selected transaction'}
        selectedId={targetPrId}
        onSelect={(id) => { setTargetPrId(id); setEvaluationAction(''); setRemarks(''); setNecessityVerified(false); setBudgetAvailable(false); setFieldErrors(null); setSystemError(null); const pr = displayedQueueNodes.find((item) => item.id === id); if (pr && isAdminReturnForBusiness(pr) && primarySegment === 'ACTION_REQUIRED') { setEvaluationAction('APPROVE'); setRemarks(latestBusinessDecision(pr)?.remarks || 'Fiscal review revised following Admin Office feedback.'); setNecessityVerified(true); setBudgetAvailable(true); } else if (pr?.status === PRStatus.Pending_Business_Approval && pr.isDirectPoBypass) { setEvaluationAction('APPROVE'); setNecessityVerified(true); setBudgetAvailable(true); } }}>
        <form onSubmit={handleEvaluationSubmit} className="min-w-0 space-y-6" aria-busy={isPending}>
          {!selectedPR ? <BusinessEmptySelection kind="request" /> : <>
            <section aria-label="Request overview" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6">
              <div className="flex min-w-0 flex-col items-start gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-emerald-800">{isDecisionHistoryRecord ? 'Past decision' : selectedAdminReturn ? 'Revised fiscal review' : 'Request under review'}</p>
                  <h2 className="mt-2 break-words text-lg font-semibold leading-7 text-slate-950 [overflow-wrap:anywhere]">{deriveItemSummaryTitle(selectedPR.itemsPayload)}</h2>
                  <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-600">PR {selectedPR.id}</p>
                </div>
                <span className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900">{selectedPR.isDirectPoBypass ? 'Executive pre-approved' : 'Standard review'}</span>
              </div>
              <dl className="mt-5 grid min-w-0 gap-4 sm:grid-cols-3">
                {[['Originating office', `${selectedPR.department.name} (${selectedPR.department.code})`], ['Submitted', new Date(selectedPR.createdAt).toLocaleDateString()], ['Estimated value', hasPrices ? `₱${calculatedGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Not provided']].map(([label, value]) => (
                  <div key={label} className="min-w-0"><dt className="text-xs text-slate-600">{label}</dt><dd className="mt-1 break-words text-sm font-medium leading-6 tabular-nums text-slate-900 [overflow-wrap:anywhere]">{value}</dd></div>
                ))}
              </dl>
            </section>

            {isDecisionHistoryRecord && <section className="rounded-xl border border-slate-300 bg-slate-100 p-4 text-sm leading-6 text-slate-700" role="status">
              <h2 className="font-semibold text-slate-950">Decision history · Read only</h2>
              <p className="mt-2">Business Office decision: <span className="font-semibold">{businessDecisionLabel(selectedBusinessDecision)}</span>.</p>
              <p>Current request status: <span className="font-semibold">{selectedPR.status.replace(/_/g, ' ')}</span>.</p>
              <p className="mt-2">This view shows the recorded decision and does not offer evaluation actions.</p>
            </section>}

            {selectedBusinessDecision && <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
              <h2 className="text-base font-semibold text-emerald-950">Recorded Business Office decision</h2>
              <p className="mt-2 text-sm font-semibold text-emerald-950">{businessDecisionLabel(selectedBusinessDecision)}</p>
              {selectedBusinessDecision.remarks && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-emerald-950 [overflow-wrap:anywhere]">{selectedBusinessDecision.remarks}</p>}
              <p className="mt-3 break-words border-t border-emerald-200 pt-3 text-xs leading-5 text-emerald-900 [overflow-wrap:anywhere]">{selectedBusinessDecision.actor.email} · {new Date(selectedBusinessDecision.createdAt).toLocaleString()}</p>
            </section>}

            {selectedAdminReturn && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4" role="status">
              <h2 className="text-base font-semibold text-amber-950">Admin returned this evaluation</h2>
              <p className="mt-2 text-sm leading-6 text-amber-950">Your previous fiscal review is filled in below. Address the Admin Office feedback, confirm the checks, and resubmit this same request for Admin approval.</p>
            </section>}

            {selectedPR.isDirectPoBypass && <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <h2 className="text-base font-semibold text-emerald-950">Executive pre-approval on file</h2>
              <p className="mt-2 text-sm leading-6 text-emerald-900">Verify the budget ledger allocation and confirm dispatch to the Admin Office.</p>
              {selectedPR.adminProofFilePath && <a href={selectedPR.adminProofFilePath} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-100">
                View executive letter<ExternalLink className="size-4 shrink-0" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
              </a>}
            </section>}

            {adminAuditFeedback && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-base font-semibold text-amber-950">Admin Office feedback</h2><span className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs text-amber-900">{adminAuditFeedback.actor.role.replace(/_/g, ' ')}</span></div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-amber-950 [overflow-wrap:anywhere]">{adminAuditFeedback.remarks || 'No specific remark recorded.'}</p>
              <p className="mt-3 break-words border-t border-amber-200 pt-3 text-xs leading-5 text-amber-900 [overflow-wrap:anywhere]">{adminAuditFeedback.actor.email} · {new Date(adminAuditFeedback.createdAt).toLocaleString()}</p>
            </section>}

            <BusinessSection title="Reason for the request" description="The justification saved by the Requesting Office.">
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{selectedPR.justification}</p>
            </BusinessSection>
            <BusinessSection title="Requested items" description={`${itemsList.length} line item${itemsList.length === 1 ? '' : 's'} in this request.`}>
              <ol className="divide-y divide-slate-200">{itemsList.map((item, idx) => {
                const unitPrice = item.unitPrice || 0;
                return <li key={idx} className="min-w-0 py-4 first:pt-0 last:pb-0">
                  <p className="text-xs text-slate-600">Item {idx + 1}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-900 [overflow-wrap:anywhere]">{item.itemName}</p>
                  <dl className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
                    <div><dt className="text-xs text-slate-600">Quantity</dt><dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{item.quantity}</dd></div>
                    {hasPrices && <><div className="min-w-0"><dt className="text-xs text-slate-600">Unit price</dt><dd className="mt-1 break-words text-sm tabular-nums text-slate-900 [overflow-wrap:anywhere]">{unitPrice > 0 ? `₱${unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</dd></div><div className="min-w-0"><dt className="text-xs text-slate-600">Subtotal</dt><dd className="mt-1 break-words text-sm font-semibold tabular-nums text-slate-900 [overflow-wrap:anywhere]">{unitPrice > 0 ? `₱${(unitPrice * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</dd></div></>}
                  </dl>
                </li>;
              })}</ol>
              {itemsList.length === 0 && <p className="text-sm text-slate-600">An itemized list is not available for this record.</p>}
              {hasPrices && <p className="mt-5 break-words border-t border-slate-200 pt-4 text-sm font-semibold tabular-nums text-slate-900 [overflow-wrap:anywhere]">Estimated total: ₱{calculatedGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
            </BusinessSection>

            {selectedPR.auditLogs && selectedPR.auditLogs.length > 0 && <details className="group min-w-0 rounded-xl border border-slate-200 bg-white">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold text-slate-800 sm:px-6">Decision and progress history<ChevronDown className="size-4 shrink-0 transition group-open:rotate-180" aria-hidden="true" /></summary>
              <ol className="space-y-4 border-t border-slate-200 p-4 sm:p-6">{selectedPR.auditLogs.map((log, idx) => <li key={log.id || idx} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="break-words text-sm font-semibold text-slate-900">{log.newState.replace(/_/g, ' ')}</p>
                {log.remarks && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{log.remarks}</p>}
                <p className="mt-3 break-words text-xs leading-5 text-slate-600 [overflow-wrap:anywhere]">{log.actor.role.replace(/_/g, ' ')} · {log.actor.email}<br />{new Date(log.createdAt).toLocaleString()}</p>
              </li>)}</ol>
            </details>}

            {!isDecisionHistoryRecord && <BusinessSection title="Fiscal verification" description="Confirm both checks before recording any evaluation outcome.">
              <p className={`mb-4 text-sm font-medium ${checksComplete === 2 ? 'text-emerald-800' : 'text-slate-700'}`}>{checksComplete} of 2 verified</p>
              <div className="space-y-3"><CheckItem id="gate-necessity" checked={necessityVerified} onChange={setNecessityVerified} label="Purchase necessity verified" description="Item specifications and departmental requirements have been reviewed." /><CheckItem id="gate-budget" checked={budgetAvailable} onChange={setBudgetAvailable} label="Budget availability confirmed" description="Funds are available under the department allocation code." /></div>
            </BusinessSection>}

            {!isDecisionHistoryRecord && <BusinessSection title="Business Office decision" description={selectedAdminReturn ? 'Revise your fiscal evaluation before sending it back to Admin.' : 'Choose the outcome to record for this request.'}>
              {selectedAdminReturn ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">Resubmit to Admin Office</p> : <DecisionButtonGroup value={evaluationAction} onChange={setEvaluationAction} approveLabel="Approve" returnLabel="Return for correction" declineLabel="Decline" />}
              {fieldErrors?.action?._errors && <FieldError>{fieldErrors.action._errors[0]}</FieldError>}
              {selectedAdminReturn && <div className="mt-5 border-t border-slate-200 pt-5">
                <FieldLabel htmlFor="business-remarks">Revised fiscal evaluation and response to Admin</FieldLabel>
                <textarea id="business-remarks" required minLength={5} rows={4} className={inputClass(!!fieldErrors?.remarks)} value={remarks} onChange={(e) => setRemarks(e.target.value)} aria-invalid={Boolean(fieldErrors?.remarks?._errors?.length)} aria-describedby={`business-remarks-help${fieldErrors?.remarks?._errors?.length ? ' business-remarks-error' : ''}`} />
                <p id="business-remarks-help" className="mt-2 text-xs leading-5 text-slate-600">At least 5 characters. Explain the revised review and how it addresses Admin feedback.</p>
                {fieldErrors?.remarks?._errors && <FieldError id="business-remarks-error">{fieldErrors.remarks._errors[0]}</FieldError>}
              </div>}
              {(evaluationAction === 'RETURN_FOR_CORRECTION' || evaluationAction === 'DECLINE') && <div className="mt-5 border-t border-slate-200 pt-5">
                <FieldLabel htmlFor="business-remarks">{evaluationAction === 'RETURN_FOR_CORRECTION' ? 'Corrections required' : 'Reason for declining'}</FieldLabel>
                <textarea id="business-remarks" required rows={4} className={inputClass(!!fieldErrors?.remarks)} placeholder={evaluationAction === 'RETURN_FOR_CORRECTION' ? 'Specify the corrections required…' : 'Document the reason for declining this request…'} value={remarks} onChange={(e) => setRemarks(e.target.value)} aria-invalid={Boolean(fieldErrors?.remarks?._errors?.length)} aria-describedby={`business-remarks-help${fieldErrors?.remarks?._errors?.length ? ' business-remarks-error' : ''}`} />
                <p id="business-remarks-help" className="mt-2 text-xs leading-5 text-slate-600">At least 5 characters. Give the Requesting Office a clear explanation.</p>
                {fieldErrors?.remarks?._errors && <FieldError id="business-remarks-error">{fieldErrors.remarks._errors[0]}</FieldError>}
              </div>}
            </BusinessSection>}

            {!isDecisionHistoryRecord && <>
              <input type="hidden" required readOnly value={targetPrId} />
              {fieldErrors?.prId?._errors && <FieldError>{fieldErrors.prId._errors[0]}</FieldError>}
              <BusinessFinalAction title={selectedAdminReturn ? 'Resubmit revised evaluation' : 'Record fiscal evaluation'} description={selectedAdminReturn ? 'The existing request returns to Admin for approval.' : evaluationAction === 'APPROVE' ? 'Approval sends this request to the Admin Office for review.' : evaluationAction === 'RETURN_FOR_CORRECTION' ? 'The Requesting Office will receive your feedback and can correct this same request.' : evaluationAction === 'DECLINE' ? 'This request will be declined. Your reason becomes part of the decision history.' : 'Select an outcome and confirm the verification checks above.'}>
                <ActionButton type="submit" disabled={isPending}>{isPending ? 'Saving…' : selectedAdminReturn ? 'Resubmit to Admin' : 'Submit evaluation'}</ActionButton>
              </BusinessFinalAction>
            </>}
          </>}
        </form>
      </ReviewWorkspace>
      {showOperationStateModal && <OperationStateModal onReviewLatest={reviewLatestDecisionHistory} />}
    </PageShell>
  );
}
