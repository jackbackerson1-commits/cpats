// src/app/dashboard/po/new/page.tsx
'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Role, PRStatus } from '@prisma/client';
import { AuthUser } from '@/shared/session';
import QRCodeSVG from '@/components/ui/QRCodeSVG';
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

interface ZodSubErrors {
  _errors?: string[];
}

interface ZodFormErrors {
  purchaseRequestId?: ZodSubErrors;
  poNumber?: ZodSubErrors;
}

interface ApprovedPRQueueNode {
  id: string;
  justification: string;
  itemsPayload?: unknown;
  status: PRStatus;
  createdAt: string;
  department: { code: string; name: string };
}

function PrintIcon({ className = 'size-4 shrink-0' }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v6H7z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
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
  const [custodyConfirmed, setCustodyConfirmed] = useState<boolean>(false);

  const [createdPoDetails, setCreatedPoDetails] = useState<{
    poNumber: string;
    qrCodeToken: string;
    departmentCode?: string;
    prId?: string;
  } | null>(null);

  const [purchasingQueue, setPurchasingQueue] = useState<ApprovedPRQueueNode[]>([]);
  const [queueLoading, setQueueLoading] = useState<boolean>(true);

  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ZodFormErrors | null>(null);
  const [transactionSuccess, setTransactionSuccess] = useState<string | null>(null);
  const notificationTargetHandled = useRef(false);

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
        setPurchasingQueue(activeTasks);
        if (!notificationTargetHandled.current) {
          notificationTargetHandled.current = true;
          const targetId = new URLSearchParams(window.location.search).get('prId');
          if (targetId) {
            const target = activeTasks.find((item: ApprovedPRQueueNode) => item.id === targetId);
            if (target) setPurchaseRequestId(target.id);
            else setRuntimeError('This request is no longer awaiting PO preparation. Its workflow status may have changed.');
          }
        }
      }
    } catch (err) {
      console.error('Queue sync failed:', err);
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
    setRuntimeError(null);
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

    const selectedPR = purchasingQueue.find((node) => node.id === purchaseRequestId);

    startTransition(async () => {
      try {
        const response = await fetch('/api/po/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ purchaseRequestId, poNumber }),
        });

        const result = await response.json();

        if (!response.ok) {
          if (response.status === 422 && result.errors) {
            setValidationErrors(result.errors);
            throw new Error('Please check the highlighted fields below.');
          }
          throw new Error(result.error || 'A system error occurred while generating the PO.');
        }

        setCreatedPoDetails({
          poNumber: result.data.poNumber,
          qrCodeToken: result.data.qrCodeToken,
          departmentCode: selectedPR?.department.code || 'DMC',
          prId: purchaseRequestId,
        });

        setTransactionSuccess(`Purchase Order [${poNumber}] prepared successfully. Dispatched to Business Office for payment modality clearance.`);
        
        setPurchaseRequestId('');
        setPoNumber('');
        setCustodyConfirmed(false);
        
        await syncPurchasingQueue(activeUser.role);
        router.refresh();
      } catch (err: unknown) {
        setRuntimeError((err as Error).message || 'Something went wrong. Please try again.');
      }
    });
  };

  if (userLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500 font-sans">
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
    dateLabel: new Date(task.createdAt).toLocaleDateString(),
    justificationPreview: task.justification,
  }));

  const selectedRequest = purchasingQueue.find((task) => task.id === purchaseRequestId);
  const selectedItems = normalizeReportItems(selectedRequest?.itemsPayload);

  return (
    <PageShell>
      <StageHeader
        eyebrow="Step 4-A of 6 · PO Preparation & Tag Generation"
        title="Prepare purchase order"
        description="Select an approved request, assign its PO number, and confirm document custody before sending it to Business Office for financial clearance."
        meta={{ label: 'Signed in as', value: activeUser.email }}
      />

      {runtimeError && <ErrorBanner>{runtimeError}</ErrorBanner>}
      {transactionSuccess && <SuccessBanner>{transactionSuccess}</SuccessBanner>}

      {createdPoDetails && (
        <div className="min-w-0 rounded-xl border border-emerald-200 bg-white p-5 text-slate-900 shadow-xs sm:p-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="w-full min-w-0 space-y-2 text-center sm:flex-1 sm:text-left">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="text-xs font-medium text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                  Official Asset Sticker Tag
                </span>
                <span className="text-xs font-medium text-slate-700 bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
                  Dept: {createdPoDetails.departmentCode}
                </span>
              </div>
              <h3 className="mt-3 break-words text-2xl font-semibold tracking-tight text-slate-950 [overflow-wrap:anywhere]">{createdPoDetails.poNumber}</h3>
              <p className="text-xs text-slate-600 font-mono break-all max-w-md">
                Cryptographic Token: <span className="text-slate-800 font-medium">{createdPoDetails.qrCodeToken}</span>
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-700"
              >
                  <span className="inline-flex items-center gap-1.5">
                    <PrintIcon className="size-4 shrink-0" />
                    <span>Print asset tag</span>
                  </span>
                </button>
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-xl shadow-md shrink-0 border border-emerald-400/40 text-center">
              <QRCodeSVG value={createdPoDetails.qrCodeToken} size={130} />
              <span className="block text-[9px] font-mono font-bold text-slate-700 mt-1.5 uppercase tracking-wider">DMC CPATS STICKER</span>
            </div>
          </div>
        </div>
      )}

      <ReviewWorkspace
        queueTitle="Approved request queue"
        tasks={queueTasks}
        loading={queueLoading}
        emptyMessage="No approved requests are currently waiting for PO generation."
        selectedId={purchaseRequestId}
        onSelect={setPurchaseRequestId}
        selectionLabel="Preparing purchase order"
        selectedTaskLabel="Purchase order preparation"
      >
        <form onSubmit={handlePurchaseOrderGeneration} className="space-y-6 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6">
          <section aria-label="Selected request overview" className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <p className="text-xs font-medium text-emerald-800">{purchaseRequestId ? 'Approved request' : 'Start with an approved request'}</p>
            <h2 className="mt-2 break-words text-lg font-semibold leading-7 text-slate-950 [overflow-wrap:anywhere]">{queueTasks.find((task) => task.id === purchaseRequestId)?.title || 'Choose a request from the queue'}</h2>
            {selectedRequest && <>
              <p className="mt-2 break-words text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{selectedRequest.department.name}</p>
              <div className="mt-4 border-t border-slate-200 pt-4"><h3 className="text-sm font-medium text-slate-800">Reason for the request</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{selectedRequest.justification}</p></div>
              {selectedItems.length > 0 && <details className="mt-4 border-t border-slate-200 pt-2">
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-emerald-700">Approved items · {selectedItems.length} line item{selectedItems.length === 1 ? '' : 's'}</summary>
                <ul className="mt-2 space-y-2">{selectedItems.map((item, index) => <li key={index} className="flex min-w-0 flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3 text-sm sm:flex-row sm:justify-between">
                  <span className="min-w-0 break-words leading-6 text-slate-800 [overflow-wrap:anywhere]">{item.itemName}</span><span className="shrink-0 font-medium text-slate-700">Quantity: {item.quantity}</span>
                </li>)}</ul>
              </details>}
            </>}
            {!purchaseRequestId && <p className="mt-2 text-sm leading-6 text-slate-600">The saved request reference and details will appear here. PO preparation sends the request to Business Office for payment clearance.</p>}
          </section>
          <div>
            <FieldLabel htmlFor="po-request-reference">Request reference</FieldLabel>
            <input
              type="text"
              required
              readOnly
              id="po-request-reference"
              aria-invalid={!!validationErrors?.purchaseRequestId}
              aria-describedby={validationErrors?.purchaseRequestId ? "po-request-error" : undefined}
              className={`${inputClass(!!validationErrors?.purchaseRequestId)} font-mono bg-slate-100 text-slate-600 cursor-not-allowed`}
              placeholder="Select an approved request from the list..."
              value={purchaseRequestId}
            />
            {validationErrors?.purchaseRequestId?._errors && (
              <FieldError id="po-request-error">{validationErrors.purchaseRequestId._errors[0]}</FieldError>
            )}
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <FieldLabel htmlFor="po-number">Purchase order number <span className="text-rose-700">*</span></FieldLabel>
              <button
                type="button"
                onClick={handleGeneratePoNumber}
                className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              >
                <span className="inline-flex items-center gap-1.5">
                  <SparkIcon className="size-3.5 shrink-0" />
                  <span>Suggest PO number</span>
                </span>
              </button>
            </div>
            <input
              type="text"
              required
              className={`${inputClass(!!validationErrors?.poNumber)} font-mono`}
              id="po-number"
              aria-invalid={!!validationErrors?.poNumber}
              aria-describedby={validationErrors?.poNumber ? "po-number-error" : undefined}
              placeholder="e.g., PO-2026-8891"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
            />
            {validationErrors?.poNumber?._errors && (
              <FieldError id="po-number-error">{validationErrors.poNumber._errors[0]}</FieldError>
            )}
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

          <div className="space-y-4 border-t border-slate-200 pt-5">
            <p className="text-sm leading-6 text-slate-600">After preparation, Business Office records the payment method and financial clearance.</p>
            <ActionButton className="w-full sm:w-auto" type="submit" disabled={isPending}>
              {isPending ? 'Preparing PO & Tag...' : 'Prepare PO & asset tag'}
            </ActionButton>
          </div>
        </form>
      </ReviewWorkspace>
    </PageShell>
  );
}
