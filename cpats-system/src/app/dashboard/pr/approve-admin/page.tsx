// src/app/dashboard/pr/approve-admin/page.tsx
// Enterprise executive-review UI overhaul.
// Existing state, validation, queue synchronization, upload behavior, and API mutation contract are preserved.

'use client';

import { useUnsavedForm } from '@/components/ui/UnsavedChanges';
import { SubmissionFeedback } from '@/components/ui/SubmissionFeedback';
import { describeSubmissionIssue, SubmissionResponseError, type SubmissionIssue } from '@/shared/submission-feedback';
import { actionFeedback, decisionFeedback, submissionFeedbackError } from '@/components/ui/action-feedback';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, ExternalLink, FileText } from 'lucide-react';
import { AdminRecordedDecision, AdminStatusBadge } from '@/components/admin/AdminPortalPresentation';
import { Role, PRStatus } from '@prisma/client';
import { AuthUser } from '@/shared/session';
import AdminRequestPanels, { AdminPendingReviews } from '@/components/admin/AdminRequestPanels';
import { WaitingTime } from '@/components/ui/QueueFilters';
import { AdminDecisionContext } from '@/components/admin/AdminDecisionContext';
import {
  PageShell,
  StageHeader,
  Card,
  ErrorBanner,
  SuccessBanner,
  FieldLabel,
  FieldError,
  inputClass,
  CheckItem,
  ReviewWorkspace,
  ActionButton,
  QueueTask, AdminSection, AdminEmptySelection, AdminFinalAction, DecisionButtonGroup,
} from '@/components/admin/AdminUI';

interface ZodSubErrors {
  _errors?: string[];
}

interface ZodFormErrors {
  prId?: ZodSubErrors;
  action?: ZodSubErrors;
  remarks?: ZodSubErrors;
  adminProofFilePath?: ZodSubErrors;
}

interface ItemPayloadNode {
  itemName: string;
  quantity: number;
  unitPrice?: number;
}

interface AuditLogNode {
  id?: string;
  createdAt: string;
  previousState: PRStatus | null;
  newState: PRStatus;
  remarks: string | null;
  businessNecessityVerified?: boolean | null;
  businessBudgetAvailable?: boolean | null;
  actor: { email: string; role: Role };
}

interface PendingAdminPRNode {
  id: string;
  justification: string;
  status: PRStatus;
  isDirectPoBypass?: boolean;
  adminProofFilePath?: string | null;
  createdAt: string;
  department: {
    code: string;
    name: string;
  };
  itemsPayload?: ItemPayloadNode[] | unknown;
  auditLogs?: AuditLogNode[];
}

function latestAdminDecision(record: PendingAdminPRNode): AuditLogNode | undefined {
  return record.auditLogs?.find((log) =>
    log.actor.role === Role.Admin_Office &&
    log.previousState === PRStatus.Pending_Admin_Approval &&
    (log.newState === PRStatus.Approved_Awaiting_PO ||
      log.newState === PRStatus.Returned_for_Correction ||
      log.newState === PRStatus.Declined),
  );
}

function deriveItemSummaryTitle(itemsPayload: unknown): string {
  if (!itemsPayload || !Array.isArray(itemsPayload) || itemsPayload.length === 0) {
    return 'Executive Purchase Requisition';
  }

  const items = itemsPayload as ItemPayloadNode[];
  const firstItemName = items[0]?.itemName?.trim() || 'Requested Item';
  const firstItemQty = items[0]?.quantity || 1;

  if (items.length === 1) {
    return `${firstItemName} (x${firstItemQty})`;
  }

  return `${firstItemName} (x${firstItemQty}) +${items.length - 1} more item${
    items.length - 1 > 1 ? 's' : ''
  }`;
}

const isImageFile = (path?: string | null) => {
  if (!path) return false;
  return /\.(jpg|jpeg|png|webp|svg)$/i.test(path);
};

