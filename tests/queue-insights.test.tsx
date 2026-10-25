import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { PRStatus } from '@prisma/client';
import { currentStageSince, emptyQueueFilters, matchesQueueFilters, submittedDay, waitingTimeLabel } from '../src/shared/queue-insights';
import { QueueFilters } from '../src/components/ui/QueueFilters';

test('inclusive submitted dates use Philippine calendar days, including the UTC boundary', () => {
  const record = { createdAt: '2026-10-12T16:00:00Z', department: 'Office A', status: PRStatus.Pending_Admin_Approval };
  assert.equal(submittedDay(record.createdAt), '2026-10-13');
  assert.ok(matchesQueueFilters(record, { ...emptyQueueFilters, from: '2026-10-13', to: '2026-10-13' }));
  assert.equal(matchesQueueFilters(record, { ...emptyQueueFilters, to: '2026-10-12' }), false);
  assert.equal(matchesQueueFilters(record, { ...emptyQueueFilters, from: '2026-10-14', to: '2026-10-13' }), false);
  assert.equal(matchesQueueFilters({ createdAt: 'invalid' }, { ...emptyQueueFilters, from: '2026-10-13' }), false);
  assert.ok(matchesQueueFilters(record, emptyQueueFilters));
});
test('department and current status intersect without mutating or reordering authorized source records', () => {
  const records = Object.freeze([
    { createdAt: '2026-10-13T00:00:00Z', department: 'A', status: PRStatus.Pending_Business_Approval },
    { createdAt: '2026-10-13T00:00:00Z', department: 'B', status: PRStatus.Pending_Admin_Approval },
  ]);
  const before = JSON.stringify(records);
  assert.deepEqual(records.filter(record => matchesQueueFilters(record, { ...emptyQueueFilters, department: 'A', status: PRStatus.Pending_Admin_Approval })), []);
  assert.deepEqual(records.filter(record => matchesQueueFilters(record, emptyQueueFilters)), [...records]);
  assert.equal(JSON.stringify(records), before);
});
test('a repeated review starts at the latest transition, not original submission or same-status notes', () => {
  const record = { createdAt: '2026-09-01T00:00:00Z', status: PRStatus.Pending_Business_Approval, auditLogs: [
    { createdAt: '2026-10-13T01:00:00Z', previousState: PRStatus.Pending_Business_Approval, newState: PRStatus.Pending_Business_Approval },
    { createdAt: '2026-10-12T00:00:00Z', previousState: PRStatus.Returned_for_Correction, newState: PRStatus.Pending_Business_Approval },
    { createdAt: '2026-09-01T00:00:00Z', previousState: null, newState: PRStatus.Pending_Business_Approval },
  ] };
  const before = JSON.stringify(record);
  assert.equal(currentStageSince(record), '2026-10-12T00:00:00Z');
  assert.equal(waitingTimeLabel(record, Date.parse('2026-10-13T00:00:00Z')), 'In current stage: 1 day');
  assert.equal(JSON.stringify(record), before);
});
test('terminal records and missing transition evidence do not fabricate active waiting time', () => {
  const createdAt = '2026-09-01T00:00:00Z', now = Date.parse('2026-10-13T00:00:00Z');
  for (const status of [PRStatus.Declined, PRStatus.Received_and_Closed]) assert.equal(waitingTimeLabel({ createdAt, status }, now), 'No active waiting time');
  assert.equal(waitingTimeLabel({ createdAt, status: PRStatus.Ready_for_Purchase }, now), 'Stage start not recorded');
  assert.equal(waitingTimeLabel({ createdAt: '2026-10-14T00:00:00Z', status: PRStatus.Pending_Business_Approval }, now), 'In current stage: less than 1 day');
});
test('filter controls expose invalid-range feedback and preserve selected options across refreshed lists', () => {
  const html = renderToStaticMarkup(<QueueFilters records={[{ department: 'Other office' }]} value={{ from: '2026-10-14', to: '2026-10-13', department: 'Earlier office', status: 'Returned_for_Correction' }} onChange={() => {}} />);
  assert.match(html, /role="alert"/); assert.match(html, /aria-invalid="true"/);
  assert.match(html, /Earlier office/); assert.match(html, /Returned for Correction/);
  assert.match(html, /type="button"/); assert.match(html, /not a deadline/);
});
