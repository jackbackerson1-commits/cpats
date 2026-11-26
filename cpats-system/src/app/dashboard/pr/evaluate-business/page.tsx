'use client';

import { useUnsavedForm } from '@/components/ui/UnsavedChanges';
import { SubmissionFeedback } from '@/components/ui/SubmissionFeedback';
import { describeSubmissionIssue, SubmissionResponseError, type SubmissionIssue } from '@/shared/submission-feedback';
import { actionFeedback, decisionFeedback, submissionFeedbackError } from '@/components/ui/action-feedback';

import React, { useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, History, LockKeyhole, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PRStatus, Role } from '@prisma/client';
import { AuthUser } from '@/shared/session';
import { BusinessPaymentHistory, PaymentHistoryOrder } from '@/components/business/BusinessPaymentHistory';
import { AdminFeedbackContext } from '@/components/business/AdminFeedbackContext';
import { WaitingTime } from '@/components/ui/QueueFilters';
import { BusinessVerificationDetails } from '@/components/business/BusinessVerificationDetails';
import { BusinessDecisionChronology } from '@/components/business/BusinessDecisionChronology';
import { BusinessProgressHistory } from '@/components/business/BusinessProgressHistory';
import { BusinessEvaluationWorkspace as ReviewWorkspace, BusinessRequestPanels, BusinessEvaluationActionBar } from '@/components/business/BusinessEvaluationWorkspace';
import {
  PageShell, StageHeader, Card, ErrorBanner, SuccessBanner, FieldLabel, FieldError, BusinessSection, BusinessEmptySelection,
  inputClass, CheckItem, DecisionButtonGroup, ActionButton, QueueTask,
} from '@/components/business/BusinessUI';

