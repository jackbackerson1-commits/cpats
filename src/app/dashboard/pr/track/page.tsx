'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { ArrowLeft, Check, CheckCircle2, CircleAlert, CircleX, Clock3, ClipboardList, FilePlus2, X } from 'lucide-react';
import { RequesterPageHeader, requesterPrimaryClass } from '@/components/requesting/RequesterUI';
import { QueueFilters, useQueueFilters, WaitingTime } from '@/components/ui/QueueFilters';
import { matchesQueueFilters } from '@/shared/queue-insights';
import Link from 'next/link';
import { Role, PRStatus } from '@prisma/client';
import { AuthUser } from '@/shared/session';
import { deriveItemSummaryTitle } from '@/components/ui/WorkflowUI';
import { RequestAuditTimeline } from '@/components/requesting/RequestAuditTimeline';
import styles from '@/components/requesting/request-track.module.css';

// Tracking-only presentation: selections and actions share the institutional accent.
const trackingRecordActionClass = 'inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold leading-5 text-emerald-900 transition hover:border-emerald-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700';

// ─── Type Definitions ─────────────────────────────────────────────────────────
interface AuditLogNode {
  id?: string;
  createdAt: string;
  previousState: PRStatus | null;
  newState: PRStatus;
  remarks: string | null;
  actor: {
    email: string;
    role: Role;
  };
}

interface DepartmentPRNode {
  id: string;
  justification: string;
  itemsPayload?: unknown;
  adminProofFilePath?: string | null;
  status: PRStatus;
  isDirectPoBypass: boolean;
  createdAt: string;
  updatedAt: string;
  department: {
    code: string;
    name: string;
  };
  auditLogs?: AuditLogNode[];
}

// src/app/dashboard/pr/track/page.tsx

