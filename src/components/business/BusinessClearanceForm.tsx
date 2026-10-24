'use client';

import React from 'react';
import { Banknote, Copy, CreditCard } from 'lucide-react';
import { ActionButton, BusinessSection, CheckItem, FieldError, FieldLabel, inputClass } from './BusinessUI';
import { BusinessEvaluationActionBar } from './BusinessEvaluationWorkspace';
import './business-clearance-workspace.css';

interface BillingItem { itemName: string; quantity: number; unitPrice: number }
interface FormErrors {
  poId?: { _errors?: string[] }; paymentType?: { _errors?: string[] }; checkNumber?: { _errors?: string[] };
  items?: Record<string, unknown>;
}

export interface BusinessClearanceFormProps {
  selectedTask: { id: string; justification: string; department: { code: string; name: string } };
  selectedPO?: { poNumber: string };
  poId: string; paymentType: 'CASH_CHECK' | 'CREDIT_TERMS'; checkNumber: string;
  billingItems: BillingItem[]; physicalCheckSigned: boolean; ledgerLogged: boolean;
  calculatedBilledTotal: number; quantityTotal: number; checksVerified: number; isPending: boolean;
  validationErrors: FormErrors | null;
  onSubmit: (event: React.FormEvent) => void;
  onPriceChange: (index: number, price: number) => void;
  onPaymentTypeChange: (value: 'CASH_CHECK' | 'CREDIT_TERMS') => void;
  onCheckNumberChange: (value: string) => void;
  onPhysicalCheckSignedChange: (value: boolean) => void;
  onLedgerLoggedChange: (value: boolean) => void;
}