interface ZodSubErrors { _errors?: string[] }
interface ZodFormErrors { prId?: ZodSubErrors; action?: ZodSubErrors; remarks?: ZodSubErrors }
interface ItemPayloadNode { itemName: string; quantity: number; unitPrice?: number }
interface AuditLogNode {
  id?: string; createdAt: string; previousState: PRStatus | null; newState: PRStatus;
  remarks: string | null; actor: { email: string; role: Role };
  businessNecessityVerified?: boolean | null;
  businessBudgetAvailable?: boolean | null;
}
interface PendingPRNode {
  id: string; justification: string; status: PRStatus; isDirectPoBypass?: boolean;
  adminProofFilePath?: string | null; createdAt: string;
  department: { code: string; name: string }; itemsPayload?: ItemPayloadNode[] | unknown;
  auditLogs?: AuditLogNode[];
  purchaseOrders?: PaymentHistoryOrder[];
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

function HistoryCardStatus({ record, showCurrentStatus = true }: { record: PendingPRNode; showCurrentStatus?: boolean }) {
  const adminDecision = record.auditLogs?.find(log => log.actor.role === Role.Admin_Office &&
    (log.newState === PRStatus.Approved_Awaiting_PO || log.newState === PRStatus.Returned_for_Correction || log.newState === PRStatus.Declined));
  const currentTone = record.status === PRStatus.Declined ? 'bg-rose-50 text-rose-900 ring-rose-200'
    : record.status === PRStatus.Returned_for_Correction ? 'bg-amber-50 text-amber-900 ring-amber-200'
    : record.status === PRStatus.Received_and_Closed || record.status === PRStatus.Approved_Awaiting_PO ? 'bg-emerald-50 text-emerald-900 ring-emerald-200'
    : 'bg-slate-50 text-slate-700 ring-slate-200';
  return <span className="business-history-card-status mt-3 block min-w-0 space-y-2 text-xs leading-5">
    {showCurrentStatus && <span className={`block w-fit max-w-full rounded-md px-2 py-1 font-medium ring-1 ring-inset [overflow-wrap:anywhere] ${currentTone}`}>Current request status: {record.status.replace(/_/g, ' ')}</span>}
    <span className="block break-words text-slate-600 [overflow-wrap:anywhere]">Latest Admin decision: {adminDecision ? adminDecision.newState === PRStatus.Approved_Awaiting_PO ? 'Approved' : adminDecision.newState === PRStatus.Declined ? 'Declined' : 'Returned for correction' : 'Not recorded yet'}</span>
  </span>;
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
  const [queueError, setQueueError] = useState(false);
  const [primarySegment, setPrimarySegment] = useState<'ACTION_REQUIRED' | 'DECISION_HISTORY'>('ACTION_REQUIRED');
  const [historySubFilter, setHistorySubFilter] = useState<'ALL' | 'APPROVED' | 'RETURNED' | 'DECLINED'>('ALL');
  const [submissionIssue, setSubmissionIssue] = useState<SubmissionIssue | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ZodFormErrors | null>(null);
  const [successMessage, setSuccessMessage] = useState<{
    message: string;
    action: 'APPROVE' | 'DECLINE' | 'RETURN_FOR_CORRECTION';
  } | null>(null);
  const [showOperationStateModal, setShowOperationStateModal] = useState(false);
  const notificationTargetHandled = useRef(false);
  const guard = useUnsavedForm(primarySegment + targetPrId, { evaluationAction, remarks, necessityVerified, budgetAvailable }, { enabled: !userLoading && activeUser?.role === Role.Business_Office && primarySegment === 'ACTION_REQUIRED' && !!targetPrId, blocked: isPending && !!targetPrId });

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
        setQueueError(false);
      } else setQueueError(true);
      if (historyResult.status === 'fulfilled' && historyResult.value.ok) {
        const historyData = await historyResult.value.json();
        history = historyData.data || [];
        setBusinessHistory(history);
        setHistoryError(null);
      } else setHistoryError('Unable to load Business Office decision history. Please refresh.');
      if (!notificationTargetHandled.current) {
        notificationTargetHandled.current = true;
        const targetId = new URLSearchParams(window.location.search).get('prId');
        const openHistory = new URLSearchParams(window.location.search).get('view') === 'history';
        if (targetId) {
          const activeTarget = tasks.find((item) => item.id === targetId);
          const historyTarget = history.find((item) => item.id === targetId);
          if (activeTarget && !openHistory) {
            setTargetPrId(activeTarget.id);
            if (activeTarget.isDirectPoBypass) {
              setEvaluationAction('APPROVE');
              setNecessityVerified(true);
              setBudgetAvailable(true);
            }
          } else if (historyTarget) {
            setPrimarySegment(!openHistory && isAdminReturnForBusiness(historyTarget) ? 'ACTION_REQUIRED' : 'DECISION_HISTORY');
            setHistorySubFilter('ALL');
            setTargetPrId(historyTarget.id);
            if (!openHistory && isAdminReturnForBusiness(historyTarget)) {
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
      setQueueError(true);
      setHistoryError('Unable to load Business Office decision history. Please refresh.');
    } finally { setQueueLoading(false); }
  };

  useEffect(() => {
    fetch('/api/auth/me').then((res) => res.json()).then((res) => {
      if (res.success && res.data) {
        if (new URLSearchParams(window.location.search).get('view') === 'history') setPrimarySegment('DECISION_HISTORY');
        setActiveUser(res.data); syncWorkspaceQueue(res.data.role);
      }
    }).catch(() => setSystemError('Could not load active session. Please refresh.')).finally(() => setUserLoading(false));
  }, []);

  const handleEvaluationSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSystemError(null); setSubmissionIssue(null); setFieldErrors(null); setSuccessMessage(null); setShowOperationStateModal(false);
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
      let committed = false;
      try {
        const response = await fetch('/api/pr/evaluate-business', { method: adminReturned ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prId: targetPrId, action: evaluationAction, remarks: finalRemarks, necessityVerified, budgetAvailable }) });
        const result = await response.json();
        if (!response.ok || result.success === false) {
          if (response.status === 422 && result.errors) { setFieldErrors(result.errors); throw new SubmissionResponseError(response.status, 'Please review highlighted fields.'); }
          const errorMessage = result.error || 'A transaction exception occurred while recording your decision.';
          if (/INVALID OPERATION STATE|currently in .* status|Returned_for_Correction/i.test(errorMessage)) {
            setSubmissionIssue(describeSubmissionIssue(new SubmissionResponseError(response.status, errorMessage)));
            setShowOperationStateModal(true);
            actionFeedback('Decision not recorded', errorMessage, 'warning');
            await syncWorkspaceQueue(activeUser.role);
            return;
          }
          throw new SubmissionResponseError(response.status, errorMessage);
        }
        committed = true;
        guard.markClean();
        if (evaluationAction) decisionFeedback(evaluationAction, targetPrId, 'Business', adminReturned);
        setSuccessMessage({ action: evaluationAction, message: evaluationAction === 'APPROVE' ? 'Evaluation saved. The request is ready for Admin Office review.' : evaluationAction === 'RETURN_FOR_CORRECTION' ? 'Return saved. The Requesting Office can revise the same request using your feedback.' : 'Decline saved. This request is final; its department can reuse the details in a new request.' });
        setTargetPrId(''); setEvaluationAction(''); setRemarks(''); setNecessityVerified(false); setBudgetAvailable(false);
        await syncWorkspaceQueue(activeUser.role); router.refresh();
      } catch (err: unknown) {
        setSubmissionIssue({ ...describeSubmissionIssue(err, committed), reference: targetPrId || undefined });
        if (!committed) submissionFeedbackError(err);
        else actionFeedback('Saved; refresh needed', 'Your action was recorded. Refresh the workspace to see the latest queue.', 'info');
        if (!committed) setSystemError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
    });
  };

  if (userLoading) return <div className="flex min-h-[45dvh] items-center justify-center text-sm text-slate-500">Loading session context…</div>;
  if (!activeUser || activeUser.role !== Role.Business_Office) return (
    <Card className="mx-auto my-12 w-full max-w-md text-center"><h2 className="text-sm font-bold text-rose-700">Access Restricted</h2>
      <p className="mt-2 text-sm text-slate-500">Your account ({activeUser?.role.replace(/_/g, ' ') || 'Guest'}) is not authorized for Business Office evaluation.</p></Card>
  );

  const actionRequiredQueue = [...activeQueue.filter((item) => item.status === PRStatus.Pending_Business_Approval), ...businessHistory.filter(isAdminReturnForBusiness)];
  const decisionHistoryQueue = [...businessHistory].sort((a, b) => new Date(latestBusinessDecision(b)?.createdAt || b.createdAt).getTime() - new Date(latestBusinessDecision(a)?.createdAt || a.createdAt).getTime());
  const filteredHistoryQueue = decisionHistoryQueue.filter((item) => {
    const state = historyDecisionState(item);
    return historySubFilter === 'APPROVED' ? state === PRStatus.Pending_Admin_Approval
      : historySubFilter === 'RETURNED' ? state === PRStatus.Returned_for_Correction
      : historySubFilter === 'DECLINED' ? state === PRStatus.Declined : true;
  });
  const displayedQueueNodes = primarySegment === 'ACTION_REQUIRED' ? actionRequiredQueue : filteredHistoryQueue;
  const queueTasks: (QueueTask & { reviewCue?: string })[] = displayedQueueNodes.map((task) => ({
    reviewCue: primarySegment === 'ACTION_REQUIRED' ? isAdminReturnForBusiness(task) ? 'Admin return' : task.isDirectPoBypass ? 'Executive pre-approved' : undefined : undefined,
    createdAt: task.createdAt, department: `${task.department.code} · ${task.department.name}`, status: task.status, timing: task,
    officeCode: task.department.code, decisionStatus: primarySegment === 'DECISION_HISTORY' ? latestBusinessDecision(task)?.newState : undefined,
    id: task.id, title: deriveItemSummaryTitle(task.itemsPayload),
    subtitle: primarySegment === 'DECISION_HISTORY' ? `${task.department.code} • Business evaluation: ${businessDecisionLabel(latestBusinessDecision(task))}` : isAdminReturnForBusiness(task) ? `${task.department.code} • ADMIN RETURN` : task.isDirectPoBypass ? `${task.department.code} • FAST-TRACK` : task.department.code,
    dateLabel: new Date(primarySegment === 'DECISION_HISTORY' ? latestBusinessDecision(task)?.createdAt || task.createdAt : task.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }), justificationPreview: task.justification,
  }));
  const selectedPR = primarySegment === 'DECISION_HISTORY' && historyError ? undefined : displayedQueueNodes.find((req) => req.id === targetPrId);
  const isDecisionHistoryRecord = primarySegment === 'DECISION_HISTORY';
  const selectedBusinessDecision = selectedPR ? latestBusinessDecision(selectedPR) : undefined;
  const selectedAdminReturn = selectedPR ? isAdminReturnForBusiness(selectedPR) && !isDecisionHistoryRecord : false;
  const itemsList: ItemPayloadNode[] = selectedPR && Array.isArray(selectedPR.itemsPayload) ? selectedPR.itemsPayload as ItemPayloadNode[] : [];
  const hasPrices = itemsList.some((item) => typeof item.unitPrice === 'number' && item.unitPrice > 0);
  const calculatedGrandTotal = itemsList.reduce((acc, item) => acc + (item.unitPrice || 0) * item.quantity, 0);
  const checksComplete = Number(necessityVerified) + Number(budgetAvailable);

  const actionDescription = selectedAdminReturn ? 'The existing request returns to Admin for approval.' : evaluationAction === 'APPROVE' ? 'Approval sends this request to the Admin Office for review.' : evaluationAction === 'RETURN_FOR_CORRECTION' ? 'The Requesting Office will receive your feedback and can correct this same request.' : evaluationAction === 'DECLINE' ? 'This request will be declined. Your reason becomes part of the decision history.' : 'Confirm both fiscal checks and choose an outcome.';
  const showDecision = selectedPR && !isDecisionHistoryRecord;
  const verificationError = showDecision && systemError?.startsWith('Please confirm both verification checks');
  const decisionError = showDecision && (systemError?.startsWith('Please select an evaluation action') ||
    systemError?.startsWith('Compliance Exception:'));

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
    <PageShell compact className="business-fiscal-polish">
      <StageHeader title="Fiscal evaluation" />
      <SubmissionFeedback issue={submissionIssue} />
      {systemError && !verificationError && !decisionError && (!submissionIssue || systemError !== submissionIssue.message) && <ErrorBanner>{systemError}</ErrorBanner>}
      {primarySegment === 'ACTION_REQUIRED' && (queueError || historyError) && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{queueError && historyError ? 'The fiscal review queue could not be updated.' : queueError ? 'Pending reviews could not be updated.' : 'Admin returns could not be updated.'} Use Refresh records to check for the latest requests.</p>}
      {successMessage && <SuccessBanner tone={successMessage.action === 'DECLINE' ? 'decline' : successMessage.action === 'RETURN_FOR_CORRECTION' ? 'warning' : 'success'}>{successMessage.message}<button type="button" onClick={() => guard.request(() => { setPrimarySegment('DECISION_HISTORY'); setHistorySubFilter('ALL'); setTargetPrId(''); })} className="ml-2 inline-flex min-h-11 items-center gap-2 rounded-lg border border-current px-3 font-semibold"><History className="size-4" aria-hidden="true" />View evaluation history</button></SuccessBanner>}
      {primarySegment === 'DECISION_HISTORY' && historyError && <ErrorBanner>{historyError}<button type="button" disabled={queueLoading} onClick={() => guard.request(() => { setQueueLoading(true); void syncWorkspaceQueue(activeUser.role); })} className="ml-3 min-h-11 rounded-lg border border-rose-300 px-3 font-semibold">Retry history</button></ErrorBanner>}

      <div className="business-records-toolbar">
        <h2 className="sr-only">Fiscal evaluation records</h2>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Queue view">
          {([['ACTION_REQUIRED', 'Action required', actionRequiredQueue.length], ['DECISION_HISTORY', 'Decision history', decisionHistoryQueue.length]] as const).map(([key, label, count]) => (
            <button key={key} type="button" aria-pressed={primarySegment === key}
              onClick={() => guard.request(() => { setPrimarySegment(key); setTargetPrId(''); })}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition ${primarySegment === key ? 'border-emerald-800 bg-emerald-800 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
              {key === 'DECISION_HISTORY' ? 'Evaluation history' : label} <span className="tabular-nums">({queueLoading ? '…' : key === 'DECISION_HISTORY' && historyError ? 'Unavailable' : count})</span>
            </button>
          ))}
        </div>

        <button type="button" disabled={queueLoading} onClick={() => guard.request(() => { setQueueLoading(true); void syncWorkspaceQueue(activeUser.role); })} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`size-4 ${queueLoading ? 'animate-spin' : ''}`} aria-hidden="true" />{queueLoading ? 'Loading records…' : 'Refresh records'}</button>
        {primarySegment === 'ACTION_REQUIRED' && <p className="text-sm leading-6 text-slate-600">Select a request to evaluate. Admin returns include your previous review and the requested changes.</p>}
      </div>

      <ReviewWorkspace compactTools historyFilters={primarySegment === 'DECISION_HISTORY' && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Decision history filters">
            {([['ALL', 'All', decisionHistoryQueue.length], ['APPROVED', 'Approved', decisionHistoryQueue.filter(i => historyDecisionState(i) === PRStatus.Pending_Admin_Approval).length], ['RETURNED', 'Returned', decisionHistoryQueue.filter(i => historyDecisionState(i) === PRStatus.Returned_for_Correction).length], ['DECLINED', 'Declined', decisionHistoryQueue.filter(i => historyDecisionState(i) === PRStatus.Declined).length]] as const).map(([key, label, count]) => (
              <button key={key} type="button" aria-pressed={historySubFilter === key} aria-label={`${label} ${count} Business Office evaluations`}
                onClick={() => guard.request(() => { setHistorySubFilter(key); setTargetPrId(''); })}
                className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-medium transition ${historySubFilter === key ? 'border-emerald-800 bg-emerald-800 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                {label} <span className="ml-1 tabular-nums">{count}</span>
              </button>
            ))}
          </div>
        )} key={primarySegment} queueTitle={primarySegment === 'ACTION_REQUIRED' ? 'Fiscal review queue' : 'Evaluation history'} tasks={primarySegment === 'DECISION_HISTORY' && historyError ? [] : queueTasks}
        emptyTitle={primarySegment === 'ACTION_REQUIRED' && (queueError || historyError) ? 'Queue could not be verified' : primarySegment === 'DECISION_HISTORY' && historyError ? 'History unavailable' : primarySegment === 'DECISION_HISTORY' && !queueTasks.length ? 'No matching evaluations' : undefined}
        loading={queueLoading} emptyMessage={primarySegment === 'ACTION_REQUIRED' ? queueError || historyError ? 'Use Refresh records to check for outstanding requests.' : 'No requisitions are awaiting fiscal evaluation.' : historyError ? 'History is unavailable. Use Retry history above.' : 'No matching records found in evaluation history.'}
        selectionLabel={primarySegment === 'DECISION_HISTORY' ? 'Viewing' : 'In review'}
        selectedTaskLabel={primarySegment === 'DECISION_HISTORY' ? 'Viewing past decision' : 'Reviewing selected transaction'}
        selectedId={targetPrId}
        onSelect={(id) => guard.request(() => { setTargetPrId(id); setEvaluationAction(''); setRemarks(''); setNecessityVerified(false); setBudgetAvailable(false); setFieldErrors(null); setSystemError(null); setSubmissionIssue(null); const pr = displayedQueueNodes.find((item) => item.id === id); if (pr && isAdminReturnForBusiness(pr) && primarySegment === 'ACTION_REQUIRED') { setEvaluationAction('APPROVE'); setRemarks(latestBusinessDecision(pr)?.remarks || 'Fiscal review revised following Admin Office feedback.'); setNecessityVerified(true); setBudgetAvailable(true); } else if (pr?.status === PRStatus.Pending_Business_Approval && pr.isDirectPoBypass) { setEvaluationAction('APPROVE'); setNecessityVerified(true); setBudgetAvailable(true); } })}>
        <form onSubmit={handleEvaluationSubmit} className="business-review-form min-w-0 space-y-4" aria-busy={isPending}>
          {isDecisionHistoryRecord && <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600"><LockKeyhole className="mt-1 size-4 shrink-0" aria-hidden="true" /><p>Saved evaluations remain available after a request moves to another office. This history view cannot approve, return or decline a request.</p></div>}
          {!selectedPR ? isDecisionHistoryRecord ? <Card><h2 className="text-base font-semibold text-slate-950">Select a saved evaluation</h2><p className="mt-2 text-sm leading-6 text-slate-600">Choose a history record to review its decision, remarks, request details and subsequent office feedback.</p></Card> : <BusinessEmptySelection kind="request" /> : <>
            <BusinessRequestPanels key={primarySegment + selectedPR.id} requestId={selectedPR.id} title={deriveItemSummaryTitle(selectedPR.itemsPayload)} status={selectedPR.status}
              hideContext={isDecisionHistoryRecord} compactReference
              context={`${selectedPR.department.code} · ${isDecisionHistoryRecord ? 'Past decision · Read-only' : selectedAdminReturn ? 'Revised fiscal review' : 'Request under review'}`}
              reviewLabel={selectedPR.isDirectPoBypass ? 'Executive pre-approved' : 'Standard review'}
              overview={<>
            {!isDecisionHistoryRecord && <AdminFeedbackContext auditLogs={selectedPR.auditLogs} status={selectedPR.status} />}
            <BusinessSection title="Reason for the request" description="The justification saved by the Requesting Office.">
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{selectedPR.justification}</p>
            </BusinessSection>
            <section aria-label="Request overview" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6">
              <h2 className="text-base font-semibold text-slate-950">Request overview</h2>
              <dl className="business-overview-grid mt-3 grid min-w-0 gap-4">
                {[['Originating office', `${selectedPR.department.name} (${selectedPR.department.code})`], ['Submitted', new Date(selectedPR.createdAt).toLocaleDateString()], ['Estimated value', hasPrices ? `₱${calculatedGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Not provided']].map(([label, value]) => (
                  <div key={label} className="min-w-0"><dt className="text-xs text-slate-600">{label}</dt><dd className="mt-1 break-words text-sm font-medium leading-6 tabular-nums text-slate-900 [overflow-wrap:anywhere]">{value}</dd></div>
                ))}
              </dl>
            </section>

            <HistoryCardStatus record={selectedPR} showCurrentStatus={isDecisionHistoryRecord} />
            <WaitingTime record={selectedPR} />
            {isDecisionHistoryRecord && <BusinessDecisionChronology status={selectedPR.status} auditLogs={selectedPR.auditLogs} businessDecision={selectedBusinessDecision} />}

            {isDecisionHistoryRecord && <BusinessPaymentHistory orders={selectedPR.purchaseOrders} auditLogs={selectedPR.auditLogs} />}

            {selectedBusinessDecision && !isDecisionHistoryRecord && <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
              <h2 className="text-base font-semibold text-emerald-950">Recorded Business Office decision</h2>
              <p className="mt-2 text-sm font-semibold text-emerald-950">{businessDecisionLabel(selectedBusinessDecision)}</p>
              {selectedBusinessDecision.remarks && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-emerald-950 [overflow-wrap:anywhere]">{selectedBusinessDecision.remarks}</p>}
              <BusinessVerificationDetails decision={selectedBusinessDecision} />
              <p className="mt-3 break-words border-t border-emerald-200 pt-3 text-xs leading-5 text-emerald-900 [overflow-wrap:anywhere]">{selectedBusinessDecision.actor.email} · {new Date(selectedBusinessDecision.createdAt).toLocaleString()}</p>
            </section>}

            {selectedAdminReturn && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4" role="status">
              <h2 className="text-base font-semibold text-amber-950">Admin returned this evaluation</h2>
              <p className="mt-2 text-sm leading-6 text-amber-950">Your previous fiscal review is filled in below. Address the Admin Office feedback, confirm the checks, and resubmit this same request for Admin approval.</p>
            </section>}

            {selectedPR.isDirectPoBypass && <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <h2 className="text-base font-semibold text-emerald-950">Executive pre-approval on file</h2>
              <p className="mt-2 text-sm leading-6 text-emerald-900">{isDecisionHistoryRecord ? 'This saved proof accompanied the fast-track request.' : 'Verify the budget ledger allocation and confirm dispatch to the Admin Office.'}</p>
              {selectedPR.adminProofFilePath && <a href={selectedPR.adminProofFilePath} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-100">
                View executive letter<ExternalLink className="size-4 shrink-0" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
              </a>}
            </section>}

            <BusinessSection title="Requested items" description={`${itemsList.length} line item${itemsList.length === 1 ? '' : 's'} in this request.`}>
              <ol className="space-y-3">{itemsList.map((item, idx) => {
                const unitPrice = item.unitPrice || 0;
                return <li key={idx} className="min-w-0 rounded-lg border border-slate-200 p-3">
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

              </>}
              history={selectedPR.auditLogs?.length ? <BusinessProgressHistory auditLogs={selectedPR.auditLogs} embedded /> : <Card><p className="text-sm text-slate-600">No workflow events recorded.</p></Card>} />

            <div id="business-decision-controls" tabIndex={-1} className="min-w-0 space-y-4">
            {!isDecisionHistoryRecord && <BusinessSection title="Fiscal verification" description="Confirm both checks before recording any evaluation outcome.">
              {verificationError && <ErrorBanner>{systemError}</ErrorBanner>}
              <p className={`mb-4 text-sm font-medium ${checksComplete === 2 ? 'text-emerald-800' : 'text-slate-700'}`}>{checksComplete} of 2 verified</p>
              <div className="business-verification-checks grid gap-3"><CheckItem id="gate-necessity" checked={necessityVerified} onChange={setNecessityVerified} label="Purchase necessity verified" description="Item specifications and departmental requirements have been reviewed." /><CheckItem id="gate-budget" checked={budgetAvailable} onChange={setBudgetAvailable} label="Budget availability confirmed" description="Funds are available under the department allocation code." /></div>
            </BusinessSection>}

            {!isDecisionHistoryRecord && <BusinessSection title="Business Office decision" description={selectedAdminReturn ? 'Revise your fiscal evaluation before sending it back to Admin.' : 'Choose the outcome to record for this request.'}>
              {decisionError && <ErrorBanner>{systemError}</ErrorBanner>}
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
            </>}
            </div>
          </>}
          {selectedPR && !isDecisionHistoryRecord && <BusinessEvaluationActionBar description={actionDescription} title={selectedAdminReturn ? 'Resubmit revised evaluation' : evaluationAction === 'APPROVE' ? 'Approve request' : evaluationAction === 'RETURN_FOR_CORRECTION' ? 'Return for correction' : evaluationAction === 'DECLINE' ? 'Decline request' : 'Select an outcome'}>
            <ActionButton type="submit" aria-describedby="business-decision-explanation" disabled={isPending}>{isPending ? 'Saving…' : selectedAdminReturn ? 'Resubmit to Admin' : 'Submit evaluation'}</ActionButton>
          </BusinessEvaluationActionBar>}
        </form>
      </ReviewWorkspace>
      {showOperationStateModal && <OperationStateModal onReviewLatest={() => guard.request(reviewLatestDecisionHistory)} />}
    </PageShell>
  );
}
