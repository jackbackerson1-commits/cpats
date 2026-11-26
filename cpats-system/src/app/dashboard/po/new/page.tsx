// src/app/dashboard/po/new/page.tsx
'use client';

import { useUnsavedChanges } from '@/components/ui/UnsavedChanges';
import { SubmissionFeedback } from '@/components/ui/SubmissionFeedback';
import { describeSubmissionIssue, SubmissionResponseError, type SubmissionIssue } from '@/shared/submission-feedback';
import { actionFeedback, submissionFeedbackError } from '@/components/ui/action-feedback';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { Role, PRStatus, type PurchaseMethod } from '@prisma/client';
import { AuthUser } from '@/shared/session';
import QRCodeSVG from '@/components/ui/QRCodeSVG';
import PrintQrLabels from '@/components/ui/PrintQrLabels';
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
  QueueTask,
} from '@/components/purchasing/PurchasingUI';
import { deriveItemSummaryTitle } from '@/components/ui/WorkflowUI';
import { normalizeReportItems } from '@/shared/monthly-report';
import { PURCHASE_METHODS, PURCHASE_METHOD_LABELS } from '@/shared/purchase-method';
import '@/components/purchasing/po-preparation-workspace.css';

interface ZodSubErrors {
  _errors?: string[];
}

interface ZodFormErrors {
  purchaseRequestId?: ZodSubErrors;
  poNumber?: ZodSubErrors;
  purchaseMethod?: ZodSubErrors;
}

const paymentGuidance: Record<PurchaseMethod, string> = {
  LOCAL_CASH: 'Business Office records financial clearance and the check for this local purchase.',
  ONLINE_CASH: 'After saving the PO, open its checkout, attach the screenshot under PO supporting documents, then submit it with the final amount for Business Office review.',
  SUPPLIER_CREDIT: 'Business Office records financial clearance. Add the supplier’s Statement of Account to the PO’s supporting documents when it arrives.',
};

interface ApprovedPRQueueNode {
  id: string;
  justification: string;
  itemsPayload?: unknown;
  status: PRStatus;
  createdAt: string;
  auditLogs?: import('@/shared/queue-insights').QueueTiming['auditLogs'];
  department: { code: string; name: string };
}

interface PendingOnlineCheckout {
  id: string;
  poNumber: string;
  purchaseRequestId: string;
  purchaseRequest: { department: { code: string } };
}

