import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { PRStatus, Role } from '@prisma/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { BusinessEvaluationSchema } from '../src/validation/business.schema';
import { BusinessVerificationDetails } from '../src/components/business/BusinessVerificationDetails';

const prId = '11111111-1111-4111-8111-111111111111';
const actorId = 'business-reviewer';
const payload = { prId, action: 'APPROVE', remarks: 'Original evaluation remarks' };
type Reply = { status: number; body: { success: boolean; data?: unknown } };
type SavedDecision = { prId: string; actorId: string; previousState: PRStatus; newState: PRStatus; remarks: string; businessNecessityVerified: boolean | null; businessBudgetAvailable: boolean | null };

function loadRoute(file: string, modules: Record<string, unknown>) {
  const exports: Record<string, (request: unknown) => Promise<Reply>> = {};
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, console: { error() {} }, require: (name: string) => {
    assert.ok(name in modules, `Missing isolated dependency ${name}`);
    return modules[name];
  } });
  return exports;
}

function harness(options: { role?: Role; status?: PRStatus; adminReturn?: boolean; count?: number; auditFails?: boolean } = {}) {
  const decisions: SavedDecision[] = [];
  const updates: unknown[] = [];
  const notifications: string[] = [];
  const tx = {
    purchaseRequest: {
      findUnique: async () => ({ id: prId, status: options.status ?? PRStatus.Pending_Business_Approval, auditLogs: options.adminReturn ? [{ actor: { role: Role.Admin_Office }, previousState: PRStatus.Pending_Admin_Approval, newState: PRStatus.Returned_for_Correction }] : [] }),
      update: async (query: unknown) => { updates.push(query); return { id: prId }; },
      updateMany: async (query: unknown) => { updates.push(query); return { count: options.count ?? 1 }; },
    },
    auditLog: { create: async ({ data }: { data: SavedDecision }) => {
      if (options.auditFails) throw new Error('Storage failed');
      decisions.push(data); return { id: `decision-${decisions.length}` };
    } },
  };
  const modules = {
    'next/server': { NextResponse: { json: (body: Reply['body'], init?: { status: number }) => ({ body, status: init?.status ?? 200 }) } },
    '@prisma/client': { Role, PRStatus },
    '@/validation/business.schema': { BusinessEvaluationSchema },
    '@/shared/rbac': { authorizeRequest: async () => (options.role ?? Role.Business_Office) === Role.Business_Office ? { success: true, user: { id: actorId } } : { success: false, response: { status: 403, body: { success: false } } } },
    '@/shared/notifications': { dispatchNotificationForAuditLog: async (id: string) => { notifications.push(id); } },
    '@/shared/prisma': { prisma: { ...tx, $transaction: async (run: (client: typeof tx) => Promise<unknown>) => {
      const savedCount = decisions.length, updateCount = updates.length;
      try { return await run(tx); } catch (error) { decisions.splice(savedCount); updates.splice(updateCount); throw error; }
    } } },
  };
  const route = loadRoute('src/app/api/pr/evaluate-business/route.ts', modules);
  return { decisions, updates, notifications, submit: (body: object = payload, method = 'POST') => route[method]({ json: async () => body }) };
}

test('ordinary decisions retain their transitions and save current declarations independently of remarks', async () => {
  for (const [action, next] of [['APPROVE', PRStatus.Pending_Admin_Approval], ['DECLINE', PRStatus.Declined], ['RETURN_FOR_CORRECTION', PRStatus.Returned_for_Correction]]) {
    const h = harness();
    assert.equal((await h.submit({ ...payload, action, necessityVerified: false, budgetAvailable: true })).status, 200);
    assert.deepEqual(JSON.parse(JSON.stringify(h.decisions[0])), { prId, actorId, previousState: PRStatus.Pending_Business_Approval, newState: next, remarks: payload.remarks, businessNecessityVerified: false, businessBudgetAvailable: true });
    assert.deepEqual(h.notifications, ['decision-1']);
  }
});

test('legacy callers remain accepted, missing values remain null, and invalid types never write', async () => {
  const oldClient = harness();
  assert.equal((await oldClient.submit()).status, 200);
  assert.equal(oldClient.decisions[0].businessNecessityVerified, null);
  assert.equal(oldClient.decisions[0].businessBudgetAvailable, null);
  const partial = harness();
  assert.equal((await partial.submit({ ...payload, budgetAvailable: false })).status, 200);
  assert.equal(partial.decisions[0].businessNecessityVerified, null);
  assert.equal(partial.decisions[0].businessBudgetAvailable, false);
  for (const key of ['necessityVerified', 'budgetAvailable']) {
    const h = harness();
    assert.equal((await h.submit({ ...payload, [key]: 'true' })).status, 422);
    assert.equal(h.updates.length, 0); assert.equal(h.decisions.length, 0); assert.equal(h.notifications.length, 0);
  }
});

