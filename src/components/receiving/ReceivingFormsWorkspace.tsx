'use client';

import { useEffect, useRef, useState } from 'react';
import { useUnsavedChanges, useUnsavedForm, useUnsavedNavigation } from '@/components/ui/UnsavedChanges';
import { blankFormItem, blankReceivingForm, FormPayloadSchema, prefillReceivingForm, receivingLineTotal, type FormDocumentView, type FormKind, type FormPayload, type FormRevisionView, type FormSource } from '@/shared/receiving-forms';

const input = 'mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:bg-slate-100';
const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50';
const card = 'min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5';
type PO = FormSource & { id: string; purchaseRequest: FormSource['purchaseRequest'] & { status: string; department: { code: string; name: string } } };
type Order = { id: string; poNumber: string; purchaseRequest: { department: { name: string; code: string } } };
async function readResult(response: Response) {
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || 'This action could not be completed.');
  return data;
}
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The response could not be confirmed. Refresh before retrying.';

export default function ReceivingFormsWorkspace() {
  const [orders, setOrders] = useState<Order[]>([]), [poId, setPoId] = useState(''), [page, setPage] = useState(1), [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const navigate = useUnsavedNavigation();
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      setLoading(true); setError('');
      try {
        const data = await readResult(await fetch(`/api/receiving/forms?page=${page}`, { signal: controller.signal }));
        if (controller.signal.aborted) return;
        setOrders(data.data); setTotal(data.total);
        setPoId(previous => previous || new URLSearchParams(window.location.search).get('poId') || data.data[0]?.id || '');
      } catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause)); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    });
    return () => controller.abort();
  }, [page, retry]);
  return <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 text-slate-900 [overflow-wrap:anywhere] sm:px-6">
    <header><h1 className="text-2xl font-semibold sm:text-3xl">Prepare RR / MR</h1><p className="mt-2 text-sm leading-6 text-slate-600">Prepare a web draft, export the school’s Excel layout, print for physical signatures, then attach the signed copy.</p></header>
    <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Staff select the appropriate document. Credit payment does not determine MR eligibility. Classification, official numbering and required signatures still follow the school’s confirmed rules. Preparing or attaching a form does not close a request or verify signatures.</p>
    <section className={card} aria-label="Choose purchase order">
      <label className="block text-sm font-medium">Linked purchase order<select className={input} value={poId} disabled={loading} onChange={event => navigate(() => setPoId(event.target.value))}>
        {!orders.some(order => order.id === poId) && <option value={poId}>{poId ? 'Selected purchase order' : 'Choose a purchase order'}</option>}
        {orders.map(order => <option key={order.id} value={order.id}>{order.poNumber} · {order.purchaseRequest.department.code}</option>)}
      </select></label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className={button} disabled={page === 1 || loading} onClick={() => setPage(page-1)}>Previous POs</button>
        <span className="text-sm">PO page {page} of {Math.max(1, Math.ceil(total/20))}</span>
        <button type="button" className={button} disabled={page*20 >= total || loading} onClick={() => setPage(page+1)}>Next POs</button>
        <button type="button" className={button} disabled={loading} onClick={() => setRetry(retry+1)}>Reload PO list</button>
      </div>
      {loading && <p role="status" className="mt-3 text-sm">Loading purchase orders…</p>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-800">{error}</p>}
      {!loading && !error && !total && <p className="mt-3 text-sm text-slate-600">No purchase orders are available to this account.</p>}
    </section>
    {poId && <PurchaseOrderForms key={poId} poId={poId} />}
  </main>;
}

