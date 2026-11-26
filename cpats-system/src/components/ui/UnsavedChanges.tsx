'use client';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { hasUnsavedFormChanges, shouldGuardLink } from '@/shared/unsaved-changes';
type Action = () => void | Promise<void>;
interface GuardEntry { dirty: boolean; blocked?: boolean; confirm?: (proceed: () => void) => void; allowUnload?: () => (() => void) }
interface GuardContext { register: (id: string, entry: GuardEntry) => () => void; clear: (id: string) => void; request: (action: Action) => void }
const Context = createContext<GuardContext | null>(null);
const passthrough: GuardContext = { register: () => () => {}, clear: () => {}, request: action => { void action(); } };

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const entries = useRef(new Map<string, GuardEntry>()), bypass = useRef(0);
  const [pending, setPending] = useState<{ id: string; action: Action; entry: GuardEntry; trigger: HTMLElement | null } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), keep = useRef<HTMLButtonElement>(null);
  const register = useCallback((id: string, entry: GuardEntry) => {
    entries.current.set(id, entry);
    return () => { if (entries.current.get(id) === entry) entries.current.delete(id); };
  }, []);
  const clear = useCallback((id: string) => { entries.current.delete(id); setPending(current => current?.id === id ? null : current); }, []);
  const run = useCallback(async (action: Action, entry?: GuardEntry) => {
    bypass.current++;
    const restore = entry?.allowUnload?.();
    try { await action(); }
    finally { window.setTimeout(() => { bypass.current = Math.max(0, bypass.current - 1); restore?.(); }, 0); }
  }, []);
  const request = useCallback((action: Action) => {
    const values = [...entries.current.entries()];
    const selected = values.find(([, value]) => value.blocked) ?? values.find(([, value]) => value.dirty);
    if (bypass.current || !selected) { void action(); return; }
    const [id, entry] = selected;
    if (entry.confirm && !entry.blocked) { entry.confirm(() => { void run(action, entry); }); return; }
    setPending({ id, action, entry, trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null });
  }, [run]);
  const context = useMemo(() => ({ register, clear, request }), [register, clear, request]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (!bypass.current && [...entries.current.values()].some(entry => entry.dirty || entry.blocked)) { event.preventDefault(); event.returnValue = ''; }
    };
    const click = (event: MouseEvent) => {
      if (bypass.current || event.defaultPrevented || !(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || !shouldGuardLink({ href: anchor.href, target: anchor.target, download: anchor.hasAttribute('download'), button: event.button, modified: event.ctrlKey || event.metaKey || event.shiftKey || event.altKey }, window.location.href)) return;
      if (![...entries.current.values()].some(entry => entry.dirty || entry.blocked)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      // Replay the existing Next/link or special navigation handler after consent.
      request(() => { if (anchor.isConnected) anchor.click(); });
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', click, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', click, true); };
  }, [request]);
  useEffect(() => {
    if (!pending) return;
    const element = dialog.current;
    element?.showModal(); keep.current?.focus();
    return () => { element?.close(); if (pending.trigger?.isConnected) pending.trigger.focus({ preventScroll: true }); };
  }, [pending]);
  return <Context.Provider value={context}>{children}{pending && <dialog ref={dialog} onCancel={event => { event.preventDefault(); setPending(null); }} aria-labelledby="unsaved-reminder-title" aria-describedby="unsaved-reminder-description" className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-950/50 sm:p-6">
    <h2 id="unsaved-reminder-title" className="flex items-start gap-2 text-lg font-semibold"><CircleAlert className="mt-1 size-5 shrink-0 text-amber-700" aria-hidden="true" />{pending.entry.blocked ? 'Please wait for the current action' : 'You have unsaved changes'}</h2>
    <p id="unsaved-reminder-description" className="mt-3 text-sm leading-6 text-slate-600">{pending.entry.blocked ? 'A form action is still in progress. Stay here until its result is confirmed.' : 'Your changes have not been recorded. Keep editing, or continue leaving or switching records. This reminder does not submit or save the form.'}</p>
    <div className="mt-5 flex flex-col gap-2 sm:flex-row"><button ref={keep} type="button" onClick={() => setPending(null)} className="min-h-11 rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Keep editing</button>{!pending.entry.blocked && <button type="button" onClick={() => { const target = pending; setPending(null); void run(target.action, target.entry); }} className="min-h-11 rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Continue without saving</button>}</div>
  </dialog>}</Context.Provider>;
}
export function useUnsavedNavigation() { return (useContext(Context) ?? passthrough).request; }
export function useUnsavedChanges(dirty: boolean, options: Omit<GuardEntry, 'dirty'> & { enabled?: boolean } = {}) {
  const context = useContext(Context) ?? passthrough, id = useId();
  const { enabled = true, blocked, confirm, allowUnload } = options;
  useEffect(() => { if (enabled) return context.register(id, { dirty, blocked, confirm, allowUnload }); }, [context, id, enabled, dirty, blocked, confirm, allowUnload]);
  return { request: context.request, clear: () => context.clear(id) };
}
export function useUnsavedForm(scope: string, value: unknown, options: { enabled?: boolean; blocked?: boolean } = {}) {
  const serialized = JSON.stringify(value);
  const [baseline, setBaseline] = useState({ scope, value: serialized });
  // A newly selected record's prefilled values are the clean baseline.
  if (baseline.scope !== scope) setBaseline({ scope, value: serialized });
  const dirty = hasUnsavedFormChanges(baseline, scope, serialized);
  const guard = useUnsavedChanges(dirty, options);
  return { ...guard, dirty, markClean: () => { guard.clear(); setBaseline({ scope, value: serialized }); } };
}
