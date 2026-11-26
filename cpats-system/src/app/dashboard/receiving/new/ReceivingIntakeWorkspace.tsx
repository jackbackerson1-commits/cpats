'use client';

import { useUnsavedChanges } from '@/components/ui/UnsavedChanges';
import { SubmissionFeedback } from '@/components/ui/SubmissionFeedback';
import { describeSubmissionIssue, SubmissionResponseError, type SubmissionIssue } from '@/shared/submission-feedback';
import { actionFeedback, submissionFeedbackError } from '@/components/ui/action-feedback';

import React, { useState, useEffect, useRef, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Role, PRStatus } from '@prisma/client';
import type { AuthUser } from '@/shared/session';
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
  ReceivingSection,
  ScannerDialog,
} from '@/components/receiving/ReceivingUI';
import { deriveItemSummaryTitle } from '@/components/ui/WorkflowUI';
import { normalizeReportItems } from '@/shared/monthly-report';
import '@/components/receiving/receiving-intake-workspace.css';

interface ZodSubErrors {
  _errors?: string[];
}

interface ZodFormErrors {
  purchaseOrderId?: ZodSubErrors;
  condition?: ZodSubErrors;
  invoiceFilePath?: ZodSubErrors;
  asssetImageFilePath?: ZodSubErrors;
  remarks?: ZodSubErrors;
}

interface PendingPOQueueNode {
  id: string;
  poNumber: string;
  qrCodeToken?: string;
  purchaseRequestId: string;
  purchaseRequest: {
    justification: string;
    itemsPayload?: unknown;
    status: PRStatus;
    createdAt: string;
    auditLogs?: import('@/shared/queue-insights').QueueTiming['auditLogs'];
    department: { code: string; name: string };
  };
}

type IconProps = { className?: string };

function QrScanIcon({ className = 'size-4 shrink-0' }: IconProps) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8zM14 14h2v2h-2z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ReceiptIcon({ className = 'size-4 shrink-0' }: IconProps) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21V3Z" strokeLinejoin="round" /><path d="M10 8h4M10 12h4M10 16h2" strokeLinecap="round" /></svg>;
}

function FolderUpIcon({ className = 'size-4 shrink-0' }: IconProps) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><path d="M3.5 7.5h6l1.8 2H20.5v8.8A2.2 2.2 0 0 1 18.3 20.5H5.7a2.2 2.2 0 0 1-2.2-2.2V7.5Z" strokeLinejoin="round" /><path d="m12 16 0-6m0 0-2.5 2.5M12 10l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function CameraIcon({ className = 'size-4 shrink-0' }: IconProps) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><path d="M4.5 8.5h3l1.3-2h6.4l1.3 2h3a1.8 1.8 0 0 1 1.8 1.8v7.2a1.8 1.8 0 0 1-1.8 1.8h-15A1.8 1.8 0 0 1 2.7 17.5v-7.2a1.8 1.8 0 0 1 1.8-1.8Z" strokeLinejoin="round" /><circle cx="12" cy="14" r="3" /></svg>;
}

function CheckIcon({ className = 'size-4 shrink-0' }: IconProps) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="m5 12.5 4.2 4.2L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function XIcon({ className = 'size-4 shrink-0' }: IconProps) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" /></svg>;
}

function VideoOffIcon({ className = 'size-4 shrink-0' }: IconProps) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}><path d="M3 7.5h10.5A2.5 2.5 0 0 1 16 10v4a2.5 2.5 0 0 1-2.5 2.5H3V7.5ZM16 10l4-2v8l-4-2" strokeLinecap="round" strokeLinejoin="round" /><path d="m4 4 16 16" strokeLinecap="round" /></svg>;
}

