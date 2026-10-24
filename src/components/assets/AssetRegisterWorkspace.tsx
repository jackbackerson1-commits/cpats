'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { QrCode, X } from 'lucide-react';
import QRCodeSVG from '@/components/ui/QRCodeSVG';
import PrintQrLabels, { type QrLabel } from '@/components/ui/PrintQrLabels';
import './asset-register-workspace.css';

export interface AssetRecord {
  id: string; assetTag: string; qrCodeToken: string; itemName: string; lineIndex: number; unitNumber: number; serialNumber: string | null;
  purchaseOrder: { id: string; poNumber: string; purchaseRequest: { department: { code: string; name: string } } };
  receivingReport: { condition: string; createdAt: string };
}

interface Props {
  assets: AssetRecord[]; loading: boolean; error: string; total: number; poNumber?: string;
  page: number; pageSize: number; reviewSelected: boolean;
  onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void; onReviewSelected: () => void;
  selected: string[]; labels: QrLabel[]; onSelection: (ids: string[]) => void; onAllOrders: () => void;
}

const wideQuery = '(min-width: 80rem)';
const subscribeWidth = (listener: () => void) => {
  const query = window.matchMedia(wideQuery);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};
const wideSnapshot = () => window.matchMedia(wideQuery).matches;
const wrap = 'break-words [overflow-wrap:anywhere]';
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50';

function UnitFacts({ asset }: { asset: AssetRecord }) {
  return <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-sm leading-5">
    <div className="min-w-0"><dt className="text-xs text-slate-600">Manufacturer serial</dt><dd className={`mt-1 ${wrap}`}>{asset.serialNumber || 'Not recorded'}</dd></div>
    <div className="min-w-0"><dt className="text-xs text-slate-600">Condition at receipt</dt><dd className="mt-1">{asset.receivingReport.condition}</dd></div>
    <div className="min-w-0 col-span-2"><dt className="text-xs text-slate-600">Requesting department</dt><dd className={`mt-1 ${wrap}`}>{asset.purchaseOrder.purchaseRequest.department.name}</dd></div>
  </dl>;
}

function PreviewContent({ asset }: { asset: AssetRecord }) {
  return <div className="min-w-0 space-y-4 p-4 sm:p-5">
    <p className={`text-sm font-semibold leading-6 text-slate-950 ${wrap}`}>{asset.itemName}</p>
    <p className={`text-sm font-medium text-emerald-900 ${wrap}`}>{asset.purchaseOrder.poNumber} · Line {asset.lineIndex + 1}, unit {asset.unitNumber}</p>
    <div className="flex justify-center rounded-lg border border-slate-200 bg-white p-3"><QRCodeSVG value={asset.qrCodeToken} size={200} className="max-w-full h-auto" /></div>
    <div><p className="text-xs text-slate-600">Asset ID</p><p className={`mt-1 font-mono text-xs font-semibold leading-5 text-slate-900 ${wrap}`}>{asset.assetTag}</p></div>
    <UnitFacts asset={asset} />
    <p className="border-t border-slate-200 pt-3 text-xs leading-5 text-slate-600">This QR identifies this physical unit. Previewing does not select a label for printing. Reprinting keeps the same asset ID.</p>
  </div>;
}

function PreviewDialog({ asset, close, restore }: {
  asset: AssetRecord; close: () => void; restore: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const current = dialog.current;
    current?.showModal();
    return () => {
      current?.close();
      restore();
    };
  }, [restore]);
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); close(); }} aria-labelledby="asset-qr-dialog-title" className="asset-qr-dialog fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl backdrop:bg-slate-950/50">
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white p-4"><h2 id="asset-qr-dialog-title" className="text-base font-semibold">Equipment QR preview</h2><button type="button" onClick={close} className={button} aria-label="Close QR preview"><X className="size-4" aria-hidden="true" /></button></div>
    <PreviewContent asset={asset} />
    <div className="px-4 pb-4 sm:px-5 sm:pb-5"><button type="button" onClick={close} className={`w-full ${button}`}>Back to units</button></div>
  </dialog>;
}

