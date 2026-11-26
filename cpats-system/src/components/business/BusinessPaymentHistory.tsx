import { PRStatus, Role } from '@prisma/client';
import { ExternalLink } from 'lucide-react';

export interface PaymentHistoryOrder {
  id: string; poNumber: string; paymentType: 'CASH_CHECK' | 'CREDIT_TERMS';
  isCheckIssued: boolean; createdAt: string;
  receivingReports: { id: string; invoiceFilePath: string; createdAt: string }[];
}
interface ClearanceEvent {
  id?: string; createdAt: string; previousState: PRStatus | null; newState: PRStatus;
  remarks: string | null; actor: { email: string; role: Role };
}
function invoiceHref(path: string): string | null {
  try {
    const url = new URL(path, 'https://cpats.local');
    return url.origin === 'https://cpats.local' && url.pathname.startsWith('/uploads/') ? url.pathname + url.search : null;
  } catch { return null; }
}
const wrap = 'min-w-0 break-words [overflow-wrap:anywhere]';

export function BusinessPaymentHistory({ orders = [], auditLogs = [] }: { orders?: PaymentHistoryOrder[]; auditLogs?: ClearanceEvent[] }) {
  const events = auditLogs.filter(log => log.actor.role === Role.Business_Office &&
    log.previousState === PRStatus.Awaiting_Check_Issuance && log.newState === PRStatus.Ready_for_Purchase);
  return <section aria-labelledby="payment-history-title" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
    <h2 id="payment-history-title" className="text-base font-semibold text-slate-950">Financial clearance &amp; purchase invoices</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">Saved payment details for this request. Financial clearance authorizes the purchase; it does not confirm that the supplier has been paid.</p>
    {!orders.length ? <p className="mt-4 text-sm text-slate-600">No purchase order or payment method has been recorded yet.</p> : <div className="mt-5 space-y-4">{orders.map(order => <article key={order.id} className="min-w-0 rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className={`${wrap} text-sm font-semibold text-slate-950`}>{order.poNumber}</h3>
        <span className={`rounded-md px-2 py-1 text-xs font-medium ${order.isCheckIssued ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>{order.isCheckIssued ? 'Financial clearance recorded' : 'Awaiting financial clearance'}</span></div>
      <dl className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
        <div className={wrap}><dt className="text-xs text-slate-600">Payment method</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{!order.isCheckIssued ? 'Not confirmed yet' : order.paymentType === 'CREDIT_TERMS' ? 'Credit / charge terms' : 'Cash / check'}</dd></div>
        <div className={wrap}><dt className="text-xs text-slate-600">Purchase order prepared</dt><dd className="mt-1 text-sm text-slate-700">{new Date(order.createdAt).toLocaleString()}</dd></div>
      </dl>
      {order.isCheckIssued && <p className="mt-3 text-sm leading-6 text-slate-600">{order.paymentType === 'CREDIT_TERMS'
        ? 'Cleared under supplier credit terms, without a pre-purchase check release. Credit due date, repayment schedule and outstanding balance are not recorded in this system.'
        : 'Cleared using cash / check. The saved check reference and billed amount, where recorded, appear in the clearance events below.'}</p>}
      <div className="mt-4 border-t border-slate-200 pt-4"><h4 className="text-sm font-semibold text-slate-900">Supplier invoice</h4>
        {!order.receivingReports.length ? <p className="mt-2 text-sm leading-6 text-slate-600">No supplier invoice recorded yet. The Receiving Custodian records the invoice when receiving the delivery.</p> : <ul className="mt-2 space-y-3">{order.receivingReports.map(report => {
          const href = invoiceHref(report.invoiceFilePath);
          return <li key={report.id} className={wrap}><p className="text-xs leading-5 text-slate-600">Receiving record · {new Date(report.createdAt).toLocaleString()}</p>
            {href ? <a href={href} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-lg border border-emerald-200 px-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"><span>Open supplier invoice<span className="sr-only"> for {order.poNumber} (opens in a new tab)</span></span><ExternalLink className="size-4 shrink-0" aria-hidden="true" /></a>
              : <p className="mt-2 text-sm text-slate-600">No accessible supplier invoice reference in this receiving record.</p>}</li>;
        })}</ul>}
        <p className="mt-2 text-xs leading-5 text-slate-600">The invoice documents the purchase; this history does not certify settlement.</p>
      </div>
    </article>)}</div>}
    <div className="mt-5 border-t border-slate-200 pt-4"><h3 className="text-sm font-semibold text-slate-950">Recorded financial clearance events</h3>
      <p className="mt-2 text-xs leading-5 text-slate-600">These events belong to this request. Check references and billed amounts are shown exactly as recorded by Business Office.</p>
      {!events.length ? <p className="mt-3 text-sm text-slate-600">No financial clearance event recorded.</p> : <ol className="mt-3 space-y-3">{events.map((event, index) => <li key={event.id || `${event.createdAt}-${index}`} className="min-w-0 rounded-lg bg-slate-50 p-3">
        <p className={`${wrap} whitespace-pre-wrap text-sm leading-6 text-slate-800`}>{event.remarks || 'Financial clearance recorded without additional remarks.'}</p>
        <p className={`${wrap} mt-2 text-xs leading-5 text-slate-600`}>{event.actor.email} · {new Date(event.createdAt).toLocaleString()}</p>
      </li>)}</ol>}
    </div>
  </section>;
}
