'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Role } from '@prisma/client';
import type { AuthUser } from '@/shared/session';
import AuditWorkspace, { type AuditRecord } from '@/components/audit/AuditWorkspace';
import { actionFeedback, submissionFeedbackError } from '@/components/ui/action-feedback';
export default function GlobalAuditorConsolePage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [eventId, setEventId] = useState<string | null>(null);
  const targetHandled = useRef(false), sequence = useRef(0);
  const notificationScrolled = useRef(false);
  useEffect(() => {
    let mounted = true;
    void fetch('/api/auth/me').then(response => response.json()).then(result => {
      if (!mounted) return;
      if (result.success && result.data) setUser(result.data);
      else setError('Your session could not be verified. Sign in again to open the audit ledger.');
    }).catch(() => { if (mounted) setError('Session verification failed. Reload the page to try again.'); })
      .finally(() => { if (mounted) setSessionLoading(false); });
    return () => { mounted = false; };
  }, []);
  const load = useCallback(async (feedback = false) => {
    if (user?.role !== Role.Global_Auditor) return;
    const current = ++sequence.current;
    await Promise.resolve();
    if (current !== sequence.current) return;
    setLoading(true); setError(null); setNotificationError(null);
    try {
      const response = await fetch('/api/audit/report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: status || undefined, sortOrder: order }),
      });
      const result = await response.json();
      if (current !== sequence.current) return;
      if (!response.ok) throw new Error(result.error || 'The audit ledger could not be loaded.');
      const next: AuditRecord[] = result.data || [];
      setRecords(next);
      setSelectedId(previous => next.some(record => record.id === previous) ? previous : '');
      if (feedback) actionFeedback('Audit ledger refreshed', `${next.length} request records loaded. Audit access remains read-only.`);
      if (!targetHandled.current) {
        const params = new URLSearchParams(window.location.search), prId = params.get('prId'), auditLogId = params.get('auditLogId');
        if (prId) {
          const record = next.find(record => record.id === prId);
          if (record) {
            setSelectedId(prId);
            setEventId(record.auditLogs.some(log => log.id === auditLogId) ? auditLogId : null);
            targetHandled.current = true;
          } else setNotificationError('This notification’s request is not available in the current audit ledger. Refresh or clear the status filter.');
        } else targetHandled.current = true;
      }
    } catch (cause) {
      if (current !== sequence.current) return;
      setError(cause instanceof Error ? cause.message : 'The audit ledger could not be loaded.');
      if (feedback) submissionFeedbackError(cause, 'Audit refresh failed');
    } finally { if (current === sequence.current) setLoading(false); }
  }, [user, status, order]);
  useEffect(() => {
    let mounted = true;
    const counter = sequence;
    void Promise.resolve().then(() => { if (mounted) return load(); });
    return () => { mounted = false; counter.current++; };
  }, [load]);
  useEffect(() => {
    const targetId = new URLSearchParams(window.location.search).get('prId');
    if (!selectedId || selectedId !== targetId || notificationScrolled.current) return;
    notificationScrolled.current = true;
    const frame = window.requestAnimationFrame(() => {
      const event = eventId && document.getElementById(`audit-event-${eventId}`);
      (event || document.querySelector('[aria-label="Audit record details"]'))?.scrollIntoView({ block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedId, eventId]);
  if (sessionLoading) return <p role="status" className="mx-auto max-w-[1920px] px-4 py-10 text-sm text-slate-600 sm:px-6 lg:px-8">Loading audit session…</p>;
  if (!user || user.role !== Role.Global_Auditor) return <div role="alert" className="mx-4 my-8 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{error || 'The audit ledger is available to Global Auditors only.'}</div>;
  return <AuditWorkspace records={records} loading={loading} error={error} notificationError={notificationError} status={status} order={order} onStatus={setStatus} onOrder={setOrder} refresh={() => void load(true)} selectedId={selectedId} onSelect={setSelectedId} eventId={eventId} email={user.email} />;
}
