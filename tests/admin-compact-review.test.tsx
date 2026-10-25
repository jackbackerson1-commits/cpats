import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { PRStatus, Role } from '@prisma/client';
import { adminReviewPage } from '../src/shared/admin-presentation';
import AdminRequestPanels, { AdminPendingReviews } from '../src/components/admin/AdminRequestPanels';
import { AdminWorkflowHistory } from '../src/components/admin/AdminWorkflowHistory';
import type { AdminContextEvent } from '../src/components/admin/AdminDecisionContext';

const event: AdminContextEvent = { id: 'saved-return', previousState: PRStatus.Pending_Admin_Approval, newState: PRStatus.Returned_for_Correction, createdAt: '2026-10-10T00:00:00Z', remarks: 'Saved return reason', actor: { role: Role.Admin_Office, email: 'admin@example.invalid' } };
test('Admin pages cover complete filtered records and clamp empty/shrunk views without mutating records', () => {
  const records = Object.freeze(Array.from({ length: 31 }, (_, id) => ({ id })));
  const before = JSON.stringify(records);
  const page = adminReviewPage(records, 3, 10);
  assert.deepEqual(page.records.map(r => r.id), [20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
  assert.equal(page.start, 21); assert.equal(page.end, 30);
  assert.equal(adminReviewPage(records.slice(0, 2), 4, 10).page, 1);
  assert.equal(adminReviewPage(records, 4, 25).page, 2);
  assert.equal(adminReviewPage([], 4, 10).start, 0);
  assert.equal(JSON.stringify(records), before);
});
test('Admin panels expose three categories and visible Overview; decision actions live outside the tab panels', () => {
  for (const readOnly of [true, false]) {
    const html = renderToStaticMarkup(<AdminRequestPanels requestId="saved-request" title="Equipment" status={PRStatus.Returned_for_Correction} departmentCode="CCS" readOnly={readOnly} logs={[event]} overview={<p>Saved overview data</p>} reviews={<p>Saved review data</p>} />);
    assert.equal(html.match(/role="tab" /g)?.length, 3);
    assert.match(html, /Overview/); assert.match(html, /Reviews &amp; documents/); assert.match(html, /Workflow history/);
    assert.match(html, /Copy reference/); assert.match(html, /Saved overview data/);
    assert.match(html, /View return feedback/);
    assert.doesNotMatch(html, /Go to decision/);
    assert.doesNotMatch(html, /<form|type="submit"|<details/);
  }
});
test('embedded Admin history preserves exact notification anchor and chronological labels without a disclosure', () => {
  const html = renderToStaticMarkup(<AdminWorkflowHistory logs={[event]} embedded highlightedLogId={event.id} notificationLogId={event.id} />);
  assert.match(html, /id="admin-event-saved-return"/); assert.match(html, /Notification event/);
  assert.match(html, /Event 1 of 1/); assert.match(html, /Pending Admin Approval → /);
  assert.match(html, /Saved return reason/); assert.match(html, /admin@example.invalid/);
  assert.doesNotMatch(html, /<details|<summary/);
});
test('pending saved fiscal reviews retain true/false/missing confirmation meaning and are read-only', () => {
  const fiscal = { ...event, actor: { role: Role.Business_Office, email: 'finance@example.invalid' }, newState: PRStatus.Pending_Admin_Approval, businessNecessityVerified: true, businessBudgetAvailable: false };
  const html = renderToStaticMarkup(<AdminPendingReviews logs={[fiscal]} />);
  assert.match(html, /Confirmed/); assert.match(html, /Not confirmed/); assert.match(html, /finance@example.invalid/);
  assert.doesNotMatch(html, /<input|<button|<form/);
});
