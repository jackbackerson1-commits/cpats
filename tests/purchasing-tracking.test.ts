import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesTrackingView, sortTrackingRecords, trackingPage } from '../src/shared/purchasing-tracking';

const make = (id: string, status = 'Approved_Awaiting_PO', since?: string) => ({
  id, status, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-10-16T00:00:00Z',
  auditLogs: since ? [{ previousState: null, newState: status, createdAt: since }] : [],
});

test('longest waiting uses stage-entry evidence, keeps unknown/closed records last, and leaves source order intact', () => {
  const records = [make('unknown'), make('newer', undefined, '2026-10-12T00:00:00Z'), make('closed', 'Received_and_Closed', '2026-09-01T00:00:00Z'), make('oldest', undefined, '2026-10-01T00:00:00Z')];
  const before = JSON.stringify(records);
  assert.deepEqual(sortTrackingRecords(records, 'waiting').slice(0, 2).map(r => r.id), ['oldest', 'newer']);
  assert.equal(JSON.stringify(records), before);
  const recent = { ...records[0], id: 'recent', updatedAt: '2026-10-17T00:00:00Z' };
  assert.equal(sortTrackingRecords([...records, recent], 'recent')[0].id, 'recent');
});

test('view filtering precedes pagination and retains completed records in All', () => {
  const records = Array.from({ length: 30 }, (_, i) => make(String(i), i < 6 ? 'Received_and_Closed' : 'Ready_for_Purchase'));
  assert.equal(records.filter(r => matchesTrackingView(r, 'all')).length, 30);
  assert.equal(records.filter(r => matchesTrackingView(r, 'received')).length, 6);
  const active = records.filter(r => matchesTrackingView(r, 'active'));
  const last = trackingPage(active, 3, 10);
  assert.equal(last.totalPages, 3);
  assert.deepEqual(last.records.map(r => r.id), ['26', '27', '28', '29']);
  assert.equal(last.start, 21);
  assert.equal(last.end, 24);
  assert.equal(trackingPage(active, 3, 25).page, 1);
  assert.equal(trackingPage(active.slice(0, 2), 3, 10).page, 1);
  const empty = trackingPage([], 8, 10);
  assert.equal(empty.start, 0); assert.equal(empty.end, 0); assert.equal(empty.page, 1);
});
