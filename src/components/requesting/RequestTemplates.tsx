'use client';

import { useEffect, useRef, useState } from 'react';
import { BookCopy, LoaderCircle, Save, Trash2 } from 'lucide-react';
import { actionFeedback } from '@/components/ui/action-feedback';
import { RequestTemplatePayloadSchema, templateToNewDraft } from '@/validation/request-template.schema';
import type { RequestDraftPayload } from '@/validation/request-draft.schema';
import { requesterFieldClass, requesterPrimaryClass, requesterSecondaryClass } from './RequesterUI';
import waves from './requester-waves.module.css';

interface TemplateSummary { id: string; name: string; version: number; createdAt: string; itemCount: number }

export default function RequestTemplates({ payload, disabled, onUse, onBusyChange, onAttention, onInventoryChange }: {
  payload: RequestDraftPayload; disabled: boolean; onUse: (payload: RequestDraftPayload, name: string) => void; onBusyChange: (busy: boolean) => void; onAttention?: () => void;
  onInventoryChange?: (inventory: { count: number; hasMore: boolean; loading: boolean }) => void;
}) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<TemplateSummary | null>(null);
  const busyRef = useRef(false), sequence = useRef(0);
  const latestUse = useRef(onUse);
  useEffect(() => { latestUse.current = onUse; }, [onUse]);
  const errorRef = useRef<HTMLDivElement>(null), confirmationRef = useRef<HTMLDivElement>(null);
  const blocked = disabled || busy || loading;
  const visible = templates.filter(template => template.name.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => { onInventoryChange?.({ count: templates.length, hasMore: nextPage !== null, loading }); }, [templates.length, nextPage, loading, onInventoryChange]);

  async function refresh(page = 0) {
    const current = ++sequence.current;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/pr/templates?page=${page}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load your templates.');
      if (current !== sequence.current) return;
      setTemplates(previous => page === 0 ? result.data : [...previous, ...result.data.filter((entry: TemplateSummary) => !previous.some(old => old.id === entry.id))]);
      setNextPage(result.nextPage);
    } catch (cause) { if (current === sequence.current) setError(cause instanceof Error ? cause.message : 'Unable to load your templates.'); }
    finally { if (current === sequence.current) setLoading(false); }
  }
  useEffect(() => {
    let cancelled = false;
    const generation = sequence;
    void Promise.resolve().then(() => { if (!cancelled) void refresh(); });
    return () => { cancelled = true; generation.current++; };
  }, []);
  useEffect(() => { if (error) { onAttention?.(); errorRef.current?.focus(); } }, [error, onAttention]);
  useEffect(() => { if (pendingRemove) { onAttention?.(); confirmationRef.current?.focus(); } }, [pendingRemove, onAttention]);

  async function save() {
    if (blocked || busyRef.current) return;
    busyRef.current = true; setBusy(true); onBusyChange(true); setError(null); setNotice(null);
    try {
      const response = await fetch('/api/pr/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, payload: { items: payload.items, justification: payload.justification } }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save this template.');
      setName(''); setQuery('');
      setNotice(`“${result.data.name}” saved for reuse. Your current request has not been submitted.`);
      actionFeedback('Template saved', 'Your item list and justification are saved for reuse. Your current request has not been submitted.');
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save this template. Your form has been kept.'); }
    finally { busyRef.current = false; setBusy(false); onBusyChange(false); }
  }
  async function applyTemplate(id: string) {
    if (blocked || busyRef.current) return;
    busyRef.current = true; setBusy(true); onBusyChange(true); setError(null); setNotice(null); setPendingRemove(null);
    try {
      const response = await fetch(`/api/pr/templates?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load this template.');
      const parsed = RequestTemplatePayloadSchema.safeParse(result.data.payload);
      if (!parsed.success) throw new Error('This template cannot be restored. Your current form has been kept.');
      latestUse.current(templateToNewDraft(parsed.data), result.data.name);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load this template. Your form has been kept.'); }
    finally { busyRef.current = false; setBusy(false); onBusyChange(false); }
  }
  async function remove() {
    if (blocked || !pendingRemove || busyRef.current) return;
    const target = pendingRemove;
    busyRef.current = true; setBusy(true); onBusyChange(true); setError(null); setNotice(null);
    try {
      const response = await fetch('/api/pr/templates', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: target.id, version: target.version }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to confirm template removal.');
      setTemplates(previous => previous.filter(template => template.id !== target.id)); setPendingRemove(null);
      setNotice('Template removed. Your current form and saved requests have been kept.');
      actionFeedback('Template removed', 'The reusable copy was removed. Your current form and saved requests have been kept.');
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to confirm template removal.'); }
    finally { busyRef.current = false; setBusy(false); onBusyChange(false); }
  }

  return <section aria-labelledby="request-templates-title" className={`mb-6 min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 ${waves.support}`}>
    <h2 id="request-templates-title" className="flex items-center gap-2 text-base font-semibold"><BookCopy className="size-5 shrink-0 text-emerald-800" aria-hidden="true" />Your request templates</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">Save recurring items and justification for reuse. Templates are private to your account and current department. Each use starts a new request for you to review.</p>
    <details className="mt-3">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-emerald-700">Save this item list as a template</summary>
      <div className="mt-2 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-sm font-medium">Template name<input value={name} onChange={event => setName(event.target.value)} maxLength={120} disabled={blocked} placeholder="For example: Monthly office supplies" className={`${requesterFieldClass} mt-2`} /></label>
        <button type="button" disabled={blocked || !name.trim()} onClick={() => void save()} className={requesterSecondaryClass}><Save className="size-4 shrink-0" aria-hidden="true" />Save template</button>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600">Complete item specifications and whole quantities first. Approval attachments and fast-track choices are not stored in templates. Save draft separately to keep your current work.</p>
    </details>
    {busy && <p role="status" className="mt-3 flex items-center gap-2 text-sm text-slate-600"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Working with templates…</p>}
    {notice && <p role="status" className="mt-3 break-words text-sm leading-6 text-emerald-900 [overflow-wrap:anywhere]">{notice}</p>}
    {error && <div ref={errorRef} tabIndex={-1} role="alert" className="mt-3 scroll-mt-36 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-900 [overflow-wrap:anywhere]">{error}</div>}
    {pendingRemove && <div ref={confirmationRef} tabIndex={-1} role="region" aria-label="Confirm template removal" className="mt-4 scroll-mt-36 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <p className="break-words text-sm font-semibold [overflow-wrap:anywhere]">Remove “{pendingRemove.name}”?</p><p className="mt-1 text-sm leading-6">This permanently removes the reusable copy. Existing drafts, submitted requests and your current form are kept.</p>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={blocked} onClick={() => void remove()} className={`${requesterSecondaryClass} text-rose-800`}>Remove saved template</button><button type="button" disabled={blocked} onClick={() => setPendingRemove(null)} className={requesterSecondaryClass}>Keep template</button></div>
    </div>}
    <details className="mt-3">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-emerald-700">Use a saved template ({templates.length}{nextPage !== null ? '+' : ''})</summary>
      <label className="mt-2 block text-sm font-medium">Find a template<input type="search" value={query} onChange={event => setQuery(event.target.value)} className={`${requesterFieldClass} mt-2`} placeholder="Search loaded template names" /></label>
      {loading && <p role="status" className="mt-3 flex items-center gap-2 text-sm text-slate-600"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Loading templates…</p>}
      {!loading && !visible.length && <p className="mt-3 text-sm leading-6 text-slate-600">{error ? 'Templates are unavailable. Refresh to try again.' : query ? 'No loaded templates match this name. Clear your search or load more templates.' : 'No saved templates yet. Name and save an item list to reuse it later.'}</p>}
      <ul className="mt-3 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.map(template => <li key={template.id} className="min-w-0 rounded-lg border border-slate-200 p-3">
        <p className="break-words text-sm font-semibold [overflow-wrap:anywhere]">{template.name}</p><p className="mt-2 text-xs leading-5 text-slate-600">{template.itemCount} {template.itemCount === 1 ? 'item' : 'items'} · Saved {new Date(template.createdAt).toLocaleDateString('en-PH')}</p>
        <button type="button" disabled={blocked} onClick={() => void applyTemplate(template.id)} className={`${requesterPrimaryClass} mt-3 w-full`}>Use template</button>
        <button type="button" disabled={blocked} onClick={() => setPendingRemove(template)} aria-label={`Remove template: ${template.name}`} className={`${requesterSecondaryClass} mt-2 w-full text-rose-800`}><Trash2 className="size-4 shrink-0" aria-hidden="true" />Remove template</button>
      </li>)}</ul>
      <div className="mt-3 flex flex-wrap gap-2">{nextPage !== null && <button type="button" disabled={blocked} onClick={() => void refresh(nextPage)} className={requesterSecondaryClass}>Load more templates</button>}<button type="button" disabled={disabled || busy || loading} onClick={() => void refresh()} className={requesterSecondaryClass}>Refresh templates</button></div>
    </details>
  </section>;
}
