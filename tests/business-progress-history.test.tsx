import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { PRStatus, Role } from '@prisma/client';
import { BusinessProgressHistory, BusinessProgressEvent, orderedBusinessProgressEvents } from '../src/components/business/BusinessProgressHistory';

const states = [PRStatus.Pending_Business_Approval, PRStatus.Pending_Admin_Approval, PRStatus.Approved_Awaiting_PO, PRStatus.Awaiting_Check_Issuance, PRStatus.Ready_for_Purchase, PRStatus.Received_and_Closed];
const roles = [Role.Requesting_Office, Role.Business_Office, Role.Admin_Office, Role.Purchasing_Office, Role.Business_Office, Role.Receiving_Custodian];
const events: BusinessProgressEvent[] = states.map((newState, index) => ({ id: `event-${index}`, newState, previousState: index ? states[index - 1] : null, createdAt: `2026-10-08T08:0${index}:00Z`, remarks: `Saved note ${index}`, actor: { role: roles[index], email: `office-${index}@example.invalid` }, businessNecessityVerified: true, businessBudgetAvailable: false }));
const render = (logs: readonly BusinessProgressEvent[]) => renderToStaticMarkup(<BusinessProgressHistory auditLogs={logs} />);

test('completed journey defaults to receipt first, with chronological numbering and preserved evidence', () => {
  const newestFirst = [...events].reverse();
  const original = JSON.stringify(newestFirst);
  const markup = render(Object.freeze(newestFirst));
  for (let index = 0; index < events.length; index++) {
    assert.match(markup, new RegExp(`Event ${index + 1} of 6`));
    assert.match(markup, new RegExp(`Saved note ${index}`));
    assert.match(markup, new RegExp(`office-${index}@example.invalid`));
    if (index) assert.ok(markup.indexOf(`Saved note ${index}`) < markup.indexOf(`Saved note ${index - 1}`));
  }
  assert.match(markup, /First recorded event/); assert.match(markup, /Latest recorded event/);
  assert.match(markup, /Confirmed/); assert.match(markup, /Not confirmed/);
  assert.equal(JSON.stringify(newestFirst), original);
  assert.doesNotMatch(markup, /<button|<input|<form/);
  assert.match(markup, /Latest update first/); assert.match(markup, /Show history/);
  assert.match(markup, /value="latest" selected/);
});

test('returns and resubmissions retain their actual sequence, including repeated states', () => {
  const returned = { ...events[2], id: 'return', newState: PRStatus.Returned_for_Correction, remarks: 'Return reason' };
  const resubmitted = { ...events[0], id: 'resubmit', previousState: PRStatus.Returned_for_Correction, remarks: 'Resubmission note' };
  const markup = render([resubmitted, returned, events[1], events[0]]);
  assert.ok(markup.indexOf('Saved note 1') < markup.indexOf('Saved note 0'));
  assert.ok(markup.indexOf('Resubmission note') < markup.indexOf('Return reason'));
  assert.match(markup, /Event 4 of 4 · Latest recorded event/);
  assert.equal((markup.match(/Pending Business Approval/g) || []).length, 2);
});

test('equal timestamps retain supplied order in latest mode and its reverse in oldest mode', () => {
  const logs = events.slice(0, 3).map(event => ({ ...event, createdAt: '2026-10-08T08:00:00Z' })).reverse();
  const markup = render(logs);
  assert.ok(markup.indexOf('Saved note 2') < markup.indexOf('Saved note 1'));
  assert.ok(markup.indexOf('Saved note 1') < markup.indexOf('Saved note 0'));
  assert.deepEqual(orderedBusinessProgressEvents(logs, 'oldest').map(entry => entry.event.id), ['event-0', 'event-1', 'event-2']);
});

test('single and empty histories do not invent a starting or completed stage', () => {
  assert.equal(render([]), '');
  const markup = render([events[1]]);
  assert.match(markup, /1 recorded event · Latest first/);
  assert.match(markup, /First and latest recorded event/);
  assert.doesNotMatch(markup, /Received and Closed/);
});

test('both display orders retain event identity and chronological numbers without mutating input', () => {
  const logs = Object.freeze([...events].reverse());
  const original = JSON.stringify(logs);
  const latest = orderedBusinessProgressEvents(logs, 'latest');
  const oldest = orderedBusinessProgressEvents(logs, 'oldest');
  assert.deepEqual(latest.map(entry => entry.number), [6, 5, 4, 3, 2, 1]);
  assert.deepEqual(oldest.map(entry => entry.number), [1, 2, 3, 4, 5, 6]);
  for (const entry of latest) assert.equal(oldest.find(other => other.event.id === entry.event.id)?.number, entry.number);
  assert.equal(JSON.stringify(logs), original);
});
