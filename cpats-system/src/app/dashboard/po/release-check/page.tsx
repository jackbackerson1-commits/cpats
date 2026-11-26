// src/app/dashboard/po/release-check/page.tsx
// Enterprise UI overhaul for Business Office Financial Clearance.

'use client';

import { useUnsavedForm } from '@/components/ui/UnsavedChanges';
import { SubmissionFeedback } from '@/components/ui/SubmissionFeedback';
import { describeSubmissionIssue, SubmissionResponseError, type SubmissionIssue } from '@/shared/submission-feedback';
import { actionFeedback, submissionFeedbackError } from '@/components/ui/action-feedback';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Role, PRStatus, type PaymentType, type PurchaseMethod } from '@prisma/client';
import { AuthUser } from '@/shared/session';
import { PageShell, StageHeader, Card, ErrorBanner, SuccessBanner, BusinessEmptySelection, QueueTask } from '@/components/business/BusinessUI';
import { BusinessEvaluationWorkspace as ReviewWorkspace } from '@/components/business/BusinessEvaluationWorkspace';
import { BusinessClearanceForm } from '@/components/business/BusinessClearanceForm';
import { PurchaseOrderDocuments } from '@/components/purchasing/PurchaseOrderDocuments';
import { ReviewRecordHeader } from '@/components/ui/ReviewPresentation';
import { ONLINE_PURCHASE_STAGE_LABELS, type OnlinePurchaseStage } from '@/shared/online-purchase';

interface ZodSubErrors { _errors?: string[]; }
interface ZodFormErrors {
  poId?: ZodSubErrors;
  paymentType?: ZodSubErrors;
  checkNumber?: ZodSubErrors;
  items?: Record<string, unknown>;
}
interface PurchaseOrderSummary { id: string; poNumber: string; isCheckIssued: boolean; paymentType: PaymentType; purchaseMethod?: PurchaseMethod | null; onlinePurchase?: { stage: OnlinePurchaseStage } | null; }
interface BillingItemNode { itemName: string; quantity: number; unitPrice: number; }
interface AwaitingCheckPRNode {
  id: string;
  justification: string;
  status: PRStatus;
  createdAt: string;
  auditLogs?: import('@/shared/queue-insights').QueueTiming['auditLogs'];
  department: { code: string; name: string };
  purchaseOrders: PurchaseOrderSummary[];
  itemsPayload?: BillingItemNode[] | unknown;
}

function deriveItemSummaryTitle(itemsPayload: unknown): string {
  if (!itemsPayload || !Array.isArray(itemsPayload) || itemsPayload.length === 0) return 'Purchase Order Requisition';
  const items = itemsPayload as BillingItemNode[];
  const firstItemName = items[0]?.itemName?.trim() || 'Purchased Item';
  const firstItemQty = items[0]?.quantity || 1;
  if (items.length === 1) return `${firstItemName} (x${firstItemQty})`;
  return `${firstItemName} (x${firstItemQty}) +${items.length - 1} more item${items.length - 1 > 1 ? 's' : ''}`;
}