function PurchaseOrderForms({ poId }: { poId: string }) {
  const [po, setPo] = useState<PO | null>(null), [documents, setDocuments] = useState<FormDocumentView[]>([]), [canEdit, setCanEdit] = useState(false);
  const [page, setPage] = useState(1), [total, setTotal] = useState(0), [selectedId, setSelectedId] = useState(''), [kind, setKind] = useState<FormKind>('RR');
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [success, setSuccess] = useState(''), [epoch, setEpoch] = useState(0), [retry, setRetry] = useState(0);
  const navigate = useUnsavedNavigation();
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      setLoading(true); setError('');
      try {
        const data = await readResult(await fetch(`/api/receiving/forms?poId=${encodeURIComponent(poId)}&page=${page}`, { signal: controller.signal }));
        if (controller.signal.aborted) return;
        setPo(data.po); setDocuments(data.data); setTotal(data.total); setCanEdit(data.canEdit);
      } catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause)); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    });
    return () => controller.abort();
  }, [poId, page, retry]);
  const saved = (documentId: string, message: string) => { setSuccess(message); setSelectedId(documentId); setEpoch(value => value+1); setRetry(value => value+1); };
  return <div className="min-w-0 space-y-5">
    {loading && <p role="status" className="text-sm">Loading receiving documents…</p>}
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900">{error} <button type="button" className={`${button} mt-2`} onClick={() => setRetry(retry+1)}>Retry documents</button></p>}
    {success && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
    {po && <>
      <section className={card}>
        <h2 className="font-semibold">{po.poNumber} · {po.purchaseRequest.department.name}</h2>
        <p className="mt-2 text-sm text-slate-600">Saved documents remain separate from the current request status: {po.purchaseRequest.status.replaceAll('_', ' ')}.</p>
        {canEdit && <div className="mt-4 flex flex-wrap gap-3">{(['RR','MR'] as const).map(value => <button key={value} type="button" className={button} onClick={() => navigate(() => { setSelectedId(''); setKind(value); setEpoch(epoch+1); })}>New {value} draft</button>)}</div>}
        <h3 className="mt-5 text-sm font-semibold">Saved document series</h3>
        <button type="button" className={`${button} mt-3`} disabled={loading} onClick={() => setRetry(retry+1)}>Reload document list</button>
        <ul className="mt-3 space-y-2">{documents.map(document => <li key={document.id}><button type="button" aria-pressed={selectedId === document.id} className={`${button} w-full justify-start text-left`} onClick={() => navigate(() => { setSelectedId(document.id); setEpoch(epoch+1); })}>{document.kind} · {document.revisions[0]?.payload.number || document.id} · latest revision {document.version}</button></li>)}</ul>
        {!documents.length && !loading && <p className="mt-3 text-sm text-slate-600">No saved RR/MR drafts on this page.</p>}
        {total > 20 && <div className="mt-3 flex flex-wrap gap-3"><button type="button" className={button} disabled={page === 1 || loading} onClick={() => setPage(page-1)}>Previous documents</button><span className="self-center text-sm">Page {page} of {Math.ceil(total/20)}</span><button type="button" className={button} disabled={page*20 >= total || loading} onClick={() => setPage(page+1)}>Next documents</button></div>}
      </section>
      {selectedId ? <SavedFormSeries key={`${selectedId}-${epoch}`} po={po} documentId={selectedId} canEdit={canEdit} onSaved={saved} /> : canEdit && <FormEditor key={`new-${kind}-${epoch}`} po={po} kind={kind} canEdit onSaved={saved} />}
    </>}
  </div>;
}

