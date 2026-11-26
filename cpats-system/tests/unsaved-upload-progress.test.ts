import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function uploadHarness(fetch: () => Promise<unknown>) {
  const page = readFileSync('src/app/dashboard/receiving/new/page.tsx', 'utf8');
  const start = page.indexOf('  const handleInvoiceUpload ='), end = page.indexOf('  const handleReceivingCommit =', start);
  assert.ok(start >= 0 && end > start);
  let pending = 0;
  const context: Record<string, unknown> = {
    FormData, URL: { createObjectURL: () => 'blob:fixture' }, fetch,
    setPendingEvidence: (update: (count: number) => number) => { pending = update(pending); },
    setInvoiceFileName: () => {}, setInvoiceFilePath: () => {}, setImagePreviewUrl: () => {},
    setAsssetImageFilePath: () => {}, setCameraViewportMapped: () => {}, setSystemError: () => {},
  };
  const source = ts.transpileModule(`${page.slice(start, end)}\ninvoice = handleInvoiceUpload; photo = handleHardwarePhotoSelect;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, context);
  const event = { target: { files: [new File(['fixture'], 'evidence.png', { type: 'image/png' })] } };
  return { pending: () => pending, invoice: () => (context.invoice as (event: unknown) => Promise<void>)(event), photo: () => (context.photo as (event: unknown) => Promise<void>)(event) };
}
test('receiving upload reminders clear their busy state after success, rejection and network failure', async () => {
  for (const outcome of ['success', 'rejected', 'network']) {
    const h = uploadHarness(async () => { if (outcome === 'network') throw Error('Network fixture'); return { ok: outcome === 'success', json: async () => ({ url: outcome === 'success' ? '/uploads/fixture.png' : null }) }; });
    await h.invoice(); assert.equal(h.pending(), 0);
    await h.photo(); assert.equal(h.pending(), 0);
  }
});
test('concurrent invoice and photo uploads keep the reminder busy until both finish', async () => {
  const releases: (() => void)[] = [];
  const h = uploadHarness(() => new Promise(resolve => { releases.push(() => resolve({ ok: true, json: async () => ({ url: '/uploads/fixture.png' }) })); }));
  const invoice = h.invoice(), photo = h.photo();
  assert.equal(h.pending(), 2);
  releases[0](); await invoice; assert.equal(h.pending(), 1);
  releases[1](); await photo; assert.equal(h.pending(), 0);
});