function SavedCheckoutPanel({ orders, initiallyOpen }: {
  orders: PendingOnlineCheckout[];
  initiallyOpen: boolean;
}) {
  return (
    <section aria-labelledby="pending-checkouts-title" className="po-saved-checkouts min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-2">
      <details className="group min-w-0" open={initiallyOpen}>
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 py-2 text-slate-950">
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 -rotate-90 text-emerald-800 group-open:rotate-0" />
          <h2 id="pending-checkouts-title" className="min-w-0 font-semibold">Saved online checkouts</h2>
        </summary>
        <p className="text-sm leading-5 text-slate-600">Submit the final amount and screenshot to send a saved PO to Business Office.</p>
        <ul className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {orders.map(po => (
            <li key={po.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm">
              <p className="min-w-0 wrap-anywhere py-2"><strong>{po.poNumber}</strong> · {po.purchaseRequest.department.code}</p>
              <Link href={`/dashboard/po/online?poId=${po.id}`} aria-label={`Continue checkout for ${po.poNumber}`}
                className="inline-flex min-h-11 items-center font-semibold text-emerald-800 underline">Continue checkout</Link>
            </li>
          ))}
        </ul>
      </details>
      <Link href="/dashboard/po/online" className="inline-flex min-h-11 items-center py-2 text-sm font-semibold text-emerald-800 underline">View all online cash purchases</Link>
    </section>
  );
}

function SparkIcon({ className = 'size-4 shrink-0' }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><path d="m13 2-8 12h6l-1 8 9-13h-6l0-7Z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activeUser, setActiveUser] = useState<AuthUser | null>(null);
  const [userLoading, setUserLoading] = useState<boolean>(true);

  const [purchaseRequestId, setPurchaseRequestId] = useState<string>('');
  const [poNumber, setPoNumber] = useState<string>('');
  const [numberSuggested, setNumberSuggested] = useState(false);
  const [purchaseMethod, setPurchaseMethod] = useState<PurchaseMethod | ''>('');
  const [custodyConfirmed, setCustodyConfirmed] = useState<boolean>(false);

  const [createdPoDetails, setCreatedPoDetails] = useState<{
    id: string;
    poNumber: string;
    qrCodeToken: string;
    purchaseMethod: PurchaseMethod;
    departmentCode?: string;
    prId?: string;
  } | null>(null);

  const [purchasingQueue, setPurchasingQueue] = useState<ApprovedPRQueueNode[]>([]);
  const [pendingOnlineCheckouts, setPendingOnlineCheckouts] = useState<PendingOnlineCheckout[]>([]);
  const [queueLoading, setQueueLoading] = useState<boolean>(true);

  const [submissionIssue, setSubmissionIssue] = useState<SubmissionIssue | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ZodFormErrors | null>(null);
  const [transactionSuccess, setTransactionSuccess] = useState<string | null>(null);
  const notificationTargetHandled = useRef(false);
  const savedPoRef = useRef<HTMLElement>(null);
  const guard = useUnsavedChanges(!!poNumber || !!purchaseMethod || custodyConfirmed, { enabled: !userLoading && activeUser?.role === Role.Purchasing_Office, blocked: isPending && !!purchaseRequestId });

  useEffect(() => {
    if (!createdPoDetails) return;
    savedPoRef.current?.focus({ preventScroll: true });
    savedPoRef.current?.scrollIntoView({ block: 'start' });
  }, [createdPoDetails]);

  const syncPurchasingQueue = async (userRole: Role) => {
    try {
      const response = await fetch('/api/pr/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: userRole }),
      });
      const resData = await response.json();
      if (response.ok) {
        const activeTasks = (resData.data || []).filter(
          (item: ApprovedPRQueueNode) => item.status === PRStatus.Approved_Awaiting_PO
        );
        const pending: PendingOnlineCheckout[] = resData.pendingOnlineCheckouts || [];
        setPurchasingQueue(activeTasks);
        setPendingOnlineCheckouts(pending);
        if (!notificationTargetHandled.current) {
          notificationTargetHandled.current = true;
          const targetId = new URLSearchParams(window.location.search).get('prId');
          if (targetId) {
            const target = activeTasks.find((item: ApprovedPRQueueNode) => item.id === targetId);
            if (target) setPurchaseRequestId(target.id);
            else if (!pending.some(po => po.purchaseRequestId === targetId)) {
              setRuntimeError('This request is no longer awaiting PO preparation. Check online purchases or Track Orders for its next step.');
            }
          }
        }
      } else {
        setRuntimeError('The Purchasing queues could not be loaded. Refresh to try again.');
      }
    } catch (err) {
      console.error('Queue sync failed:', err);
      setRuntimeError('The Purchasing queues could not be loaded. Refresh to try again.');
    } finally {
      setQueueLoading(false);
    }
  };

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data) {
          setActiveUser(res.data);
          syncPurchasingQueue(res.data.role);
        }
      })
      .catch(() => setRuntimeError('Failed to load session context. Please refresh.'))
      .finally(() => setUserLoading(false));
  }, []);

  const handleGeneratePoNumber = () => {
    const year = new Date().getFullYear();
    const randomSeq = Math.floor(1000 + Math.random() * 9000);
    setPoNumber(`PO-${year}-${randomSeq}`);
  };

  const handlePurchaseOrderGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    setRuntimeError(null); setSubmissionIssue(null);
    setValidationErrors(null);
    setTransactionSuccess(null);

    if (!activeUser || activeUser.role !== Role.Purchasing_Office) {
      setRuntimeError('Access denied. Only Purchasing Office accounts can generate POs.');
      return;
    }

    if (!custodyConfirmed) {
      setRuntimeError('You must confirm custody and preparation of the Purchase Order before proceeding.');
      return;
    }
    if (!purchaseMethod) {
      setValidationErrors({ purchaseMethod: { _errors: ['Choose a payment method for this purchase order.'] } });
      return;
    }

    const selectedPR = purchasingQueue.find((node) => node.id === purchaseRequestId);

    startTransition(async () => {
      let committed = false;
      try {
        const response = await fetch('/api/po/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ purchaseRequestId, poNumber, purchaseMethod }),
        });

        const result = await response.json();

        if (!response.ok || result.success === false) {
          if (response.status === 422 && result.errors) {
            setValidationErrors(result.errors);
            throw new SubmissionResponseError(response.status, 'Please check the highlighted fields below.');
          }
          throw new SubmissionResponseError(response.status, result.error || 'A system error occurred while generating the PO.');
        }

        committed = true;
        guard.clear();
        const nextStep = purchaseMethod === 'ONLINE_CASH'
          ? 'Submit the final checkout amount and screenshot for Business Office review.'
          : 'Business Office can now record financial clearance.';
        actionFeedback('Purchase Order prepared', nextStep);
        setCreatedPoDetails({
          id: result.data.id,
          poNumber: result.data.poNumber,
          qrCodeToken: result.data.qrCodeToken,
          purchaseMethod,
          departmentCode: selectedPR?.department.code || 'DMC',
          prId: purchaseRequestId,
        });

        setTransactionSuccess(`Purchase Order [${result.data.poNumber}] saved. ${nextStep}`);
        
        setPurchaseRequestId('');
        setPoNumber('');
        setPurchaseMethod('');
        setCustodyConfirmed(false);
        
        await syncPurchasingQueue(activeUser.role);
        router.refresh();
      } catch (err: unknown) {
        setSubmissionIssue({ ...describeSubmissionIssue(err, committed), reference: purchaseRequestId || undefined });
        if (!committed) submissionFeedbackError(err);
        else actionFeedback('Saved; refresh needed', 'Your action was recorded. Refresh the workspace to see the latest queue.', 'info');
        if (!committed) setRuntimeError((err as Error).message || 'Something went wrong. Please try again.');
      }
    });
  };

  if (userLoading) {
    return (
      <div className="min-h-dvh bg-slate-50 flex items-center justify-center text-sm text-slate-500 font-sans">
        Loading session context…
      </div>
    );
  }

  if (!activeUser || activeUser.role !== Role.Purchasing_Office) {
    return (
      <Card className="max-w-md w-full text-center mx-auto my-12">
        <h2 className="text-rose-700 font-bold text-sm">Access Restricted</h2>
        <p className="text-slate-500 text-xs mt-2 leading-relaxed">
          Your account is not authorized to generate Purchase Orders. Available to Purchasing Office profiles only.
        </p>
      </Card>
    );
  }

  const queueTasks: QueueTask[] = purchasingQueue.map((task) => ({
    id: task.id,
    title: deriveItemSummaryTitle(task.itemsPayload, task.justification),
    subtitle: task.department.code,
    createdAt: task.createdAt, department: `${task.department.code} · ${task.department.name}`, status: task.status, timing: task,
    dateLabel: new Date(task.createdAt).toLocaleDateString(),
    justificationPreview: task.justification,
  }));

  const selectedRequest = purchasingQueue.find((task) => task.id === purchaseRequestId);
  const selectedItems = normalizeReportItems(selectedRequest?.itemsPayload);
  const savesForCheckout = purchaseMethod === 'ONLINE_CASH';

  return (
    <PageShell className="po-preparation-page">
      <StageHeader
        title="Prepare purchase order"
        description="Choose an approved request to prepare a PO, or resume a saved online checkout."
        meta={{ label: 'Signed in as', value: activeUser.email }}
      />

      <SubmissionFeedback issue={submissionIssue} />
      {runtimeError && (!submissionIssue || runtimeError !== submissionIssue.message) && <ErrorBanner>{runtimeError}</ErrorBanner>}
      {createdPoDetails && (
        <section ref={savedPoRef} tabIndex={-1} aria-labelledby="po-saved-heading" className="min-w-0 space-y-4 rounded-xl border border-emerald-200 bg-white p-4 text-slate-900 shadow-xs sm:p-6">
          {transactionSuccess && <SuccessBanner>{transactionSuccess}</SuccessBanner>}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="w-full min-w-0 space-y-2 text-center sm:flex-1 sm:text-left">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="text-xs font-medium text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                  Purchase Order QR Reference
                </span>
                <span className="text-xs font-medium text-slate-700 bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
                  Dept: {createdPoDetails.departmentCode}
                </span>
              </div>
              <h2 id="po-saved-heading" className="mt-3 wrap-anywhere text-xl font-semibold tracking-tight text-slate-950">PO reference · {createdPoDetails.poNumber}</h2>
              <p className="text-sm text-slate-700">{PURCHASE_METHOD_LABELS[createdPoDetails.purchaseMethod]}</p>
              {createdPoDetails.purchaseMethod === 'ONLINE_CASH' && <Link href={`/dashboard/po/online?poId=${createdPoDetails.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 underline">Submit checkout amount and screenshot</Link>}
              <p className="text-xs text-slate-600 font-mono break-all max-w-md">
                PO reference token: <span className="text-slate-800 font-medium">{createdPoDetails.qrCodeToken}</span>
              </p>
              <div className="pt-2">
                <PrintQrLabels labels={[{ reference: createdPoDetails.poNumber, token: createdPoDetails.qrCodeToken, title: 'PURCHASE ORDER', detail: `Department: ${createdPoDetails.departmentCode}. This reference identifies the entire order.` }]}>
                  Print PO reference
                </PrintQrLabels>
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-xl shadow-md shrink-0 border border-emerald-400/40 text-center">
              <QRCodeSVG value={createdPoDetails.qrCodeToken} size={130} />
              <span className="block text-[9px] font-mono font-bold text-slate-700 mt-1.5 uppercase tracking-wider">DMC CPATS · PURCHASE ORDER</span>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">This QR identifies the whole order. Print it with the delivery paperwork so Receiving can find the PO. Individual equipment labels are registered after inspection and receipt.</p>
        </section>
      )}

      {pendingOnlineCheckouts.length > 0 && (
        <SavedCheckoutPanel orders={pendingOnlineCheckouts} initiallyOpen={purchasingQueue.length === 0} />
      )}

      <ReviewWorkspace
        compact
        queueTitle="Approved request queue"
        tasks={queueTasks}
        loading={queueLoading}
        emptyMessage={pendingOnlineCheckouts.length > 0
          ? 'No requests are ready for a new PO. You can continue a saved online checkout above.'
          : 'No approved requests are waiting for PO preparation.'}
        selectedId={purchaseRequestId}
        onSelect={(id) => guard.request(() => {
          if (id !== purchaseRequestId) setPurchaseMethod('');
          setPurchaseRequestId(id);
        })}
        selectionLabel="Preparing purchase order"
        selectedTaskLabel="Purchase order preparation"
      >
        <form onSubmit={handlePurchaseOrderGeneration} className="po-preparation-form space-y-6 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6">
          <section aria-label="Selected request overview" className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h2 className="font-semibold text-slate-950">{selectedRequest ? 'PO details' : 'Choose an approved request'}</h2>
            {selectedRequest ? (
              <>
                <p className="mt-1 wrap-anywhere text-sm leading-5 text-slate-600">{selectedRequest.department.name}</p>
                <details className="group mt-2 border-t border-slate-200">
                  <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-emerald-800">
                    <span className="inline-flex items-center gap-2"><ChevronDown aria-hidden="true" className="size-4 shrink-0 -rotate-90 group-open:rotate-0" />Request details</span>
                  </summary>
                  <h3 className="text-sm font-medium text-slate-800">Reason for the request</h3>
                  <p className="mt-1 wrap-anywhere whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedRequest.justification}</p>
                  {selectedItems.length > 0 && (
                    <>
                      <h3 className="mt-4 text-sm font-medium text-slate-800">Approved items ({selectedItems.length})</h3>
                      <ul className="mt-2 space-y-2">
                        {selectedItems.map((item, index) => (
                          <li key={index} className="flex min-w-0 flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3 text-sm sm:flex-row sm:justify-between">
                            <span className="min-w-0 wrap-anywhere leading-6 text-slate-800">{item.itemName}</span>
                            <span className="shrink-0 font-medium text-slate-700">Quantity: {item.quantity}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </details>
              </>
            ) : <p className="mt-1 text-sm leading-5 text-slate-600">Select a request from the queue to see its details and start the PO.</p>}
          </section>

          <div>
            <FieldLabel htmlFor="po-number">Purchase order number <span className="text-rose-700">*</span></FieldLabel>
            <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row">
              <input
                type="text"
                required
                className={`${inputClass(!!validationErrors?.poNumber)} min-w-0 flex-1 font-mono`}
                id="po-number"
                aria-invalid={!!validationErrors?.poNumber}
                aria-describedby={validationErrors?.poNumber ? 'po-number-error' : undefined}
                placeholder="e.g., PO-2026-8891"
                value={poNumber}
                onChange={(event) => { setPoNumber(event.target.value); setNumberSuggested(false); }}
              />
              <button
                type="button"
                onClick={() => { handleGeneratePoNumber(); setNumberSuggested(true); }}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              >
                <SparkIcon className="size-3.5 shrink-0" />
                Suggest PO number
              </button>
            </div>
            <div role="status" className="text-sm text-emerald-800">
              {numberSuggested && poNumber && <p className="mt-2">Suggested {poNumber}. You can edit it.</p>}
            </div>
            {validationErrors?.poNumber?._errors && (
              <FieldError id="po-number-error">{validationErrors.poNumber._errors[0]}</FieldError>
            )}
          </div>

          <div>
            <FieldLabel htmlFor="po-payment-method">Payment method <span className="text-rose-700">*</span></FieldLabel>
            <select id="po-payment-method" required className={inputClass(!!validationErrors?.purchaseMethod)}
              aria-invalid={Boolean(validationErrors?.purchaseMethod)}
              aria-describedby={validationErrors?.purchaseMethod ? 'po-payment-error' : purchaseMethod ? 'po-payment-help' : undefined}
              value={purchaseMethod} onChange={(event) => setPurchaseMethod(event.target.value as PurchaseMethod | '')}>
              <option value="">Choose a payment method</option>
              {PURCHASE_METHODS.map(method => <option key={method} value={method}>{PURCHASE_METHOD_LABELS[method]}</option>)}
            </select>
            {purchaseMethod && <p id="po-payment-help" className="mt-2 text-sm text-slate-600">{paymentGuidance[purchaseMethod]}</p>}
            {validationErrors?.purchaseMethod?._errors && <FieldError id="po-payment-error">{validationErrors.purchaseMethod._errors[0]}</FieldError>}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <span className="mb-3 block text-sm font-semibold text-slate-800">
              Document custody confirmation
            </span>
            <CheckItem
              id="custody-chk"
              checked={custodyConfirmed}
              onChange={setCustodyConfirmed}
              label="Confirm PO Preparation & Custody"
              description="I affirm that the hard copy of this Purchase Order has been prepared, printed, and is ready for transmission to the Business Office for financial clearance."
            />
          </div>

          <div className="po-preparation-reference">
            <FieldLabel htmlFor="po-request-reference">Request reference</FieldLabel>
            <input
              type="text"
              required
              readOnly
              id="po-request-reference"
              aria-invalid={!!validationErrors?.purchaseRequestId}
              aria-describedby={validationErrors?.purchaseRequestId ? "po-request-error" : undefined}
              className={`${inputClass(!!validationErrors?.purchaseRequestId)} font-mono text-slate-600`}
              placeholder="Select an approved request from the list..."
              value={purchaseRequestId}
            />
            {validationErrors?.purchaseRequestId?._errors && (
              <FieldError id="po-request-error">{validationErrors.purchaseRequestId._errors[0]}</FieldError>
            )}
          </div>
          <div className="po-preparation-actions flex flex-col items-start gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-sm leading-5 text-slate-600" aria-live="polite">
              {savesForCheckout
                ? 'Save the PO and its QR reference. Submit the checkout separately for Business Office review.'
                : purchaseMethod
                  ? 'Save the PO and its QR reference for Business Office financial clearance.'
                  : 'The payment method determines what happens after you prepare the PO.'}
            </p>
            <ActionButton className="w-full shrink-0 sm:w-auto" type="submit" disabled={isPending}>
              {isPending ? 'Saving purchase order…'
                : savesForCheckout ? 'Save PO for checkout'
                  : purchaseMethod ? 'Prepare PO for clearance' : 'Prepare PO'}
            </ActionButton>
          </div>
        </form>
      </ReviewWorkspace>
    </PageShell>
  );
}
