import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Role } from '@prisma/client';
import { getWorkflowGuide, matchesGuideSearch } from '../src/shared/workflow-guide';

// Keep the actual route permissions as the test oracle without importing its DB/session runtime.
function existingRouteRoles(): Record<string, Role[]> {
  const source = readFileSync('src/shared/rbac.ts', 'utf8');
  const routes: Record<string, Role[]> = {};
  for (const match of source.matchAll(/'([^']+)': \[([^\]]+)\]/g)) routes[match[1]] = [...match[2].matchAll(/Role\.(\w+)/g)].map((role) => role[1] as Role);
  const assets = readFileSync('src/shared/asset-access.ts', 'utf8');
  routes['/dashboard/assets'] = [...assets.matchAll(/Role\.(\w+)/g)].map((role) => role[1] as Role);
  routes['/dashboard/notifications'] = Object.values(Role);
  return routes;
}

test('every role has guidance and only shortcuts permitted by existing route access', () => {
  const allowed = existingRouteRoles();
  for (const role of Object.values(Role)) {
    const guide = getWorkflowGuide(role);
    assert.ok(guide.roleLabel); assert.ok(guide.purpose); assert.ok(guide.tasks.length); assert.ok(guide.answers.length);
    for (const task of guide.tasks) {
      assert.ok(allowed[task.href]?.includes(role), `${role} must be allowed to open ${task.href}`);
      assert.ok(task.title && task.description);
    }
    assert.equal(new Set(guide.tasks.map((task) => task.href)).size, guide.tasks.length);
  }
});

test('help search handles case, whitespace, multiple terms and no matches', () => {
  assert.ok(matchesGuideSearch('  SAVE  draft ', 'New request', 'Save unfinished draft'));
  assert.ok(matchesGuideSearch('', 'Any text'));
  assert.ok(matchesGuideSearch('supplier damaged', 'Damaged cargo', 'Supplier invoice'));
  assert.equal(matchesGuideSearch('supplier absent', 'Supplier invoice'), false);
  assert.equal(matchesGuideSearch('unfindable', 'Save draft'), false);
});

test('requester guidance preserves correction, decline reuse and private draft distinctions', () => {
  const text = getWorkflowGuide(Role.Requesting_Office).answers.map((entry) => entry.answer).join(' ');
  assert.match(text, /same request/); assert.match(text, /new request/); assert.match(text, /original request remains declined/);
  assert.match(text, /private to your account/); assert.match(text, /unsaved work/);
});

test('receiving guidance explicitly describes current damage closure and absent partial receiving', () => {
  const text = getWorkflowGuide(Role.Receiving_Custodian).answers.map((entry) => entry.answer).join(' ');
  assert.match(text, /Received and Closed/); assert.match(text, /does not track a supplier return/); assert.match(text, /does not record per-item delivered quantities/);
});

test('read-only and account roles do not imply decision or asset registration authority', () => {
  assert.match(getWorkflowGuide(Role.Global_Auditor).answers.map((entry) => entry.answer).join(' '), /ledger is read-only/);
  assert.match(getWorkflowGuide(Role.System_Administrator).answers.map((entry) => entry.answer).join(' '), /remain with their respective roles/);
  assert.match(getWorkflowGuide(Role.Purchasing_Office).answers.map((entry) => entry.answer).join(' '), /registration belongs to the Receiving Custodian/);
});
