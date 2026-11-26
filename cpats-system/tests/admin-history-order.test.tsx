import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { PRStatus, Role } from '@prisma/client';
import { AdminWorkflowHistory, AdminWorkflowEvent, orderedAdminWorkflowEvents } from '../src/components/admin/AdminWorkflowHistory';

const first: AdminWorkflowEvent = { id: 'first', createdAt: '2026-10-08T08:00:00Z', previousState: null, newState: PRStatus.Pending_Business_Approval, remarks: 'Original request note', actor: { role: Role.Requesting_Office, email: 'requester@example.invalid' } };
const business: AdminWorkflowEvent = { ...first, id: 'business', previousState: PRStatus.Pending_Business_Approval, newState: PRStatus.Pending_Admin_Approval, remarks: 'Saved fiscal evaluation', actor: { role: Role.Business_Office, email: 'finance@example.invalid' } };
const render = (logs: readonly AdminWorkflowEvent[]) => renderToStaticMarkup(<AdminWorkflowHistory logs={logs} />);

test('all three Admin outcomes default latest first with original notes, actor/time and chronological labels', () => {
  for (const newState of [PRStatus.Approved_Awaiting_PO, PRStatus.Returned_for_Correction, PRStatus.Declined]) {
    const decision = { ...first, id: 'admin', previousState: PRStatus.Pending_Admin_Approval, newState, remarks: 'Saved Admin decision note', actor: { role: Role.Admin_Office, email: 'admin@example.invalid' } };
    const markup = render([decision, business, first]);
    assert.ok(markup.indexOf('Saved Admin decision note') < markup.indexOf('Saved fiscal evaluation'));
    assert.ok(markup.indexOf('Saved fiscal evaluation') < markup.indexOf('Original request note'));
    assert.match(markup, /Event 3 of 3 · Latest recorded event/); assert.match(markup, /Event 1 of 3 · First recorded event/);
    assert.match(markup, /value="latest" selected/); assert.match(markup, /Show history/);
    assert.match(markup, /admin@example.invalid/); assert.match(markup, /dateTime="2026-10-08T08:00:00Z"/i);
    assert.doesNotMatch(markup, /<button|<form|<input/);
  }
});

test('both orders preserve chronological numbers, event identity, ties and repeated review states', () => {
  const returned = { ...business, id: 'returned', newState: PRStatus.Returned_for_Correction };
  const resubmitted = { ...business, id: 'resubmitted', previousState: PRStatus.Returned_for_Correction };
  const logs = Object.freeze([resubmitted, returned, business, first]);
  const before = JSON.stringify(logs);
  const latest = orderedAdminWorkflowEvents(logs, 'latest'), oldest = orderedAdminWorkflowEvents(logs, 'oldest');
  assert.deepEqual(latest.map(entry => entry.number), [4, 3, 2, 1]);
  assert.deepEqual(oldest.map(entry => entry.number), [1, 2, 3, 4]);
  assert.deepEqual(oldest.map(entry => entry.log.id), ['first', 'business', 'returned', 'resubmitted']);
  for (const entry of latest) assert.equal(oldest.find(other => other.log.id === entry.log.id)?.number, entry.number);
  assert.equal(JSON.stringify(logs), before);
});

test('empty/single and advanced histories do not fabricate stages or replace an earlier Admin decision', () => {
  assert.equal(render([]), '');
  assert.match(render([first]), /Event 1 of 1 · First and latest recorded event/);
  const approved = { ...business, id: 'approved', newState: PRStatus.Approved_Awaiting_PO, remarks: 'Prior Admin approval' };
  const received = { ...first, id: 'received', newState: PRStatus.Received_and_Closed, remarks: 'Later receiving evidence', actor: { role: Role.Receiving_Custodian, email: 'receiving@example.invalid' } };
  const markup = render([received, approved, business, first]);
  assert.ok(markup.indexOf('Later receiving evidence') < markup.indexOf('Prior Admin approval'));
  assert.match(markup, /Received and Closed/); assert.match(markup, /Approved Awaiting PO/);
});
