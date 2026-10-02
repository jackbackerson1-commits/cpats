// src/app/dashboard/pr/new/page.tsx
'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { CheckCircle2, CircleAlert, ClipboardCheck, ExternalLink, ImageIcon, FileText, LoaderCircle, MessageSquareText, Minus, Plus, Trash2, Upload, X } from 'lucide-react';
import { RequesterPageHeader, RequesterSection, RequesterFieldError, TrackRequestsLink, requesterFieldClass, requesterPrimaryClass, requesterSecondaryClass } from '@/components/requesting/RequesterUI';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Role } from '@prisma/client';
import { AuthUser } from '@/shared/session';

interface PurchaseItemState {
  id: string;
  category: string;
  specs: string;
  quantity: number;
}

interface ReturnFeedbackState {
  remarks: string | null;
  createdAt: string;
  actor: { role: Role };
}

interface ZodSubErrors {
  _errors?: string[];
}

interface ZodFormErrors {
  justification?: ZodSubErrors;
  adminProofFilePath?: ZodSubErrors;
  items?: Record<string, unknown>;
}

function itemValidationMessage(errors: ZodFormErrors['items'], index: number, field: string): string | undefined {
  const row = errors?.[String(index)];
  if (!row || typeof row !== 'object') return undefined;
  const entry = (row as Record<string, unknown>)[field];
  if (!entry || typeof entry !== 'object' || !('_errors' in entry)) return undefined;
  const messages = entry._errors;
  return Array.isArray(messages) ? messages.find((message): message is string => typeof message === 'string') : undefined;
}

function itemValidationMessages(errors: ZodFormErrors['items'], index: number): string[] {
  return ['itemName', 'quantity', 'unitPrice'].flatMap((field) => {
    const message = itemValidationMessage(errors, index, field);
    return message ? [message] : [];
  });
}

const ITEM_CATEGORIES = [
  'Monitors & Displays',
  'Cables & Connectors (HDMI, VGA, LAN)',
  'Desktop Computers & Laptops',
  'Peripherals (Mouse, Keyboard, Webcam)',
  'Printers, Scanners & Consumables',
  'Networking Equipment (Switches, Routers)',
  'Office Supplies & Stationery',
  'Other / Custom Item',
];

const parseStoredItems = (payload: unknown): PurchaseItemState[] => {
  if (!Array.isArray(payload)) return [];

  return payload.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const itemName = 'itemName' in entry && typeof entry.itemName === 'string'
      ? entry.itemName.trim()
      : '';
    const rawQuantity = 'quantity' in entry ? Number(entry.quantity) : 1;
    if (!itemName) return [];

    const separatorIndex = itemName.indexOf(' — ');
    const possibleCategory = separatorIndex >= 0 ? itemName.slice(0, separatorIndex) : itemName;
    const hasKnownCategory = ITEM_CATEGORIES.includes(possibleCategory);

    return [{
      id: `returned-item-${index + 1}`,
      category: hasKnownCategory ? possibleCategory : 'Other / Custom Item',
      specs: hasKnownCategory
        ? separatorIndex >= 0 ? itemName.slice(separatorIndex + 3) : ''
        : itemName,
      quantity: Number.isInteger(rawQuantity) && rawQuantity > 0 ? rawQuantity : 1,
    }];
  });
};

