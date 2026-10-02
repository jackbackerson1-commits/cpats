'use client';

import { useEffect, useState } from 'react';
import { PageShell, StageHeader, ErrorBanner } from '@/components/purchasing/PurchasingUI';

interface ReportRow {
  poNumber: string;
  transactionDate: string;
  purchaseRequestId: string;
  departmentCode: string;
  departmentName: string;
  itemSummary: string;
  lineItemCount: number;
  totalQuantity: number;
  totalAmount: number;
  paymentType: string;
  financialStatus: string;
  workflowStatus: string;
  receivingStatus: string;
  receivedDate: string;
  preparedBy: string;
  justification: string;
}

interface ReportData {
  month: string;
  monthLabel: string;
  generatedAt: string;
  summary: {
    transactionCount: number;
    totalQuantity: number;
    totalAmount: number;
    receivedCount: number;
  };
  rows: ReportRow[];
}

function currentManilaMonth() {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    timeZone: 'Asia/Manila',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function formatPeso(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(value);
}

async function fetchMonthlyReport(month: string, signal?: AbortSignal): Promise<ReportData> {
  const response = await fetch(`/api/po/reports/monthly?month=${encodeURIComponent(month)}`, {
    signal,
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The report could not be generated.');
  return result.data;
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PurchasingMonthlyReportsPage() {
  const maximumMonth = currentManilaMonth();
  const [selectedMonth, setSelectedMonth] = useState(maximumMonth);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchMonthlyReport(selectedMonth, controller.signal)
      .then((data) => setReport(data))
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setReport(null);
        setError(loadError instanceof Error ? loadError.message : 'The report could not be generated.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selectedMonth]);

  const refreshReport = async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchMonthlyReport(selectedMonth));
    } catch (loadError: unknown) {
      setReport(null);
      setError(loadError instanceof Error ? loadError.message : 'The report could not be generated.');
    } finally {
      setLoading(false);
    }
  };

  const csvHref = `/api/po/reports/monthly?month=${encodeURIComponent(selectedMonth)}&format=csv`;

  return (
    <PageShell>
      <StageHeader
        eyebrow="Purchasing Office · Transaction Transparency"
        title="Monthly purchasing reports"
        description="Review Purchase Orders created during a selected month and export the authoritative transaction register as an Excel-compatible CSV file."
        meta={{ label: 'Reporting timezone', value: 'Philippine Time (PHT)' }}
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/80 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
          <div className="w-full sm:max-w-xs">
            <label htmlFor="report-month" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
              Transaction month
            </label>
            <input
              id="report-month"
              type="month"
              max={maximumMonth}
              value={selectedMonth}
              onChange={(event) => {
                setSelectedMonth(event.target.value);
                setReport(null);
                setError(null);
                setLoading(true);
              }}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                refreshReport();
              }}
              disabled={loading || !selectedMonth}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Generating…' : 'Refresh Preview'}
            </button>
            <a
              href={csvHref}
              aria-disabled={!selectedMonth || loading}
              onClick={(event) => {
                if (!selectedMonth || loading) event.preventDefault();
              }}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-800 ${!selectedMonth || loading ? 'pointer-events-none opacity-50' : ''}`}
            >
              <DownloadIcon />
              Export CSV for Excel
            </a>
          </div>
        </div>

        <div className="px-4 py-3 text-sm leading-6 text-slate-600 sm:px-5">
          The report includes every PO created within the selected Philippine calendar month, including transactions still awaiting financial clearance or delivery.
        </div>
      </section>

      {loading && !report ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center text-xs font-semibold text-slate-600">
          Generating the monthly transaction register…
        </div>
      ) : report ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Purchase Orders', value: report.summary.transactionCount.toLocaleString(), detail: report.monthLabel },
              { label: 'Total Units', value: report.summary.totalQuantity.toLocaleString(), detail: 'Across all item lines' },
              { label: 'Recorded Value', value: formatPeso(report.summary.totalAmount), detail: 'Based on stored unit prices' },
              { label: 'Received', value: `${report.summary.receivedCount} / ${report.summary.transactionCount}`, detail: 'Transactions with intake record' },
            ].map((metric) => (
              <div key={metric.label} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs sm:p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600 sm:text-xs sm:tracking-[0.12em]">{metric.label}</p>
                <p className="mt-2 break-words font-mono text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{metric.value}</p>
                <p className="mt-1 text-xs text-slate-600">{metric.detail}</p>
              </div>
            ))}
          </div>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="flex flex-col gap-1 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{report.monthLabel} transaction register</h2>
                <p className="mt-0.5 text-xs text-slate-600">Preview generated {report.generatedAt} PHT</p>
              </div>
              <span className="mt-2 w-fit rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 sm:mt-0">
                {report.rows.length} record{report.rows.length === 1 ? '' : 's'}
              </span>
            </div>

            {report.rows.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-sm font-semibold text-slate-700">No Purchase Orders were created in this month.</p>
                <p className="mt-1 text-xs text-slate-600">You can still export an empty register containing the official column headings.</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-200 lg:hidden">
                  {report.rows.map((row) => (
                    <article key={row.poNumber} className="p-4 sm:p-5">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-all font-mono text-sm font-semibold text-emerald-800">{row.poNumber}</p>
                          <p className="mt-1 text-xs text-slate-600">{row.transactionDate}</p>
                        </div>
                        <span className={`max-w-[45%] break-words rounded-full border px-2 py-1 text-xs font-semibold ${row.receivingStatus.startsWith('Received') ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                          {row.receivingStatus}
                        </span>
                      </div>

                      <div className="mt-4 min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Items</p>
                        <p className="mt-1.5 break-words text-sm font-medium leading-6 text-slate-800 [overflow-wrap:anywhere]">
                          {row.itemSummary || 'No structured item data'}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">{row.lineItemCount} line item(s) · {row.totalQuantity} unit(s)</p>
                      </div>

                      <dl className="mt-4 grid min-w-0 grid-cols-2 gap-x-4 gap-y-4">
                        <div className="min-w-0">
                          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Requesting office</dt>
                          <dd className="mt-1 break-words text-sm font-semibold text-slate-900">{row.departmentCode}</dd>
                          <dd className="mt-0.5 break-words text-xs leading-4 text-slate-600">{row.departmentName}</dd>
                        </div>
                        <div className="min-w-0 text-right">
                          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Recorded amount</dt>
                          <dd className="mt-1 break-words font-mono text-sm font-semibold tabular-nums text-slate-900">{formatPeso(row.totalAmount)}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Payment</dt>
                          <dd className="mt-1 break-words text-xs font-semibold text-slate-800">{row.paymentType}</dd>
                          <dd className="mt-0.5 break-words text-xs leading-4 text-slate-600">{row.financialStatus}</dd>
                        </div>
                        <div className="min-w-0 text-right">
                          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Workflow</dt>
                          <dd className="mt-1 break-words text-xs font-semibold leading-4 text-slate-700">{row.workflowStatus}</dd>
                        </div>
                      </dl>

                      <div className="mt-4 flex flex-col gap-1 border-t border-slate-100 pt-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                        <span className="break-all">PR: {row.purchaseRequestId}</span>
                        {row.receivedDate && <span>Received {row.receivedDate}</span>}
                      </div>
                    </article>
                  ))}
                </div>

                <div className="hidden lg:block"><p className="border-b border-slate-200 px-4 py-2 text-xs text-slate-600">Scroll horizontally to see all register columns if needed.</p><div tabIndex={0} role="region" aria-label="Monthly transaction register table" className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-emerald-700">
                <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                      <th className="px-4 py-3">PO / Date</th>
                      <th className="px-4 py-3">Requesting Office</th>
                      <th className="px-4 py-3">Items</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Payment / Clearance</th>
                      <th className="px-4 py-3">Workflow</th>
                      <th className="px-4 py-3">Receiving</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.rows.map((row) => (
                      <tr key={row.poNumber} className="align-top text-sm text-slate-600 transition hover:bg-slate-50/70">
                        <td className="px-4 py-4">
                          <span className="block max-w-48 break-words font-mono font-semibold text-emerald-800 [overflow-wrap:anywhere]">{row.poNumber}</span>
                          <span className="mt-1 block text-xs text-slate-600">{row.transactionDate}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="block font-semibold text-slate-900">{row.departmentCode}</span>
                          <span className="mt-1 block max-w-44 text-xs leading-4 text-slate-600">{row.departmentName}</span>
                        </td>
                        <td className="max-w-xs px-4 py-4">
                          <span className="block break-words leading-6 text-slate-700 [overflow-wrap:anywhere]">{row.itemSummary || 'No structured item data'}</span>
                          <span className="mt-1 block text-xs text-slate-600">{row.lineItemCount} line item(s) · {row.totalQuantity} unit(s)</span>
                        </td>
                        <td className="px-4 py-4 text-right font-mono font-semibold tabular-nums text-slate-900">{formatPeso(row.totalAmount)}</td>
                        <td className="px-4 py-4">
                          <span className="block font-semibold text-slate-800">{row.paymentType}</span>
                          <span className="mt-1 block text-xs text-slate-600">{row.financialStatus}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-block rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">{row.workflowStatus}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`block font-semibold ${row.receivingStatus.startsWith('Received') ? 'text-emerald-700' : 'text-amber-700'}`}>{row.receivingStatus}</span>
                          {row.receivedDate && <span className="mt-1 block text-xs text-slate-600">{row.receivedDate}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div></div>
              </>
            )}
          </section>
        </>
      ) : null}
    </PageShell>
  );
}