export default function ReceivingIntakeWorkspace({ initialRole }: { initialRole: Role | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activeUser, setActiveUser] = useState<Pick<AuthUser, 'role'> | null>(initialRole ? { role: initialRole } : null);
  const [userLoading, setUserLoading] = useState<boolean>(!initialRole);

  // Form State
  const [purchaseOrderId, setPurchaseOrderId] = useState<string>('');
  const [condition, setCondition] = useState<'Good' | 'Damaged' | ''>('');
  const [remarks, setRemarks] = useState<string>('');

  // Clean Upload States (No raw URLs exposed)
  const [invoiceFilePath, setInvoiceFilePath] = useState<string>('');
  const [invoiceFileName, setInvoiceFileName] = useState<string | null>(null);

  const [asssetImageFilePath, setAsssetImageFilePath] = useState<string>('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // Clearances
  const [quantityVerified, setQuantityVerified] = useState<boolean>(false);
  const [cameraViewportMapped, setCameraViewportMapped] = useState<boolean>(false);

  // Queues
  const [receivingQueue, setReceivingQueue] = useState<PendingPOQueueNode[]>([]);
  const [queueLoading, setQueueLoading] = useState<boolean>(true);

  // WebRTC Live QR Scanner Modal State
  const [showQrDecoderModal, setShowQrDecoderModal] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [scannedQrInput, setScannedQrInput] = useState<string>('');
  const [qrScanStatus, setQrScanStatus] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [submissionIssue, setSubmissionIssue] = useState<SubmissionIssue | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ZodFormErrors | null>(null);
  const [transactionSuccess, setTransactionSuccess] = useState<string | null>(null);
  const [completedRequestId, setCompletedRequestId] = useState('');
  const [pendingEvidence, setPendingEvidence] = useState(0);
  const guard = useUnsavedChanges(!!condition || !!remarks || !!invoiceFilePath || !!invoiceFileName || !!asssetImageFilePath || !!imagePreviewUrl || quantityVerified || cameraViewportMapped, { enabled: !userLoading && activeUser?.role === Role.Receiving_Custodian, blocked: pendingEvidence > 0 || (isPending && !!purchaseOrderId) });
  const notificationTargetHandled = useRef(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = actionsRef.current, form = bar?.closest('form');
    if (!bar || !form) return;
    const measure = () => form.style.setProperty('--receiving-action-height', `${bar.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(bar); measure();
    return () => { observer.disconnect(); form.style.removeProperty('--receiving-action-height'); };
  }, [userLoading]);

  const syncReceivingQueue = useCallback(async (userRole: Role) => {
    try {
      const response = await fetch('/api/pr/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: userRole }),
      });
      const resData = await response.json();
      if (response.ok) {
        setReceivingQueue(resData.data || []);
        if (!notificationTargetHandled.current) {
          notificationTargetHandled.current = true;
          const targetId = new URLSearchParams(window.location.search).get('prId');
          if (targetId) {
            const target = (resData.data as PendingPOQueueNode[]).find((item) => item.purchaseRequestId === targetId);
            if (target) setPurchaseOrderId(target.id);
            else router.replace(`/dashboard/receiving/history?prId=${encodeURIComponent(targetId)}`);
          }
        }
      }
    } catch (err) {
      console.error('Intake queue sync error:', err);
    } finally {
      setQueueLoading(false);
    }
  }, [router]);

  const stopCameraStream = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const matchAndSelectPO = (tokenQuery: string) => {
    const cleanQuery = tokenQuery.trim();
    if (cleanQuery.startsWith('ASSET-TOKEN-') || cleanQuery.startsWith('DMC-ASSET-')) {
      setQrScanStatus('This is an individual equipment label. Open the asset register to find that unit; scan a PO reference here.');
      return;
    }
    const matchedPO = receivingQueue.find(
      (po) =>
        po.qrCodeToken === cleanQuery ||
        po.poNumber === cleanQuery ||
        po.id === cleanQuery
    );

    if (matchedPO) {
      guard.request(() => {
      setPurchaseOrderId(matchedPO.id);
      setQrScanStatus(null);
      stopCameraStream();
      setShowQrDecoderModal(false);
      setScannedQrInput('');
      setTransactionSuccess(`QR Tag matched cleanly to Purchase Order [${matchedPO.poNumber}]. Workspace auto-populated.`);
      });
    } else {
      setQrScanStatus(`Discrepancy: Token [${cleanQuery.substring(0, 16)}...] does not match any shipment in active queue.`);
    }
  };

  const initBarcodeFrameScanner = () => {
    if (!('BarcodeDetector' in window)) return;

    try {
      // @ts-expect-error - BarcodeDetector is not included in the TypeScript DOM declarations
      const barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'data_matrix'] });

      const scanFrame = async () => {
        if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
          try {
            const detectedCodes = await barcodeDetector.detect(videoRef.current);
            if (detectedCodes && detectedCodes.length > 0) {
              const rawToken = detectedCodes[0].rawValue;
              if (rawToken) {
                matchAndSelectPO(rawToken);
                return;
              }
            }
          } catch {
            // Frame analysis skip
          }
        }
        animationFrameRef.current = requestAnimationFrame(scanFrame);
      };
      animationFrameRef.current = requestAnimationFrame(scanFrame);
    } catch (e) {
      console.warn('BarcodeDetector initialization error:', e);
    }
  };

  const startCameraStream = async () => {
    setQrScanStatus(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('WebRTC Camera stream API is not supported on this browser context.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
        initBarcodeFrameScanner();
      }
    } catch (err: unknown) {
      console.warn('Native camera stream unavailable:', err);
      setQrScanStatus('Camera stream unavailable. Please use manual token entry or a USB hardware scanner.');
      setIsCameraActive(false);
    }
  };

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data) {
          setActiveUser(res.data);
          syncReceivingQueue(res.data.role);
        }
      })
      .catch(() => setSystemError('Failed to load session context. Please refresh.'))
      .finally(() => setUserLoading(false));

    return () => {
      stopCameraStream();
    };
  }, [syncReceivingQueue]);

  const handleManualQrSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedQrInput.trim()) {
      setQrScanStatus('Please provide a valid PO QR Token code.');
      return;
    }
    matchAndSelectPO(scannedQrInput);
  };

  const handleInvoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPendingEvidence(count => count + 1);
    setInvoiceFileName(file.name);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      const result = await response.json();

      if (response.ok && result.url) {
        setInvoiceFilePath(result.url);
      } else {
        setSystemError(result.error || 'Failed to upload invoice.');
      }
    } catch (err) {
      setSystemError('A network error interrupted the invoice upload.');
    } finally { setPendingEvidence(count => count - 1); }
  };

  const handleHardwarePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPendingEvidence(count => count + 1);
    setImagePreviewUrl(URL.createObjectURL(file));

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      const result = await response.json();

      if (response.ok && result.url) {
        setAsssetImageFilePath(result.url);
        setCameraViewportMapped(true); // Auto-check the clearance box
      } else {
        setSystemError(result.error || 'Failed to upload hardware photo.');
      }
    } catch (err) {
      setSystemError('A network error interrupted the hardware photo upload.');
    } finally { setPendingEvidence(count => count - 1); }
  };

  const handleReceivingCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSystemError(null); setSubmissionIssue(null);
    setFieldErrors(null);
    setTransactionSuccess(null);

    if (!activeUser || activeUser.role !== Role.Receiving_Custodian) {
      setSystemError('Access denied. Profile credentials insufficient for cargo intake.');
      return;
    }

    if (!quantityVerified || !cameraViewportMapped) {
      setSystemError('Please confirm manifest quantity verification and visual inspection before finalizing.');
      return;
    }

    if (!condition) {
      setSystemError('Please select an asset condition status (Good or Damaged).');
      return;
    }

    if (!invoiceFilePath) {
      setSystemError('COMPLIANCE EXCEPTION: You must upload a scan or photo of the supplier invoice.');
      return;
    }

    // Dynamic Remarks Verification
    const finalRemarks = condition === 'Good'
      ? 'Asset received in good condition. Quantities match supplier manifest.'
      : remarks;

    if (condition === 'Damaged' && finalRemarks.trim().length < 5) {
      setSystemError('COMPLIANCE EXCEPTION: You must detail the damage in the inspection remarks (min 5 characters).');
      return;
    }

    startTransition(async () => {
      let committed = false;
      try {
        const response = await fetch('/api/receiving/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            purchaseOrderId,
            condition,
            invoiceFilePath,
            asssetImageFilePath,
            remarks: finalRemarks,
          }),
        });

        const result = await response.json();

        if (!response.ok || result.success === false) {
          if (response.status === 422 && result.errors) {
            setFieldErrors(result.errors);
            throw new SubmissionResponseError(response.status, 'Please review highlighted fields below.');
          }
          throw new SubmissionResponseError(response.status, result.error || 'A remote exception occurred while recording intake.');
        }

        committed = true;
        guard.clear();
        actionFeedback(condition === 'Damaged' ? 'Delivery recorded with damage' : 'Delivery recorded',
          `Purchase Order ${purchaseOrderId}: ${condition === 'Damaged' ? 'damage was recorded with your inspection remarks.' : 'receipt in good condition was recorded.'}`,
          condition === 'Damaged' ? 'warning' : 'success');
        setTransactionSuccess(condition === 'Damaged' ? 'Inspection saved with your damage remarks and attached evidence. The current workflow marks this request received and closed.' : 'Inspection saved with the attached evidence. This request is received and closed.');
        setCompletedRequestId(receivingQueue.find((po) => po.id === purchaseOrderId)?.purchaseRequestId || '');

        setPurchaseOrderId('');
        setCondition('');
        setInvoiceFilePath('');
        setInvoiceFileName(null);
        setAsssetImageFilePath('');
        setImagePreviewUrl(null);
        setRemarks('');
        setQuantityVerified(false);
        setCameraViewportMapped(false);

        await syncReceivingQueue(activeUser.role);
        router.refresh();
      } catch (err: unknown) {
        setSubmissionIssue({ ...describeSubmissionIssue(err, committed), reference: purchaseOrderId || undefined });
        if (!committed) submissionFeedbackError(err);
        else actionFeedback('Saved; refresh needed', 'Your action was recorded. Refresh the workspace to see the latest queue.', 'info');
        if (!committed) setSystemError((err as Error).message || 'Something went wrong. Please try again.');
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

  if (!activeUser || activeUser.role !== Role.Receiving_Custodian) {
    return (
      <Card className="max-w-md w-full text-center mx-auto my-12">
        <h2 className="text-rose-700 font-bold text-sm">Access Restricted</h2>
        <p className="text-slate-500 text-xs mt-2 leading-relaxed">
          Your account is not authorized for cargo receiving inspections. Available to Receiving Custodians only.
        </p>
      </Card>
    );
  }

  const queueTasks: QueueTask[] = receivingQueue.map((poNode) => ({
    id: poNode.id,
    title: deriveItemSummaryTitle(poNode.purchaseRequest.itemsPayload, poNode.purchaseRequest.justification),
    subtitle: poNode.poNumber,
    createdAt: poNode.purchaseRequest.createdAt, department: `${poNode.purchaseRequest.department.code} · ${poNode.purchaseRequest.department.name}`, status: poNode.purchaseRequest.status, timing: poNode.purchaseRequest,
    dateLabel: new Date(poNode.purchaseRequest.createdAt).toLocaleDateString(),
    justificationPreview: poNode.purchaseRequest.justification,
  }));

  const selectedPONode = receivingQueue.find((po) => po.id === purchaseOrderId);

  const selectedItems = normalizeReportItems(selectedPONode?.purchaseRequest.itemsPayload);

  return (
    <PageShell className="receiving-intake-page">
      <StageHeader
        waveBackground
        title="Receive and inspect delivery"
        description="Select a purchase order, attach the supplier invoice and a photo, then record the delivery’s quantities and physical condition."
      />
      <SubmissionFeedback issue={submissionIssue} />
      {systemError && (!submissionIssue || systemError !== submissionIssue.message) && <ErrorBanner>{systemError}</ErrorBanner>}
      {transactionSuccess && <SuccessBanner>{transactionSuccess}{completedRequestId && <Link href={`/dashboard/receiving/history?prId=${encodeURIComponent(completedRequestId)}`} className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-emerald-300 px-3 font-semibold">View saved inspection</Link>}</SuccessBanner>}
      <nav aria-label="Receiving records" className="receiving-intake-records flex flex-wrap gap-3">
        <span aria-current="page" className="inline-flex min-h-11 items-center rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white">Awaiting inspection ({receivingQueue.length})</span>
        <Link href="/dashboard/receiving/history" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700">Receiving history</Link>
        <Link href={purchaseOrderId ? `/dashboard/receiving/forms?poId=${purchaseOrderId}` : '/dashboard/receiving/forms'} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-emerald-800">Prepare RR / MR</Link>
      </nav>


      <ReviewWorkspace compact queueAction={<button type="button" onClick={() => { setShowQrDecoderModal(true); startCameraStream(); }} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 font-semibold text-emerald-800"><QrScanIcon />Scan or enter PO</button>} queueTitle="Awaiting inspection" tasks={queueTasks} loading={queueLoading}
        emptyMessage="No open physical deliveries are waiting for inspection." selectedId={purchaseOrderId}
        onSelect={(id) => guard.request(() => setPurchaseOrderId(id))} selectionLabel="Selected delivery" selectedTaskLabel="Delivery inspection">
        <form onSubmit={handleReceivingCommit} onFocusCapture={(event) => {
          const field = event.target;
          if (!(field instanceof HTMLElement) || !field.matches('input:not([type="file"]), textarea, select') || window.innerWidth >= 1024) return;
          requestAnimationFrame(() => {
            const bounds = field.getBoundingClientRect(), bar = actionsRef.current?.getBoundingClientRect();
            const header = document.querySelector('.receiving-intake-header')?.getBoundingClientRect();
            if (bounds.top < (header?.bottom || 0) || (bar && bounds.bottom > bar.top)) field.scrollIntoView({ block: 'center', behavior: 'auto' });
          });
        }} className="receiving-intake-form min-w-0 space-y-6">
          <ReceivingSection title="1. Identify the delivery" description="Choose a cleared purchase order from the queue or use its QR token or PO number.">
            <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-emerald-800">{selectedPONode ? 'Ready for receiving' : 'No delivery selected'}</p>
                <h3 className="mt-2 break-words text-lg font-semibold leading-7 text-slate-950 [overflow-wrap:anywhere]">{selectedPONode ? selectedPONode.poNumber : 'Select a purchase order'}</h3>
                {selectedPONode && <p className="mt-2 break-words text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{selectedPONode.purchaseRequest.department.name} ({selectedPONode.purchaseRequest.department.code})</p>}
              </div>
              <button type="button" onClick={() => { setShowQrDecoderModal(true); startCameraStream(); }}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
                <QrScanIcon />Scan or enter PO
              </button>
            </div>
            {selectedPONode && <details className="mt-4 rounded-lg border border-slate-200 p-4">
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-emerald-700">View request and item details</summary>
              <dl className="mt-3 min-w-0 space-y-4 text-sm"><div><dt className="font-medium text-slate-800">Request reference</dt><dd className="mt-1 break-all font-mono text-xs leading-6 text-slate-600">{selectedPONode.purchaseRequestId}</dd></div><div><dt className="font-medium text-slate-800">Reason for the request</dt><dd className="mt-1 whitespace-pre-wrap break-words leading-6 text-slate-600 [overflow-wrap:anywhere]">{selectedPONode.purchaseRequest.justification}</dd></div></dl>
              {selectedItems.length > 0 && <ul aria-label="Requested items and quantities" className="mt-4 space-y-2">{selectedItems.map((item, index) => <li key={index} className="flex min-w-0 flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:flex-row sm:justify-between">
                <span className="min-w-0 break-words leading-6 text-slate-800 [overflow-wrap:anywhere]">{item.itemName}</span><span className="shrink-0 font-medium text-slate-700">Quantity: {item.quantity}</span>
              </li>)}</ul>}
            </details>}
            <div className="receiving-intake-reference mt-5">
              <FieldLabel htmlFor="receiving-po-reference">Purchase order reference</FieldLabel>
              <input id="receiving-po-reference" type="text" required readOnly value={purchaseOrderId}
                aria-invalid={!!fieldErrors?.purchaseOrderId} aria-describedby={fieldErrors?.purchaseOrderId ? 'receiving-po-error' : undefined}
                className={`${inputClass(!!fieldErrors?.purchaseOrderId)} font-mono bg-slate-100 text-slate-600 cursor-not-allowed`}
                placeholder="Select a delivery or scan its QR token" />
              {fieldErrors?.purchaseOrderId?._errors && <FieldError id="receiving-po-error">{fieldErrors.purchaseOrderId._errors[0]}</FieldError>}
            </div>
          </ReceivingSection>

          <ReceivingSection title="2. Attach receiving evidence" description="Include the supplier invoice and a clear photo of the delivered equipment.">
            <div className="receiving-intake-evidence grid min-w-0 gap-4 lg:grid-cols-2">
              <div className="min-w-0 rounded-lg border border-slate-200 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><ReceiptIcon className="size-5 shrink-0 text-emerald-800" />Supplier invoice <span className="text-rose-700">*</span></h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">Attach a PDF, scan, or photo of the supplier invoice.</p>
                <div className="receiving-intake-upload mt-4 flex min-h-44 min-w-0 flex-col justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                  {invoiceFileName || invoiceFilePath ? <div className="space-y-4">
                    <p className="break-words text-sm font-medium leading-6 text-slate-800 [overflow-wrap:anywhere]">{invoiceFileName || 'Invoice Document Attached'}</p>
                    <button type="button" onClick={() => { setInvoiceFilePath(''); setInvoiceFileName(null); }}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-3 text-sm font-semibold text-rose-800 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-700"><XIcon />Remove invoice</button>
                  </div> : <div className="text-center">
                    <input type="file" accept="application/pdf,image/*" onChange={handleInvoiceUpload} className="peer sr-only" id="invoice-file-input" aria-label="Upload supplier invoice" aria-invalid={!!fieldErrors?.invoiceFilePath} aria-describedby={`receiving-invoice-help${fieldErrors?.invoiceFilePath ? ' receiving-invoice-error' : ''}`} />
                    <label htmlFor="invoice-file-input" className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-900 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-700"><FolderUpIcon />Upload invoice</label>
                    <p id="receiving-invoice-help" className="mt-3 text-xs leading-5 text-slate-600">PDF or image file</p>
                  </div>}
                </div>
                {fieldErrors?.invoiceFilePath?._errors && <FieldError id="receiving-invoice-error">{fieldErrors.invoiceFilePath._errors[0]}</FieldError>}
              </div>
              <div className="min-w-0 rounded-lg border border-slate-200 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><CameraIcon className="size-5 shrink-0 text-emerald-800" />Equipment photo <span className="text-rose-700">*</span></h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">Show the physical condition of the equipment on arrival.</p>
                <div className="receiving-intake-upload mt-4 flex min-h-44 min-w-0 flex-col justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                  {imagePreviewUrl ? <div className="space-y-3">
                    <img src={imagePreviewUrl} alt="Photo of the delivered equipment" className="h-48 w-full rounded-lg border border-slate-300 bg-white object-contain" />
                    <button type="button" onClick={() => { setAsssetImageFilePath(''); setImagePreviewUrl(null); setCameraViewportMapped(false); }}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-3 text-sm font-semibold text-rose-800 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-700"><XIcon />Remove photo</button>
                  </div> : <div className="text-center">
                    <input type="file" accept="image/*" capture="environment" onChange={handleHardwarePhotoSelect} className="peer sr-only" id="hardware-photo-input" aria-label="Capture or upload equipment photo" aria-invalid={!!fieldErrors?.asssetImageFilePath} aria-describedby={`receiving-photo-help${fieldErrors?.asssetImageFilePath ? ' receiving-photo-error' : ''}`} />
                    <label htmlFor="hardware-photo-input" className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-900 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-700"><CameraIcon />Capture or upload photo</label>
                    <p id="receiving-photo-help" className="mt-3 text-xs leading-5 text-slate-600">Use your device camera or choose an image</p>
                  </div>}
                </div>
                {fieldErrors?.asssetImageFilePath?._errors && <FieldError id="receiving-photo-error">{fieldErrors.asssetImageFilePath._errors[0]}</FieldError>}
              </div>
            </div>
          </ReceivingSection>

          <ReceivingSection title="3. Record the inspection" description="Confirm the delivered quantities and photo record, then select the equipment’s physical condition.">
            <div className="space-y-3">
              <CheckItem id="chk-qty" checked={quantityVerified} onChange={setQuantityVerified} label="Manifest Quantity Verification" description="I confirm unit quantities arriving physically match the numbers on the supplier invoice." />
              <CheckItem id="chk-cam" checked={cameraViewportMapped} onChange={setCameraViewportMapped} label="Physical Photo Record Captured" description="Photographic proof of physical condition has been captured and linked to the asset record." />
            </div>
            <fieldset className="mt-5" aria-describedby={fieldErrors?.condition ? 'receiving-condition-error' : undefined}>
              <legend className="mb-3 text-sm font-medium text-slate-800">Equipment condition <span className="text-rose-700">*</span></legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" aria-pressed={condition === 'Good'} onClick={() => { setCondition('Good'); setRemarks(''); }}
                  className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${condition === 'Good' ? 'border-emerald-700 bg-emerald-50 text-emerald-950' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}><CheckIcon />Good condition</button>
                <button type="button" aria-pressed={condition === 'Damaged'} onClick={() => setCondition('Damaged')}
                  className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 ${condition === 'Damaged' ? 'border-rose-700 bg-rose-50 text-rose-950' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}><XIcon />Damaged cargo</button>
              </div>
              {fieldErrors?.condition?._errors && <FieldError id="receiving-condition-error">{fieldErrors.condition._errors[0]}</FieldError>}
            </fieldset>
            {condition === 'Damaged' && <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4">
              <FieldLabel htmlFor="receiving-damage-remarks">Damage inspection remarks <span className="text-rose-700">*</span></FieldLabel>
              <p id="receiving-damage-help" className="mb-3 text-sm leading-6 text-slate-700">Describe the damage, missing parts, or packaging concerns. Enter at least 5 characters.</p>
              <textarea id="receiving-damage-remarks" required rows={3} className={inputClass(!!fieldErrors?.remarks)} placeholder="Describe the equipment’s condition on arrival…" value={remarks} onChange={(e) => setRemarks(e.target.value)}
                aria-invalid={!!fieldErrors?.remarks} aria-describedby={`receiving-damage-help${fieldErrors?.remarks ? ' receiving-damage-error' : ''}`} />
              {fieldErrors?.remarks?._errors && <FieldError id="receiving-damage-error">{fieldErrors.remarks._errors[0]}</FieldError>}
            </div>}
          </ReceivingSection>
          <div ref={actionsRef} className="receiving-intake-actions min-w-0 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
            <div className="min-w-0 flex-1"><h2 className="text-base font-semibold text-slate-950">Finalize receiving report</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">Check your evidence and inspection details. Finalizing records the receiving report and closes this procurement request.</p></div>
            <ActionButton type="submit" disabled={isPending} className="mt-4 w-full sm:w-auto">{isPending ? 'Saving Intake...' : 'Finalize receiving report'}</ActionButton>
          </div>
        </form>
      </ReviewWorkspace>

      {showQrDecoderModal && <ScannerDialog onClose={() => { stopCameraStream(); setShowQrDecoderModal(false); setQrScanStatus(null); }}>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
            <div className="min-w-0"><h2 id="receiving-scanner-title" className="text-lg font-semibold leading-7 text-slate-950">Find a purchase order</h2><p id="receiving-scanner-help" className="mt-2 text-sm leading-6 text-slate-600">Use the camera, a connected scanner, or enter a PO number or QR token.</p></div>
            <button type="button" onClick={() => { stopCameraStream(); setShowQrDecoderModal(false); setQrScanStatus(null); }} aria-label="Close scanner terminal"
              className="grid size-11 shrink-0 place-items-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-700"><XIcon /></button>
          </div>
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
            <video ref={videoRef} playsInline muted aria-label="Live QR scanner camera preview" className="h-full w-full object-cover" />
            {!isCameraActive && <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 p-4 text-center text-sm text-slate-200"><span className="inline-flex items-center gap-2"><VideoOffIcon />Camera preview offline</span><span className="mt-2 text-xs leading-5 text-slate-300">Use the entry field below if the camera is unavailable.</span></div>}
            {isCameraActive && <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg border-2 border-emerald-500/40"><div className="h-28 w-48 animate-pulse rounded-lg border-2 border-dashed border-emerald-400" /></div>}
          </div>
          {qrScanStatus && <p id="receiving-scan-status" role="alert" className="min-w-0 break-words rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-900 [overflow-wrap:anywhere]">{qrScanStatus}</p>}
          <form onSubmit={handleManualQrSubmit} className="space-y-4">
            <div><FieldLabel htmlFor="receiving-qr-input">QR token or PO number</FieldLabel><input id="receiving-qr-input" type="text" className={`${inputClass()} font-mono`} placeholder="PO-TOKEN-… or PO-2026-8891" value={scannedQrInput} onChange={(e) => setScannedQrInput(e.target.value)} aria-describedby={qrScanStatus ? 'receiving-scan-status' : undefined} /></div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-medium text-slate-700">Orders awaiting inspection</p><div className="mt-2 flex max-h-32 flex-wrap gap-2 overflow-y-auto">
              {receivingQueue.map((po) => <button key={po.id} type="button" onClick={() => setScannedQrInput(po.qrCodeToken || po.poNumber)} className="min-h-11 min-w-0 max-w-full break-words rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-medium text-slate-800 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700 [overflow-wrap:anywhere]">{po.poNumber}</button>)}
              {receivingQueue.length === 0 && <p className="text-sm leading-6 text-slate-600">No open orders are awaiting inspection.</p>}
            </div></div>
            <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { stopCameraStream(); setShowQrDecoderModal(false); }} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-700">Cancel</button>
              <ActionButton type="submit">Find and select PO</ActionButton>
            </div>
          </form>
        </div>
      </ScannerDialog>}
    </PageShell>
  );
}