const formatFileSize = (bytes: number | null) => {
  if (bytes === null) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function NewPurchaseRequestPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activeUser, setActiveUser] = useState<AuthUser | null>(null);
  const [userLoading, setUserLoading] = useState<boolean>(true);
  const [returnedRequestId, setReturnedRequestId] = useState<string | null>(null);
  const [sourceDeclineId, setSourceDeclineId] = useState<string | null>(null);
  const [evaluatorFeedback, setEvaluatorFeedback] = useState<ReturnFeedbackState | null>(null);
  const [correctionLoadFailed, setCorrectionLoadFailed] = useState(false);
  const allowedTemplateNavigationRef = useRef<string | null>(null);

  // Form States
  const [justification, setJustification] = useState<string>('');
  const [isDirectPoBypass, setIsDirectPoBypass] = useState<boolean>(false);
  const [adminProofFilePath, setAdminProofFilePath] = useState<string>('');
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);
  const [attachedFileSize, setAttachedFileSize] = useState<number | null>(null);
  const [attachedFileIsImage, setAttachedFileIsImage] = useState(false);
  const [memoPreviewUrl, setMemoPreviewUrl] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState<boolean>(false);
  const memoFileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<PurchaseItemState[]>([
    { id: 'item-1', category: 'Monitors & Displays', specs: '', quantity: 1 },
  ]);

  const [systemError, setSystemError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ZodFormErrors | null>(null);
  const errorBannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (systemError) errorBannerRef.current?.focus();
  }, [systemError]);

  useEffect(() => {
    let cancelled = false;

    const query = new URLSearchParams(window.location.search);
    const returnId = query.get('returnId');
    const declineId = query.get('declineId');
    const templateNavigation = returnId
      ? `return:${returnId}`
      : declineId ? `decline:${declineId}` : null;

    if (templateNavigation && allowedTemplateNavigationRef.current !== templateNavigation) {
      const pendingNavigation = sessionStorage.getItem('cpats:request-template-navigation');
      sessionStorage.removeItem('cpats:request-template-navigation');
      if (pendingNavigation !== templateNavigation) {
        window.location.replace('/dashboard/pr/new');
        return;
      }
      allowedTemplateNavigationRef.current = templateNavigation;
    }

    const loadWorkspace = async () => {
      try {
        const authResponse = await fetch('/api/auth/me');
        const authResult = await authResponse.json();
        if (!authResponse.ok || !authResult.success || !authResult.data) {
          throw new Error('Failed to verify active institutional session.');
        }
        if (cancelled) return;
        setActiveUser(authResult.data);

        if ((!returnId && !declineId) || authResult.data.role !== Role.Requesting_Office) return;

        const sourceResponse = await fetch(
          returnId
            ? `/api/pr/return-correction?prId=${encodeURIComponent(returnId)}`
            : `/api/pr/declined-template?prId=${encodeURIComponent(declineId!)}`
        );
        const sourceResult = await sourceResponse.json();
        if (!sourceResponse.ok || !sourceResult.success || !sourceResult.data) {
          if (!cancelled) {
            setCorrectionLoadFailed(true);
            setSystemError(sourceResult.error || 'Unable to load this request.');
          }
          return;
        }
        if (cancelled) return;

        const returnedItems = parseStoredItems(sourceResult.data.itemsPayload);
        if (returnId) setReturnedRequestId(sourceResult.data.id);
        if (declineId) setSourceDeclineId(sourceResult.data.id);
        setJustification(sourceResult.data.justification || '');
        setItems(returnedItems.length > 0 ? returnedItems : [
          { id: 'returned-item-1', category: 'Monitors & Displays', specs: '', quantity: 1 },
        ]);
        setIsDirectPoBypass(Boolean(sourceResult.data.isDirectPoBypass));
        setAdminProofFilePath(sourceResult.data.adminProofFilePath || '');
        setEvaluatorFeedback(sourceResult.data.returnFeedback || sourceResult.data.feedback || null);

        if (sourceResult.data.adminProofFilePath) {
          const storedPath = String(sourceResult.data.adminProofFilePath);
          const storedName = storedPath.split('/').pop() || 'Executive approval document';
          setAttachedFileName(decodeURIComponent(storedName));
          setAttachedFileIsImage(/\.(png|jpe?g|webp)$/i.test(storedPath));
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setSystemError(error instanceof Error ? error.message : 'Failed to load the request workspace.');
        }
      } finally {
        if (!cancelled) setUserLoading(false);
      }
    };

    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearMemoAttachment = () => {
    if (memoPreviewUrl) URL.revokeObjectURL(memoPreviewUrl);
    setAdminProofFilePath('');
    setAttachedFileName(null);
    setAttachedFileSize(null);
    setAttachedFileIsImage(false);
    setMemoPreviewUrl(null);
    if (memoFileInputRef.current) memoFileInputRef.current.value = '';
  };

  useEffect(() => () => {
    if (memoPreviewUrl) URL.revokeObjectURL(memoPreviewUrl);
  }, [memoPreviewUrl]);

  const handleProofFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImage && !isPdf) {
      setSystemError('Please choose a PNG, JPG, WEBP, or PDF copy of the signed executive memo.');
      e.target.value = '';
      return;
    }

    setSystemError(null);
    clearMemoAttachment();
    setUploadingFile(true);
    setAttachedFileName(file.name);
    setAttachedFileSize(file.size);
    setAttachedFileIsImage(isImage);
    if (isImage) setMemoPreviewUrl(URL.createObjectURL(file));

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.url) {
        setAdminProofFilePath(data.url);
      } else {
        throw new Error(data.error || 'Failed to upload attachment.');
      }
    } catch (err: unknown) {
      setSystemError(err instanceof Error ? err.message : 'Error uploading memo attachment.');
      clearMemoAttachment();
    } finally {
      setUploadingFile(false);
    }
  };

  const handleItemChange = (
    id: string,
    field: keyof Omit<PurchaseItemState, 'id'>,
    value: string | number
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (field === 'quantity') {
          return { ...item, quantity: Math.max(1, Number(value) || 1) };
        }
        return { ...item, [field]: value };
      })
    );
  };

  const adjustQuantity = (id: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return { ...item, quantity: Math.max(1, item.quantity + delta) };
      })
    );
  };

  const addItemRow = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}`,
        category: 'Monitors & Displays',
        specs: '',
        quantity: 1,
      },
    ]);
  };

  const removeItemRow = (id: string) => {
    if (items.length > 1) {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const totalPhysicalUnits = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

  const discardCorrection = () => {
    window.location.assign('/dashboard/pr/new');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSystemError(null);
    setFieldErrors(null);

    if (!activeUser || activeUser.role !== Role.Requesting_Office) {
      setSystemError('Access Restricted: Only authorized Requesting Offices can submit purchase requests.');
      return;
    }

    if (isDirectPoBypass && !adminProofFilePath) {
      setSystemError('Compliance Notice: Please attach the signed executive memo to submit under the Pre-Approved protocol.');
      return;
    }

    const formattedPayloadItems = items.map((item) => {
      const isOther = item.category === 'Other / Custom Item';
      const synthesizedName = !isOther && item.category
        ? item.specs.trim()
          ? `${item.category} — ${item.specs.trim()}`
          : item.category
        : item.specs.trim() || 'Custom Item';

      return {
        itemName: synthesizedName,
        quantity: item.quantity,
      };
    });

    startTransition(async () => {
      try {
        const payload = {
          ...(returnedRequestId && { prId: returnedRequestId }),
          justification,
          isDirectPoBypass,
          ...(isDirectPoBypass && { adminProofFilePath }),
          items: formattedPayloadItems,
        };

        const response = await fetch(
          returnedRequestId ? '/api/pr/return-correction' : '/api/pr/create',
          {
            method: returnedRequestId ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          if (response.status === 422 && result.errors) {
            setFieldErrors(result.errors);
            throw new Error('Please review highlighted fields before proceeding.');
          }
          throw new Error(result.error || 'A system exception occurred while submitting your request.');
        }

        // Transient presentation feedback only; success follows the server response.
        try {
          sessionStorage.setItem('cpats:request-submitted', JSON.stringify({
            id: result.data?.id || returnedRequestId,
            corrected: Boolean(returnedRequestId),
          }));
        } catch {
          // Storage restrictions must not block a successful submission.
        }
        router.refresh();
        router.push('/dashboard/pr/track');
      } catch (err: unknown) {
        setSystemError(err instanceof Error ? err.message : 'An unexpected exception occurred.');
      }
    });
  };

  if (userLoading) {
    return (
      <div role="status" className="min-h-[60vh] flex flex-col items-center justify-center space-y-3 font-sans">
        <div className="w-8 h-8 border-3 border-emerald-700 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold text-slate-500 tracking-wide">
          Loading Department Workspace…
        </span>
      </div>
    );
  }

  if (!activeUser || activeUser.role !== Role.Requesting_Office) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white border border-rose-200 rounded-2xl shadow-sm text-center font-sans space-y-3">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto text-xl font-bold">
          !
        </div>
        <h2 className="text-base font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          Your account (<span className="font-semibold text-slate-700">{activeUser?.role.replace(/_/g, ' ') || 'Guest'}</span>) is not permitted to initiate purchase requests.
        </p>
        <Link
          href="/dashboard"
          className="inline-block text-xs font-bold text-emerald-700 hover:text-emerald-800 underline pt-2"
        >
          Return to Dashboard →
        </Link>
      </div>
    );
  }

  if (correctionLoadFailed) {
    return (
      <div className="max-w-lg mx-auto my-12 p-6 bg-white border border-orange-200 rounded-2xl shadow-sm text-center font-sans space-y-4">
        <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-700 flex items-center justify-center mx-auto text-xl font-bold">
          !
        </div>
        <h2 className="text-base font-bold text-slate-900">Request details unavailable</h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          {systemError || 'These request details are no longer available.'}
        </p>
        <Link
          href="/dashboard/pr/track"
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-700 px-5 text-xs font-bold text-white hover:bg-emerald-800"
        >
          Return to Department Records
        </Link>
      </div>
    );
  }

  const modeTitle = returnedRequestId ? 'Correct returned request' : sourceDeclineId ? 'New request from declined record' : 'New purchase request';
  const submitLabel = returnedRequestId ? 'Resubmit corrected request' : 'Submit purchase request';
  const nextStep = returnedRequestId
    ? 'Your corrections update this request and return it to the Business Office for review.'
    : sourceDeclineId
    ? 'Submitting creates a new request. The original declined record stays unchanged.'
    : 'Your request goes to the Business Office for review and recording.';

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 pb-36 text-slate-900 sm:px-6 sm:py-8 sm:pb-36 lg:px-8 lg:pb-10">
      <RequesterPageHeader title={modeTitle} description={returnedRequestId ? 'Use the evaluator’s feedback to revise your saved details, then resubmit the same request.' : sourceDeclineId ? 'Review the saved details and feedback before creating a new request.' : 'Tell us what your department needs and why. You can check your details before submitting.'} department={`${activeUser.departmentName} (${activeUser.departmentCode})`} action={<TrackRequestsLink />} />

      {systemError && (
        <div ref={errorBannerRef} role="alert" tabIndex={-1} className="mb-6 flex scroll-mt-36 items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900 focus:outline-2 focus:outline-rose-700">
          <CircleAlert className="mt-1 size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1"><p className="font-semibold">Please review your request</p><p className="break-words">{systemError}</p>
            {fieldErrors && <ul className="mt-2 space-y-1">
              {fieldErrors.justification?._errors?.map((message) => <li key={message}><a className="underline underline-offset-2" href="#justification">Reason for the request: {message}</a></li>)}
              {fieldErrors.adminProofFilePath?._errors?.map((message) => <li key={message}><a className="underline underline-offset-2" href="#memo-upload">Approval document: {message}</a></li>)}
              {items.map((item, index) => { const errors = itemValidationMessages(fieldErrors.items, index); return errors.length > 0 ? <li key={item.id}><a className="underline underline-offset-2" href={`#${item.id}-specs`}>Item {index + 1}: {errors.join(' ')}</a></li> : null; })}
            </ul>}
          </div>
          <button type="button" onClick={() => setSystemError(null)} aria-label="Dismiss request error" className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-rose-100"><X className="size-5" aria-hidden="true" /></button>
        </div>
      )}

      {(returnedRequestId || sourceDeclineId) && (
        <section aria-label="Evaluator feedback" className={`mb-6 rounded-xl border p-4 sm:p-5 ${returnedRequestId ? 'border-amber-300 bg-amber-50' : 'border-rose-200 bg-rose-50'}`}>
          <div className="flex items-start gap-3">
            <MessageSquareText className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold">{returnedRequestId ? 'What needs to change' : 'Feedback on the original request'}</h2>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{evaluatorFeedback?.remarks || 'No specific decision note was provided.'}</p>
              {evaluatorFeedback && <p className="mt-3 text-xs leading-5 text-slate-700">{evaluatorFeedback.actor.role.replace(/_/g, ' ')} · {new Date(evaluatorFeedback.createdAt).toLocaleDateString('en-PH')}</p>}
              <p className="mt-3 text-sm font-medium leading-6">{nextStep}</p>
              <p className="mt-1 break-all font-mono text-xs text-slate-600">Original reference: {returnedRequestId || sourceDeclineId}</p>
            </div>
          </div>
        </section>
      )}

      <form onSubmit={handleSubmit} className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]" aria-busy={isPending}>
        <div className="min-w-0 space-y-6">
          <RequesterSection id="requested-items" number="1" title="Requested items" description="List each item, its specifications, and the quantity your department needs.">
            <div className="space-y-4">
              {items.map((item, index) => {
                const errors = itemValidationMessages(fieldErrors?.items, index);
                const nameError = itemValidationMessage(fieldErrors?.items, index, 'itemName');
                const quantityError = itemValidationMessage(fieldErrors?.items, index, 'quantity');
                return (
                  <fieldset key={item.id} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                    <legend className="px-1 text-sm font-semibold text-slate-700">Item {index + 1}</legend>
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <span className="text-xs text-slate-600">Item details</span>
                      <button type="button" onClick={() => removeItemRow(item.id)} disabled={items.length === 1} aria-label={`Remove item ${index + 1}`} title={items.length === 1 ? 'Keep at least one item in your request' : 'Remove this item'} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-rose-800 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-500"><Trash2 className="size-4" aria-hidden="true" />Remove</button>
                    </div>
                    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_164px]">
                      <div className="min-w-0">
                        <label htmlFor={`${item.id}-category`} className="mb-2 block text-sm font-medium text-slate-800">Category</label>
                        <select id={`${item.id}-category`} value={item.category} onChange={(e) => handleItemChange(item.id, 'category', e.target.value)} className={requesterFieldClass}>{ITEM_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}</select>
                      </div>
                      <div className="min-w-0">
                        <label htmlFor={`${item.id}-quantity`} className="mb-2 block text-sm font-medium text-slate-800">Quantity <span className="text-rose-700">*</span></label>
                        <div className="flex h-[50px] w-fit max-w-full items-center overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-emerald-700/15">
                          <button type="button" onClick={() => adjustQuantity(item.id, -1)} aria-label={`Decrease quantity for item ${index + 1}`} className="grid h-full w-11 shrink-0 place-items-center text-slate-700 hover:bg-slate-100"><Minus className="size-4" aria-hidden="true" /></button>
                          <input id={`${item.id}-quantity`} type="number" min={1} required value={item.quantity || ''} onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)} aria-invalid={Boolean(quantityError)} aria-describedby={quantityError ? `${item.id}-error` : undefined} className="h-full w-16 min-w-0 border-x border-slate-200 bg-white px-1 text-center text-sm font-semibold tabular-nums outline-none" />
                          <button type="button" onClick={() => adjustQuantity(item.id, 1)} aria-label={`Increase quantity for item ${index + 1}`} className="grid h-full w-11 shrink-0 place-items-center text-slate-700 hover:bg-slate-100"><Plus className="size-4" aria-hidden="true" /></button>
                        </div>
                      </div>
                      <div className="min-w-0 xl:col-span-2">
                        <label htmlFor={`${item.id}-specs`} className="mb-2 block text-sm font-medium text-slate-800">{item.category === 'Other / Custom Item' ? 'Item name and specifications' : 'Specifications and details'}{item.category === 'Other / Custom Item' ? <span className="text-rose-700"> *</span> : <span className="ml-1 text-xs font-normal text-slate-600"> (optional)</span>}</label>
                        <textarea id={`${item.id}-specs`} required={item.category === 'Other / Custom Item'} rows={2} placeholder={item.category === 'Other / Custom Item' ? 'Describe the item, including its name, brand, or model…' : 'For example, 27-inch IPS monitor, 1080p, with HDMI input'} value={item.specs} onChange={(e) => handleItemChange(item.id, 'specs', e.target.value)} aria-invalid={Boolean(nameError)} aria-describedby={errors.length ? `${item.id}-error` : undefined} className={`${requesterFieldClass} scroll-mt-36 resize-y`} />
                      </div>
                    </div>
                    <RequesterFieldError id={`${item.id}-error`} message={errors.join(' ')} />
                  </fieldset>
                );
              })}
            </div>
            <button type="button" onClick={addItemRow} className={`${requesterSecondaryClass} mt-4 w-full border-dashed`}><Plus className="size-4" aria-hidden="true" />Add another item</button>
          </RequesterSection>

          <RequesterSection id="request-reason" number="2" title="Reason for the request" description="Explain how these items will support your department’s work.">
            <label htmlFor="justification" className="mb-2 block text-sm font-medium text-slate-800">Justification <span className="text-rose-700">*</span></label>
            <textarea id="justification" required rows={4} value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="For example, replace damaged monitors in Laboratory 2 so students can complete their programming activities." aria-invalid={Boolean(fieldErrors?.justification?._errors?.length)} aria-describedby={`justification-help${fieldErrors?.justification?._errors?.length ? ' justification-error' : ''}`} className={`${requesterFieldClass} scroll-mt-36 resize-y`} />
            <p id="justification-help" className="mt-2 text-xs leading-5 text-slate-600">At least 10 characters. Include the purpose and where the items will be used.</p>
            <RequesterFieldError id="justification-error" message={fieldErrors?.justification?._errors?.[0]} />
          </RequesterSection>

          <RequesterSection id="approval-document" number="3" title="Approval document" description="Choose the option that matches the approval documents you already have.">
            <fieldset className="space-y-3">
              <legend className="sr-only">Request protocol</legend>
              <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${!isDirectPoBypass ? 'border-emerald-700 bg-emerald-50/50' : 'border-slate-200'}`}>
                <input type="radio" name="filingProtocol" value="standard" checked={!isDirectPoBypass} onChange={() => { setIsDirectPoBypass(false); clearMemoAttachment(); }} className="mt-1 size-4 shrink-0 accent-emerald-800" />
                <span className="min-w-0"><span className="block text-sm font-semibold text-slate-900">Standard department request</span><span className="mt-1 block text-sm leading-6 text-slate-600">Reviewed by the Business Office and Administration before purchase order preparation.</span></span>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${isDirectPoBypass ? 'border-emerald-700 bg-emerald-50/50' : 'border-slate-200'}`}>
                <input type="radio" name="filingProtocol" value="bypass" checked={isDirectPoBypass} onChange={() => setIsDirectPoBypass(true)} className="mt-1 size-4 shrink-0 accent-emerald-800" />
                <span className="min-w-0"><span className="block text-sm font-semibold text-slate-900">Executive pre-approved memo</span><span className="mt-1 block text-sm leading-6 text-slate-600">Attach your signed executive approval letter. The request still goes to the Business Office for recording and review.</span></span>
              </label>
            </fieldset>

            {isDirectPoBypass && (
              <div id="memo-upload" tabIndex={-1} className="mt-5 scroll-mt-36 border-t border-slate-200 pt-5">
                <p className="text-sm font-semibold text-slate-800">Signed approval document <span className="text-rose-700">*</span></p>
                <p id="memo-file-help" className="mt-1 text-xs leading-5 text-slate-600">Choose a PDF, PNG, JPG, or WEBP copy of the signed document.</p>
                <input ref={memoFileInputRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" capture="environment" onChange={handleProofFileUpload} className="sr-only" id="memo-file-input" aria-label="Signed executive approval document" aria-describedby={`memo-file-help${fieldErrors?.adminProofFilePath?._errors?.length ? ' memo-file-error' : ''}`} aria-invalid={Boolean(fieldErrors?.adminProofFilePath?._errors?.length)} />
                <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                  {attachedFileName || adminProofFilePath ? (
                    <div className="space-y-4">
                      {attachedFileIsImage && memoPreviewUrl && <Image src={memoPreviewUrl} alt={`Preview of ${attachedFileName || 'the signed document'}`} width={1200} height={800} unoptimized className="max-h-64 w-auto max-w-full rounded-lg object-contain" />}
                      <div className="flex min-w-0 items-start gap-3">
                        {attachedFileIsImage ? <ImageIcon className="mt-1 size-5 shrink-0 text-emerald-800" aria-hidden="true" /> : <FileText className="mt-1 size-5 shrink-0 text-emerald-800" aria-hidden="true" />}
                        <div className="min-w-0"><p className="break-words text-sm font-medium text-slate-900 [overflow-wrap:anywhere]">{attachedFileName || 'Signed approval document'}</p><p role="status" className="mt-1 text-xs text-slate-600">{uploadingFile ? 'Uploading document…' : `Document attached${formatFileSize(attachedFileSize) ? ` · ${formatFileSize(attachedFileSize)}` : ''}`}</p></div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(memoPreviewUrl || adminProofFilePath) && !uploadingFile && <a href={memoPreviewUrl || adminProofFilePath} target="_blank" rel="noreferrer" className={requesterSecondaryClass}>View document<ExternalLink className="size-4" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span></a>}
                        <button type="button" onClick={() => memoFileInputRef.current?.click()} disabled={uploadingFile} className={requesterSecondaryClass}>Replace</button>
                        <button type="button" onClick={clearMemoAttachment} disabled={uploadingFile} className={`${requesterSecondaryClass} text-rose-800`}>Remove</button>
                      </div>
                    </div>
                  ) : <div className="space-y-2"><button type="button" onClick={() => memoFileInputRef.current?.click()} disabled={uploadingFile} className={requesterSecondaryClass}><Upload className="size-4" aria-hidden="true" />{uploadingFile ? 'Uploading…' : 'Choose file or take photo'}</button><p className="text-xs leading-5 text-slate-600">Your uploaded document stays attached when you submit.</p></div>}
                </div>
                <RequesterFieldError id="memo-file-error" message={fieldErrors?.adminProofFilePath?._errors?.[0]} />
              </div>
            )}
          </RequesterSection>
        </div>

        <aside aria-labelledby="request-summary-title" className="min-w-0 lg:sticky lg:top-36">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
            <div className="flex items-center gap-2"><ClipboardCheck className="size-5 text-emerald-800" aria-hidden="true" /><h2 id="request-summary-title" className="text-base font-semibold text-slate-950">Request summary</h2></div>
            <p className="mt-2 text-sm leading-6 text-slate-600">Check your items and approval details before submitting.</p>
            <dl className="mt-5 grid grid-cols-2 gap-4 border-y border-slate-200 py-4"><div><dt className="text-xs text-slate-600">Line items</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{items.length}</dd></div><div><dt className="text-xs text-slate-600">Total units</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{totalPhysicalUnits}</dd></div></dl>
            <ul className="mt-4 max-h-64 space-y-3 overflow-y-auto pr-1" aria-label="Items in your request">{items.map((item, index) => <li key={item.id} className="flex items-start gap-3 text-sm leading-5"><span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]"><span className="block font-medium text-slate-800">{item.category === 'Other / Custom Item' ? item.specs || `Item ${index + 1}` : item.category}</span>{item.category !== 'Other / Custom Item' && item.specs && <span className="mt-1 block text-xs leading-5 text-slate-600">{item.specs}</span>}</span><span className="shrink-0 font-semibold tabular-nums text-slate-700">× {item.quantity}</span></li>)}</ul>
            <div className="mt-5 border-t border-slate-200 pt-4"><p className="text-xs font-medium text-slate-600">Request type</p><p className="mt-1 text-sm font-medium text-slate-900">{isDirectPoBypass ? 'Executive pre-approved memo' : 'Standard department request'}</p>{isDirectPoBypass && <p className={`mt-2 flex items-center gap-2 text-xs ${adminProofFilePath ? 'text-emerald-800' : 'text-amber-900'}`}>{adminProofFilePath ? <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> : <CircleAlert className="size-4 shrink-0" aria-hidden="true" />}{uploadingFile ? 'Document upload in progress' : adminProofFilePath ? 'Approval document attached' : 'Approval document required'}</p>}</div>
            <div className="mt-5 rounded-lg bg-emerald-50 p-3.5"><h3 className="text-sm font-semibold text-emerald-950">What happens next</h3><p className="mt-1 text-sm leading-6 text-emerald-900">{nextStep}</p></div>
            <details className="mt-4 text-sm"><summary className="cursor-pointer py-2 font-medium text-slate-700">About the review process</summary><ol className="mt-2 space-y-3 border-l border-slate-200 pl-4 text-sm leading-6 text-slate-600"><li><strong className="font-medium text-slate-900">Requesting Office</strong><br />Specifications and justification are submitted.</li><li><strong className="font-medium text-slate-900">Business Office</strong><br />Item necessity and budget are checked.</li><li><strong className="font-medium text-slate-900">Administration</strong><br />Executive authorization is recorded.</li><li><strong className="font-medium text-slate-900">Purchasing and Receiving</strong><br />Purchase order, financial release, and receiving are recorded.</li></ol></details>
            <div className="mt-5 hidden space-y-2 border-t border-slate-200 pt-5 lg:block"><button type="submit" disabled={isPending || uploadingFile} className={`${requesterPrimaryClass} w-full`}>{isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}{isPending ? returnedRequestId ? 'Resubmitting…' : 'Submitting…' : submitLabel}</button>{returnedRequestId || sourceDeclineId ? <button type="button" onClick={discardCorrection} className={`${requesterSecondaryClass} w-full text-rose-800`}>Discard changes and start new</button> : <Link href="/dashboard/pr/track" className={`${requesterSecondaryClass} w-full`}>Cancel and return to requests</Link>}</div>
          </div>
        </aside>

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_rgba(15,23,42,0.04)] lg:hidden">
          <div className="mx-auto max-w-7xl"><p className="mb-2 text-xs text-slate-600">{items.length} {items.length === 1 ? 'item' : 'items'} · {totalPhysicalUnits} {totalPhysicalUnits === 1 ? 'unit' : 'units'}</p><div className="flex flex-wrap gap-2">{returnedRequestId || sourceDeclineId ? <button type="button" onClick={discardCorrection} className={`${requesterSecondaryClass} text-rose-800`}>Discard</button> : <Link href="/dashboard/pr/track" className={requesterSecondaryClass}>Cancel</Link>}<button type="submit" disabled={isPending || uploadingFile} className={`${requesterPrimaryClass} min-w-0 flex-1 px-3`}>{isPending && <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />}{isPending ? returnedRequestId ? 'Resubmitting…' : 'Submitting…' : returnedRequestId ? 'Resubmit request' : 'Submit request'}</button></div></div>
        </div>
      </form>
    </main>
  );
}