export default function ReleaseCheckPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeUser, setActiveUser] = useState<AuthUser | null>(null);
  const [userLoading, setUserLoading] = useState<boolean>(true);
  const [poId, setPoId] = useState<string>('');
  const [legacyPaymentType, setLegacyPaymentType] = useState<PaymentType>('CASH_CHECK');
  const [checkNumber, setCheckNumber] = useState<string>('');
  const [billingItems, setBillingItems] = useState<BillingItemNode[]>([]);
  const [physicalCheckSigned, setPhysicalCheckSigned] = useState<boolean>(false);
  const [ledgerLogged, setLedgerLogged] = useState<boolean>(false);
  const [checkQueue, setCheckQueue] = useState<AwaitingCheckPRNode[]>([]);
  const [queueLoading, setQueueLoading] = useState<boolean>(true);
  const [queueUnavailable, setQueueUnavailable] = useState(false);
  const [submissionIssue, setSubmissionIssue] = useState<SubmissionIssue | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ZodFormErrors | null>(null);
  const [transactionSuccess, setTransactionSuccess] = useState<string | null>(null);
  const notificationTargetHandled = useRef(false);
  const selectedTask = checkQueue.find((task) => task.purchaseOrders.some((po) => po.id === poId));
  const selectedPO = selectedTask?.purchaseOrders.find((po) => po.id === poId);
  const paymentType = selectedPO?.purchaseMethod ? selectedPO.paymentType : legacyPaymentType;
  const unpricedCredit = selectedPO?.purchaseMethod === 'SUPPLIER_CREDIT';
  const guard = useUnsavedForm(poId, { paymentType, checkNumber, billingItems, physicalCheckSigned, ledgerLogged }, { enabled: !userLoading && activeUser?.role === Role.Business_Office && !!poId, blocked: isPending && !!poId });

  const syncCheckReleaseQueue = async (userRole: Role) => {
    try {
      const response = await fetch('/api/pr/queue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: userRole }),
      });
      const resData = await response.json();
      if (response.ok) {
        setQueueUnavailable(false);
        const awaitingTasks = (resData.data || []).filter((item: AwaitingCheckPRNode) => item.status === PRStatus.Awaiting_Check_Issuance);
        setCheckQueue(awaitingTasks);
        if (!notificationTargetHandled.current) {
          notificationTargetHandled.current = true;
          const targetId = new URLSearchParams(window.location.search).get('prId');
          if (targetId) {
            if (awaitingTasks.some((item: AwaitingCheckPRNode) => item.id === targetId)) handleTaskSelection(targetId, awaitingTasks);
            else setSystemError('This request is unavailable in Financial Clearance. Online POs appear after Purchasing submits the amount and checkout evidence.');
          }
        }
      }
      else setQueueUnavailable(true);
    } catch (err) {
      setQueueUnavailable(true);
      console.error('Queue sync failed:', err);
    } finally {
      setQueueLoading(false);
    }
  };

  const handlePriceChange = (index: number, newUnitPrice: number) => {
    const updated = [...billingItems];
    updated[index].unitPrice = Math.max(0, newUnitPrice);
    setBillingItems(updated);
  };

  const calculatedBilledTotal = billingItems.reduce((acc, item) => acc + (item.quantity * (item.unitPrice || 0)), 0);

  const handleFinancialClearanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSystemError(null); setSubmissionIssue(null); setValidationErrors(null); setTransactionSuccess(null);
    if (!activeUser || activeUser.role !== Role.Business_Office) {
      setSystemError('Access denied. Action restricted to Business Office profiles.'); return;
    }
    if (paymentType === 'CASH_CHECK' && (!physicalCheckSigned || !ledgerLogged)) {
      setSystemError('Both physical signatory checks and ledger entries must be verified before releasing the check.'); return;
    }

    startTransition(async () => {
      let committed = false;
      try {
        const payload = { poId, paymentType, ...(!unpricedCredit ? { items: billingItems } : {}), ...(paymentType === 'CASH_CHECK' ? { checkNumber } : {}) };
        const response = await fetch('/api/po/release-check', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok || result.success === false) {
          if (response.status === 422 && result.errors) { setValidationErrors(result.errors); throw new SubmissionResponseError(response.status, 'Please check the highlighted fields below.'); }
          throw new SubmissionResponseError(response.status, result.error || 'A transaction exception occurred while recording financial clearance.');
        }
        const successNotice = unpricedCredit
          ? 'Financial clearance granted under supplier credit. The PO has no recorded amount.'
          : paymentType === 'CREDIT_TERMS'
          ? `Financial clearance granted under Credit Terms. Total Billed: ₱${calculatedBilledTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
          : `Financial clearance authorized. Check [${checkNumber}] assigned. Total Billed: ₱${calculatedBilledTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;
        committed = true;
        guard.markClean();
        actionFeedback('Financial clearance recorded', successNotice);
        setTransactionSuccess(successNotice);
        setPoId(''); setLegacyPaymentType('CASH_CHECK'); setCheckNumber(''); setBillingItems([]); setPhysicalCheckSigned(false); setLedgerLogged(false);
        await syncCheckReleaseQueue(activeUser.role);
        router.refresh();
      } catch (err: unknown) {
        setSubmissionIssue({ ...describeSubmissionIssue(err, committed), reference: poId || undefined });
        if (!committed) submissionFeedbackError(err);
        else actionFeedback('Saved; refresh needed', 'Your action was recorded. Refresh the workspace to see the latest queue.', 'info');
        if (!committed) setSystemError((err as { message?: string }).message || 'Something went wrong. Please try again.');
      }
    });
  };

  const handleTaskSelection = (taskId: string, tasks: AwaitingCheckPRNode[] = checkQueue) => {
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      const unissuedPO = task.purchaseOrders.find((po) => !po.isCheckIssued || po.onlinePurchase);
      if (unissuedPO) {
        if (unissuedPO.id === poId) return;
        setPoId(unissuedPO.id);
        setLegacyPaymentType('CASH_CHECK');
        setCheckNumber('');
        setPhysicalCheckSigned(false);
        setLedgerLogged(false);
        setValidationErrors(null);
        if (Array.isArray(task.itemsPayload)) {
          const formatted = (task.itemsPayload as BillingItemNode[]).map((item) => ({ itemName: item.itemName || 'Item Description', quantity: Number(item.quantity) || 1, unitPrice: Number(item.unitPrice) || 0 }));
          setBillingItems(formatted);
        } else setBillingItems([]);
      } else {
        setPoId(''); setBillingItems([]); setSystemError('No pending Purchase Order found for this request.');
      }
    }
  };

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data) {
          setActiveUser(res.data);
          syncCheckReleaseQueue(res.data.role);
        }
      })
      .catch(() => setSystemError('Failed to load session context. Please refresh.'))
      .finally(() => setUserLoading(false));
  }, []);

  if (userLoading) return <div className="min-h-[60dvh] flex items-center justify-center text-sm font-medium text-slate-500 font-sans">Loading session context…</div>;
  if (!activeUser || activeUser.role !== Role.Business_Office) {
    return <Card className="max-w-md w-full text-center mx-auto my-12"><h2 className="text-rose-700 font-bold text-sm">Access Restricted</h2><p className="text-slate-500 text-xs mt-2 leading-relaxed">Your account isn’t authorized for financial clearances. Available to the Business Office only.</p></Card>;
  }

  const queueTasks: QueueTask[] = checkQueue.map((task) => {
    const poTarget = task.purchaseOrders.find((p) => !p.isCheckIssued || p.onlinePurchase);
    const poCode = poTarget ? poTarget.poNumber : 'PO Missing';
    return {
      id: task.id,
      title: deriveItemSummaryTitle(task.itemsPayload),
      subtitle: task.department?.code ? `${task.department.code} • ${poCode}` : poCode,
      createdAt: task.createdAt, department: `${task.department.code} · ${task.department.name}`, status: task.status, timing: task,
    dateLabel: new Date(task.createdAt).toLocaleDateString(),
      justificationPreview: task.justification,
    };
  });

  const checksVerified = Number(physicalCheckSigned) + Number(ledgerLogged);
  const quantityTotal = billingItems.reduce((sum, item) => sum + item.quantity, 0);
  const onlineStage = selectedPO?.onlinePurchase?.stage;
  const onlineStatus = onlineStage ? ONLINE_PURCHASE_STAGE_LABELS[onlineStage] : 'Awaiting checkout submission';
  const onlineLinkLabel = onlineStage === 'AWAITING_BO' ? 'Review submitted checkout'
    : onlineStage === 'AUTHORIZED' ? 'Open check release' : 'View online purchase';
  const selectedQueueTask = queueTasks.find(task => task.id === selectedTask?.id);

  return (
    <PageShell compact className="business-clearance-page">
      <StageHeader title="Financial clearance"
        description="Select a PO to review and clear it according to its payment method." />
      <p className="text-sm"><Link href="/dashboard/po/online" className="inline-flex min-h-11 items-center font-semibold text-emerald-800 underline">Review provisional online cash purchases</Link></p>
      <SubmissionFeedback issue={submissionIssue} />
      {systemError && (!submissionIssue || systemError !== submissionIssue.message) && <ErrorBanner>{systemError}</ErrorBanner>}
      {transactionSuccess && <SuccessBanner>{transactionSuccess}</SuccessBanner>}
      <ReviewWorkspace queueTitle="Financial clearance queue" tasks={queueTasks}
        loading={queueLoading} emptyMessage="No pending orders require financial clearance at this time."
        clearanceLayout queueUnavailable={queueUnavailable}
        hideRecordHeader={!!selectedPO}
        selectedId={selectedTask?.id || ''} onSelect={(id) => guard.request(() => handleTaskSelection(id))}
        selectedTaskLabel="Reviewing financial clearance">
        {!selectedTask ? <BusinessEmptySelection kind="order" /> : (
          <>
          {selectedPO?.onlinePurchase || selectedPO?.purchaseMethod === 'ONLINE_CASH' ? (
            <section aria-label="Online purchase overview" className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <h2 className="wrap-anywhere text-base font-semibold text-slate-950">{selectedPO.poNumber}</h2>
              <p className="wrap-anywhere font-semibold">{selectedQueueTask?.title}</p>
              <p className="wrap-anywhere text-slate-600">{selectedTask.department.name}</p>
              <p className="font-semibold text-amber-900">{onlineStatus}</p>
              <Link href={`/dashboard/po/online?poId=${poId}`} className="inline-flex min-h-11 items-center font-semibold text-emerald-800 underline">{onlineLinkLabel}</Link>
              {selectedQueueTask && <details>
                <summary className="min-h-11 cursor-pointer py-3 font-semibold text-slate-700">Request reason and reference</summary>
                <ReviewRecordHeader task={{ ...selectedQueueTask, status: onlineStatus }} showJustification />
              </details>}
            </section>
          ) : <BusinessClearanceForm selectedTask={selectedTask} selectedPO={selectedPO} poId={poId}
            itemSummary={deriveItemSummaryTitle(selectedTask.itemsPayload)} paymentType={paymentType} checkNumber={checkNumber} billingItems={billingItems}
            physicalCheckSigned={physicalCheckSigned} ledgerLogged={ledgerLogged}
            calculatedBilledTotal={calculatedBilledTotal} quantityTotal={quantityTotal} checksVerified={checksVerified}
            isPending={isPending} validationErrors={validationErrors}
            onSubmit={handleFinancialClearanceSubmit} onPriceChange={handlePriceChange}
            onPaymentTypeChange={setLegacyPaymentType} onCheckNumberChange={setCheckNumber}
            onPhysicalCheckSignedChange={setPhysicalCheckSigned} onLedgerLoggedChange={setLedgerLogged} />}
          <details key={poId} className="clearance-documents mt-4 rounded-lg border border-slate-200 bg-white">
            <summary id="clearance-documents-summary" className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">Supporting documents and RR / MR</summary>
            <div className="px-3 pb-3"><PurchaseOrderDocuments poId={poId} /></div>
          </details>
          </>
        )}
      </ReviewWorkspace>
    </PageShell>
  );
}
