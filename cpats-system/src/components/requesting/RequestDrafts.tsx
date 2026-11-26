'use client';

import { useEffect, useRef, useState } from 'react';
import { FilePenLine, LoaderCircle, Save, Trash2 } from 'lucide-react';
import { actionFeedback } from '@/components/ui/action-feedback';
import type { RequestDraftPayload } from '@/validation/request-draft.schema';
import { RequestDraftPayloadSchema } from '@/validation/request-draft.schema';
import { requesterPrimaryClass, requesterSecondaryClass } from './RequesterUI';
import waves from './requester-waves.module.css';

interface DraftSummary { id: string; version: number; title: string; updatedAt: string; itemCount: number }
interface SavedDraft { id: string; version: number; updatedAt: string }
interface DraftReply { success: boolean; error?: string; data: SavedDraft & { payload: RequestDraftPayload } }

async function loadSavedDraft(id: string): Promise<DraftReply['data']> {
  const response = await fetch(`/api/pr/drafts?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
  const result: DraftReply = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || 'Unable to open this draft.');
  // Do not replace the current form with a damaged or unsupported snapshot.
  const parsed = RequestDraftPayloadSchema.safeParse(result.data.payload);
  if (!parsed.success) throw new Error('This draft could not be restored. Your current form has been kept.');
  return { ...result.data, payload: parsed.data };
}

export function useRequestDrafts(enabled: boolean, payload: RequestDraftPayload, restore: (payload: RequestDraftPayload | null) => void) {
  const [active, setActive] = useState<SavedDraft | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [initialSnapshot] = useState(() => JSON.stringify(payload));
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [listBusy, setListBusy] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const suppressUnload = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingOpen, setPendingOpen] = useState<{ id: string | null; leave?: () => void } | null>(null);
  const [pendingRemove, setPendingRemove] = useState<DraftSummary | null>(null);
  const serialized = JSON.stringify(payload);
  const dirty = serialized !== (snapshot ?? initialSnapshot);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const initialize = async () => {
      const id = new URLSearchParams(window.location.search).get('draftId');
      if (id) {
        try {
          const saved = await loadSavedDraft(id);
          if (!cancelled) { restore(saved.payload); setActive(saved); setSnapshot(JSON.stringify(saved.payload)); setNotice('Saved draft restored. Continue editing or submit when ready.'); }
        } catch (err) { if (!cancelled) { setUnavailable(true); setError(err instanceof Error ? err.message : 'Unable to open this draft.'); } }
      }
      try {
        const response = await fetch('/api/pr/drafts', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load your saved drafts.');
        if (!cancelled) { setDrafts(result.data); setNextPage(result.nextPage); }
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load your saved drafts.'); }
      finally { if (!cancelled) setInitializing(false); }
    };
    void initialize();
    return () => { cancelled = true; };
  }, [enabled, restore]);

  useEffect(() => {
    if (!enabled || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => { if (!suppressUnload.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [enabled, dirty]);

  async function refreshList(page = 0) {
    setListBusy(true);
    try {
      const response = await fetch(`/api/pr/drafts?page=${page}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to refresh your saved drafts.');
      setDrafts((previous) => page === 0 ? result.data : [...previous, ...result.data.filter((entry: DraftSummary) => !previous.some((old) => old.id === entry.id))]);
      setNextPage(result.nextPage);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to refresh your saved drafts.'); }
    finally { setListBusy(false); }
  }

  async function save(): Promise<boolean> {
    if (!enabled || unavailable || busyRef.current || initializing) return false;
    busyRef.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch('/api/pr/drafts', {
        method: active ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(active ? { id: active.id, version: active.version } : {}), payload }),
      });
      const result: DraftReply = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save this draft. Your edits are still in this form.');
      setActive(result.data); setSnapshot(serialized);
      window.history.replaceState(null, '', `/dashboard/pr/new?draftId=${encodeURIComponent(result.data.id)}`);
      setNotice('Draft saved. It has not been submitted for review.');
      actionFeedback('Draft saved', 'Your unfinished request is saved. It has not been submitted for review.');
      await refreshList();
      return true;
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save this draft. Your edits are still in this form.'); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function open(id: string | null, leave?: () => void) {
    if (busyRef.current || initializing) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      if (leave) { setPendingOpen(null); leave(); return; }
      if (id) {
        const saved = await loadSavedDraft(id);
        restore(saved.payload); setActive(saved); setSnapshot(JSON.stringify(saved.payload));
        window.history.replaceState(null, '', `/dashboard/pr/new?draftId=${encodeURIComponent(id)}`);
        setNotice('Saved draft restored. Continue editing or submit when ready.');
      } else {
        restore(null); setActive(null); setSnapshot(null);
        window.history.replaceState(null, '', '/dashboard/pr/new');
        setNotice('New request started. Previously saved drafts remain available below.');
      }
      setPendingOpen(null);
      setUnavailable(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to open this draft.'); }
    finally { busyRef.current = false; setBusy(false); }
  }

  function requestOpen(id: string | null) {
    setPendingRemove(null);
    if (dirty) setPendingOpen({ id });
    else void open(id);
  }

  function requestLeave(leave: () => void) {
    setPendingRemove(null);
    if (dirty) setPendingOpen({ id: null, leave });
    else leave();
  }

  function requestTemplate(saved: RequestDraftPayload, name: string) {
    if (!enabled || busyRef.current || initializing || unavailable) return;
    requestLeave(() => {
      restore(saved); setActive(null); setSnapshot(null); setUnavailable(false);
      window.history.replaceState(null, '', '/dashboard/pr/new');
      setNotice('Template copied into a new request. Review its details, then save a draft or submit.');
      actionFeedback('Template copied', `“${name}” starts a new request. Review the details before saving or submitting.`);
    });
  }

  async function remove() {
    if (!enabled || !pendingRemove || busyRef.current || initializing) return;
    const target = pendingRemove;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const response = await fetch('/api/pr/drafts', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: target.id, version: target.version }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to remove this draft.');
      setDrafts((previous) => previous.filter((entry) => entry.id !== target.id));
      if (active?.id === target.id) {
        // Keep the current inputs, but stop referencing the deleted saved record.
        setActive(null); setSnapshot(null);
        window.history.replaceState(null, '', '/dashboard/pr/new');
      }
      setPendingRemove(null);
      const message = active?.id === target.id ? 'The saved copy was removed. Your current form remains available as unsaved work.' : 'The saved copy was removed. Your current form was kept.';
      setNotice(message);
      actionFeedback('Draft removed', message);
      await refreshList();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to remove this draft.';
      setError(message); actionFeedback('Draft removal could not be confirmed', message, 'error');
    } finally { busyRef.current = false; setBusy(false); }
  }

  return { active, dirty, drafts, nextPage, listBusy, loading: enabled && initializing, unavailable, busy, error, notice, pendingOpen, pendingRemove,
    allowUnload: () => { const previous = suppressUnload.current; suppressUnload.current = true; return () => { suppressUnload.current = previous; }; },
    markSubmitted: () => { suppressUnload.current = true; setSnapshot(serialized); },
    remove, requestRemove: (entry: DraftSummary) => { setPendingOpen(null); setPendingRemove(entry); }, cancelRemove: () => setPendingRemove(null),
    save, open, requestOpen, requestLeave, requestTemplate, refreshList, cancelOpen: () => setPendingOpen(null),
    saveAndOpen: async () => { const target = pendingOpen; if (target && await save()) await open(target.id, target.leave); },
  };
}

