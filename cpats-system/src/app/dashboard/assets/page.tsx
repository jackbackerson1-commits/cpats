'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AssetRegisterWorkspace, { type AssetRecord } from '@/components/assets/AssetRegisterWorkspace';
import AssetRegistration, { ReceivedAssetOrder } from '@/components/assets/AssetRegistration';
import AssetCamera from '@/components/assets/AssetCamera';
import waves from '@/components/requesting/requester-waves.module.css';
import '@/components/assets/purchasing-assets-compact.css';
import '@/components/assets/receiving-assets-compact.css';

interface BrowseOptions { q: string; poId: string; department: string; condition: string; sort: string; page: number; pageSize: number }
interface FilterOrder { id: string; poNumber: string; department: { code: string; name: string } }
const initialBrowse: BrowseOptions = { q: '', poId: '', department: '', condition: '', sort: 'recent', page: 1, pageSize: 10 };

export default function AssetRegisterPage() {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [previewEpoch, setPreviewEpoch] = useState(0);
  const [orders, setOrders] = useState<ReceivedAssetOrder[]>([]);
  const [canRegister, setCanRegister] = useState(false);
  const [query, setQuery] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<AssetRecord[]>([]);
  const [browse, setBrowse] = useState<BrowseOptions>(initialBrowse);
  const [filterOrders, setFilterOrders] = useState<FilterOrder[]>([]);
  const [reviewSelected, setReviewSelected] = useState(false);
  const [reviewPage, setReviewPage] = useState(1);
  const selected = selection.map(asset => asset.id);
  const [reportId, setReportId] = useState('');
  const activeOrder = orders.find((order) => order.reportId === reportId);
  const requestNumber = useRef(0);
  const load = useCallback(async (options: BrowseOptions = initialBrowse, includeOptions = false) => {
    const { q: search, poId } = options;
    const current = ++requestNumber.current;
    await Promise.resolve();
    setLoading(true); setError(''); setPreviewEpoch(current);
    try {
      const params = new URLSearchParams({ ...Object.fromEntries(Object.entries(options).map(([key, value]) => [key, String(value)])), q: search.trim() });
      if (includeOptions) params.set('options', '1');
      const response = await fetch('/api/assets?' + params, { cache: 'no-store' });
      const result = await response.json();
      if (current !== requestNumber.current) return;
      if (!response.ok) throw new Error(result.error || 'The register could not be loaded.');
      setAssets(result.assets); setBrowse({ ...options, page: result.page || options.page });
      if (result.filterOrders) setFilterOrders(result.filterOrders);
      if (!poId) setOrders(result.receivedOrders);
      else setOrders((previous) => previous.map((order) => result.receivedOrders.find((updated: ReceivedAssetOrder) => updated.reportId === order.reportId) || order));
      setTotal(result.total); setCanRegister(result.canRegister);
      return true;
    } catch (cause) {
      if (current === requestNumber.current) { setError(cause instanceof Error ? cause.message : 'The register could not be loaded.'); setAssets([]); }
      throw cause;
    } finally { if (current === requestNumber.current) setLoading(false); }
  }, []);
  useEffect(() => { const counter = requestNumber; let mounted = true; void Promise.resolve().then(() => { if (mounted) return load(initialBrowse, true); }).catch(() => {}); return () => { mounted = false; counter.current++; }; }, [load]);
  const reviewTotalPages = Math.max(1, Math.ceil(selection.length / browse.pageSize));
  const currentPage = reviewSelected ? Math.min(reviewPage, reviewTotalPages) : browse.page;
  const visibleAssets = loading ? [] : reviewSelected ? selection.slice((currentPage - 1) * browse.pageSize, currentPage * browse.pageSize) : assets;
  const shownTotal = reviewSelected ? selection.length : total;
  const labels = loading || error ? [] : selection.map(asset => ({ reference: asset.assetTag, token: asset.qrCodeToken, title: 'INDIVIDUAL EQUIPMENT',
    detail: asset.itemName + ' · Line ' + (asset.lineIndex + 1) + ', unit ' + asset.unitNumber + ' · ' + asset.purchaseOrder.poNumber + ' · Serial: ' + (asset.serialNumber || 'Not recorded') }));
  function updateBrowse(patch: Partial<BrowseOptions>, clearSelection = false) {
    const next = { ...browse, ...patch };
    if (clearSelection) { setSelection([]); setReviewSelected(false); setReviewPage(1); }
    setBrowse(next); return load(next).catch(() => false);
  }
  function focusUnits() {
    const heading = document.getElementById('registered-units-title');
    if (!heading) return;
    const headerHeight = document.querySelector('header.sticky')?.getBoundingClientRect().height || 0;
    const top = window.scrollY + heading.getBoundingClientRect().top - headerHeight - 16;
    heading.focus({ preventScroll: true }); window.scrollTo({ top, behavior: 'instant' });
  }
  function search(value: string) {
    setQuery(value); updateBrowse({ q: value, page: 1 }, true);
  }
  function chooseOrder(value: string) {
    setReportId(value); setSelection([]); setReviewSelected(false); setQuery(''); setReviewPage(1);
    const next = { ...initialBrowse, pageSize: browse.pageSize, poId: orders.find(order => order.reportId === value)?.purchaseOrderId || '' };
    setBrowse(next); void load(next, true).catch(() => {});
  }
  function changeSelection(ids: string[]) {
    const available = new Map([...selection, ...assets].map(asset => [asset.id, asset]));
    setSelection(ids.flatMap(id => available.has(id) ? [available.get(id)!] : []));
  }
  const departments = [...new Map(filterOrders.map(order => [order.department.code, order.department])).values()];
  const field = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50';
  return <main className="asset-register-page mx-auto max-w-[1920px] space-y-6 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
    <header className={`rounded-xl border border-slate-200 border-l-4 border-l-emerald-800 bg-white p-5 sm:p-6 ${waves.assetIntroduction}`}><p className="text-xs font-medium text-emerald-800">Equipment identification</p><h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Asset register</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">One PO QR identifies an order. Each equipment QR identifies one physical unit, including units of the same brand and model. Opening a label does not change procurement status.</p></header>
    <section aria-label="Find equipment" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <form onSubmit={(event) => { event.preventDefault(); search(query); }} className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-sm font-medium">Find by asset ID, serial number, item, or PO<input maxLength={160} value={query} onChange={(event) => setQuery(event.target.value)} className="mt-2 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-3 text-sm" placeholder="Enter or scan an asset reference" /></label>
        <button disabled={loading} className="min-h-11 rounded-lg bg-emerald-800 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">Find</button><button type="button" onClick={() => search('')} disabled={loading} className="min-h-11 rounded-lg border border-slate-300 px-4 py-3 text-sm disabled:opacity-50">Clear / refresh</button>
      </form>
      {activeOrder && <p className="break-words text-sm leading-6 text-emerald-900 [overflow-wrap:anywhere]">Search and scan results are limited to {activeOrder.poNumber}. Use “Show all orders” below to search the full register.</p>}
      <AssetCamera onScan={(token) => { if (token.startsWith('PO-TOKEN-')) { setError('This is a purchase-order QR. Use it in Receiving to identify a delivery; scan an individual asset label here.'); return; } search(token); }} />
      <p className="text-xs leading-5 text-slate-600">Use a camera where supported, a connected scanner, or the printed asset ID. To find older received orders for tagging, search their PO number. The registration list shows up to 50 matching received reports.</p>
    </section>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">{error}</p>}
    {canRegister && <AssetRegistration orders={orders} reportId={reportId} loading={loading || Boolean(error)} onOrderChange={chooseOrder} onSaved={async (ids, order) => {
      setOrders((previous) => previous.some((entry) => entry.reportId === order.reportId) ? previous : [...previous, order]);
      setReportId(order.reportId); setQuery(''); setSelection([]); setReviewSelected(false); setReviewPage(1);
      const next = { ...initialBrowse, pageSize: browse.pageSize, poId: order.purchaseOrderId };
      setBrowse(next);
      if (!await load(next, true)) return;
      const hydrationRequest = requestNumber.current;
      const response = await fetch('/api/assets?' + new URLSearchParams({ ids: ids.join(','), poId: order.purchaseOrderId }), { cache: 'no-store' });
      const result = await response.json();
      if (hydrationRequest !== requestNumber.current) return;
      if (!response.ok || result.assets?.length !== ids.length) throw new Error(result.error || 'Refresh to retrieve all newly saved labels.');
      setSelection(result.assets); setReviewSelected(true);
    }} />}
    <section aria-label="Register filters" className="grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="min-w-0 text-xs font-medium text-slate-600">Purchase order<select aria-label="Filter by purchase order" disabled={loading || Boolean(activeOrder)} value={browse.poId} onChange={event => updateBrowse({ poId: event.target.value, page: 1 }, true)} className={field}><option value="">All purchase orders</option>{filterOrders.map(order => <option key={order.id} value={order.id}>{order.poNumber}</option>)}{activeOrder && !filterOrders.some(order => order.id === activeOrder.purchaseOrderId) && <option value={activeOrder.purchaseOrderId}>{activeOrder.poNumber}</option>}</select></label>
      <label className="min-w-0 text-xs font-medium text-slate-600">Department<select aria-label="Filter by department" disabled={loading} value={browse.department} onChange={event => updateBrowse({ department: event.target.value, page: 1 }, true)} className={field}><option value="">All departments</option>{departments.map(department => <option key={department.code} value={department.code}>{department.code} · {department.name}</option>)}</select></label>
      <label className="min-w-0 text-xs font-medium text-slate-600">Condition at receipt<select aria-label="Filter by receipt condition" disabled={loading} value={browse.condition} onChange={event => updateBrowse({ condition: event.target.value, page: 1 }, true)} className={field}><option value="">All conditions</option><option value="Good">Good</option><option value="Damaged">Damaged</option></select></label>
      <label className="min-w-0 text-xs font-medium text-slate-600">Sort by<select aria-label="Sort equipment" disabled={loading} value={browse.sort} onChange={event => { setReviewSelected(false); updateBrowse({ sort: event.target.value, page: 1 }); }} className={field}><option value="recent">Newest registered</option><option value="po">PO and unit sequence</option><option value="item">Item name</option></select></label>
      <p className="text-xs leading-5 text-slate-600 sm:col-span-2 xl:col-span-4">Search, scan, filter and order changes clear label selection. Changing pages or sorting keeps your selection. {activeOrder && 'The registration order limits this register; use Show all orders to release it.'}</p>
      {(browse.poId || browse.department || browse.condition) && <button type="button" disabled={loading} onClick={() => updateBrowse({ poId: activeOrder?.purchaseOrderId || '', department: '', condition: '', page: 1 }, true)} className="min-h-11 justify-self-start rounded-lg border border-slate-300 px-3 text-sm font-semibold">Clear register filters</button>}
    </section>
    <AssetRegisterWorkspace key={String(previewEpoch) + '-' + reviewSelected + '-' + currentPage} assets={visibleAssets} loading={loading} error={error} total={shownTotal} poNumber={activeOrder?.poNumber} selected={selected} labels={labels} onSelection={changeSelection}
      page={currentPage} pageSize={browse.pageSize} reviewSelected={reviewSelected}
      onReviewSelected={() => { setReviewSelected(value => !value); setReviewPage(1); }}
      onPageChange={page => { if (reviewSelected) { setReviewPage(page); requestAnimationFrame(focusUnits); } else void updateBrowse({ page }).then(loaded => { if (loaded) requestAnimationFrame(focusUnits); }); }}
      onPageSizeChange={pageSize => { setReviewPage(1); void updateBrowse({ pageSize, page: 1 }).then(loaded => { if (loaded) requestAnimationFrame(focusUnits); }); }} onAllOrders={() => chooseOrder('')} />
  </main>;
}