function AlertTriangleIcon({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function HistoryIcon({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function FileTextIcon({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function SearchIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// ─── Status Badge Mapper ───────────────────────────────────────────────────────
function mapStatusToBadge(status: PRStatus): {
  label: string;
  badgeClass: string;
  dotClass: string;
  rowAccent: string;
} {
  switch (status) {
    case PRStatus.Draft:
      return {
        label: 'Draft',
        badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
        dotClass: 'bg-slate-400',
        rowAccent: '',
      };
    case PRStatus.Pending_Business_Approval:
      return {
        label: 'Pending Budget Check',
        badgeClass: 'bg-indigo-50 text-indigo-900 border-indigo-100',
        dotClass: 'bg-emerald-700',
        rowAccent: '',
      };
    case PRStatus.Pending_Admin_Approval:
      return {
        label: 'Pending Executive Sign-off',
        badgeClass: 'bg-indigo-50 text-indigo-900 border-indigo-100',
        dotClass: 'bg-emerald-700',
        rowAccent: '',
      };
    case PRStatus.Approved_Awaiting_PO:
      return {
        label: 'Approved — Awaiting PO',
        badgeClass: 'bg-emerald-50 text-emerald-900 border-emerald-200',
        dotClass: 'bg-emerald-700',
        rowAccent: '',
      };
    case PRStatus.Awaiting_Check_Issuance:
      return {
        label: 'Financial Clearance Pending',
        badgeClass: 'bg-indigo-50 text-indigo-900 border-indigo-100',
        dotClass: 'bg-emerald-700',
        rowAccent: '',
      };
    case PRStatus.Ready_for_Purchase:
      return {
        label: 'Ready for Purchase',
        badgeClass: 'bg-indigo-50 text-indigo-900 border-indigo-100',
        dotClass: 'bg-emerald-700',
        rowAccent: '',
      };
    case PRStatus.Received_and_Closed:
      return {
        label: 'Cargo Received & Closed',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        dotClass: 'bg-emerald-600',
        rowAccent: '',
      };
    case PRStatus.Returned_for_Correction:
      return {
        label: 'Action Needed: Returned',
        badgeClass: 'bg-amber-50/50 text-amber-900 border-amber-200/70',
        dotClass: 'bg-amber-700',
        rowAccent: '',
      };
    case PRStatus.Declined:
      return {
        label: 'Declined',
        badgeClass: 'bg-rose-50/40 text-rose-900 border-rose-200/70',
        dotClass: 'bg-rose-700',
        rowAccent: '',
      };
    default:
      return {
        label: String(status).replace(/_/g, ' '),
        badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
        dotClass: 'bg-slate-400',
        rowAccent: '',
      };
  }
}

// ─── Procurement Stage Progress Tracker ───────────────────────────────────────
const STAGE_ORDER: PRStatus[] = [
  PRStatus.Draft,
  PRStatus.Pending_Business_Approval,
  PRStatus.Pending_Admin_Approval,
  PRStatus.Approved_Awaiting_PO,
  PRStatus.Awaiting_Check_Issuance,
  PRStatus.Ready_for_Purchase,
  PRStatus.Received_and_Closed,
];

const APPROVED_STATES: PRStatus[] = [PRStatus.Approved_Awaiting_PO, PRStatus.Awaiting_Check_Issuance, PRStatus.Ready_for_Purchase, PRStatus.Received_and_Closed];

function matchesStatusFilter(status: PRStatus, filter: string) {
  switch (filter) {
    case 'ACTION_REQUIRED': return status === PRStatus.Returned_for_Correction;
    case 'IN_PROGRESS': return status !== PRStatus.Received_and_Closed && status !== PRStatus.Declined && status !== PRStatus.Returned_for_Correction;
    case 'APPROVED': return APPROVED_STATES.includes(status);
    case 'DECLINED': return status === PRStatus.Declined;
    case 'CLOSED': return status === PRStatus.Received_and_Closed;
    default: return true;
  }
}

function StatusIcon({ status }: { status: PRStatus }) {
  const Icon = status === PRStatus.Returned_for_Correction ? CircleAlert : status === PRStatus.Declined ? CircleX : APPROVED_STATES.includes(status) ? CheckCircle2 : Clock3;
  return <Icon className="size-4 shrink-0" aria-hidden="true" />;
}

function getStageIndex(status: PRStatus): number {
  const idx = STAGE_ORDER.indexOf(status);
  return idx === -1 ? 0 : idx;
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────
function LoadingLedger() {
  return (
    <div className="min-h-[60dvh] flex flex-col items-center justify-center space-y-4 font-sans">
      <div
        className="w-10 h-10 rounded-full border-[3px] border-[#064E3B] border-t-transparent animate-spin"
        role="status"
        aria-label="Loading"
      />
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-[#064E3B] tracking-normal">
          DMC College Foundation, Inc.
        </p>
        <p className="text-sm text-slate-500 font-medium">
          Loading Department Requisition Ledger…
        </p>
      </div>
    </div>
  );
}

// ─── Access Denied State ──────────────────────────────────────────────────────
function AccessDenied() {
  return (
    <div className="min-h-[60dvh] flex items-center justify-center p-4 font-sans">
      <div className="max-w-sm w-full bg-white border border-rose-200 rounded-2xl shadow-sm p-6 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto">
          <span className="text-rose-600 text-xl font-semibold">✕</span>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 mb-1">Access Restricted</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            This ledger is exclusively authorized for Requesting Office personnel under the CPATS institutional pipeline.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#047857] hover:text-[#064E3B] transition"
        >
          ← Return to Dashboard
        </Link>
      </div>
    </div>
  );
}

// ─── Audit Timeline inside Modal ──────────────────────────────────────────────
function AuditTimeline({ logs, highlightedLogId }: { logs: AuditLogNode[]; highlightedLogId?: string | null }) {
  if (!logs || logs.length === 0) {
    return (
      <p className="text-sm text-slate-600 italic py-2">
        No decision entries have been logged yet for this requisition.
      </p>
    );
  }

  return (
    <ol className="relative space-y-3 border-l-2 border-slate-200 pl-4 sm:space-y-4">
      {logs.map((log, idx) => {
        const badgeInfo = mapStatusToBadge(log.newState);
        return (
          <li key={log.id ?? idx} id={log.id ? `audit-${log.id}` : undefined} className={`relative scroll-mt-36 ${log.id === highlightedLogId ? 'rounded-xl ring-2 ring-emerald-500 ring-offset-2' : ''}`}>
            <span className="absolute -left-[21px] top-1 w-3 h-3 rounded-full border-2 border-white bg-[#047857] shadow-sm" />
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                <span
                  className={`inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium leading-5 ${badgeInfo.badgeClass}`}
                >
                  <span className={`size-1.5 shrink-0 rounded-full ${badgeInfo.dotClass}`} />
                  {badgeInfo.label}
                </span>
                <time className="font-mono text-[12px] tabular-nums text-slate-600">
                  {new Date(log.createdAt).toLocaleString('en-PH', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
                <span className="font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                  {log.actor.role.replace(/_/g, ' ')}
                </span>
                <span className="text-slate-600">·</span>
                <span className="min-w-0 break-all sm:break-normal">{log.actor.email}</span>
              </div>
              {log.remarks && log.remarks.trim().length > 0 && (
                <p className="break-words rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700 [overflow-wrap:anywhere]">
                  &ldquo;{log.remarks}&rdquo;
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Stage Progress Bar ────────────────────────────────────────────────────────
function StageProgressBar({ status }: { status: PRStatus }) {
  const paused = status === PRStatus.Declined || status === PRStatus.Returned_for_Correction;
  const currentIdx = getStageIndex(status);
  const stages = ['Draft', 'Business review', 'Admin review', 'PO preparation', 'Financial clearance', 'Purchase', 'Received'];
  if (paused) {
    return <div className={`flex items-start gap-2 rounded-lg border p-4 text-sm leading-6 ${status === PRStatus.Declined ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}><CircleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" /><p>{status === PRStatus.Returned_for_Correction ? 'This request needs your corrections before it can continue.' : 'This request was declined. You may use its details to prepare a new request.'}</p></div>;
  }
  return (
    <div>
      <p className="mb-4 text-sm font-medium text-slate-700">Current stage: <span className="font-semibold text-emerald-900">{stages[currentIdx]}</span></p>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-7" aria-label="Request progress">
        {stages.map((stage, idx) => <li key={stage} aria-current={idx === currentIdx ? 'step' : undefined} className={`flex min-w-0 items-start gap-2 rounded-lg border p-3 xl:flex-col ${idx === currentIdx ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white'}`}><span className={`grid size-6 shrink-0 place-items-center rounded-full text-sm font-semibold ${idx < currentIdx ? 'bg-emerald-800 text-white' : idx === currentIdx ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-600'}`}>{idx < currentIdx ? <Check className="size-3.5" aria-hidden="true" /> : idx + 1}</span><span className="min-w-0"><span className="block text-sm font-medium leading-5 text-slate-800">{stage}</span><span className="block text-sm leading-5 text-slate-600">{idx < currentIdx ? 'Completed' : idx === currentIdx ? 'Current' : 'Upcoming'}</span></span></li>)}
      </ol>
    </div>
  );
}

function RequestItemDetails({ payload }: { payload: unknown }) {
  let entries: unknown = payload;
  if (typeof payload === 'string') {
    try { entries = JSON.parse(payload); } catch { entries = null; }
  }
  const items = Array.isArray(entries) ? entries.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object') : [];
  return (
    <section aria-labelledby="request-items-title" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 id="request-items-title" className="text-base font-semibold text-slate-950">Requested items</h2>
      {items.length === 0 ? <p className="mt-3 text-sm text-slate-600">An itemized list is not available for this record.</p> : <ol className="mt-4 divide-y divide-slate-200">{items.map((item, index) => {
        const name = typeof item.itemName === 'string' ? item.itemName : typeof item.name === 'string' ? item.name : 'Requested item';
        const quantity = item.quantity ?? item.qty;
        const specification = typeof item.specifications === 'string' ? item.specifications : typeof item.specs === 'string' ? item.specs : null;
        return <li key={index} className="flex min-w-0 flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="text-sm text-slate-600">Item {index + 1}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-900 [overflow-wrap:anywhere]">{name}</p>{specification && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{specification}</p>}</div><p className="shrink-0 text-sm text-slate-700">Quantity: <span className="font-semibold tabular-nums">{typeof quantity === 'number' || typeof quantity === 'string' ? String(quantity) : 'Not recorded'}</span></p></li>;
      })}</ol>}
    </section>
  );
}


// ─── Inline Detail / Audit Reader ─────────────────────────────────────────────
function InspectionPanel({
  node,
  onBack,
  highlightedLogId,
}: {
  node: DepartmentPRNode;
  onBack: () => void;
  highlightedLogId?: string | null;
}) {
  const badge = mapStatusToBadge(node.status);
  const isReturned = node.status === PRStatus.Returned_for_Correction;
  const isDeclined = node.status === PRStatus.Declined;
  const itemTitle = deriveItemSummaryTitle(node.itemsPayload, node.justification);

  const feedbackLog = node.auditLogs?.find(
    (log) =>
      log.newState === node.status
  );

  return (
      <section
        aria-labelledby="inspection-title"
        aria-describedby="inspection-description"
        className={`w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${styles.inspection}`}
      >
        
        {/* ─── Modal Header ─── */}
        <div className={`shrink-0 border-b border-slate-200 bg-white ${styles.inspectionHead}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <button
                type="button"
                onClick={onBack}
                className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
                <span className={styles.backLabel}>Back to requests</span>
              </button>
              <h1
                id="inspection-title"
                className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-950 leading-snug"
              >
                Request details
              </h1>
              <p title={node.id} className="break-all text-xs font-mono leading-5 text-slate-600">
                {node.id}
              </p>
              <p id="inspection-description" className="sr-only">
                Procurement stage and official decision history for this requisition.
              </p>
            </div>
          </div>
        </div>

        {/* ─── Detail Body ─── */}
        <div className={`space-y-6 ${styles.inspectionBody}`}>

          {/* Evaluator Feedback Alert (Returned / Declined) */}
          {(isReturned || isDeclined) && (
            <div
              className={`rounded-xl border p-4 space-y-3 ${
                isReturned
                  ? 'bg-amber-50/40 border-amber-200'
                  : 'bg-rose-50/40 border-rose-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span
                  className={`text-sm font-semibold tracking-normal flex items-center gap-1.5 ${
                    isReturned ? 'text-amber-900' : 'text-rose-900'
                  }`}
                >
                  <CircleAlert className="size-4 shrink-0" aria-hidden="true" />{isReturned ? 'Changes requested' : 'Request declined'}
                </span>
                <span className="text-[12px] font-semibold bg-white px-2 py-0.5 rounded-md border border-slate-200 text-slate-600 tracking-normal">
                  Evaluator Feedback
                </span>
              </div>

              {feedbackLog ? (
                <div className="space-y-2">
                  <div className="bg-white rounded-lg border border-slate-200 p-3">
                    <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                      &ldquo;{feedbackLog.remarks || 'No specific note was provided by the evaluator.'}&rdquo;
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between text-[12px] text-slate-500 gap-0.5">
                    <span>
                      Issued by:{' '}
                      <strong className="text-slate-700">
                        {feedbackLog.actor.role.replace(/_/g, ' ')}
                      </strong>
                    </span>
                    <span className="font-mono">
                      {new Date(feedbackLog.createdAt).toLocaleString('en-PH', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm italic text-slate-500">
                  No specific evaluation remarks have been logged.
                </p>
              )}

              {isReturned && (
                <Link
                  href={`/dashboard/pr/new?returnId=${encodeURIComponent(node.id)}`}
                  onClick={() => sessionStorage.setItem('cpats:request-template-navigation', `return:${node.id}`)}
                  className={`${requesterPrimaryClass} w-full sm:w-auto`}
                >
                  <FileTextIcon className="size-4 shrink-0" />
                  Modify returned request
                </Link>
              )}

              {isDeclined && (
                <Link
                  href={`/dashboard/pr/new?declineId=${encodeURIComponent(node.id)}`}
                  onClick={() => sessionStorage.setItem('cpats:request-template-navigation', `decline:${node.id}`)}
                  className={`${requesterPrimaryClass} w-full sm:w-auto`}
                >
                  <FileTextIcon className="size-4 shrink-0" />
                  Start new request using these details
                </Link>
              )}
            </div>
          )}

          {/* Requisition Scope Summary */}
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <div className="flex flex-col items-start gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:justify-between">
              <h2 className="text-base font-semibold text-slate-950 leading-6 flex-1 min-w-0 break-words [overflow-wrap:anywhere]">
                {itemTitle}
              </h2>
              <span
                className={`inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium leading-5 ${badge.badgeClass}`} data-request-status="true"
              >
                <StatusIcon status={node.status} />
                {badge.label}
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-[12px] font-semibold text-emerald-900 tracking-normal block">
                Reason for the request
              </span>
              <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                &ldquo;{node.justification}&rdquo;
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 text-[12px]">
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-900 font-medium">Filed:</span>
                <span className="font-mono font-semibold text-[#064E3B]">
                  {new Date(node.createdAt).toLocaleDateString('en-PH', {
                    weekday: 'short',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
              {node.isDirectPoBypass && (
                <span className="font-semibold text-[#064E3B] bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300 text-[12px] tracking-normal w-fit">
                  Approval letter on file
                </span>
              )}
            </div>
          </div>

          <RequestItemDetails payload={node.itemsPayload} />
          {node.adminProofFilePath && <div className="rounded-xl border border-slate-200 p-4"><h3 className="text-base font-semibold text-slate-900">Approval document</h3><a href={node.adminProofFilePath} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 underline underline-offset-4">View attached document<span className="sr-only"> (opens in a new tab)</span></a></div>}

          {/* Procurement Stage Progress */}
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-slate-950">
              Request progress
            </h2>
            <StageProgressBar status={node.status} />
          </div>

          {/* Official Audit Timeline */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-slate-950">
              Decision and progress history
            </h2>
            {node.status === PRStatus.Returned_for_Correction
              ? <AuditTimeline logs={node.auditLogs || []} highlightedLogId={highlightedLogId} />
              : <RequestAuditTimeline logs={node.auditLogs || []} highlightedLogId={highlightedLogId} statusBadge={mapStatusToBadge} />}
          </div>
        </div>

        {/* ─── Modal Footer ─── */}
        <div className={`shrink-0 border-t border-slate-200 bg-white ${styles.inspectionFoot}`}>
          <button
            type="button"
            onClick={onBack}
            className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#064E3B] text-sm font-semibold text-white transition hover:bg-[#047857] active:scale-[0.99]"
          >
            <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
            Back to requests
          </button>
        </div>
      </section>
  );
}

// ─── Mobile Requisition Status Card ───────────────────────────────────────────
function MobileRequisitionCard({
  req,
  onInspect,
}: {
  req: DepartmentPRNode;
  onInspect: (req: DepartmentPRNode) => void;
}) {
  const badge = mapStatusToBadge(req.status);
  const itemTitle = deriveItemSummaryTitle(req.itemsPayload, req.justification);
  const isReturned = req.status === PRStatus.Returned_for_Correction;
  const isDeclined = req.status === PRStatus.Declined;


  return (
    <article
      data-action-needed={isReturned}
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs"
    >
      <div className="p-4 space-y-3">
        {/* Card Header */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span
            className={`inline-flex max-w-full items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium leading-5 border ${badge.badgeClass}`} data-request-status="true"
          >
            <StatusIcon status={req.status} />
            {badge.label}
          </span>
          <time className="text-[12px] font-medium text-slate-600 shrink-0">
            {new Date(req.createdAt).toLocaleDateString('en-PH', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </time>
        </div>

        <WaitingTime record={req} />
        {/* Item Summary */}
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-900 leading-snug break-words [overflow-wrap:anywhere]">
            {itemTitle}
          </h2>
          <p className="text-sm text-slate-600 line-clamp-2 leading-6 break-words [overflow-wrap:anywhere]">
            &ldquo;{req.justification}&rdquo;
          </p>
        </div>

        {/* Return reason preview */}
        {isReturned && req.auditLogs && req.auditLogs.length > 0 && (() => {
          const log = req.auditLogs.find((l) => l.newState === PRStatus.Returned_for_Correction && l.remarks);
          return log ? (
            <div className="bg-amber-50/40 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-900 line-clamp-2 break-words [overflow-wrap:anywhere]">
              &ldquo;{log.remarks}&rdquo;
            </div>
          ) : null;
        })()}

        {/* Meta Row */}
        <div className="flex items-center justify-between text-[12px] text-slate-600 pt-0.5">
          <code className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-slate-600 font-mono font-semibold">
            {req.id.substring(0, 13)}…
          </code>
          {req.isDirectPoBypass && (
            <span className="font-semibold text-[#064E3B] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[12px] tracking-normal">
              Pre-Approved
            </span>
          )}
        </div>

        {/* CTA Button */}
        <button
          type="button"
          onClick={() => onInspect(req)}
          className={`${trackingRecordActionClass} w-full`}
        >
          {isReturned ? (
            <>
              <AlertTriangleIcon className="size-4 shrink-0" />
              <span>View requested changes</span>
            </>
          ) : isDeclined ? (
            <>
              <FileTextIcon className="size-4 shrink-0" />
              <span>View decline notice</span>
            </>
          ) : (
            <>
              <HistoryIcon className="size-4 shrink-0" />
              <span>View request details</span>
            </>
          )}
        </button>
      </div>
    </article>
  );
}

// ─── Summary Statistics Bar ───────────────────────────────────────────────────
function SummaryStatsBar({ requests, active, onFilter }: { requests: DepartmentPRNode[]; active: string; onFilter: (filter: string) => void }) {
  const summaries = [
    { id: 'ALL', label: 'Total requests', hint: 'Your department' },
    { id: 'ACTION_REQUIRED', label: 'Action needed', hint: 'Returned for correction' },
    { id: 'IN_PROGRESS', label: 'In progress', hint: 'Review & purchasing' },
    { id: 'APPROVED', label: 'Approved', hint: 'Includes later stages' },
    { id: 'DECLINED', label: 'Declined', hint: 'View office feedback' },
    { id: 'CLOSED', label: 'Received & closed', hint: 'Completed requests' },
  ];
  return (
    <div role="group" aria-label="Request status filters" className={styles.stats}>
      {summaries.map(({ id, label, hint }) => <button key={id} type="button" className={styles.stat} title={hint} aria-pressed={active === id} onClick={() => onFilter(id)}>
        <span>{label}</span>
        <span className={styles.statValue}>{requests.filter(request => matchesStatusFilter(request.status, id)).length}</span>
      </button>)}
    </div>
  );
}

// ─── Dynamic Empty State ──────────────────────────────────────────────────────
interface EmptyStateProps {
  statusFilter: string;
  searchQuery: string;
  totalCount: number;
  onReset: () => void;
}

function RequisitionEmptyState({
  statusFilter,
  searchQuery,
  totalCount,
  onReset,
}: EmptyStateProps) {
  const isFiltered = totalCount > 0;

  const getFilteredMessage = () => {
    if (searchQuery) {
      return `No requisitions matched "${searchQuery}". Try checking your spelling or clearing search.`;
    }
    switch (statusFilter) {
      case 'ACTION_REQUIRED':
        return 'There are no requisitions currently returned for correction.';
      case 'DECLINED':
        return 'There are no declined requisitions to review.';
      case 'IN_PROGRESS':
        return 'There are currently no requisitions undergoing review or purchasing.';
      case 'APPROVED':
        return 'No requests have reached approval or a later stage yet.';
      case 'CLOSED':
        return 'No requisitions have been marked as completed and closed yet.';
      default:
        return 'No requisitions match the selected criteria.';
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl py-14 px-4 text-center shadow-sm">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 mx-auto mb-3.5">
        <ClipboardList className="w-6 h-6 stroke-[1.75]" aria-hidden="true" />
      </div>

      <h3 className="text-sm font-semibold text-slate-800">
        {isFiltered ? 'No requests match these filters' : 'No purchase requests on file'}
      </h3>

      <p className="mx-auto mt-1 max-w-sm break-words text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">
        {isFiltered
          ? getFilteredMessage()
          : 'Your department has not submitted any purchase requests yet.'}
      </p>

      {!isFiltered ? (
        <Link
          href="/dashboard/pr/new"
          className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[#047857] hover:text-[#064E3B] transition"
        >
          Submit your department&apos;s first request &rarr;
        </Link>
      ) : (
        <button
          type="button"
          onClick={onReset}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition cursor-pointer"
        >
          Reset filters &amp; search
        </button>
      )}
    </div>
  );
}

// ─── Main Page Component ───────────────────────────────────────────────────────
export default function RequestTrackingPage() {
  const [isPending, startTransition] = useTransition();

  const [activeUser, setActiveUser] = useState<AuthUser | null>(null);
  const [userLoading, setUserLoading] = useState<boolean>(true);

  const [requests, setRequests] = useState<DepartmentPRNode[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [queueFilters, setQueueFilters] = useQueueFilters();
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [systemError, setSystemError] = useState<string | null>(null);
  const [submissionConfirmation, setSubmissionConfirmation] = useState<{ id: string; corrected: boolean } | null>(null);
  const [activeInspectionNode, setActiveInspectionNode] = useState<DepartmentPRNode | null>(null);
  const [highlightedLogId, setHighlightedLogId] = useState<string | null>(null);
  const recordsAreaRef = useRef<HTMLElement>(null);
  const listScrollPositionRef = useRef(0);
  const inspectionTriggerRef = useRef<HTMLElement | null>(null);

  const openInspection = (request: DepartmentPRNode) => {
    setHighlightedLogId(null);
    listScrollPositionRef.current = window.scrollY;
    inspectionTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActiveInspectionNode(request);
    window.requestAnimationFrame(() => {
      recordsAreaRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
  };

  const closeInspection = () => {
    const previousScrollPosition = listScrollPositionRef.current;
    const previousTrigger = inspectionTriggerRef.current;
    setActiveInspectionNode(null);
    setHighlightedLogId(null);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: previousScrollPosition, left: 0, behavior: 'auto' });
        previousTrigger?.focus({ preventScroll: true });
      });
    });
  };

  useEffect(() => {
    const fetchDepartmentRequests = (role: Role, departmentId: string) => {
      startTransition(async () => {
        try {
          const response = await fetch('/api/pr/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, departmentId }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Failed to fetch departmental requests.');
          const departmentRequests: DepartmentPRNode[] = result.data || [];
          setRequests(departmentRequests);
          // Consume transient feedback only after the authorized records load.
          try {
            const message = sessionStorage.getItem('cpats:request-submitted');
            if (message) {
              sessionStorage.removeItem('cpats:request-submitted');
              const submitted: unknown = JSON.parse(message);
              if (submitted && typeof submitted === 'object' && 'id' in submitted && typeof submitted.id === 'string' && departmentRequests.some((record) => record.id === submitted.id)) {
                setSubmissionConfirmation({ id: submitted.id, corrected: 'corrected' in submitted && submitted.corrected === true });
              }
            }
          } catch {
            // Optional feedback must not prevent loading the request list.
          }
          const params = new URLSearchParams(window.location.search);
          const linkedRequest = departmentRequests.find((item) => item.id === params.get('prId'));
          if (linkedRequest) {
            const auditLogId = params.get('auditLogId');
            setActiveInspectionNode(linkedRequest);
            setHighlightedLogId(linkedRequest.auditLogs?.some((log) => log.id === auditLogId) ? auditLogId : null);
          }
        } catch (err: unknown) {
          setSystemError(
            err instanceof Error ? err.message : 'Network interrupt prevented loading requests.'
          );
        }
      });
    };

    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data) {
          setActiveUser(res.data);
          fetchDepartmentRequests(res.data.role, res.data.departmentId);
        }
      })
      .catch(() => setSystemError('Failed to verify session credentials.'))
      .finally(() => setUserLoading(false));
  }, []);

  useEffect(() => {
    if (!activeInspectionNode) return;
    const frame = window.requestAnimationFrame(() => {
      const target = highlightedLogId ? document.getElementById(`audit-${highlightedLogId}`) : recordsAreaRef.current;
      target?.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeInspectionNode, highlightedLogId]);

  if (userLoading) return <LoadingLedger />;
  if (!activeUser || activeUser.role !== Role.Requesting_Office) return <AccessDenied />;
  if (isPending && requests.length === 0) return <LoadingLedger />;

  // ─── Filtered Records ────────────────────────────────────────────────────────
  const filteredRequests = requests.filter((req) => {
    if (!matchesQueueFilters({ ...req, department: req.department.name }, queueFilters)) return false;
    const q = searchQuery.toLowerCase().trim();
    const title = deriveItemSummaryTitle(req.itemsPayload, req.justification).toLowerCase();
    const matchesSearch =
      !q ||
      title.includes(q) ||
      req.id.toLowerCase().includes(q) ||
      req.justification.toLowerCase().includes(q);

    return matchesSearch && matchesStatusFilter(req.status, statusFilter);
  });

  return (
    <>
      {/* Page-level canvas with institutional background */}
      <div className={`relative ${styles.canvas}`}>
        {/* DMC Crest Watermark */}

        <main className={`requester-workspace mx-auto font-sans antialiased text-slate-900 ${styles.page}`}>

          {!activeInspectionNode && (
            <>
          {/* ─── Page Header ────────────────────────────────────────────────── */}
          <RequesterPageHeader waveBackground title="Track requests" description="Follow your department’s requests, review office feedback, and see what needs your attention." department={`${activeUser.departmentName} (${activeUser.departmentCode})`} action={<Link href="/dashboard/pr/new" className={requesterPrimaryClass}><FilePlus2 className="size-4 shrink-0" aria-hidden="true" />New request</Link>} />
          {submissionConfirmation && (
            <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1"><p className="font-semibold">{submissionConfirmation.corrected ? 'Corrected request resubmitted' : 'Purchase request submitted'}</p><p className="mt-1 leading-6">Your request is now with the Business Office for review.</p><button type="button" className="mt-2 min-h-11 text-left font-semibold underline underline-offset-4" onClick={() => { const record = requests.find((request) => request.id === submissionConfirmation.id); if (record) openInspection(record); }}>View submitted request</button></div>
              <button type="button" aria-label="Dismiss submission confirmation" onClick={() => setSubmissionConfirmation(null)} className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-emerald-100"><X className="size-4" aria-hidden="true" /></button>
            </div>
          )}

          {/* ─── System Error Banner ─────────────────────────────────────────── */}
          {systemError && (
            <div
              role="alert"
              className="p-4 bg-rose-50 border border-rose-200 border-l-4 border-l-rose-600 rounded-xl text-rose-900 text-sm font-medium flex items-start justify-between gap-2.5 shadow-sm"
            >
              <div className="flex items-start gap-2">
                <CircleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
                <span>{systemError}</span>
              </div>
              <button
                type="button"
                onClick={() => setSystemError(null)}
                className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg text-rose-800 hover:bg-rose-100"
                aria-label="Dismiss error"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* ─── Search & Filter Control Bar ────────────────────────────────── */}
          <div className={`rounded-xl border border-slate-200 bg-white space-y-4 ${styles.searchPanel}`}>
            <p className="text-sm font-semibold text-slate-950">Find a request</p>
            <div className={styles.commandBar}>
              {/* Search */}
              <div className={`relative ${styles.searchField}`}>
                <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600 size-4 select-none pointer-events-none"/>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by equipment name, reference ID, or justification…"
                  className="w-full min-w-0 h-11 pl-10 pr-12 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 outline-none transition"
                  aria-label="Search requisitions"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-700"
                    aria-label="Clear search"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              <SummaryStatsBar requests={requests} active={statusFilter} onFilter={setStatusFilter} />
            </div>

            <div className={styles.advanced}><QueueFilters records={requests.map(req => ({ ...req, department: req.department.name }))} value={queueFilters} onChange={setQueueFilters} onClear={() => { setSearchQuery(''); setStatusFilter('ALL'); }} /></div>
            <p role="status" className="text-sm text-slate-600">{filteredRequests.length} of {requests.length} requests shown</p>
          </div>
            </>
          )}

          {/* ─── Records / Empty State ───────────────────────────────────────── */}
          <section ref={recordsAreaRef} className="scroll-mt-36" aria-label="Department procurement records">
          {activeInspectionNode && (
            <InspectionPanel node={activeInspectionNode} onBack={closeInspection} highlightedLogId={highlightedLogId} />
          )}
          <div className={activeInspectionNode ? 'hidden' : undefined}>
          {isPending ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
              <div className="w-5 h-5 border-2 border-[#047857] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium">Refreshing ledger…</span>
            </div>
          ) : filteredRequests.length === 0 ? (
            <RequisitionEmptyState
              statusFilter={statusFilter}
              searchQuery={searchQuery}
              totalCount={requests.length}
              onReset={() => {
                setSearchQuery('');
                setStatusFilter('ALL');
                setQueueFilters({ from: '', to: '', department: '', status: '' });
              }}
            />
          ) : (
            <>
              {/* ═══════════════════════════════════════════════════════════════ */}
              {/* Phone and tablet: stacked request cards                       */}
              {/* ═══════════════════════════════════════════════════════════════ */}
              <div className={`space-y-3 ${styles.cards}`}>
                <p className="text-[12px] font-semibold text-slate-600 px-0.5">
                  Showing {filteredRequests.length} of {requests.length} requisitions
                </p>
                {filteredRequests.map((req) => (
                  <MobileRequisitionCard
                    key={req.id}
                    req={req}
                    onInspect={openInspection}
                  />
                ))}
              </div>

              {/* ═══════════════════════════════════════════════════════════════ */}
              {/* Desktop: request table when adequate width is available        */}
              {/* ═══════════════════════════════════════════════════════════════ */}
              <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white ${styles.register}`}>
                {/* Table header context */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                  <span className="text-[12px] font-semibold text-slate-600 tracking-normal">
                    Department Procurement Records — {activeUser.departmentCode}
                  </span>
                  <span className="text-[12px] font-semibold text-slate-600">
                    {filteredRequests.length} record{filteredRequests.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full table-fixed border-collapse text-left" role="table">
                    <colgroup><col className="w-[13%]" /><col className="w-[24%]" /><col className="w-[18%]" /><col className="w-[10%]" /><col className="w-[18%]" /><col className="w-[17%]" /></colgroup>
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                        <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                          Reference
                        </th>
                        <th scope="col" className="px-5 py-3.5">
                          Requested Item Specifications
                        </th>
                        <th scope="col" className="px-5 py-3.5">
                          Justification
                        </th>
                        <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                          Date Filed
                        </th>
                        <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                          Current Stage
                        </th>
                        <th scope="col" className="px-5 py-3.5 text-right whitespace-nowrap">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                      {filteredRequests.map((req) => {
                        const badge = mapStatusToBadge(req.status);
                        const itemTitle = deriveItemSummaryTitle(req.itemsPayload, req.justification);
                        const isReturned = req.status === PRStatus.Returned_for_Correction;
                        const isDeclined = req.status === PRStatus.Declined;


                        return (
                          <tr
                            key={req.id}
                            data-action-needed={isReturned}
                            className={`transition-colors ${
                              isReturned
                                ? 'bg-white hover:bg-slate-50'
                                : 'hover:bg-slate-50/60'
                            }`}
                          >
                            {/* Reference Code */}
                            <td className="px-5 py-4 whitespace-nowrap">
                              <div className="space-y-1">
                                <code className="break-all font-mono text-xs leading-5 text-slate-600" title={req.id}>
                                  {req.id.substring(0, 13)}…
                                </code>
                                {req.isDirectPoBypass && (
                                  <span className="block text-[12px] font-semibold text-[#064E3B] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 tracking-normal w-fit">
                                    Pre-Approved
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Item Name */}
                            <td className="px-5 py-5 align-top">
                              <span className="block break-words text-sm font-semibold leading-6 text-slate-900 [overflow-wrap:anywhere]">
                                {itemTitle}
                              </span>
                            </td>

                            {/* Justification */}
                            <td
                              className="px-5 py-5 align-top text-sm leading-6 text-slate-600"
                              title={req.justification}
                            >
                              <span className="line-clamp-2 break-words [overflow-wrap:anywhere]">{req.justification}</span>
                            </td>

                            {/* Date */}
                            <td className="px-5 py-4 whitespace-nowrap">
                              <time className="text-xs leading-5 text-slate-600">
                                {new Date(req.createdAt).toLocaleDateString('en-PH', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </time>
                            </td>

                            {/* Status Badge */}
                            <td className="px-5 py-5 align-top">
                              <span
                                className={`inline-flex max-w-full items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium leading-5 border ${badge.badgeClass}`} data-request-status="true"
                              >
                                <StatusIcon status={req.status} />
                                {badge.label}
                              </span>
                              <WaitingTime record={req} />
                            </td>

                            {/* Action Button */}
                            <td className="px-5 py-5 text-right align-top">
                              <button
                                type="button"
                                onClick={() => openInspection(req)}
                                title={isReturned ? 'View requested changes' : isDeclined ? 'View decline notice' : 'View details'}
                                className={trackingRecordActionClass}
                              >
                                {isReturned ? (
                                  <>
                                    <AlertTriangleIcon className="size-3.5 shrink-0" />
                                    <span>View requested changes</span>
                                  </>
                                ) : isDeclined ? (
                                  <>
                                    <FileTextIcon className="size-3.5 shrink-0" />
                                    <span>View decline notice</span>
                                  </>
                                ) : (
                                  <>
                                    <HistoryIcon className="size-3.5 shrink-0" />
                                    <span>View details</span>
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
          </div>
          </section>

          {/* ─── Page Footer ─────────────────────────────────────────────────── */}
          <footer className="pb-4 pt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-600 font-medium">
            <span>CPATS · Campus Procurement Automation &amp; Tracking System</span>
            <span>DMC College Foundation, Inc. · Dipolog</span>
          </footer>
        </main>
      </div>

    </>
  );
}
