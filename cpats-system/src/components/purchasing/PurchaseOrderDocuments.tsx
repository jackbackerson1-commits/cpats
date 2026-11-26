'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useUnsavedChanges } from '@/components/ui/UnsavedChanges';
import { PO_DOCUMENT_KINDS, PO_DOCUMENT_LABELS, type PODocumentKind, type SavedPODocument } from '@/shared/po-documents';

const fieldClass = 'min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-emerald-700';
const buttonClass = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50';

export function PurchaseOrderDocuments({ poId, onSaved }: { poId: string; onSaved?: () => void }) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [records, setRecords] = useState<SavedPODocument[]>([]);
  const [canAttach, setCanAttach] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [kind, setKind] = useState<PODocumentKind>('ORDER_CONFIRMATION');
  const [file, setFile] = useState<File | null>(null);
  const [uploadedReference, setUploadedReference] = useState('');
  const [notes, setNotes] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  const pendingSave = useRef(false);
  const guard = useUnsavedChanges(Boolean(file || notes), { blocked: saving });

  const load = useCallback(async (targetPage: number) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    await Promise.resolve();
    if (controller.signal.aborted) return;
    setLoading(true);
    setLoadError('');
    try {
      const response = await fetch(`/api/po/documents?poId=${encodeURIComponent(poId)}&page=${targetPage}`, { signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Supporting documents could not be loaded.');
      if (controller.signal.aborted) return;
      setRecords(result.data);
      setTotal(result.total);
      setPageSize(result.pageSize);
      setCanAttach(result.canAttach);
    } catch (error) {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'Supporting documents could not be loaded.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [poId]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) return load(page); });
    return () => { active = false; requestRef.current?.abort(); };
  }, [load, page]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pendingSave.current || !file) return;
    pendingSave.current = true;
    setSaving(true);
    setSaveError('');
    setSuccess('');
    let committed = false;
    try {
      let reference = uploadedReference;
      if (!reference) {
        const form = new FormData();
        form.set('file', file);
        const upload = await fetch('/api/upload', { method: 'POST', body: form });
        const result = await upload.json();
        if (!upload.ok || !result.success) throw new Error(result.error || 'The file upload failed.');
        reference = result.url;
        setUploadedReference(reference);
      }
      const response = await fetch('/api/po/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poId, kind, filePath: reference, fileName: file.name, notes }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'The document could not be saved.');
      committed = true;
      guard.clear();
      setFile(null);
      setUploadedReference('');
      setNotes('');
      if (fileInput.current) fileInput.current.value = '';
      setSuccess('Supporting document saved. The saved entry includes its uploader and date.');
      if (page === 1) await load(1);
      else setPage(1);
      onSaved?.();
    } catch (error) {
      if (!committed) setSaveError(error instanceof Error ? error.message : 'The document could not be saved. Your selected file is still available to retry.');
    } finally { pendingSave.current = false; setSaving(false); }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <section aria-labelledby={`${id}-title`} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 [overflow-wrap:anywhere]">
    <h3 id={`${id}-title`} className="text-base font-semibold text-slate-950">PO supporting documents</h3>
    <p className="mt-2 text-sm leading-6 text-slate-600">Keep order confirmations, delivery evidence and signed forms with this purchase order. A Statement of Account (SOA) can be added when it arrives. Approval, receiving and payment decisions are recorded in their respective workspaces.</p>
    <Link href={`/dashboard/receiving/forms?poId=${poId}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 underline">Open RR / MR drafts and saved revisions</Link>
    {success && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
    {loadError && <div role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-900"><p>{loadError}</p><button type="button" onClick={() => void load(page)} className={`${buttonClass} mt-2`}>Retry loading documents</button></div>}
    {loading ? <p role="status" className="mt-4 text-sm text-slate-600">Loading supporting documents…</p> : !loadError && <>
      {records.length === 0 ? <p className="mt-4 text-sm text-slate-600">No supporting documents have been attached to this PO.</p> : <ul className="mt-4 space-y-3">
        {records.map(record => <li key={record.id} className="min-w-0 rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-semibold text-slate-900">{PO_DOCUMENT_LABELS[record.kind] || 'Supporting document'}</p>
          <a href={record.filePath} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 max-w-full items-center break-all text-sm font-medium text-emerald-800 underline underline-offset-4">{record.fileName}<span className="sr-only"> (opens in a new tab)</span></a>
          <p className="mt-1 text-xs leading-5 text-slate-600">Saved by {record.uploadedBy.email} · {record.uploadedBy.role.replaceAll('_', ' ')}<br /><time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</time></p>
          {record.notes && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{record.notes}</p>}
        </li>)}
      </ul>}
      {total > pageSize && <nav aria-label="Supporting document pages" className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" disabled={page <= 1 || saving} onClick={() => setPage(page - 1)} className={buttonClass}>Previous</button>
        <span className="text-sm text-slate-600">Page {page} of {pages} · {total} documents</span>
        <button type="button" disabled={page >= pages || saving} onClick={() => setPage(page + 1)} className={buttonClass}>Next</button>
      </nav>}
    </>}
    {canAttach && <form onSubmit={save} className="mt-5 min-w-0 space-y-3 border-t border-slate-200 pt-4">
      <fieldset disabled={saving} className="min-w-0 space-y-3">
        <legend className="text-sm font-semibold text-slate-900">Attach supporting document</legend>
        <label htmlFor={`${id}-kind`} className="block text-sm text-slate-700">Document type</label>
        <select id={`${id}-kind`} value={kind} onChange={event => setKind(event.target.value as PODocumentKind)} className={fieldClass}>
          {PO_DOCUMENT_KINDS.map(value => <option key={value} value={value}>{PO_DOCUMENT_LABELS[value]}</option>)}
        </select>
        <label htmlFor={`${id}-file`} className="block text-sm text-slate-700">PDF or image</label>
        <input ref={fileInput} id={`${id}-file`} required type="file" accept="application/pdf,image/png,image/jpeg,image/gif,image/webp" aria-describedby={`${id}-file-help`} onChange={event => {
          const selected = event.target.files?.[0] || null;
          setFile(selected && selected.name.length <= 180 ? selected : null);
          setUploadedReference('');
          setSaveError(selected && selected.name.length > 180 ? 'Rename this file to 180 characters or fewer, then choose it again.' : '');
          setSuccess('');
        }} className={`${fieldClass} file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1`} />
        <p id={`${id}-file-help`} className="text-xs leading-5 text-slate-600">Up to 10 MB. Attach a signed copy when selecting RR or MR. Each saved file is retained as a separate entry.</p>
        <label htmlFor={`${id}-notes`} className="block text-sm text-slate-700">Notes (optional)</label>
        <textarea id={`${id}-notes`} rows={2} maxLength={1000} value={notes} onChange={event => setNotes(event.target.value)} className={fieldClass} />
      </fieldset>
      {saveError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900">{saveError}</p>}
      <button type="submit" disabled={saving || !file} className={`${buttonClass} w-full bg-emerald-800 text-white sm:w-auto`}>{saving ? 'Saving document…' : 'Save supporting document'}</button>
    </form>}
  </section>;
}
