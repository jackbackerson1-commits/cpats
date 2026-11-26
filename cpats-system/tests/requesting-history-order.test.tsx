import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { PRStatus, Role } from '@prisma/client';
import { RequestAuditTimeline, RequestAuditEvent, orderedRequestAuditEvents } from '../src/components/requesting/RequestAuditTimeline';

const badge = (status: PRStatus) => ({ label: status === PRStatus.Received_and_Closed ? 'Cargo Received & Closed' : status.replace(/_/g, ' '), badgeClass: 'existing-badge', dotClass: 'existing-dot' });
const start: RequestAuditEvent = { id: 'start', createdAt: '2026-10-08T08:00:00Z', previousState: null, newState: PRStatus.Pending_Business_Approval, remarks: 'Original submission note', actor: { role: Role.Requesting_Office, email: 'requester@example.invalid' } };
const render = (logs: readonly RequestAuditEvent[], highlightedLogId?: string) => renderToStaticMarkup(<RequestAuditTimeline logs={logs} highlightedLogId={highlightedLogId} statusBadge={badge} />);

test('declined, in-progress and received histories default to latest first and retain evidence and stable event IDs', () => {
  for (const status of [PRStatus.Declined, PRStatus.Pending_Admin_Approval, PRStatus.Received_and_Closed]) {
    const latest = { ...start, id: 'latest', previousState: PRStatus.Pending_Admin_Approval, newState: status, remarks: 'Latest office note', actor: { role: Role.Admin_Office, email: 'office@example.invalid' } };
    const markup = render([latest, start], 'start');
    assert.ok(markup.indexOf('Latest office note') < markup.indexOf('Original submission note'));
    assert.match(markup, /Event 2 of 2 · Latest recorded event/); assert.match(markup, /Event 1 of 2 · First recorded event/);
    assert.match(markup, /value="latest" selected/); assert.match(markup, /Show history/); assert.match(markup, /Latest update first/);
    assert.match(markup, /id="audit-start"[^>]+ring-2/); assert.match(markup, /id="audit-latest"/);
    assert.match(markup, /office@example.invalid/); assert.match(markup, /existing-badge/); assert.match(markup, /existing-dot/);
    assert.match(markup, /datetime="2026-10-08T08:00:00Z"/i);
    assert.doesNotMatch(markup, /<button|<form/);
  }
});

test('order switching retains numbering, repeated states and supplied tie ordering without mutating the original list', () => {
  const returned = { ...start, id: 'return', newState: PRStatus.Returned_for_Correction, remarks: 'Prior return' };
  const resubmitted = { ...start, id: 'resubmit', previousState: PRStatus.Returned_for_Correction, remarks: 'Resubmitted same request' };
  const logs = Object.freeze([resubmitted, returned, start]);
  const before = JSON.stringify(logs);
  const latest = orderedRequestAuditEvents(logs, 'latest'), oldest = orderedRequestAuditEvents(logs, 'oldest');
  assert.deepEqual(latest.map(entry => entry.number), [3, 2, 1]);
  assert.deepEqual(oldest.map(entry => entry.number), [1, 2, 3]);
  assert.deepEqual(oldest.map(entry => entry.log.id), ['start', 'return', 'resubmit']);
  for (const entry of latest) assert.equal(oldest.find(other => other.log.id === entry.log.id)?.number, entry.number);
  assert.equal(JSON.stringify(logs), before);
});

test('empty and single histories remain honest about missing stages', () => {
  const empty = render([]); assert.match(empty, /No decision entries/); assert.doesNotMatch(empty, /<select/);
  const single = render([start]); assert.match(single, /Event 1 of 1 · First and latest recorded event/);
  assert.doesNotMatch(single, /Cargo Received/);
});

