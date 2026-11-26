import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { PRStatus, Role } from '@prisma/client';
import AuditWorkflowHistory from '../src/components/audit/AuditWorkflowHistory';
import { orderedAuditEvents } from '../src/shared/audit-presentation';
import type { AuditRecord } from '../src/components/audit/AuditWorkspace';

const initial: AuditRecord['auditLogs'][number] = { id: 'initial', createdAt: '2026-10-01T00:00:00Z', previousState: null, newState: PRStatus.Pending_Business_Approval, actor: { role: Role.Requesting_Office, email: 'requester@example.invalid' }, remarks: 'Original submission' };
const returned = { ...initial, id: 'return', previousState: PRStatus.Pending_Admin_Approval, newState: PRStatus.Returned_for_Correction, actor: { role: Role.Admin_Office, email: 'admin@example.invalid' }, createdAt: '2026-10-02T00:00:00Z', remarks: 'Saved return remarks' };
const resubmitted = { ...initial, id: 'resubmit', previousState: PRStatus.Returned_for_Correction, createdAt: '2026-10-02T00:00:00Z', remarks: 'Saved resubmission' };

test('audit ordering keeps chronological event numbers, repeated stages and supplied timestamp ties without mutation', () => {
  const logs = Object.freeze([resubmitted, returned, initial]);
  const before = JSON.stringify(logs);
  const latest = orderedAuditEvents(logs, 'latest'), oldest = orderedAuditEvents(logs, 'oldest');
  assert.deepEqual(latest.map(entry => entry.number), [3, 2, 1]);
  assert.deepEqual(oldest.map(entry => entry.number), [1, 2, 3]);
  assert.deepEqual(oldest.map(entry => entry.log.id), ['initial', 'return', 'resubmit']);
  for (const entry of latest) assert.equal(oldest.find(other => other.log.id === entry.log.id)?.number, entry.number);
  assert.equal(JSON.stringify(logs), before);
});

test('audit timeline defaults to latest first and retains transition text, original actor/remarks and event anchors', () => {
  const html = renderToStaticMarkup(<AuditWorkflowHistory logs={[resubmitted, returned, initial]} highlightedEventId="return" notificationEventId="return" />);
  assert.ok(html.indexOf('Saved resubmission') < html.indexOf('Original submission'));
  assert.match(html, /Event 3 of 3/); assert.match(html, /Event 1 of 3/);
  assert.match(html, /Latest recorded event/); assert.match(html, /First recorded event/);
  assert.match(html, /value="latest" selected/); assert.match(html, /Oldest first/);
  assert.match(html, /Pending Admin Approval → /); assert.match(html, /Returned for Correction/);
  assert.match(html, /admin@example.invalid/); assert.match(html, /Saved return remarks/);
  assert.match(html, /id="audit-event-return"[^>]+ring-2/); assert.match(html, /Notification event/);
  assert.match(html, /datetime="2026-10-01T00:00:00Z"/i); assert.doesNotMatch(html, /<button|<form/);
});

test('single and empty histories do not invent workflow stages or timeline controls', () => {
  const empty = renderToStaticMarkup(<AuditWorkflowHistory logs={[]} />);
  assert.match(empty, /No workflow events recorded/); assert.doesNotMatch(empty, /<select|<ol/);
  const single = renderToStaticMarkup(<AuditWorkflowHistory logs={[initial]} highlightedEventId="initial" />);
  assert.match(single, /Event 1 of 1/); assert.match(single, /First and latest recorded event/);
  assert.match(single, /Return feedback/); assert.doesNotMatch(single, /Pending Admin Approval/);
});