function formatPeso(value: number) {
  return `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function itemError(errors: FormErrors['items'], index: number, field: string): string | undefined {
  const row = errors?.[String(index)];
  if (!row || typeof row !== 'object') return undefined;
  const value = (row as Record<string, unknown>)[field];
  if (!value || typeof value !== 'object' || !('_errors' in value)) return undefined;
  return Array.isArray(value._errors) ? value._errors.find((message): message is string => typeof message === 'string') : undefined;
}

// This component renders existing form state; the page retains all calculations,
// selection, submission guards, payloads, queue loading, and server calls.
export function BusinessClearanceForm({ selectedTask, selectedPO, poId, paymentType, checkNumber, billingItems,
  physicalCheckSigned, ledgerLogged, calculatedBilledTotal, quantityTotal, checksVerified, isPending, validationErrors,
  onSubmit, onPriceChange, onPaymentTypeChange, onCheckNumberChange, onPhysicalCheckSignedChange, onLedgerLoggedChange,
}: BusinessClearanceFormProps) {
  const [copyResult, setCopyResult] = React.useState<{ id: string; message: string } | null>(null);
  const copyReference = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Unavailable');
      await navigator.clipboard.writeText(selectedTask.id);
      setCopyResult({ id: selectedTask.id, message: 'Request reference copied.' });
    } catch { setCopyResult({ id: selectedTask.id, message: 'Copy unavailable. Select the reference and copy it manually.' }); }
  };
  return (
    <form onSubmit={onSubmit} className="business-review-form clearance-form min-w-0 space-y-4" aria-busy={isPending}>
      <BusinessEvaluationActionBar label="Financial clearance" title={formatPeso(calculatedBilledTotal)} jumpLabel="Review clearance" targetId="clearance-controls">
        <ActionButton type="submit" aria-describedby="clearance-explanation" disabled={isPending}>{isPending ? 'Authorizing…' : 'Authorize clearance'}</ActionButton>
      </BusinessEvaluationActionBar>
      <section aria-label="Purchase order overview" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6">
        <div className="business-request-title-row">
          <h2 title={selectedPO?.poNumber || 'Purchase Order'} className="line-clamp-2 min-w-0 text-base font-semibold text-slate-950">{selectedPO?.poNumber || 'Purchase Order'}</h2>
          <span className="business-status-badge rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-900">Awaiting financial clearance</span>
        </div>
        <p className="mt-2 text-xs font-medium text-emerald-800">Purchase order under review</p>
        <dl className="business-overview-grid mt-3 grid min-w-0 gap-4">
          <div className="min-w-0"><dt className="text-xs text-slate-600">Originating office</dt><dd className="mt-1 break-words text-sm font-medium leading-6 text-slate-900 [overflow-wrap:anywhere]">{selectedTask.department.name} ({selectedTask.department.code})</dd></div>
          <div className="min-w-0"><dt className="text-xs text-slate-600">Current billed total</dt><dd className="mt-1 break-words text-base font-semibold tabular-nums text-emerald-900 [overflow-wrap:anywhere]">{formatPeso(calculatedBilledTotal)}</dd></div>
          <div className="min-w-0"><dt className="text-xs text-slate-600">Billing scope</dt><dd className="mt-1 text-sm font-medium leading-6 text-slate-900">{billingItems.length} line item{billingItems.length === 1 ? '' : 's'} · {quantityTotal} total unit{quantityTotal === 1 ? '' : 's'}</dd></div>
        </dl>
        <div className="business-reference-row mt-3"><span className="text-xs font-medium text-slate-600">Request reference</span><code className="min-w-0 select-all break-all text-xs text-slate-700">{selectedTask.id}</code><button type="button" aria-label="Copy reference" title="Copy reference" onClick={() => void copyReference()} className="business-copy-button rounded-lg border border-slate-300 bg-white"><Copy className="size-4" aria-hidden="true" /></button></div>
        <p role="status" className="text-xs leading-5 text-slate-600">{copyResult?.id === selectedTask.id ? copyResult.message : ''}</p>
        <input type="text" required readOnly tabIndex={-1} aria-label="Selected purchase order reference" className="sr-only" value={poId} />
        {validationErrors?.poId?._errors && <FieldError>{validationErrors.poId._errors[0]}</FieldError>}
      </section>

      <BusinessSection title="Reason for the request" description="The justification saved by the Requesting Office.">
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{selectedTask.justification}</p>
      </BusinessSection>

      <BusinessSection title="Verify billing amounts" description="Enter or confirm each unit price using the official supplier billing statement.">
        <ol className="space-y-4">{billingItems.map((item, index) => {
          const lineAmount = item.quantity * (item.unitPrice || 0);
          const priceError = itemError(validationErrors?.items, index, 'unitPrice');
          const errors = ['itemName', 'quantity', 'unitPrice'].flatMap((field) => {
            const message = itemError(validationErrors?.items, index, field);
            return message ? [message] : [];
          });
          return <li key={index} className="clearance-billing-item grid min-w-0 gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="clearance-item-name min-w-0">
              <p className="text-xs text-slate-600">Item {index + 1}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-900 [overflow-wrap:anywhere]">{item.itemName}</p>
            </div>
            <div><p className="text-xs text-slate-600">Quantity</p><p className="mt-2 text-sm font-semibold tabular-nums text-slate-900">{item.quantity}</p></div>
            <div className="min-w-0">
              <FieldLabel htmlFor={`billing-price-${index}`}>Unit price</FieldLabel>
              <div className={`flex min-w-0 items-center rounded-lg border bg-white px-3 focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-700/15 ${priceError ? 'border-rose-600' : 'border-slate-300'}`}>
                <span className="mr-2 text-sm text-slate-600" aria-hidden="true">₱</span>
                <input id={`billing-price-${index}`} type="number" min="0" step="0.01" required
                  aria-label={`Unit price for ${item.itemName}`} aria-invalid={Boolean(priceError)} aria-describedby={errors.length ? `billing-item-error-${index}` : 'billing-price-help'}
                  placeholder="0.00" className="min-h-11 w-full min-w-0 bg-transparent py-3 text-right text-sm tabular-nums text-slate-900 outline-none placeholder:text-slate-500"
                  value={item.unitPrice || ''} onChange={(e) => onPriceChange(index, parseFloat(e.target.value) || 0)} />
              </div>
            </div>
            <div className="min-w-0"><p className="text-xs text-slate-600">Line total</p><p className="mt-2 break-words text-sm font-semibold tabular-nums text-slate-900 [overflow-wrap:anywhere]">{formatPeso(lineAmount)}</p></div>
            {errors.length > 0 && <div className="clearance-item-errors min-w-0"><FieldError id={`billing-item-error-${index}`}>{errors.join(' ')}</FieldError></div>}
          </li>;
        })}</ol>
        {billingItems.length === 0 && <p className="text-sm text-slate-600">No billing items are recorded for this request.</p>}
        <p id="billing-price-help" className="mt-3 text-xs leading-5 text-slate-600">Amounts are in Philippine pesos. Quantities come from the saved request.</p>
        <div className="mt-5 flex min-w-0 flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-slate-700">Billing statement total</p>
          <p className="min-w-0 break-words text-xl font-semibold tabular-nums text-emerald-900 [overflow-wrap:anywhere]">{formatPeso(calculatedBilledTotal)}</p>
        </div>
      </BusinessSection>

      <div id="clearance-controls" tabIndex={-1} className="min-w-0 space-y-4">
      <BusinessSection title="Payment method" description="Choose how this purchase order will be financially cleared.">
        <fieldset>
          <legend className="sr-only">Settlement method</legend>
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            <label className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-emerald-700 ${paymentType === 'CASH_CHECK' ? 'border-emerald-600 bg-emerald-50' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>
              <input type="radio" name="payment-type" value="CASH_CHECK" checked={paymentType === 'CASH_CHECK'} onChange={() => onPaymentTypeChange('CASH_CHECK')} className="mt-1 size-5 shrink-0 accent-emerald-800" />
              <span className="min-w-0"><span className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Banknote className="size-4 shrink-0" aria-hidden="true" />Cash / check</span><span className="mt-2 block text-sm leading-6 text-slate-700">Requires the bank check number, authorized signatures, and an accounting ledger entry before release.</span></span>
            </label>
            <label className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-emerald-700 ${paymentType === 'CREDIT_TERMS' ? 'border-amber-600 bg-amber-50' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>
              <input type="radio" name="payment-type" value="CREDIT_TERMS" checked={paymentType === 'CREDIT_TERMS'} onChange={() => { onPaymentTypeChange('CREDIT_TERMS'); onCheckNumberChange(''); }} className="mt-1 size-5 shrink-0 accent-emerald-800" />
              <span className="min-w-0"><span className="flex items-center gap-2 text-sm font-semibold text-slate-900"><CreditCard className="size-4 shrink-0" aria-hidden="true" />Credit / charge terms</span><span className="mt-2 block text-sm leading-6 text-slate-700">Uses supplier credit terms. This request proceeds to purchase readiness without a pre-purchase check release.</span></span>
            </label>
          </div>
        </fieldset>
        {validationErrors?.paymentType?._errors && <FieldError>{validationErrors.paymentType._errors[0]}</FieldError>}
      </BusinessSection>

      {paymentType === 'CASH_CHECK' && <BusinessSection title="Check release verification" description="Record the issued check and confirm both release requirements.">
        <div className="max-w-md">
          <FieldLabel htmlFor="bank-check-number">Bank check number</FieldLabel>
          <input id="bank-check-number" type="text" required={paymentType === 'CASH_CHECK'} className={inputClass(!!validationErrors?.checkNumber)} placeholder="For example, CHK-2026-9812" value={checkNumber} onChange={(e) => onCheckNumberChange(e.target.value)} aria-invalid={Boolean(validationErrors?.checkNumber?._errors?.length)} aria-describedby={`bank-check-help${validationErrors?.checkNumber?._errors?.length ? ' bank-check-error' : ''}`} />
          <p id="bank-check-help" className="mt-2 text-xs leading-5 text-slate-600">Use the exact check number issued by the Business Office. At least 4 characters.</p>
          {validationErrors?.checkNumber?._errors && <FieldError id="bank-check-error">{validationErrors.checkNumber._errors[0]}</FieldError>}
        </div>
        <p className={`mb-3 mt-5 text-sm font-medium ${checksVerified === 2 ? 'text-emerald-800' : 'text-slate-700'}`}>{checksVerified} of 2 verified</p>
        <div className="space-y-3">
          <CheckItem id="gate-sign" checked={physicalCheckSigned} onChange={onPhysicalCheckSignedChange} label="Authorized check signatures verified" description="The physical check has been reviewed, matched to the total amount, and signed by authorized executives." />
          <CheckItem id="gate-ledger" checked={ledgerLogged} onChange={onLedgerLoggedChange} label="Disbursement recorded in the ledger" description="The bank payment voucher reference is recorded in the physical accounting log books." />
        </div>
      </BusinessSection>}

      {paymentType === 'CREDIT_TERMS' && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <h2 className="font-semibold">No pre-purchase check required</h2>
        <p className="mt-2">Credit terms clearance makes this request ready for purchase. Billing will be settled when the supplier invoice is submitted.</p>
      </section>}

      <p id="clearance-explanation" className="text-xs leading-5 text-slate-600"><span className="font-semibold">Total to authorize: {formatPeso(calculatedBilledTotal)}.</span> {paymentType === 'CASH_CHECK' ? 'Record the verified billing amounts and check-backed clearance. The request becomes ready for purchase.' : 'Record the verified billing amounts and supplier credit terms. The request becomes ready for purchase.'}</p>
      </div>
    </form>
  );
}