test('Admin-return revisions append their own confirmations and preserve conditional stale checks', async () => {
  const h = harness({ status: PRStatus.Returned_for_Correction, adminReturn: true });
  assert.equal((await h.submit({ ...payload, necessityVerified: true, budgetAvailable: false }, 'PATCH')).status, 200);
  assert.equal(h.decisions[0].previousState, PRStatus.Returned_for_Correction);
  assert.equal(h.decisions[0].newState, PRStatus.Pending_Admin_Approval);
  assert.equal(h.decisions[0].businessBudgetAvailable, false);
  assert.deepEqual(JSON.parse(JSON.stringify(h.updates[0])), { where: { id: prId, status: PRStatus.Returned_for_Correction }, data: { status: PRStatus.Pending_Admin_Approval } });
  for (const options of [{ status: PRStatus.Pending_Business_Approval }, { status: PRStatus.Returned_for_Correction, adminReturn: true, count: 0 }]) {
    const stale = harness(options);
    assert.equal((await stale.submit(payload, 'PATCH')).status, 409);
    assert.equal(stale.decisions.length, 0); assert.equal(stale.notifications.length, 0);
  }
});

test('other roles, closed requests, invalid revision actions and failed storage cannot save confirmations', async () => {
  for (const role of Object.values(Role).filter(role => role !== Role.Business_Office)) {
    for (const method of ['POST', 'PATCH']) {
      const h = harness({ role });
      assert.equal((await h.submit(payload, method)).status, 403);
      assert.equal(h.updates.length, 0); assert.equal(h.decisions.length, 0);
    }
  }
  const closed = harness({ status: PRStatus.Received_and_Closed });
  assert.equal((await closed.submit()).status, 400); assert.equal(closed.decisions.length, 0);
  const revised = harness({ status: PRStatus.Returned_for_Correction, adminReturn: true });
  assert.equal((await revised.submit({ ...payload, action: 'DECLINE' }, 'PATCH')).status, 400); assert.equal(revised.updates.length, 0);
  const failed = harness({ auditFails: true });
  assert.equal((await failed.submit()).status, 500); assert.equal(failed.updates.length, 0); assert.equal(failed.notifications.length, 0);
});

test('read-only history requests both stored fields for every audit event, retaining null and false', async () => {
  let selected: { select: { auditLogs: { select: Record<string, unknown> } } } | undefined;
  const records = [{ id: prId, auditLogs: [{ id: 'revision', businessNecessityVerified: true, businessBudgetAvailable: false }, { id: 'old', businessNecessityVerified: null, businessBudgetAvailable: null }] }];
  const route = loadRoute('src/app/api/pr/business-history/route.ts', {
    'next/server': { NextResponse: { json: (body: Reply['body']) => ({ status: 200, body }) } },
    '@prisma/client': { Role, PRStatus },
    '@/shared/rbac': { authorizeRequest: async () => ({ success: true }) },
    '@/shared/prisma': { prisma: { purchaseRequest: { findMany: async (query: typeof selected) => { selected = query; return records; } } } },
  });
  const reply = await route.GET({});
  assert.equal(selected?.select.auditLogs.select.businessNecessityVerified, true);
  assert.equal(selected?.select.auditLogs.select.businessBudgetAvailable, true);
  assert.deepEqual(reply.body.data, records);
});

test('display distinguishes confirmed, explicitly unconfirmed, and unrecorded decisions', () => {
  const markup = renderToStaticMarkup(<BusinessVerificationDetails decision={{ businessNecessityVerified: true, businessBudgetAvailable: false }} />);
  assert.match(markup, />Confirmed</); assert.match(markup, />Not confirmed</);
  for (const decision of [{}, { businessNecessityVerified: null, businessBudgetAvailable: null }]) {
    const old = renderToStaticMarkup(<BusinessVerificationDetails decision={decision} />);
    assert.equal((old.match(/>Not recorded</g) ?? []).length, 2);
    assert.doesNotMatch(old, /<button|<input/);
  }
});

test('actual client handler sends current confirmations for normal and revised decisions; existing unchecked gate remains', async () => {
  const source = readFileSync('src/app/dashboard/pr/evaluate-business/page.tsx', 'utf8');
  const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler = '';
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleEvaluationSubmit') handler = node.initializer!.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(handler);
  for (const revised of [false, true]) {
    for (const checked of [false, true]) {
      const requests: { method: string; body: string }[] = [];
      let pending = Promise.resolve();
      const context: Record<string, unknown> = {
        activeUser: { role: Role.Business_Office }, Role, PRStatus,
        activeQueue: [{ id: prId, status: revised ? PRStatus.Returned_for_Correction : PRStatus.Pending_Business_Approval }], businessHistory: [],
        targetPrId: prId, evaluationAction: 'APPROVE', remarks: payload.remarks, necessityVerified: checked, budgetAvailable: checked,
        isAdminReturnForBusiness: () => revised,
        fetch: async (_url: string, init: { method: string; body: string }) => { requests.push(init); return { ok: true, json: async () => ({ success: true }) }; },
        startTransition: (fn: () => Promise<void>) => { pending = fn(); },
        decisionFeedback() {}, actionFeedback() {}, submissionFeedbackError() {}, syncWorkspaceQueue: async () => {}, router: { refresh() {} },
      };
      for (const match of handler.matchAll(/\b(set[A-Z]\w*)\(/g)) context[match[1]] = () => {};
      vm.runInNewContext(ts.transpileModule('globalThis.run = ' + handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
      await (context.run as (event: unknown) => Promise<void>)({ preventDefault() {} }); await pending;
      assert.equal(requests.length, checked ? 1 : 0);
      if (checked) {
        assert.equal(requests[0].method, revised ? 'PATCH' : 'POST');
        assert.equal(JSON.parse(requests[0].body).necessityVerified, true);
        assert.equal(JSON.parse(requests[0].body).budgetAvailable, true);
      }
    }
  }
});
