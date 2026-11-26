import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldGuardLink, hasUnsavedFormChanges } from '../src/shared/unsaved-changes';

const current = 'https://cpats.test/dashboard/pr/new?draftId=one';
test('workspace, Help, request-query and same-URL reload links can leave edited forms', () => {
  for (const href of ['/dashboard/help', '/dashboard/pr/track', '/dashboard/pr/new', '/dashboard/pr/new?draftId=two', current]) assert.ok(shouldGuardLink({ href }, current), href);
});
test('new tabs, downloads, modified clicks and in-page anchors preserve the existing form', () => {
  for (const link of [
    { href: '/uploads/proof.pdf', target: '_blank' }, { href: '/dashboard/help', target: 'help-window' },
    { href: '/download', download: true }, { href: '/dashboard/help', modified: true },
    { href: '/dashboard/help', button: 1 }, { href: '#items' },
  ]) assert.equal(shouldGuardLink(link, current), false);
  assert.ok(shouldGuardLink({ href: '/dashboard/help', target: '_self' }, current));
});
test('non-navigation links are excluded without suppressing an external same-tab departure', () => {
  for (const href of ['mailto:office@example.invalid', 'tel:1234', 'javascript:void(0)']) assert.equal(shouldGuardLink({ href }, current), false);
  assert.ok(shouldGuardLink({ href: 'https://example.invalid/help' }, current));
});
test('prefilled and reverted values stay clean, but price, quantity, remarks and proof edits are detected', () => {
  const values = { price: 12, quantity: 2, remarks: 'Saved feedback', proof: '/uploads/saved.pdf', verified: true };
  const baseline = { scope: 'record-a', value: JSON.stringify(values) };
  assert.equal(hasUnsavedFormChanges(baseline, 'record-a', JSON.stringify(values)), false);
  for (const changed of [{ price: 13 }, { quantity: 3 }, { remarks: 'Edited feedback' }, { proof: '/uploads/new.pdf' }, { verified: false }]) assert.ok(hasUnsavedFormChanges(baseline, 'record-a', JSON.stringify({ ...values, ...changed })));
  assert.equal(hasUnsavedFormChanges(baseline, 'record-a', JSON.stringify(values)), false);
});
test('loading another record establishes its own baseline without mutating either snapshot', () => {
  const baseline = Object.freeze({ scope: 'record-a', value: 'old record' });
  assert.equal(hasUnsavedFormChanges(baseline, 'record-b', 'new prefilled record'), false);
  assert.deepEqual(baseline, { scope: 'record-a', value: 'old record' });
  const saved = { scope: 'record-b', value: 'current edits' };
  assert.equal(hasUnsavedFormChanges(saved, 'record-b', 'current edits'), false);
  assert.ok(hasUnsavedFormChanges(saved, 'record-b', 'next edit'));
});