function formatPeso(value: number): string {
  return `₱${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function AdminOfficeApprovalPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activeUser, setActiveUser] = useState<AuthUser | null>(null);
  const [userLoading, setUserLoading] = useState<boolean>(true);

  // Form State
  const [prId, setPrId] = useState<string>('');
  const [action, setAction] = useState<
    'APPROVE' | 'DECLINE' | 'RETURN_FOR_CORRECTION' | ''
  >('');
  const [remarks, setRemarks] = useState<string>('');

  // Option 1 Off-Campus Toggle & Proof State
  const [isOption1Enabled, setIsOption1Enabled] = useState<boolean>(false);
  const [option1ProofFilePath, setOption1ProofFilePath] = useState<string>('');
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);
  const [proofUploading, setProofUploading] = useState(false);

  // Mandatory Signatory Verification Checkboxes
  const [checkedPR, setCheckedPR] = useState<boolean>(false);
  const [checkedPOAuth, setCheckedPOAuth] = useState<boolean>(false);
  const [checkedPurchaseAuth, setCheckedPurchaseAuth] = useState<boolean>(false);

  // Queue Storage
  const [adminQueue, setAdminQueue] = useState<PendingAdminPRNode[]>([]);
  const [adminHistory, setAdminHistory] = useState<PendingAdminPRNode[]>([]);
  const [queueLoading, setQueueLoading] = useState<boolean>(true);
  const [primarySegment, setPrimarySegment] = useState<
    'ACTION_REQUIRED' | 'DECISION_HISTORY'
  >('ACTION_REQUIRED');
  const [historySubFilter, setHistorySubFilter] = useState<
    'ALL' | 'APPROVED' | 'RETURNED' | 'DECLINED'
  >('ALL');

  // Status Responses
  const [submissionIssue, setSubmissionIssue] = useState<SubmissionIssue | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ZodFormErrors | null>(null);
  const [successStatus, setSuccessStatus] = useState<{
    message: string;
    action: 'APPROVE' | 'RETURN_FOR_CORRECTION' | 'DECLINE' | '';
  } | null>(null);
  const notificationTargetHandled = useRef(false);
  const [notificationEventTarget, setNotificationEventTarget] = useState<{ prId: string; eventId?: string } | null>(null);
  const guard = useUnsavedForm(primarySegment + prId, { action, remarks, isOption1Enabled, option1ProofFilePath, checkedPR, checkedPOAuth, checkedPurchaseAuth }, { enabled: !userLoading && activeUser?.role === Role.Admin_Office && primarySegment === 'ACTION_REQUIRED' && !!prId, blocked: (isPending || proofUploading) && !!prId });

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data) {
          setActiveUser(res.data);
          syncAdminWorkspaceQueue(res.data.role);
        } else {
          setActiveUser({
            id: 'admin-approver-uuid-static-789',
            email: 'vp-admin@dmc.edu.ph',
            role: Role.Admin_Office,
            departmentId: 'administration-dept-uuid-hq',
            departmentCode: 'OVPA',
            departmentName: 'Office of the VP for Administration',
          });
          syncAdminWorkspaceQueue(Role.Admin_Office);
        }
      })
      .catch(() => setSystemError('Failed to load session context. Please refresh.'))
      .finally(() => setUserLoading(false));
  }, []);

  async function syncAdminWorkspaceQueue(role: Role) {
    try {
      const [queueResult, historyResult] = await Promise.allSettled([
        fetch('/api/pr/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role }),
        }).then(async (response) => {
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load the Admin Office review queue.');
          return result.data as PendingAdminPRNode[];
        }),
        fetch('/api/pr/admin-history', { cache: 'no-store' }).then(async (response) => {
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load Admin decision history.');
          return result.data as PendingAdminPRNode[];
        }),
      ]);
      const adminTasks: PendingAdminPRNode[] = queueResult.status === 'fulfilled'
        ? (queueResult.value || []).filter(
          (item: PendingAdminPRNode) =>
            item.status === PRStatus.Pending_Admin_Approval ||
            item.status === PRStatus.Returned_for_Correction ||
            item.status === PRStatus.Declined,
        )
        : [];
      const historyTasks = historyResult.status === 'fulfilled' ? historyResult.value || [] : [];

      if (queueResult.status === 'fulfilled') setAdminQueue(adminTasks);
      else setSystemError(queueResult.reason instanceof Error ? queueResult.reason.message : 'Unable to load the Admin Office review queue.');
      if (historyResult.status === 'fulfilled') {
        setAdminHistory(historyTasks);
        setHistoryError(null);
      } else setHistoryError(historyResult.reason instanceof Error ? historyResult.reason.message : 'Unable to load Admin decision history.');

      if (!notificationTargetHandled.current) {
        const targetId = new URLSearchParams(window.location.search).get('prId');
        const targetEventId = new URLSearchParams(window.location.search).get('auditLogId');
        if (targetId) {
          const activeTarget = adminTasks.find((item) => item.id === targetId && item.status === PRStatus.Pending_Admin_Approval);
          const historicalTarget = historyTasks.find((item) => item.id === targetId);
          if (activeTarget) {
            setPrimarySegment('ACTION_REQUIRED');
            setPrId(activeTarget.id);
            setNotificationEventTarget({ prId: activeTarget.id, eventId: activeTarget.auditLogs?.find(log => log.id === targetEventId)?.id });
            notificationTargetHandled.current = true;
          } else if (historicalTarget) {
            setPrimarySegment('DECISION_HISTORY');
            setHistorySubFilter('ALL');
            setPrId(historicalTarget.id);
            setNotificationEventTarget({ prId: historicalTarget.id, eventId: historicalTarget.auditLogs?.find(log => log.id === targetEventId)?.id });
            notificationTargetHandled.current = true;
          } else if (historyResult.status === 'rejected') {
            setPrimarySegment('DECISION_HISTORY');
          } else if (queueResult.status === 'fulfilled') {
            setSystemError('This request has no Admin Office decision history available for this account.');
            notificationTargetHandled.current = true;
          }
        }
      }
    } catch (err) {
      console.error('Admin queue synchronization interrupted:', err);
      setHistoryError('Unable to load Admin decision history. Please refresh this page.');
    } finally {
      setQueueLoading(false);
    }
  }

  const handleProofFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];

    if (file) {
      setSystemError(null); setSubmissionIssue(null);
      setProofUploading(true);

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();

        if (!res.ok || !data.success || !data.url) throw new Error(data.error || 'The proof file could not be uploaded.');
        setOption1ProofFilePath(data.url);
        setAttachedFileName(file.name);
      } catch (err) {
        console.error('Upload failed:', err);
        setSystemError(err instanceof Error ? err.message : 'The proof file could not be uploaded.');
      } finally { setProofUploading(false); }
    }
  };

  const handleAdminApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    setSystemError(null); setSubmissionIssue(null);
    setFieldErrors(null);
    setSuccessStatus(null);

    if (!activeUser || activeUser.role !== Role.Admin_Office) {
      setSystemError(
        'SECURITY VIOLATION: Operational profile lacks Admin Office regulatory clearance.',
      );
      return;
    }

    const selectedPR = adminQueue.find((req) => req.id === prId);

    if (!selectedPR || selectedPR.status !== PRStatus.Pending_Admin_Approval) {
      setSystemError(
        'This requisition is in decision history and cannot receive another Admin Office decision.',
      );
      return;
    }

    if (!action) {
      setSystemError(
        'VALIDATION FAILURE: You must authoritatively select an approval, correction, or decline command.',
      );
      return;
    }

    if (action === 'APPROVE') {
      if (!checkedPR || !checkedPOAuth || !checkedPurchaseAuth) {
        setSystemError(
          'COMPLIANCE EXCEPTION: All three regulatory authorization check-boxes must be actively validated.',
        );
        return;
      }

      if (
        isOption1Enabled &&
        (!option1ProofFilePath || option1ProofFilePath.trim().length === 0)
      ) {
        setSystemError(
          'AUDIT TRAIL FAILURE: Option 1 Remote Sign-Off is enabled, but no proof file has been attached.',
        );
        return;
      }
    }

    const finalRemarks =
      action === 'APPROVE'
        ? remarks.trim().length >= 5
          ? remarks
          : selectedPR?.isDirectPoBypass
            ? 'Fast-Track Executive Logged: Verified with attached Executive Pre-Approved Letter. Authorized for Purchase Order generation.'
            : `Executive approval granted by Admin Office.`
        : remarks;

    if (action !== 'APPROVE' && finalRemarks.trim().length < 5) {
      setSystemError(
        'COMPLIANCE EXCEPTION: Audit evaluation remarks are mandatory for returning or declining requests (min. 5 characters).',
      );
      return;
    }

    startTransition(async () => {
      let committed = false;
      try {
        const payload = {
          prId,
          action,
          remarks: finalRemarks,
          ...(action === 'APPROVE' &&
          isOption1Enabled &&
          option1ProofFilePath
            ? { adminProofFilePath: option1ProofFilePath }
            : {}),
        };

        const response = await fetch('/api/pr/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (!response.ok || result.success === false) {
          if (response.status === 422 && result.errors) {
            setFieldErrors(result.errors);
            throw new SubmissionResponseError(response.status, 'Please review the highlighted fields below.');
          }

          throw new SubmissionResponseError(response.status,
            result.error ||
              'The server could not confirm this submission.',
          );
        }

        committed = true;
        guard.markClean();
        if (action) decisionFeedback(action, prId, 'Admin');
        setSuccessStatus({
          action,
          message: action === 'APPROVE' ? 'Approval saved. The request is ready for Purchasing Office to prepare its purchase order.' : action === 'RETURN_FOR_CORRECTION' ? 'Return saved. The Requesting Office can revise the same request using your feedback.' : 'Decline saved. This request is final; its department can reuse the details in a new request.',
        });

        setPrId('');
        setAction('');
        setRemarks('');
        setIsOption1Enabled(false);
        setOption1ProofFilePath('');
        setAttachedFileName(null);
        setCheckedPR(false);
        setCheckedPOAuth(false);
        setCheckedPurchaseAuth(false);

        await syncAdminWorkspaceQueue(activeUser.role);
        router.refresh();
      } catch (err: unknown) {
        setSubmissionIssue({ ...describeSubmissionIssue(err, committed), reference: prId || undefined });
        if (!committed) submissionFeedbackError(err);
        else actionFeedback('Saved; refresh needed', 'Your action was recorded. Refresh the workspace to see the latest queue.', 'info');
        if (!committed) setSystemError(
          (err instanceof Error ? err.message : null) ||
            'A network or server disconnect interrupted ledger propagation.',
        );
      }
    });
  };

  if (userLoading) {
    return (
      <div className="min-h-[60dvh] flex items-center justify-center text-sm font-medium text-slate-500 font-sans">
        Loading executive session context…
      </div>
    );
  }

  if (!activeUser || activeUser.role !== Role.Admin_Office) {
    return (
      <Card className="max-w-md w-full text-center mx-auto my-12">
        <h2 className="text-rose-700 font-bold text-sm">Access Restricted</h2>
        <p className="text-slate-500 text-xs mt-2 leading-relaxed">
          Your account (
          {activeUser?.role.replace(/_/g, ' ') || 'Guest'}) is not authorized for
          Executive Administration Sign-off.
        </p>
      </Card>
    );
  }

  const actionRequiredQueue = adminQueue.filter(
    (item) => item.status === PRStatus.Pending_Admin_Approval,
  );
  const decisionHistoryQueue = adminHistory;
  const filteredHistoryQueue = decisionHistoryQueue.filter((item) =>
    historySubFilter === 'ALL' || latestAdminDecision(item)?.newState === (
      historySubFilter === 'APPROVED' ? PRStatus.Approved_Awaiting_PO
        : historySubFilter === 'RETURNED' ? PRStatus.Returned_for_Correction : PRStatus.Declined
    ),
  );
  const displayedQueue =
    primarySegment === 'ACTION_REQUIRED'
      ? actionRequiredQueue
      : filteredHistoryQueue;

  const queueTasks: (QueueTask & { decisionStatus?: PRStatus; officeCode: string; dateTime: string })[] = displayedQueue.map((task) => ({
    id: task.id,
    title: deriveItemSummaryTitle(task.itemsPayload),
    subtitle: primarySegment === 'DECISION_HISTORY'
      ? `${task.department?.code || 'OVPA'} • ${latestAdminDecision(task)?.newState === PRStatus.Approved_Awaiting_PO ? 'APPROVED' : latestAdminDecision(task)?.newState === PRStatus.Returned_for_Correction ? 'RETURNED' : 'DECLINED'}`
      : task.isDirectPoBypass ? `${task.department?.code || 'OVPA'} • PRE-APPROVED` : task.department?.code || 'OVPA',
    createdAt: task.createdAt, department: `${task.department.code} · ${task.department.name}`, status: task.status, timing: task,
    officeCode: task.department.code,
    decisionStatus: primarySegment === 'DECISION_HISTORY' ? latestAdminDecision(task)?.newState : undefined,
    dateTime: primarySegment === 'DECISION_HISTORY' ? latestAdminDecision(task)?.createdAt || task.createdAt : task.createdAt,
    dateLabel: new Date(primarySegment === 'DECISION_HISTORY' ? latestAdminDecision(task)?.createdAt || task.createdAt : task.createdAt).toLocaleDateString(),
    justificationPreview: task.justification,
  }));

  const selectedPR = (primarySegment === 'DECISION_HISTORY' ? adminHistory : adminQueue).find((req) => req.id === prId);
  const isDecisionHistoryRecord = primarySegment === 'DECISION_HISTORY';

  const itemsList: ItemPayloadNode[] =
    selectedPR && Array.isArray(selectedPR.itemsPayload)
      ? (selectedPR.itemsPayload as ItemPayloadNode[])
      : [];

  const hasPrices = itemsList.some(
    (item) => typeof item.unitPrice === 'number' && item.unitPrice > 0,
  );

  const calculatedGrandTotal = itemsList.reduce((acc, item) => {
    const price = item.unitPrice || 0;
    return acc + price * item.quantity;
  }, 0);

  const authorizationCount =
    Number(checkedPR) + Number(checkedPOAuth) + Number(checkedPurchaseAuth);

  const selectedActionLabel =
    action === 'APPROVE'
      ? 'Approve requisition'
      : action === 'RETURN_FOR_CORRECTION'
        ? 'Return for correction'
        : action === 'DECLINE'
          ? 'Decline requisition'
          : 'No decision selected';

  const selectedActionDescription = action === 'APPROVE' ? 'Approval authorizes the Purchasing Office to prepare the purchase order.' : action === 'RETURN_FOR_CORRECTION' ? 'The request is returned with your feedback through the existing correction process.' : action === 'DECLINE' ? 'The request will be declined. Your reason remains in its decision history.' : 'Choose an outcome above before recording the Admin Office decision.';

  const changeView = (segment: 'ACTION_REQUIRED' | 'DECISION_HISTORY', filter: typeof historySubFilter = 'ALL', selected = '') => guard.request(() => {
    setPrimarySegment(segment); setHistorySubFilter(filter); setPrId(selected); setAction(''); setRemarks('');
    setCheckedPR(false); setCheckedPOAuth(false); setCheckedPurchaseAuth(false);
    setSystemError(null); setSubmissionIssue(null); setFieldErrors(null); setNotificationEventTarget(null);
  });
  const decisions = decisionHistoryQueue.map(record => ({ record, decision: latestAdminDecision(record) }))
    .sort((a, b) => new Date(b.decision?.createdAt || 0).getTime() - new Date(a.decision?.createdAt || 0).getTime());
  const historyCounts = [PRStatus.Approved_Awaiting_PO, PRStatus.Returned_for_Correction, PRStatus.Declined]
    .map(status => decisions.filter(({ decision }) => decision?.newState === status).length);
  const historyFilters = <div role="group" aria-label="Admin decision history filters" className="admin-history-filters">
    {([['ALL', 'All', decisionHistoryQueue.length], ['APPROVED', 'Approved', historyCounts[0]], ['RETURNED', 'Returned', historyCounts[1]], ['DECLINED', 'Declined', historyCounts[2]]] as const).map(([key, label, count]) =>
      <button key={key} type="button" aria-pressed={historySubFilter === key} onClick={() => guard.request(() => { setHistorySubFilter(key); setPrId(''); })}>{label} {count}</button>)}
  </div>;
  const caughtUp = !queueLoading && !systemError && primarySegment === 'ACTION_REQUIRED' && actionRequiredQueue.length === 0 && !selectedPR;

  return (
    <PageShell>
      <StageHeader title="Executive requisition review" />
      <p className="mb-5 text-sm"><Link href="/dashboard/po/online" className="inline-flex min-h-11 items-center font-semibold text-emerald-800 underline">Review provisional online purchase amounts</Link></p>
      <SubmissionFeedback issue={submissionIssue} />
      {systemError && (!submissionIssue || systemError !== submissionIssue.message) && <ErrorBanner>{systemError}</ErrorBanner>}
      {primarySegment === 'DECISION_HISTORY' && historyError && <ErrorBanner>{historyError}</ErrorBanner>}
      {successStatus && <SuccessBanner tone={successStatus.action === 'DECLINE' ? 'decline' : successStatus.action === 'RETURN_FOR_CORRECTION' ? 'warning' : 'success'}>{successStatus.message}</SuccessBanner>}

      <div role="group" aria-label="Executive queue view" className="admin-view-segments">
        {([['ACTION_REQUIRED', 'Action required', actionRequiredQueue.length], ['DECISION_HISTORY', 'Decision history', decisionHistoryQueue.length]] as const).map(([key, label, count]) =>
          <button key={key} type="button" aria-pressed={primarySegment === key} onClick={() => changeView(key, historySubFilter)}>{label} <span>({queueLoading ? '…' : count})</span></button>)}
      </div>
      {caughtUp ? <section className="admin-caught-up" aria-labelledby="admin-caught-up-title">
        <div className="admin-caught-up-message"><span className="admin-caught-up-icon"><CheckCircle2 className="size-8" aria-hidden="true" /></span><h2 id="admin-caught-up-title" className="mt-4 text-xl font-semibold">All caught up</h2><p className="mt-2 text-sm text-slate-600">No requests are awaiting Admin Office review</p></div>
        <div className="admin-recent-decisions"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Recent decisions</h3><button type="button" onClick={() => changeView('DECISION_HISTORY')}>View decision history →</button></div>
          {historyError ? <p role="alert" className="mt-3 text-sm text-rose-800">{historyError}</p> : decisions.length ? <ul>{decisions.slice(0, 3).map(({ record, decision }) => <li key={record.id}><button type="button" onClick={() => changeView('DECISION_HISTORY', 'ALL', record.id)} className="admin-recent-row"><span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm font-semibold">{deriveItemSummaryTitle(record.itemsPayload)}</span><span className="mt-1 block text-xs text-slate-600">{record.department.code} · {decision && new Date(decision.createdAt).toLocaleDateString()}</span></span>{decision && <AdminStatusBadge status={decision.newState} label={decision.newState === PRStatus.Approved_Awaiting_PO ? 'Approved' : undefined} />}</button></li>)}</ul> : <p className="mt-4 text-sm text-slate-600">No Admin decisions have been recorded yet.</p>}
        </div>
      </section> :
      <ReviewWorkspace toolbar={primarySegment === 'DECISION_HISTORY' ? historyFilters : undefined} queueTitle={primarySegment === 'ACTION_REQUIRED' ? 'Executive review queue' : 'Decision history'} tasks={queueTasks} loading={queueLoading}
        viewKey={primarySegment + ':' + historySubFilter}
        emptyMessage={primarySegment === 'ACTION_REQUIRED' ? 'No requests are awaiting Admin Office review.' : 'No matching Admin Office decisions were found.'}
        selectionLabel={primarySegment === 'DECISION_HISTORY' ? 'Viewing' : 'In review'}
        selectedTaskLabel={primarySegment === 'DECISION_HISTORY' ? 'Viewing past Admin decision' : 'Reviewing selected transaction'}
        selectedId={prId}
        onSelect={(id) => guard.request(() => {
          setNotificationEventTarget(null);
          setPrId(id); setAction(''); setRemarks(''); setCheckedPR(false); setCheckedPOAuth(false); setCheckedPurchaseAuth(false);
          setFieldErrors(null); setSystemError(null); setSubmissionIssue(null);
          const pr = adminQueue.find((item) => item.id === id);
          if (pr?.status === PRStatus.Pending_Admin_Approval) {
            setAction('APPROVE'); setCheckedPR(true); setCheckedPOAuth(true); setCheckedPurchaseAuth(true);
          }
          setIsOption1Enabled(false); setOption1ProofFilePath(''); setAttachedFileName(null);
        })}>
        {!selectedPR ? <AdminEmptySelection kind="request" /> : <form onSubmit={handleAdminApproval} className="admin-review-form min-w-0 space-y-4" aria-busy={isPending}>
          <input type="text" required readOnly tabIndex={-1} aria-label="Selected requisition reference" className="sr-only" value={prId} />
          {fieldErrors?.prId?._errors && <FieldError>{fieldErrors.prId._errors[0]}</FieldError>}

          {!isDecisionHistoryRecord && <AdminFinalAction title={selectedActionLabel} description={selectedActionDescription}>
            <DecisionButtonGroup value={action} onChange={setAction} returnLabel="Return" />
            {fieldErrors?.action?._errors && <FieldError>{fieldErrors.action._errors[0]}</FieldError>}
            <ActionButton type="submit" aria-describedby="admin-decision-explanation" disabled={isPending}>{isPending ? 'Saving decision…' : 'Submit decision'}</ActionButton>
          </AdminFinalAction>}

          <AdminRequestPanels key={primarySegment + selectedPR.id + (notificationEventTarget?.prId === selectedPR.id ? notificationEventTarget.eventId || '' : '')}
            requestId={selectedPR.id} title={deriveItemSummaryTitle(selectedPR.itemsPayload)} status={selectedPR.status} departmentCode={selectedPR.department.code} readOnly={isDecisionHistoryRecord} logs={selectedPR.auditLogs}
            notificationEventId={notificationEventTarget?.prId === selectedPR.id ? notificationEventTarget.eventId : undefined}
            overview={<>
          {isDecisionHistoryRecord && <AdminRecordedDecision decision={latestAdminDecision(selectedPR)} />}
          <section aria-label="Request overview" className="admin-surface min-w-0 rounded-lg border border-slate-200 bg-white">
            <h2 className="text-base font-semibold text-slate-950">Request overview</h2>
            <p className="mt-2 text-xs text-emerald-800">{selectedPR.isDirectPoBypass ? 'Executive pre-approved' : 'Standard review'}</p>
            <dl className="admin-overview-grid mt-3 grid min-w-0 gap-4">
              <div className="min-w-0"><dt className="text-xs text-slate-600">Originating office</dt><dd className="mt-1 break-words text-sm font-medium leading-6 text-slate-900 [overflow-wrap:anywhere]">{selectedPR.department.name} ({selectedPR.department.code})</dd></div>
              <div><dt className="text-xs text-slate-600">Submitted</dt><dd className="mt-1 text-sm font-medium leading-6 text-slate-900">{new Date(selectedPR.createdAt).toLocaleDateString()}</dd></div>
              <div><dt className="text-xs text-slate-600">Request scope</dt><dd className="mt-1 text-sm font-medium leading-6 text-slate-900">{itemsList.length} line item{itemsList.length === 1 ? '' : 's'}</dd></div>
              <div className="min-w-0"><dt className="text-xs text-slate-600">Estimated value</dt><dd className={`mt-1 break-words text-sm leading-6 tabular-nums [overflow-wrap:anywhere] ${hasPrices ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>{hasPrices ? formatPeso(calculatedGrandTotal) : 'Not provided'}</dd></div>
              <div><dt className="text-xs text-slate-600">Time in current stage</dt><dd><WaitingTime record={selectedPR} /></dd></div>
            </dl>
          </section>

          <AdminSection title="Reason for the request" description="The justification saved by the Requesting Office."><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{selectedPR.justification}</p></AdminSection>
          <AdminSection title="Requested items" description="Review the saved item details and quantities before recording a decision.">
            {itemsList.length > 0 ? <ol className="space-y-3">{itemsList.map((item, idx) => {
              const unitPrice = item.unitPrice || 0;
              const subtotal = unitPrice * item.quantity;
              return <li key={idx} className="admin-item-row grid min-w-0 gap-3 rounded-lg border border-slate-200 p-3">
                <div className="min-w-0"><p className="text-xs text-slate-600">Item {idx + 1}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-900 [overflow-wrap:anywhere]">{item.itemName}</p></div>
                <dl className={`grid min-w-0 gap-3 ${hasPrices ? 'sm:grid-cols-3' : ''}`}>
                  <div><dt className="text-xs text-slate-600">Quantity</dt><dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{item.quantity}</dd></div>
                  {hasPrices && <><div className="min-w-0"><dt className="text-xs text-slate-600">Unit price</dt><dd className="mt-1 break-words text-sm tabular-nums text-slate-900 [overflow-wrap:anywhere]">{unitPrice > 0 ? formatPeso(unitPrice) : '—'}</dd></div><div className="min-w-0"><dt className="text-xs text-slate-600">Subtotal</dt><dd className="mt-1 break-words text-sm font-semibold tabular-nums text-slate-900 [overflow-wrap:anywhere]">{subtotal > 0 ? formatPeso(subtotal) : '—'}</dd></div></>}
                </dl>
              </li>;
            })}</ol> : <p className="text-sm leading-6 text-slate-600">No itemized schedule is available for this requisition.</p>}
            {hasPrices && <p className="mt-4 break-words border-t border-slate-200 pt-4 text-sm font-semibold tabular-nums text-emerald-900 [overflow-wrap:anywhere]">Estimated total: {formatPeso(calculatedGrandTotal)}</p>}
          </AdminSection>

            </>}
            reviews={<>
              {isDecisionHistoryRecord ? <AdminDecisionContext status={selectedPR.status} logs={selectedPR.auditLogs} /> : <AdminPendingReviews logs={selectedPR.auditLogs || []} />}
          {selectedPR.adminProofFilePath && <AdminSection title="Supporting approval document" description="The saved executive approval evidence attached to this request.">
            <a href={selectedPR.adminProofFilePath} target="_blank" rel="noreferrer" className="inline-flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"><ExternalLink className="size-4 shrink-0" aria-hidden="true" />Open source document<span className="text-xs font-normal">(opens in a new tab)</span></a>
            {isImageFile(selectedPR.adminProofFilePath) ? <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-2"><img src={selectedPR.adminProofFilePath} alt="Pre-Approved Executive Letter" className="mx-auto max-h-[40dvh] w-auto max-w-full rounded-md object-contain" /></div> : <p className="mt-4 flex items-center gap-2 text-sm text-slate-700"><FileText className="size-5 shrink-0" aria-hidden="true" />Attached executive approval document</p>}
            <p className="mt-3 break-all font-mono text-xs leading-5 text-slate-600">{selectedPR.adminProofFilePath}</p>
          </AdminSection>}

              {!selectedPR.adminProofFilePath && <Card><p className="text-sm text-slate-600">No supporting approval document is saved for this request.</p></Card>}
            </>} />
          <div id="admin-decision-controls" tabIndex={-1} className="min-w-0 space-y-4 focus:outline-none">
          {!isDecisionHistoryRecord && <>

            {action === 'APPROVE' && <AdminSection title="Required executive authorizations" description="All three authorizations are required to approve this requisition.">
              <p className={`mb-4 text-sm font-medium ${authorizationCount === 3 ? 'text-emerald-800' : 'text-slate-700'}`}>{authorizationCount} of 3 verified</p>
              <div className="space-y-3">
                <CheckItem id="chk-pr" checked={checkedPR} onChange={setCheckedPR} label="Approval of Purchase Request" description="Official verification that requested purchase aligns with institutional academic objectives." />
                <CheckItem id="chk-po" checked={checkedPOAuth} onChange={setCheckedPOAuth} label="Authorization to Prepare Purchase Order" description="Granting Purchasing Office clearance to bind vendor specifications and generate hard copy PO." />
                <CheckItem id="chk-item" checked={checkedPurchaseAuth} onChange={setCheckedPurchaseAuth} label="Authorization to Procure Requested Items" description="Authorizing business disbursement and financial check release." />
              </div>
              <div className="mt-4 border-t border-slate-200 pt-4">
                <CheckItem id="chk-option1-toggle" checked={isOption1Enabled} onChange={(checked) => { setIsOption1Enabled(checked); if (!checked) { setOption1ProofFilePath(''); setAttachedFileName(null); } }} label="Enable Option 1: Off-Campus Remote Sign-Off" description="Use only when the Head of Office is off-campus and granted remote approval via messaging." />
              </div>
              {isOption1Enabled && <div className="mt-4 min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-900">Remote approval evidence</h3><p id="remote-proof-help" className="mt-1 text-sm leading-6 text-slate-600">Attach the message screenshot or remote sign-off document supporting this authorization. PDF or image.</p>
                {attachedFileName || option1ProofFilePath ? <div className="mt-4 flex min-w-0 flex-col gap-3 rounded-lg border border-emerald-200 bg-white p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">{attachedFileName || 'Proof Document Attached'}</p><p className="mt-1 break-all font-mono text-xs leading-5 text-slate-600">{option1ProofFilePath}</p></div>
                  <button type="button" onClick={() => { setOption1ProofFilePath(''); setAttachedFileName(null); }} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-rose-300 px-3 text-sm font-semibold text-rose-800 hover:bg-rose-50">Remove</button>
                </div> : <div className="mt-4"><FieldLabel htmlFor="proof-file-input">Attach remote sign-off proof</FieldLabel><input id="proof-file-input" type="file" accept="application/pdf,image/*" onChange={handleProofFileUpload} aria-describedby={`remote-proof-help${fieldErrors?.adminProofFilePath?._errors?.length ? ' remote-proof-error' : ''}`} aria-invalid={Boolean(fieldErrors?.adminProofFilePath?._errors?.length)} className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-700 file:mr-3 file:min-h-9 file:rounded-md file:border-0 file:bg-emerald-50 file:px-3 file:text-sm file:font-semibold file:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" /></div>}
                {fieldErrors?.adminProofFilePath?._errors && <FieldError id="remote-proof-error">{fieldErrors.adminProofFilePath._errors[0]}</FieldError>}
              </div>}
            </AdminSection>}
            {(action === 'APPROVE' || action === 'RETURN_FOR_CORRECTION' || action === 'DECLINE') && <AdminSection title={action === 'APPROVE' ? 'Executive remarks' : action === 'RETURN_FOR_CORRECTION' ? 'Corrections required' : 'Reason for declining'}>
              <FieldLabel htmlFor="admin-remarks">{action === 'APPROVE' ? 'Executive remarks (optional)' : action === 'RETURN_FOR_CORRECTION' ? 'Reason for return for correction' : 'Reason for declining'}</FieldLabel>
              <textarea id="admin-remarks" required={action !== 'APPROVE'} rows={action === 'APPROVE' ? 3 : 4} className={`${inputClass(!!fieldErrors?.remarks)} resize-y`} placeholder={action === 'APPROVE' ? 'Add an executive note for the audit trail, if needed…' : action === 'RETURN_FOR_CORRECTION' ? 'Detail the specific corrections required for the department…' : 'Document the reason for declining this request…'} value={remarks} onChange={(e) => setRemarks(e.target.value)} aria-invalid={Boolean(fieldErrors?.remarks?._errors?.length)} aria-describedby={`admin-remarks-help${fieldErrors?.remarks?._errors?.length ? ' admin-remarks-error' : ''}`} />
              <p id="admin-remarks-help" className="mt-2 text-xs leading-5 text-slate-600">{action === 'APPROVE' ? 'Optional. The existing default approval note is used when a full note is not provided.' : 'At least 5 characters. This explanation becomes part of the requisition audit trail.'}</p>
              {fieldErrors?.remarks?._errors && <FieldError id="admin-remarks-error">{fieldErrors.remarks._errors[0]}</FieldError>}
            </AdminSection>}
            <p id="admin-decision-explanation" className="text-xs leading-5 text-slate-600">{selectedActionDescription}</p>
          </>}
          </div>
        </form>}
      </ReviewWorkspace>}
    </PageShell>
  );
}
