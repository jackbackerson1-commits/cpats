// src/app/dashboard/pr/approve-admin/page.tsx
// Enterprise executive-review UI overhaul.
// Existing state, validation, queue synchronization, upload behavior, and API mutation contract are preserved.

'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ExternalLink, FileText } from 'lucide-react';
import { Role, PRStatus } from '@prisma/client';
import { AuthUser } from '@/shared/session';
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
  const [systemError, setSystemError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ZodFormErrors | null>(null);
  const [successStatus, setSuccessStatus] = useState<string | null>(null);
  const notificationTargetHandled = useRef(false);

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
        if (targetId) {
          const activeTarget = adminTasks.find((item) => item.id === targetId && item.status === PRStatus.Pending_Admin_Approval);
          const historicalTarget = historyTasks.find((item) => item.id === targetId);
          if (activeTarget) {
            setPrimarySegment('ACTION_REQUIRED');
            setPrId(activeTarget.id);
            notificationTargetHandled.current = true;
          } else if (historicalTarget) {
            setPrimarySegment('DECISION_HISTORY');
            setHistorySubFilter('ALL');
            setPrId(historicalTarget.id);
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
      setAttachedFileName(file.name);

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();

        if (res.ok && data.url) {
          setOption1ProofFilePath(data.url);
        }
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }
  };

  const handleAdminApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    setSystemError(null);
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

        if (!response.ok) {
          if (response.status === 422 && result.errors) {
            setFieldErrors(result.errors);
            throw new Error('Please review the highlighted fields below.');
          }

          throw new Error(
            result.error ||
              'The remote execution node rolled back the database transaction.',
          );
        }

        setSuccessStatus(
          `Executive order finalized. Request [${prId.substring(
            0,
            8,
          )}...] transitioned to: ${action}.`,
        );

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
        setSystemError(
          (err instanceof Error ? err.message : null) ||
            'A network or server disconnect interrupted ledger propagation.',
        );
      }
    });
  };

  if (userLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-sm font-medium text-slate-500 font-sans">
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

  const queueTasks: QueueTask[] = displayedQueue.map((task) => ({
    id: task.id,
    title: deriveItemSummaryTitle(task.itemsPayload),
    subtitle: primarySegment === 'DECISION_HISTORY'
      ? `${task.department?.code || 'OVPA'} • ${latestAdminDecision(task)?.newState === PRStatus.Approved_Awaiting_PO ? 'APPROVED' : latestAdminDecision(task)?.newState === PRStatus.Returned_for_Correction ? 'RETURNED' : 'DECLINED'}`
      : task.isDirectPoBypass ? `${task.department?.code || 'OVPA'} • PRE-APPROVED` : task.department?.code || 'OVPA',
    dateLabel: new Date(task.createdAt).toLocaleDateString(),
    justificationPreview: task.justification,
  }));

  const selectedPR = (primarySegment === 'DECISION_HISTORY' ? adminHistory : adminQueue).find((req) => req.id === prId);
  const isDecisionHistoryRecord = primarySegment === 'DECISION_HISTORY';
  const adminDecisionLog = selectedPR ? latestAdminDecision(selectedPR) : undefined;

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

  return (
    <PageShell>
      <StageHeader title="Executive requisition review"
        description="Review procurement evidence, confirm the required authorizations, and record the Admin Office decision."
        meta={{ label: 'Signed in as', value: activeUser.email }} />
      {systemError && <ErrorBanner>{systemError}</ErrorBanner>}
      {primarySegment === 'DECISION_HISTORY' && historyError && <ErrorBanner>{historyError}</ErrorBanner>}
      {successStatus && <SuccessBanner>{successStatus}</SuccessBanner>}

      <div className="space-y-3">
        <div role="group" aria-label="Executive queue view" className="flex flex-wrap gap-2">
          {([
            ['ACTION_REQUIRED', 'Action required', actionRequiredQueue.length],
            ['DECISION_HISTORY', 'Decision history', decisionHistoryQueue.length],
          ] as const).map(([key, label, count]) => <button key={key} type="button" aria-pressed={primarySegment === key}
            onClick={() => {
              setPrimarySegment(key); setPrId(''); setAction(''); setRemarks('');
              setCheckedPR(false); setCheckedPOAuth(false); setCheckedPurchaseAuth(false);
              setSystemError(null); setFieldErrors(null);
            }}
            className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${primarySegment === key ? 'border-emerald-800 bg-emerald-800 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
            {label}<span className={`rounded-md px-2 py-0.5 text-xs tabular-nums ${primarySegment === key ? 'bg-white/15' : 'bg-slate-100'}`}>{queueLoading ? '…' : count}</span>
          </button>)}
        </div>
        {primarySegment === 'DECISION_HISTORY' && <div role="group" aria-label="Admin decision history filters" className="flex flex-wrap gap-2">
          {([
            ['ALL', 'All', decisionHistoryQueue.length],
            ['APPROVED', 'Approved', decisionHistoryQueue.filter((item) => latestAdminDecision(item)?.newState === PRStatus.Approved_Awaiting_PO).length],
            ['RETURNED', 'Returned', decisionHistoryQueue.filter((item) => latestAdminDecision(item)?.newState === PRStatus.Returned_for_Correction).length],
            ['DECLINED', 'Declined', decisionHistoryQueue.filter((item) => latestAdminDecision(item)?.newState === PRStatus.Declined).length],
          ] as const).map(([key, label, count]) => <button key={key} type="button" aria-pressed={historySubFilter === key}
            onClick={() => { setHistorySubFilter(key); setPrId(''); }}
            className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${historySubFilter === key ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{label} {count}</button>)}
        </div>}
        <p className="text-sm leading-6 text-slate-600">{primarySegment === 'DECISION_HISTORY' ? 'Review the recorded Admin decision alongside each request’s current status. History is read only.' : 'Select a request to inspect its saved details, supporting evidence, and available decision controls.'}</p>
      </div>

      <ReviewWorkspace queueTitle={primarySegment === 'ACTION_REQUIRED' ? 'Executive review queue' : 'Decision history'} tasks={queueTasks} loading={queueLoading}
        emptyMessage={primarySegment === 'ACTION_REQUIRED' ? 'No requests are awaiting Admin Office review.' : 'No matching Admin Office decisions were found.'}
        selectionLabel={primarySegment === 'DECISION_HISTORY' ? 'Viewing' : 'In review'}
        selectedTaskLabel={primarySegment === 'DECISION_HISTORY' ? 'Viewing past Admin decision' : 'Reviewing selected transaction'}
        selectedId={prId}
        onSelect={(id) => {
          setPrId(id); setAction(''); setRemarks(''); setCheckedPR(false); setCheckedPOAuth(false); setCheckedPurchaseAuth(false);
          setFieldErrors(null); setSystemError(null);
          const pr = adminQueue.find((item) => item.id === id);
          if (pr?.status === PRStatus.Pending_Admin_Approval) {
            setAction('APPROVE'); setCheckedPR(true); setCheckedPOAuth(true); setCheckedPurchaseAuth(true);
          }
          setIsOption1Enabled(false); setOption1ProofFilePath(''); setAttachedFileName(null);
        }}>
        {!selectedPR ? <AdminEmptySelection kind="request" /> : <form onSubmit={handleAdminApproval} className="min-w-0 space-y-5 sm:space-y-6" aria-busy={isPending}>
          <input type="text" required readOnly tabIndex={-1} aria-label="Selected requisition reference" className="sr-only" value={prId} />
          {fieldErrors?.prId?._errors && <FieldError>{fieldErrors.prId._errors[0]}</FieldError>}

          <section aria-label="Request overview" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6">
            <div className="flex min-w-0 flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium text-emerald-800">{isDecisionHistoryRecord ? 'Past Admin decision' : 'Request under review'}</p>
                <h2 className="mt-2 break-words text-xl font-semibold leading-7 text-slate-950 [overflow-wrap:anywhere]">{deriveItemSummaryTitle(selectedPR.itemsPayload)}</h2>
                <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-600">PR {selectedPR.id}</p>
              </div>
              <span className="w-fit shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900">{selectedPR.isDirectPoBypass ? 'Executive pre-approved' : 'Standard review'}</span>
            </div>
            <dl className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="min-w-0"><dt className="text-xs text-slate-600">Originating office</dt><dd className="mt-1 break-words text-sm font-medium leading-6 text-slate-900 [overflow-wrap:anywhere]">{selectedPR.department.name} ({selectedPR.department.code})</dd></div>
              <div><dt className="text-xs text-slate-600">Submitted</dt><dd className="mt-1 text-sm font-medium leading-6 text-slate-900">{new Date(selectedPR.createdAt).toLocaleDateString()}</dd></div>
              <div><dt className="text-xs text-slate-600">Request scope</dt><dd className="mt-1 text-sm font-medium leading-6 text-slate-900">{itemsList.length} line item{itemsList.length === 1 ? '' : 's'}</dd></div>
              <div className="min-w-0"><dt className="text-xs text-slate-600">Estimated value</dt><dd className="mt-1 break-words text-sm font-semibold leading-6 tabular-nums text-slate-900 [overflow-wrap:anywhere]">{hasPrices ? formatPeso(calculatedGrandTotal) : 'Not provided'}</dd></div>
            </dl>
          </section>

          {isDecisionHistoryRecord && <section role="status" className="rounded-xl border border-slate-200 bg-slate-100 p-4 text-sm leading-6 text-slate-700 sm:p-6">
            <h2 className="font-semibold text-slate-950">Admin decision history · Read only</h2>
            <p className="mt-2">Recorded Admin decision: <strong>{adminDecisionLog?.newState === PRStatus.Approved_Awaiting_PO ? 'Approved' : adminDecisionLog?.newState === PRStatus.Returned_for_Correction ? 'Returned for correction' : 'Declined'}</strong>.</p>
            <p className="mt-1">Current request status: <strong>{selectedPR.status.replace(/_/g, ' ')}</strong>.</p>
            <p className="mt-2">Recorded details and decision notes remain available for reference. This view does not offer decision actions.</p>
          </section>}
          {isDecisionHistoryRecord && adminDecisionLog && <section className="min-w-0 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-6">
            <h2 className="text-base font-semibold text-amber-950">Recorded Admin Office decision</h2>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-amber-950 [overflow-wrap:anywhere]">{adminDecisionLog.remarks || 'No decision note was recorded.'}</p>
            <p className="mt-4 break-words border-t border-amber-200 pt-3 text-xs leading-5 text-amber-900 [overflow-wrap:anywhere]">{adminDecisionLog.actor.email} · {new Date(adminDecisionLog.createdAt).toLocaleString()}</p>
          </section>}

          {selectedPR.adminProofFilePath && <AdminSection title="Supporting approval document" description="The saved executive approval evidence attached to this request.">
            <a href={selectedPR.adminProofFilePath} target="_blank" rel="noreferrer" className="inline-flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"><ExternalLink className="size-4 shrink-0" aria-hidden="true" />Open source document<span className="text-xs font-normal">(opens in a new tab)</span></a>
            {isImageFile(selectedPR.adminProofFilePath) ? <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-2"><img src={selectedPR.adminProofFilePath} alt="Pre-Approved Executive Letter" className="mx-auto max-h-[420px] w-auto max-w-full rounded-md object-contain" /></div> : <p className="mt-4 flex items-center gap-2 text-sm text-slate-700"><FileText className="size-5 shrink-0" aria-hidden="true" />Attached executive approval document</p>}
            <p className="mt-3 break-all font-mono text-xs leading-5 text-slate-600">{selectedPR.adminProofFilePath}</p>
          </AdminSection>}

          <AdminSection title="Reason for the request" description="The justification saved by the Requesting Office."><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{selectedPR.justification}</p></AdminSection>
          <AdminSection title="Requested items" description="Review the saved item details and quantities before recording a decision.">
            {itemsList.length > 0 ? <ol className="divide-y divide-slate-200">{itemsList.map((item, idx) => {
              const unitPrice = item.unitPrice || 0;
              const subtotal = unitPrice * item.quantity;
              return <li key={idx} className="grid min-w-0 gap-3 py-4 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_minmax(180px,36%)]">
                <div className="min-w-0"><p className="text-xs text-slate-600">Item {idx + 1}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-900 [overflow-wrap:anywhere]">{item.itemName}</p></div>
                <dl className={`grid min-w-0 gap-3 ${hasPrices ? 'sm:grid-cols-3' : ''}`}>
                  <div><dt className="text-xs text-slate-600">Quantity</dt><dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{item.quantity}</dd></div>
                  {hasPrices && <><div className="min-w-0"><dt className="text-xs text-slate-600">Unit price</dt><dd className="mt-1 break-words text-sm tabular-nums text-slate-900 [overflow-wrap:anywhere]">{unitPrice > 0 ? formatPeso(unitPrice) : '—'}</dd></div><div className="min-w-0"><dt className="text-xs text-slate-600">Subtotal</dt><dd className="mt-1 break-words text-sm font-semibold tabular-nums text-slate-900 [overflow-wrap:anywhere]">{subtotal > 0 ? formatPeso(subtotal) : '—'}</dd></div></>}
                </dl>
              </li>;
            })}</ol> : <p className="text-sm leading-6 text-slate-600">No itemized schedule is available for this requisition.</p>}
            {hasPrices && <p className="mt-5 break-words border-t border-slate-200 pt-4 text-sm font-semibold tabular-nums text-emerald-900 [overflow-wrap:anywhere]">Estimated total: {formatPeso(calculatedGrandTotal)}</p>}
          </AdminSection>

          {selectedPR.auditLogs && selectedPR.auditLogs.length > 0 && <details className="group min-w-0 rounded-xl border border-slate-200 bg-white">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold text-slate-800 sm:px-6">Workflow history<ChevronDown className="size-4 shrink-0 transition group-open:rotate-180" aria-hidden="true" /></summary>
            <ol className="space-y-4 border-t border-slate-200 p-4 sm:p-6">{selectedPR.auditLogs.map((log, idx) => <li key={log.id || idx} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="break-words text-sm font-semibold text-slate-900">{log.newState.replace(/_/g, ' ')}</p>
              {log.remarks && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{log.remarks}</p>}
              <p className="mt-3 break-words text-xs leading-5 text-slate-600 [overflow-wrap:anywhere]">{log.actor.email} · {new Date(log.createdAt).toLocaleString()}</p>
            </li>)}</ol>
          </details>}

          {!isDecisionHistoryRecord && <>
            <AdminSection title="Admin Office decision" description="Choose the outcome to record for this request."><DecisionButtonGroup value={action} onChange={setAction} />{fieldErrors?.action?._errors && <FieldError>{fieldErrors.action._errors[0]}</FieldError>}</AdminSection>
            {action === 'APPROVE' && <AdminSection title="Required executive authorizations" description="All three authorizations are required to approve this requisition.">
              <p className={`mb-4 text-sm font-medium ${authorizationCount === 3 ? 'text-emerald-800' : 'text-slate-700'}`}>{authorizationCount} of 3 verified</p>
              <div className="space-y-3">
                <CheckItem id="chk-pr" checked={checkedPR} onChange={setCheckedPR} label="Approval of Purchase Request" description="Official verification that requested purchase aligns with institutional academic objectives." />
                <CheckItem id="chk-po" checked={checkedPOAuth} onChange={setCheckedPOAuth} label="Authorization to Prepare Purchase Order" description="Granting Purchasing Office clearance to bind vendor specifications and generate hard copy PO." />
                <CheckItem id="chk-item" checked={checkedPurchaseAuth} onChange={setCheckedPurchaseAuth} label="Authorization to Procure Requested Items" description="Authorizing business disbursement and financial check release." />
              </div>
              <div className="mt-5 border-t border-slate-200 pt-5">
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
            <AdminFinalAction title={selectedActionLabel} description={action === 'APPROVE' ? 'Approval authorizes the Purchasing Office to prepare the purchase order.' : action === 'RETURN_FOR_CORRECTION' ? 'The request is returned with your feedback through the existing correction process.' : action === 'DECLINE' ? 'The request will be declined. Your reason remains in its decision history.' : 'Choose an outcome above before recording the Admin Office decision.'}>
              <ActionButton type="submit" disabled={isPending}>{isPending ? 'Saving executive decision…' : 'Submit executive decision'}</ActionButton>
            </AdminFinalAction>
          </>}
        </form>}
      </ReviewWorkspace>
    </PageShell>
  );
}