export default function AssetRegisterWorkspace({ assets, loading, error, total, poNumber, selected, labels, onSelection, onAllOrders, page, pageSize, reviewSelected, onPageChange, onPageSizeChange, onReviewSelected }: Props) {
  const [previewId, setPreviewId] = useState('');
  const wide = useSyncExternalStore(subscribeWidth, wideSnapshot, () => false);
  const workspace = useRef<HTMLElement>(null), toolbar = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null), previewHeading = useRef<HTMLHeadingElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const origin = useRef<{ trigger: HTMLButtonElement; page: number } | null>(null);
  const preview = assets.find(asset => asset.id === previewId);
  const allSelected = assets.length > 0 && assets.every(asset => selected.includes(asset.id));
  const someSelected = assets.some(asset => selected.includes(asset.id)) && !allSelected;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  function togglePage(checked: boolean) {
    const pageIds = new Set(assets.map(asset => asset.id));
    onSelection(checked ? [...new Set([...selected, ...pageIds])] : selected.filter(id => !pageIds.has(id)));
  }
  function selectUnit(asset: AssetRecord, checked: boolean) {
    onSelection(checked ? [...new Set([...selected, asset.id])] : selected.filter(id => id !== asset.id));
  }
  function previewButton(asset: AssetRecord) {
    return <button type="button" aria-label={'Preview QR for ' + asset.assetTag} aria-pressed={asset.id === previewId} onClick={event => show(asset, event.currentTarget)} className={button}><QrCode className="size-4 shrink-0" aria-hidden="true" />Preview QR</button>;
  }
  function unitCheckbox(asset: AssetRecord) {
    return <input type="checkbox" checked={selected.includes(asset.id)} disabled={loading || Boolean(error)} aria-label={'Select label for ' + asset.assetTag + ' · ' + asset.itemName + ' · ' + asset.purchaseOrder.poNumber + ', line ' + (asset.lineIndex + 1) + ', unit ' + asset.unitNumber} onChange={event => selectUnit(asset, event.target.checked)} className="size-5 shrink-0 accent-emerald-800" />;
  }

  useEffect(() => {
    const section = workspace.current;
    const header = document.querySelector<HTMLElement>('header.sticky');
    if (!section) return;
    function measure() {
      if (!section) return;
      const headerHeight = header?.getBoundingClientRect().height ?? 0;
      const toolbarHeight = toolbar.current?.getBoundingClientRect().height ?? 0;
      const sticky = window.innerHeight - headerHeight - toolbarHeight >= 240;
      section.style.setProperty('--asset-header-height', `${headerHeight}px`);
      section.style.setProperty('--asset-toolbar-offset', selected.length && sticky ? `${toolbarHeight + 12}px` : '0px');
      section.dataset.assetSticky = String(sticky);
    }
    const observer = new ResizeObserver(measure);
    if (header) observer.observe(header);
    if (toolbar.current) observer.observe(toolbar.current);
    measure();
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [labels.length, selected.length]);

  useEffect(() => {
    if (!wide || !previewId) return;
    const frame = window.requestAnimationFrame(() => {
      if (panel.current) panel.current.scrollTop = 0;
      previewHeading.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [wide, previewId]);

  const restore = useCallback(() => {
    const source = origin.current;
    if (source) window.scrollTo({ top: source.page, behavior: 'instant' });
    if (source?.trigger.isConnected) {
      source.trigger.focus({ preventScroll: true });
      const headerBottom = document.querySelector('header.sticky')?.getBoundingClientRect().bottom ?? 0;
      const sticky = workspace.current?.dataset.assetSticky === 'true';
      const toolbarRect = toolbar.current?.getBoundingClientRect();
      const boundary = sticky && toolbar.current?.dataset.hasSelection === 'true' && toolbarRect && toolbarRect.top <= headerBottom + 13 ? Math.max(headerBottom, toolbarRect.bottom) : headerBottom;
      const rect = source.trigger.getBoundingClientRect();
      if (rect.top < boundary + 8) window.scrollBy({ top: rect.top - boundary - 8, behavior: 'instant' });
      else if (rect.bottom > window.innerHeight - 8) window.scrollBy({ top: rect.bottom - window.innerHeight + 8, behavior: 'instant' });
    }
    else listHeading.current?.focus({ preventScroll: true });
  }, []);

  const close = useCallback(() => {
    setPreviewId('');
    window.requestAnimationFrame(() => {
      restore();
    });
  }, [restore]);

  function show(asset: AssetRecord, trigger: HTMLButtonElement) {
    origin.current = { trigger, page: window.scrollY };
    setPreviewId(asset.id);
  }

  function keepFocusVisible(target: EventTarget) {
    if (!(target instanceof HTMLElement) || target.closest('dialog') || toolbar.current?.contains(target) || panel.current?.contains(target)) return;
    window.requestAnimationFrame(() => {
      if (workspace.current?.dataset.assetSticky !== 'true' || document.activeElement !== target || !target.matches(':focus-visible')) return;
      const headerBottom = document.querySelector('header.sticky')?.getBoundingClientRect().bottom ?? 0;
      const toolbarRect = toolbar.current?.getBoundingClientRect();
      const boundary = selected.length && toolbarRect && toolbarRect.top <= headerBottom + 13 ? Math.max(headerBottom, toolbarRect.bottom) : headerBottom;
      const top = target.getBoundingClientRect().top;
      if (top < boundary + 8) window.scrollBy({ top: top - boundary - 8, behavior: 'instant' });
    });
  }

  return <section ref={workspace} aria-label="Registered equipment" onFocusCapture={event => keepFocusVisible(event.target)} className="asset-register-workspace min-w-0 space-y-4">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><h2 id="registered-units-title" ref={listHeading} tabIndex={-1} className={`min-w-0 text-lg font-semibold focus:outline-none ${wrap}`}>Registered units · {poNumber || 'All orders'}</h2>{poNumber && <button type="button" disabled={loading} onClick={onAllOrders} className={button}>Show all orders</button>}</div>
    <p role="status" className="text-sm text-slate-600">{loading ? 'Loading equipment…' : `Showing ${total ? (page - 1) * pageSize + 1 : 0}–${Math.min(page * pageSize, total)} of ${total} ${reviewSelected ? 'selected' : 'matching'} units${poNumber ? ` for ${poNumber}` : ' across all orders'}.`}</p>
    <div ref={toolbar} role="group" aria-label="Label selection and printing" data-has-selection={selected.length > 0} className="asset-selection-toolbar flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
      <label className="flex min-h-11 min-w-0 max-w-full items-center gap-3 text-sm font-medium has-disabled:opacity-50"><input type="checkbox" disabled={loading || Boolean(error) || !assets.length} checked={allSelected} aria-checked={someSelected ? 'mixed' : allSelected} ref={input => { if (input) input.indeterminate = someSelected; }} onChange={event => togglePage(event.target.checked)} className="size-5 shrink-0 accent-emerald-800" /><span className={`min-w-0 ${wrap}`}>Select this page — {assets.length} units</span></label>
      <div className="flex min-w-0 flex-wrap items-center gap-3"><p role="status" className="text-sm font-medium text-slate-700">{selected.length} {selected.length === 1 ? 'label' : 'labels'} selected across pages</p><button type="button" disabled={loading || Boolean(error) || (!selected.length && !reviewSelected)} onClick={onReviewSelected} className={button} aria-pressed={reviewSelected}>{reviewSelected ? 'Back to register' : 'Review selected'}</button><button type="button" disabled={loading || !selected.length} onClick={() => onSelection([])} className={button}>Clear selection</button><PrintQrLabels labels={labels} /></div>
    </div>
    <p className="max-w-4xl text-sm leading-6 text-slate-600">Use “Preview QR” to inspect one physical unit. Select labels independently, then print. Match labels to their serial or item-line unit number before attaching. Reprinting keeps the same asset ID.</p>
    {!loading && !assets.length && !error && <p className={`rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600 ${wrap}`}>{reviewSelected ? 'No labels are selected. Return to the register to choose units.' : poNumber ? `No registered equipment matches for ${poNumber}.` : 'No registered equipment matches.'} Receiving can register equipment after its inspection report is finalized.</p>}
    <div className="asset-register-columns min-w-0">
      <div className="min-w-0 space-y-4" aria-label="Equipment units">
        {!!assets.length && <>
          <div className="asset-unit-table overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full table-fixed text-left text-sm"><caption className="sr-only">Individual equipment units. Checkboxes select labels for printing; Preview QR inspects a unit independently.</caption>
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600"><tr><th scope="col" className="w-14 p-3"><span className="sr-only">Print selection</span></th><th scope="col" className="w-[39%] p-3">Equipment / asset ID</th><th scope="col" className="w-[23%] p-3">PO / unit</th><th scope="col" className="w-[13%] p-3">Receipt</th><th scope="col" className="p-3">Inspect</th></tr></thead>
              <tbody className="divide-y divide-slate-200">{assets.map(asset => <tr key={asset.id} className={'asset-unit-entry align-top ' + (asset.id === previewId ? 'bg-emerald-100/60' : selected.includes(asset.id) ? 'bg-emerald-50/40' : 'hover:bg-slate-50')}>
                <td className="p-3"><label className="flex min-h-11 items-center">{unitCheckbox(asset)}</label></td>
                <th scope="row" className="min-w-0 p-3 font-normal"><p className={'line-clamp-2 font-semibold leading-5 ' + wrap}>{asset.itemName}</p><p title={asset.assetTag} className={'mt-1 line-clamp-1 font-mono text-[11px] text-slate-600 ' + wrap}>{asset.assetTag}</p><p className={'mt-1 text-xs text-slate-600 ' + wrap}>Serial: {asset.serialNumber || 'Not recorded'}</p></th>
                <td className={'p-3 ' + wrap}><p className="font-medium text-emerald-900">{asset.purchaseOrder.poNumber}</p><p className="mt-1 text-xs text-slate-600">Line {asset.lineIndex + 1}, unit {asset.unitNumber}</p></td>
                <td className="p-3"><span className={'inline-block rounded-full px-2 py-1 text-xs font-medium ' + (asset.receivingReport.condition === 'Damaged' ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900')}>{asset.receivingReport.condition}</span></td>
                <td className="p-3">{previewButton(asset)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="asset-unit-list min-w-0">{assets.map(asset => <article key={asset.id} className={'asset-unit-entry min-w-0 space-y-2 rounded-xl border p-4 ' + (asset.id === previewId ? 'border-emerald-700 bg-emerald-50' : selected.includes(asset.id) ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-white')}>
            <label className="flex min-h-11 items-start gap-3">{unitCheckbox(asset)}<span className={'line-clamp-2 min-w-0 text-sm font-semibold leading-5 ' + wrap}>{asset.itemName}</span></label>
            <p className={'text-sm font-medium text-emerald-900 ' + wrap}>{asset.purchaseOrder.poNumber} · Line {asset.lineIndex + 1}, unit {asset.unitNumber}</p>
            <p title={asset.assetTag} className={'line-clamp-1 font-mono text-xs text-slate-600 ' + wrap}>{asset.assetTag}</p>
            <p className={'text-xs text-slate-600 ' + wrap}>Serial: {asset.serialNumber || 'Not recorded'} · Receipt: {asset.receivingReport.condition}</p>
            {previewButton(asset)}{selected.includes(asset.id) && <p className="text-xs text-emerald-900">Selected for printing</p>}
          </article>)}</div>
        </>}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <label className="flex items-center gap-2 text-sm">Units per page<select disabled={loading} value={pageSize} onChange={event => onPageSizeChange(Number(event.target.value))} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3"><option value={10}>10</option><option value={25}>25</option></select></label>
          <nav aria-label="Equipment pages" className="flex flex-wrap items-center gap-2 text-sm"><button type="button" disabled={loading || Boolean(error) || page <= 1} onClick={() => onPageChange(page - 1)} className={button}>Previous</button><span aria-current="page">Page {page} of {pages}</span><button type="button" disabled={loading || Boolean(error) || page >= pages} onClick={() => onPageChange(page + 1)} className={button}>Next</button></nav>
        </div>
      </div>
      {wide && <aside ref={panel} aria-label="Equipment QR preview" className="asset-preview-panel min-w-0 rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white p-4"><h3 ref={previewHeading} tabIndex={-1} className="text-base font-semibold focus:outline-none">Equipment QR preview</h3>{preview && <button type="button" onClick={close} className={button} aria-label="Close QR preview"><X className="size-4" aria-hidden="true" /></button>}</div>
        {preview ? <PreviewContent asset={preview} /> : <div className="space-y-3 p-5 text-sm leading-6 text-slate-600"><QrCode className="size-7 text-emerald-800" aria-hidden="true" /><p>Choose “Preview QR” on a unit to inspect its label and identifying details here.</p><p>Checkboxes select labels for printing. Previewing a unit keeps your print selection.</p></div>}
      </aside>}
    </div>
    {!wide && preview && <PreviewDialog asset={preview} close={close} restore={restore} />}
  </section>;
}