function SavedFormSeries({ po, documentId, canEdit, onSaved }: { po: PO; documentId: string; canEdit: boolean; onSaved: (id: string, message: string) => void }) {
  const [document, setDocument] = useState<FormDocumentView | null>(null), [page, setPage] = useState(1), [total, setTotal] = useState(0), [selected, setSelected] = useState(''), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const navigate = useUnsavedNavigation();
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      setError('');
      setDocument(null);
      try {
        const result = await readResult(await fetch(`/api/receiving/forms?poId=${po.id}&documentId=${documentId}&page=${page}`, { signal: controller.signal }));
        if (controller.signal.aborted) return;
        setDocument(result.document); setTotal(result.total); setSelected(result.document.revisions[0]?.id || '');
      } catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause)); }
    });
    return () => controller.abort();
  }, [po.id, documentId, page, retry]);
  const revision = document?.revisions.find(row => row.id === selected);
  return <>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900">{error} <button type="button" className={button} onClick={() => navigate(() => setRetry(retry+1))}>Retry revisions</button></p>}
    {!document && !error && <p role="status" className="text-sm">Loading saved revisions…</p>}
    {document && <section className={card}><h3 className="font-semibold">Revision history · latest revision {document.version}</h3><div className="mt-3 flex flex-wrap gap-2">{document.revisions.map(row => <button type="button" key={row.id} aria-pressed={selected === row.id} className={button} onClick={() => navigate(() => setSelected(row.id))}>Revision {row.version}{row.signedCopies.length ? ' · signed copy uploaded' : row.exportedAt ? ' · Excel exported' : ' · draft'}</button>)}</div>
      <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" className={button} disabled={page === 1} onClick={() => navigate(() => setPage(page-1))}>Newer revisions</button><span className="text-sm">Page {page} of {Math.max(1, Math.ceil(total/20))}</span><button type="button" className={button} disabled={page*20 >= total} onClick={() => navigate(() => setPage(page+1))}>Older revisions</button><button type="button" className={button} onClick={() => navigate(() => setRetry(retry+1))}>Reload saved revisions</button></div>
    </section>}
    {document && revision && <FormEditor key={revision.id} po={po} kind={document.kind} document={document} revision={revision} canEdit={canEdit} onSaved={onSaved} />}
  </>;
}

const labels: Partial<Record<keyof FormPayload, string>> = { supplier: 'Supplier', employee: 'Employee / department recipient', designation: 'Receiving person’s designation', department: 'Department / office of use', number: 'Official RR / MR control number (if assigned)', date: 'Document date', poReference: 'Printed PO reference', rivReference: 'RIV reference', preparedBy: 'Prepared by / Purchaser (printed name)', receivedBy: 'Received by (printed name)', centralOfficer: 'Central Supply Officer (printed name)', issuedBy: 'Issued by (printed name)', administrator: 'Administrator / VP-Finance (printed name)' };
const itemLabels = { quantity: 'Document quantity', unit: 'Unit', description: 'Item description', invoiceQuantity: 'Quantity per invoice', receivedQuantity: 'Quantity received', unitCost: 'Unit cost / value (PHP)', remarks: 'Remarks' };