export type RequestDraftController = ReturnType<typeof useRequestDrafts>;

export function DraftSaveButton({ drafts, disabled, className = '' }: { drafts: RequestDraftController; disabled: boolean; className?: string }) {
  return <button type="button" onClick={() => void drafts.save()} disabled={disabled || drafts.busy || drafts.loading || drafts.unavailable} className={`${requesterSecondaryClass} ${className}`}>
    {drafts.busy ? <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" /> : <Save className="size-4 shrink-0" aria-hidden="true" />} {drafts.busy ? 'Please wait…' : 'Save draft'}
  </button>;
}

export function RequestDraftWorkspace({ drafts, disabled, onAttention }: { drafts: RequestDraftController; disabled: boolean; onAttention?: () => void }) {
  const blocked = disabled || drafts.busy || drafts.loading;
  const confirmationRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (drafts.pendingOpen || drafts.pendingRemove) { onAttention?.(); confirmationRef.current?.focus(); } }, [drafts.pendingOpen, drafts.pendingRemove, onAttention]);
  useEffect(() => { if (drafts.error) { onAttention?.(); errorRef.current?.focus(); } }, [drafts.error, onAttention]);
  return <section aria-labelledby="saved-drafts-title" className={`mb-6 min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 ${waves.support}`}>
    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
      <div className="min-w-0 flex-1"><h2 id="saved-drafts-title" className="flex items-center gap-2 text-base font-semibold"><FilePenLine className="size-5 shrink-0 text-emerald-800" aria-hidden="true" />Your saved drafts</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">Private to your account. Save unfinished work here; only Submit request sends it for review.</p></div>
    </div>
    {drafts.notice && !drafts.dirty && <p role="status" className="mt-3 text-sm leading-6 text-emerald-900">{drafts.notice}</p>}
    {drafts.error && <div ref={errorRef} tabIndex={-1} role="alert" className="mt-3 scroll-mt-36 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-900 [overflow-wrap:anywhere]">{drafts.error}</div>}
    {drafts.pendingOpen && <div ref={confirmationRef} tabIndex={-1} className="mt-4 scroll-mt-36 rounded-lg border border-amber-300 bg-amber-50 p-4" role="region" aria-label="Unsaved draft changes">
      <p className="text-sm font-semibold">Keep your unsaved changes?</p><p className="mt-1 text-sm leading-6">Save before switching requests, or discard only the edits since your last save. Your saved drafts remain available.</p>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={blocked || drafts.unavailable} onClick={() => void drafts.saveAndOpen()} className={requesterPrimaryClass}>Save and continue</button><button type="button" disabled={blocked} onClick={() => void drafts.open(drafts.pendingOpen!.id, drafts.pendingOpen!.leave)} className={requesterSecondaryClass}>Discard edits and continue</button><button type="button" disabled={blocked} onClick={drafts.cancelOpen} className={requesterSecondaryClass}>Keep editing</button></div>
    </div>}
    {drafts.pendingRemove && <div ref={confirmationRef} tabIndex={-1} className="mt-4 scroll-mt-36 rounded-lg border border-amber-300 bg-amber-50 p-4" role="region" aria-label="Confirm draft removal">
      <p className="break-words text-sm font-semibold [overflow-wrap:anywhere]">Remove “{drafts.pendingRemove.title}”?</p>
      <p className="mt-1 text-sm leading-6">This permanently removes the saved copy. Your current form contents will stay available. Submitted requests are unaffected.</p>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={blocked} onClick={() => void drafts.remove()} className={`${requesterSecondaryClass} border-rose-300 text-rose-800`}><Trash2 className="size-4 shrink-0" aria-hidden="true" />{drafts.busy ? 'Removing…' : 'Remove saved draft'}</button><button type="button" disabled={blocked} onClick={drafts.cancelRemove} className={requesterSecondaryClass}>Keep draft</button></div>
    </div>}
    <details className="mt-4" open={drafts.drafts.length === 0 || undefined}>
      <summary className="cursor-pointer py-2 text-sm font-semibold text-slate-700">Resume a saved draft ({drafts.drafts.length}{drafts.nextPage !== null ? '+' : ''})</summary>
      {!drafts.loading && drafts.drafts.length === 0 && <p className="py-2 text-sm text-slate-600">No saved drafts yet. Use Save draft when you want to continue later.</p>}
      <ul className="mt-2 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">{drafts.drafts.map((entry) => <li key={entry.id} className={`min-w-0 rounded-lg border p-3 ${entry.id === drafts.active?.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200'}`}>
        <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{entry.title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{entry.itemCount} {entry.itemCount === 1 ? 'item' : 'items'} · Saved {new Date(entry.updatedAt).toLocaleString('en-PH')}</p>
        <button type="button" disabled={blocked} onClick={() => drafts.requestOpen(entry.id)} className={`${requesterSecondaryClass} mt-3 w-full`}>{entry.id === drafts.active?.id ? 'Reopen saved version' : 'Resume draft'}</button>
        <button type="button" disabled={blocked || drafts.listBusy} onClick={() => drafts.requestRemove(entry)} aria-label={`Remove draft: ${entry.title}`} className={`${requesterSecondaryClass} mt-2 w-full text-rose-800`}><Trash2 className="size-4 shrink-0" aria-hidden="true" />Remove draft</button>
      </li>)}</ul>
      <div className="mt-3 flex flex-wrap gap-2">{drafts.nextPage !== null && <button type="button" disabled={blocked || drafts.listBusy} onClick={() => void drafts.refreshList(drafts.nextPage!)} className={requesterSecondaryClass}>Load more drafts</button>}<button type="button" disabled={blocked || drafts.listBusy} onClick={() => void drafts.refreshList()} className={requesterSecondaryClass}>{drafts.listBusy ? 'Refreshing…' : 'Refresh drafts'}</button></div>
    </details>
  </section>;
}