function FormEditor({ po, kind, document, revision, canEdit, onSaved }: { po: PO; kind: FormKind; document?: FormDocumentView; revision?: FormRevisionView; canEdit: boolean; onSaved: (id: string, message: string) => void }) {
  const [payload, setPayload] = useState<FormPayload>(() => revision?.payload || blankReceivingForm()), [saving, setSaving] = useState(false), [error, setError] = useState(''), [preview, setPreview] = useState(false), [exported, setExported] = useState(Boolean(revision?.exportedAt));
  const form = useRef<HTMLFormElement>(null), pending = useRef(false);
  const [creationId] = useState(() => crypto.randomUUID());
  const [attachmentPending, setAttachmentPending] = useState(false);
  const guard = useUnsavedForm(revision?.id || `new-${kind}`, payload, { enabled: canEdit, blocked: saving });
  const visibleFields = (Object.keys(labels) as (keyof typeof labels)[]).filter(key => kind === 'RR' ? !['designation','issuedBy','administrator'].includes(key) : !['supplier','employee','preparedBy'].includes(key));
  const patch = (key: keyof FormPayload, value: string) => setPayload(current => ({ ...current, [key]: value }));
  async function save() {
    if (pending.current || !form.current?.reportValidity()) return;
    const parsed = FormPayloadSchema.safeParse(payload);
    if (!parsed.success) { setError('Check quantities, prices, date and field lengths. Use up to 100 items.'); return; }
    pending.current = true; setSaving(true); setError('');
    try {
      const result = await readResult(await fetch('/api/receiving/forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'SAVE', poId: po.id, kind, documentId: document?.id, creationId: document ? undefined : creationId, version: document?.version || 0, payload: parsed.data }) }));
      guard.markClean(); onSaved(result.data.documentId, `${kind} revision ${result.data.version} saved. Earlier revisions and attachments are retained.`);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { pending.current = false; setSaving(false); }
  }
  async function download() {
    if (!revision || pending.current) return;
    pending.current = true; setSaving(true); setError('');
    try {
      const response = await fetch(`/api/receiving/forms/export?revisionId=${revision.id}`);
      if (!response.ok) { await readResult(response); return; }
      const url = URL.createObjectURL(await response.blob()), anchor = window.document.createElement('a');
      anchor.href = url; anchor.download = `${kind}-${document!.id}-v${revision.version}.xlsx`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      setExported(true);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { pending.current = false; setSaving(false); }
  }
  return <section className={`${card} space-y-5`}>
    <header><h2 className="text-lg font-semibold">{kind === 'RR' ? 'Receiving Report' : 'Memorandum Receipt'} · {revision ? `saved revision ${revision.version}` : 'new draft'}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{revision ? `Saved by ${revision.createdBy.email} on ${new Date(revision.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}. Edits create a new revision.` : 'Start manually or prefill the available PO details. Actual receiving/assignment and signature names need confirmation.'}</p>
      {revision && document && revision.version < document.version && <p className="mt-2 text-sm font-medium text-amber-900">You are viewing an older revision. Saving creates a new latest revision from these displayed details.</p>}
    </header>
    <p className="text-sm leading-6 text-slate-600">Blank costs mean unresolved values, including credit purchases awaiting a confirmed source. Printed names are not signatures. The Excel workbook retains two copies per sheet; continuation sheets retain all item descriptions. Choose physical print quantities according to office rules.</p>
    <form ref={form} onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset disabled={!canEdit || saving || attachmentPending} className="min-w-0 space-y-5">
        <legend className="sr-only">{kind} document fields</legend>
        {canEdit && <div className="flex flex-wrap gap-3"><button type="button" className={button} onClick={() => guard.request(() => { try { setPayload(prefillReceivingForm(kind, po)); setError(''); } catch (cause) { setError(errorMessage(cause)); } })}>Prefill from linked PO</button><button type="button" className={button} onClick={() => guard.request(() => setPayload(blankReceivingForm()))}>Clear fields for manual entry</button></div>}
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">{visibleFields.map(key => <label key={key} className="block min-w-0 text-sm font-medium">{labels[key]}<input type={key === 'date' ? 'date' : 'text'} maxLength={key === 'number' ? 60 : ['poReference','rivReference'].includes(key) ? 100 : 180} className={input} value={payload[key] as string} onChange={event => patch(key, event.target.value)} /></label>)}</div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Staff-recorded classification<select className={input} value={payload.classification} onChange={event => patch('classification', event.target.value)}><option value="UNCONFIRMED">Needs office confirmation</option><option value="CONSUMABLE">Consumable</option><option value="PROPERTY">Property / equipment</option></select></label><label className="block text-sm font-medium">Classification basis / notes (saved with draft)<textarea className={input} rows={2} maxLength={500} value={payload.classificationNotes} onChange={event => patch('classificationNotes', event.target.value)} /></label></div>
        <div><h3 className="font-semibold">Items ({payload.items.length}/100)</h3><p className="mt-1 text-sm leading-6 text-slate-600">{kind === 'RR' ? 'Document, invoice and received quantities are separate. Prefilling does not confirm delivery.' : 'Enter the quantity actually being assigned. Ordered quantities are not automatically assigned to the employee.'}</p></div>
        <ol className="space-y-4">{payload.items.map((item, index) => <li key={index} className="min-w-0 rounded-lg border border-slate-200 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Item {index+1}</h4>{canEdit && <button type="button" className={button} disabled={payload.items.length === 1} onClick={() => setPayload(current => ({ ...current, items: current.items.filter((_, i) => i !== index) }))}>Remove item {index+1}</button>}</div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">{(Object.keys(itemLabels) as (keyof typeof itemLabels)[]).filter(key => kind === 'RR' ? key !== 'remarks' : !['invoiceQuantity','receivedQuantity'].includes(key)).map(key => <label key={key} className={`block min-w-0 text-sm font-medium ${key === 'description' ? 'sm:col-span-2 lg:col-span-3' : ''}`}>{itemLabels[key]}
            {key === 'description' || key === 'remarks' ? <textarea className={input} rows={2} maxLength={key === 'description' ? 600 : 240} value={item[key]} onChange={event => setPayload(current => ({ ...current, items: current.items.map((row, i) => i === index ? { ...row, [key]: event.target.value } : row) }))} /> : <input className={input} inputMode={key === 'unit' ? 'text' : 'decimal'} maxLength={key === 'unit' ? 30 : 13} value={item[key]} onChange={event => setPayload(current => ({ ...current, items: current.items.map((row, i) => i === index ? { ...row, [key]: event.target.value } : row) }))} />}
          </label>)}</div><p className="mt-3 text-sm font-medium">Calculated line total: {receivingLineTotal(kind === 'RR' ? item.receivedQuantity : item.quantity, item.unitCost) || 'Unresolved'} PHP</p>
        </li>)}</ol>
        {canEdit && <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={payload.items.length >= 100} onClick={() => setPayload(current => ({ ...current, items: [...current.items, blankFormItem()] }))}>Add item</button><button type="submit" className={`${button} bg-emerald-800 text-white`}>{document ? 'Save as new revision' : 'Save draft'}</button></div>}
      </fieldset>
    </form>
    <div className="flex flex-wrap gap-3"><button type="button" className={button} onClick={() => setPreview(!preview)}>{preview ? 'Hide preview' : 'Preview document'}</button>{revision && <button type="button" disabled={saving || guard.dirty} className={button} onClick={() => void download()}>Export saved revision to Excel</button>}</div>
    {guard.dirty && <p className="text-sm text-amber-900">Save your changes before exporting or attaching a signed copy. Switching documents will ask before discarding edits.</p>}
    {saving && <p role="status" className="text-sm">Processing document…</p>}
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
    {preview && <DocumentPreview kind={kind} payload={payload} />}
    {revision && <div className="space-y-3 border-t border-slate-200 pt-5"><h3 className="font-semibold">Signed copies · revision {revision.version}</h3><p className="text-sm text-slate-600">{revision.signedCopies.length ? 'Signed copy uploaded. Signature completeness has not been automatically verified.' : exported ? 'Excel exported. Print, obtain the required signatures and attach the completed scan/photo.' : 'Draft saved. Export this revision before attaching a signed copy.'}</p>
      <ul className="space-y-2">{revision.signedCopies.map(file => <li key={file.id} className="text-sm"><a href={file.filePath} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center break-all font-medium text-emerald-800 underline">{file.fileName}<span className="sr-only"> (opens in a new tab)</span></a><p className="text-xs text-slate-600">Uploaded by {file.uploadedBy.email} · {new Date(file.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p></li>)}</ul>
      {attachmentPending && <p className="text-sm text-amber-900">Finish attaching the selected signed copy, or clear its file and confirmation before editing this revision.</p>}
      {canEdit && <SignedCopyUpload poId={po.id} revision={revision} disabled={!exported || guard.dirty || saving} onPendingChange={setAttachmentPending} onSaved={() => { guard.markClean(); onSaved(document!.id, `Signed copy attached to ${kind} revision ${revision.version}. This does not verify signatures or change the request status.`); }} />}
    </div>}
  </section>;
}

function SignedCopyUpload({ poId, revision, disabled, onSaved, onPendingChange }: { poId: string; revision: FormRevisionView; disabled: boolean; onSaved: () => void; onPendingChange: (value: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null), [reconciled, setReconciled] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const uploaded = useRef(''), pending = useRef(false), fileInput = useRef<HTMLInputElement>(null);
  const guard = useUnsavedChanges(Boolean(file || reconciled), { blocked: saving });
  async function attach() {
    if (!file || !reconciled || pending.current || disabled) return;
    pending.current = true; setSaving(true); setError('');
    try {
      if (!uploaded.current) { const data = new FormData(); data.append('file', file); const result = await readResult(await fetch('/api/upload', { method: 'POST', body: data })); uploaded.current = result.url; }
      await readResult(await fetch('/api/receiving/forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ATTACH', poId, revisionId: revision.id, filePath: uploaded.current, fileName: file.name, reconciled: true }) }));
      setFile(null); setReconciled(false); guard.clear(); if (fileInput.current) fileInput.current.value = ''; onSaved();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { pending.current = false; setSaving(false); }
  }
  return <fieldset disabled={disabled || saving} className="min-w-0 space-y-3"><legend className="sr-only">Attach signed copy</legend>
    <label className="block text-sm font-medium">Signed RR/MR scan or photograph<input ref={fileInput} type="file" accept="application/pdf,image/png,image/jpeg,image/gif,image/webp" className={`${input} max-w-full file:mr-2 file:rounded file:bg-slate-100 file:px-2 file:py-1`} onChange={event => { const selected = event.target.files?.[0] || null; setFile(selected); onPendingChange(Boolean(selected || reconciled)); uploaded.current = ''; setError(''); }} /></label><p className="text-xs text-slate-600">PDF or supported image, up to 10 MB. Each upload is retained separately.</p>
    <label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={reconciled} onChange={event => { setReconciled(event.target.checked); onPendingChange(Boolean(file || event.target.checked)); }} />I confirm this signed copy matches saved revision {revision.version}. Any changes made in Excel have been reconciled with this CPATS revision.</label>
    <button type="button" className={button} disabled={!file || !reconciled || disabled || saving} onClick={() => void attach()}>{saving ? 'Attaching signed copy…' : 'Attach signed copy to this revision'}</button>
    {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
  </fieldset>;
}

function DocumentPreview({ kind, payload }: { kind: FormKind; payload: FormPayload }) {
  return <section className="min-w-0 space-y-4 rounded-lg border border-slate-300 bg-slate-50 p-4" aria-label="Document preview">
    <h3 className="text-center font-semibold">DMC College Foundation, Inc. · {kind === 'RR' ? 'Receiving Report' : 'Memorandum Receipt'}</h3><p className="text-center text-sm">Draft preview · printed names are unsigned · Excel provides the school’s print layout.</p>
    <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">{Object.entries(labels).filter(([key]) => kind === 'RR' ? !['designation','issuedBy','administrator'].includes(key) : !['supplier','employee','preparedBy'].includes(key)).map(([key, label]) => <div key={key}><dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap">{payload[key as keyof FormPayload] as string || 'Not recorded'}</dd></div>)}</dl>
    <ol className="space-y-3">{payload.items.map((item, index) => <li key={index} className="min-w-0 border-t border-slate-200 pt-3 text-sm"><p className="whitespace-pre-wrap font-medium">{index+1}. {item.description || 'Description not recorded'}</p><p>Quantity: {item.quantity || 'Not recorded'} · Unit: {item.unit || 'Not recorded'} · Unit cost: {item.unitCost || 'Unresolved'}</p>{kind === 'RR' ? <p>Per invoice: {item.invoiceQuantity || 'Not recorded'} · Received: {item.receivedQuantity || 'Not recorded'}</p> : <p className="whitespace-pre-wrap">{item.remarks}</p>}</li>)}</ol>
  </section>;
}
