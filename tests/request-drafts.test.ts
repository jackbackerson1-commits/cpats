import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { PRStatus, Role } from '@prisma/client';
import { z } from 'zod';
import { CreatePRSchema } from '../src/validation/pr.schema';
import * as draftSchemas from '../src/validation/request-draft.schema';
import * as workflowConflict from '../src/shared/workflow-conflict';

const draftId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const unfinished = { items: [{ category: 'Other / Custom Item', specs: '', quantity: 1 }], justification: '', isDirectPoBypass: true, adminProofFilePath: '', attachedFileName: null, attachedFileSize: null, attachedFileIsImage: false };
const complete = { justification: 'Equipment for laboratory classes', isDirectPoBypass: false, items: [{ itemName: 'Monitors & Displays — IPS panel', quantity: 2 }] };
type Row = Record<string, unknown>;
type Query = { where: Row; data: Row; select?: Row; skip?: number; take?: number };
type Reply = { status: number; body: { success: boolean; data?: Row | Row[]; error?: string; nextPage?: number | null }; headers?: Row };

function loadRoute(file: string, modules: Record<string, unknown>) {
  const exports: Record<string, (request: unknown) => Promise<Reply>> = {};
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, Date, console: { error() {} }, require: (name: string) => {
    assert.ok(name in modules, `Missing isolated dependency ${name}`); return modules[name];
  } });
  return exports;
}

function harness(options: { role?: Role; user?: string; department?: string; authenticated?: boolean; auditFails?: boolean; claimLoses?: boolean } = {}) {
  const drafts: Row[] = [], requests: Row[] = [], audits: Row[] = [], notifications: string[] = [];
  const draftWrites: Row[] = [];
  const matches = (row: Row, where: Row) => Object.entries(where).every(([key, value]) => row[key] === value);
  const tx = {
    requestDraft: {
      findFirst: async ({ where }: Query) => drafts.find((row) => matches(row, where)) ?? null,
      findMany: async ({ where, skip = 0, take = 21 }: Query) => drafts.filter((row) => matches(row, where)).slice(skip, skip + take),
      create: async ({ data }: Query) => { const row = { id: draftId, version: 1, submittedAt: null, submittedRequestId: null, updatedAt: new Date('2026-10-09T01:00:00Z'), ...data }; drafts.push(row); draftWrites.push(data); return row; },
      updateMany: async ({ where, data }: Query) => {
        draftWrites.push({ where, data });
        const row = drafts.find((entry) => matches(entry, where));
        if (!row || options.claimLoses) return { count: 0 };
        Object.assign(row, data, { version: Number(row.version) + 1, updatedAt: new Date('2026-10-09T02:00:00Z') });
        return { count: 1 };
      },
      update: async ({ where, data }: Query) => { const row = drafts.find((entry) => matches(entry, where)); assert.ok(row); Object.assign(row, data); return row; },
      deleteMany: async ({ where }: Query) => {
        draftWrites.push({ where });
        const index = drafts.findIndex((entry) => matches(entry, where));
        if (index < 0 || options.claimLoses) return { count: 0 };
        drafts.splice(index, 1); return { count: 1 };
      },
    },
    purchaseRequest: {
      create: async ({ data }: Query) => { const row = { id: requests.length ? '33333333-3333-4333-8333-333333333333' : requestId, ...data }; requests.push(row); return row; },
      findUnique: async ({ where }: Query) => requests.find((row) => matches(row, where)) ?? null,
      findUniqueOrThrow: async ({ where }: Query) => { const row = requests.find((entry) => matches(entry, where)); assert.ok(row); return row; },
      updateMany: async ({ where, data }: Query) => { const row = requests.find((entry) => matches(entry, where)); if (!row || options.claimLoses) return { count: 0 }; Object.assign(row, data); return { count: 1 }; },
    },
    auditLog: { create: async ({ data }: Query) => { if (options.auditFails) throw new Error('Storage failed'); const row = { id: `audit-${audits.length + 1}`, ...data }; audits.push(row); return row; } },
  };
  const modules = {
    'next/server': { NextResponse: { json: (body: Reply['body'], init?: { status?: number; headers?: Row }) => ({ body, status: init?.status ?? 200, headers: init?.headers }) } },
    '@prisma/client': { Role, PRStatus }, zod: { z },
    '@/validation/pr.schema': { CreatePRSchema }, '@/validation/request-draft.schema': draftSchemas,
    '@/shared/workflow-conflict': workflowConflict,
    '@/shared/evidence': { assertEvidenceReferences: async () => {}, EvidenceError: class extends Error {} },
    '@/shared/rbac': { authorizeRequest: async (_: unknown, allowed: Role) => options.authenticated === false ? { success: false, response: { status: 401, body: { success: false } } } : (options.role ?? Role.Requesting_Office) !== allowed ? { success: false, response: { status: 403, body: { success: false } } } : { success: true, user: { id: options.user ?? 'owner', departmentId: options.department ?? 'department' } } },
    '@/shared/notifications': { dispatchNotificationForAuditLog: async (id: string) => { notifications.push(id); } },
    '@/shared/prisma': { prisma: { ...tx, $transaction: async (run: (client: typeof tx) => Promise<unknown>) => {
      const before = JSON.stringify({ drafts, requests, audits, draftWrites });
      try { return await run(tx); } catch (err) {
        const original = JSON.parse(before); drafts.splice(0, drafts.length, ...original.drafts); requests.splice(0, requests.length, ...original.requests); audits.splice(0, audits.length, ...original.audits); draftWrites.splice(0, draftWrites.length, ...original.draftWrites); throw err;
      }
    } } },
  };
  const draftRoute = loadRoute('src/app/api/pr/drafts/route.ts', modules);
  const createRoute = loadRoute('src/app/api/pr/create/route.ts', modules);
  const correction = loadRoute('src/app/api/pr/return-correction/route.ts', modules);
  const declined = loadRoute('src/app/api/pr/declined-template/route.ts', modules);
  const request = (body: object = {}, query = '') => ({ json: async () => body, nextUrl: new URL(`http://localhost/api/pr/drafts${query}`) });
  return { drafts, requests, audits, notifications, draftWrites,
    save: (payload: object = unfinished) => draftRoute.POST(request({ payload })),
    patch: (body: object) => draftRoute.PATCH(request(body)),
    remove: (body: object = { id: draftId, version: 1 }) => draftRoute.DELETE(request(body)),
    get: (query = '') => draftRoute.GET(request({}, query)),
    submit: (body: object = complete) => createRoute.POST(request(body)),
    correct: (body: object) => correction.PATCH(request(body)),
    template: (kind: 'returned' | 'declined') => (kind === 'returned' ? correction : declined).GET(request({}, `?prId=${requestId}`)),
  };
}

test('incomplete save and resume preserve exact raw fields and proof; no procurement activity occurs', async () => {
  const h = harness();
  const payload = { ...unfinished, items: [{ category: 'Other / Custom Item', specs: '  Custom brand — untrimmed\nnotes  ', quantity: 7 }], justification: '', adminProofFilePath: '/uploads/existing.pdf', attachedFileName: 'Signed executive approval.pdf', attachedFileSize: 45000 };
  assert.equal((await h.save(payload)).status, 201);
  const reply = await h.get(`?id=${draftId}`);
  assert.equal(reply.status, 200); assert.equal(reply.headers?.['Cache-Control'], 'private, no-store');
  assert.deepEqual((reply.body.data as Row).payload, payload);
  assert.equal(h.requests.length, 0); assert.equal(h.audits.length, 0); assert.equal(h.notifications.length, 0);
  assert.equal((h.drafts[0]).ownerId, 'owner'); assert.equal(h.drafts[0].departmentId, 'department');
  assert.equal((await h.submit({ ...complete, justification: '', draftId, draftVersion: 1 })).status, 422);
  assert.equal((await h.submit({ ...complete, isDirectPoBypass: true, draftId, draftVersion: 1 })).status, 422);
  assert.equal(h.drafts[0].version, 1); assert.equal(h.requests.length, 0);
});

test('removal deletes only the matching private unsubmitted version without procurement activity', async () => {
  const h = harness(); await h.save();
  const list = await h.get(); assert.equal((list.body.data as Row[])[0].version, 1);
  const reply = await h.remove(); assert.equal(reply.status, 200);
  assert.equal(reply.headers?.['Cache-Control'], 'private, no-store');
  assert.equal(h.drafts.length, 0); assert.equal((await h.get(`?id=${draftId}`)).status, 404);
  assert.equal(h.requests.length, 0); assert.equal(h.audits.length, 0); assert.equal(h.notifications.length, 0);
});

test('removal rejects guests, other roles, owners, departments, invalid references and stale versions', async () => {
  for (const options of [{ authenticated: false }, ...Object.values(Role).filter((role) => role !== Role.Requesting_Office).map((role) => ({ role }))]) {
    assert.equal((await harness(options).remove()).status, 'authenticated' in options ? 401 : 403);
  }
  for (const mismatch of [{ ownerId: 'other' }, { departmentId: 'other' }]) {
    const h = harness(); await h.save(); Object.assign(h.drafts[0], mismatch);
    assert.equal((await h.remove()).status, 404); assert.equal(h.drafts.length, 1);
  }
  const h = harness(); await h.save();
  for (const body of [{ id: 'invalid', version: 1 }, { id: draftId }, { id: draftId, version: 0 }]) assert.equal((await h.remove(body)).status, 422);
  await h.patch({ id: draftId, version: 1, payload: unfinished });
  assert.equal((await h.remove()).status, 409); assert.equal(h.drafts.length, 1);
  const concurrent = harness({ claimLoses: true }); await concurrent.save();
  assert.equal((await concurrent.remove()).status, 409); assert.equal(concurrent.drafts.length, 1);
});

test('submitted draft remains available for idempotent submission and cannot be removed', async () => {
  const h = harness(); await h.save(); await h.submit({ ...complete, draftId, draftVersion: 1 });
  assert.equal((await h.remove({ id: draftId, version: Number(h.drafts[0].version) })).status, 409);
  assert.equal(h.drafts.length, 1); assert.equal(h.requests.length, 1);
  assert.equal((await h.submit({ ...complete, draftId, draftVersion: 1 })).status, 200);
  assert.equal(h.requests.length, 1); assert.equal(h.audits.length, 1);
});

test('draft endpoints and submission deny guests and every other role', async () => {
  for (const options of [{ authenticated: false }, ...Object.values(Role).filter((role) => role !== Role.Requesting_Office).map((role) => ({ role }))]) {
    const h = harness(options), expected = 'authenticated' in options && options.authenticated === false ? 401 : 403;
    for (const reply of [await h.save(), await h.get(), await h.patch({ id: draftId, version: 1, payload: unfinished }), await h.submit({ ...complete, draftId, draftVersion: 1 })]) assert.equal(reply.status, expected);
    assert.equal(h.drafts.length, 0); assert.equal(h.requests.length, 0);
  }
});

test('load, list, save and submit are scoped to both owner and current department', async () => {
  for (const mismatch of [{ ownerId: 'another-user' }, { departmentId: 'another-department' }]) {
    const h = harness(); await h.save(); Object.assign(h.drafts[0], mismatch);
    assert.equal((await h.get(`?id=${draftId}`)).status, 404);
    assert.deepEqual((await h.get()).body.data, []);
    assert.equal((await h.patch({ id: draftId, version: 1, payload: unfinished })).status, 404);
    assert.equal((await h.submit({ ...complete, draftId, draftVersion: 1 })).status, 404);
    assert.equal(h.requests.length, 0); assert.equal(h.audits.length, 0); assert.equal(h.notifications.length, 0);
  }
});

test('save increments the version; stale save/submission never overwrite or enter review', async () => {
  const h = harness(); await h.save();
  const current = { ...unfinished, justification: 'Latest saved edits' };
  assert.equal((await h.patch({ id: draftId, version: 1, payload: current })).status, 200);
  assert.equal(h.drafts[0].version, 2);
  assert.equal((await h.patch({ id: draftId, version: 1, payload: unfinished })).status, 409);
  assert.equal((await h.submit({ ...complete, draftId, draftVersion: 1 })).status, 409);
  assert.equal((h.drafts[0].payload as Row).justification, 'Latest saved edits');
  assert.equal(h.requests.length, 0); assert.equal(h.audits.length, 0);
  const race = harness({ claimLoses: true }); await race.save();
  assert.equal((await race.submit({ ...complete, draftId, draftVersion: 1 })).status, 409);
  assert.equal(race.requests.length, 0);
});

test('valid draft submission uses current edits and existing Business entry; retry returns the same request', async () => {
  for (const fast of [false, true]) {
    const h = harness(); await h.save();
    const body = { ...complete, isDirectPoBypass: fast, ...(fast ? { adminProofFilePath: '/uploads/existing.pdf' } : {}), draftId, draftVersion: 1 };
    assert.equal((await h.submit(body)).status, 201);
    assert.equal(h.requests.length, 1); assert.equal(h.requests[0].status, PRStatus.Pending_Business_Approval);
    assert.equal(h.requests[0].justification, complete.justification);
    assert.equal(h.requests[0].creatorId, 'owner'); assert.equal(h.requests[0].departmentId, 'department');
    assert.equal(h.audits[0].previousState, null); assert.equal(h.audits[0].newState, PRStatus.Pending_Business_Approval);
    assert.equal(h.drafts[0].submittedRequestId, requestId);
    assert.equal((await h.get(`?id=${draftId}`)).status, 409);
    assert.deepEqual((await h.get()).body.data, []);
    assert.equal((await h.patch({ id: draftId, version: 2, payload: unfinished })).status, 409);
    h.requests[0].status = PRStatus.Pending_Admin_Approval;
    const retry = await h.submit(body);
    assert.equal(retry.status, 200); assert.equal((retry.body.data as Row).id, requestId); assert.equal((retry.body.data as Row).status, PRStatus.Pending_Admin_Approval);
    assert.equal(h.requests.length, 1); assert.equal(h.audits.length, 1); assert.equal(h.notifications.length, 1);
  }
});

test('transaction failure rolls back the draft claim and request, permitting a safe retry', async () => {
  const failure = { auditFails: true };
  const h = harness(failure); await h.save();
  assert.equal((await h.submit({ ...complete, draftId, draftVersion: 1 })).status, 500);
  assert.equal(h.requests.length, 0); assert.equal(h.audits.length, 0); assert.equal(h.notifications.length, 0);
  assert.equal(h.drafts[0].version, 1); assert.equal(h.drafts[0].submittedRequestId, null); assert.equal(h.drafts[0].submittedAt, null);
  failure.auditFails = false;
  assert.equal((await h.submit({ ...complete, draftId, draftVersion: 1 })).status, 201);
  assert.equal(h.requests.length, 1); assert.equal(h.audits.length, 1); assert.equal(h.notifications.length, 1);
});

test('malformed draft metadata cannot silently create an ordinary request', async () => {
  for (const reference of [{ draftId }, { draftVersion: 1 }, { draftId: 'bad-id', draftVersion: 1 }, { draftId, draftVersion: 0 }]) {
    const h = harness(); assert.equal((await h.submit({ ...complete, ...reference })).status, 422);
    assert.equal(h.requests.length, 0); assert.equal(h.audits.length, 0);
  }
  const h = harness(); assert.equal((await h.get('?id=bad-id')).status, 400); assert.equal((await h.get('?page=-1')).status, 400);
  assert.equal((await h.save({ ...unfinished, items: [] })).status, 422);
});

test('all saved drafts remain discoverable; submitted records are omitted from pages', async () => {
  const h = harness(); await h.save(); const prototype = h.drafts[0];
  h.drafts.splice(0, 1, ...Array.from({ length: 25 }, (_, index) => ({ ...prototype, id: `${index}`, submittedAt: null })));
  h.drafts.push({ ...prototype, id: 'submitted', submittedAt: new Date(), submittedRequestId: requestId });
  const first = await h.get(); assert.equal((first.body.data as Row[]).length, 20); assert.equal(first.body.nextPage, 1);
  const second = await h.get('?page=1'); assert.equal((second.body.data as Row[]).length, 5); assert.equal(second.body.nextPage, null);
});

test('ordinary submission keeps its original payload, audit text, response and notification', async () => {
  const h = harness(); const reply = await h.submit(); assert.equal(reply.status, 201);
  assert.equal('replayed' in reply.body, false); assert.equal(h.draftWrites.length, 0);
  assert.equal(h.requests[0].status, PRStatus.Pending_Business_Approval); assert.equal(h.requests[0].adminProofFilePath, null);
  assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0].itemsPayload)), complete.items);
  assert.equal(h.audits[0].remarks, 'Purchase request created and submitted to Business Office for evaluation.');
  assert.deepEqual(h.notifications, ['audit-1']);
});

test('returned correction and declined reuse retain evidence, feedback, ownership and their existing semantics', async () => {
  for (const actorRole of [Role.Business_Office, Role.Admin_Office]) {
    const h = harness(); const feedback = { remarks: 'Revise the specification', createdAt: '2026-10-09', actor: { role: actorRole } };
    const record = { id: requestId, departmentId: 'department', status: PRStatus.Returned_for_Correction, justification: complete.justification, itemsPayload: complete.items, isDirectPoBypass: true, adminProofFilePath: '/uploads/existing.pdf', auditLogs: [feedback] };
    h.requests.push(record);
    const returned = await h.template('returned'); assert.equal(returned.status, 200);
    assert.deepEqual((returned.body.data as Row).returnFeedback, feedback); assert.equal((returned.body.data as Row).adminProofFilePath, record.adminProofFilePath);
    assert.equal((await h.correct({ ...complete, prId: requestId })).status, 200);
    assert.equal(h.requests.length, 1); assert.equal(h.requests[0].status, PRStatus.Pending_Business_Approval); assert.equal(h.drafts.length, 0);
    assert.equal((await h.correct({ ...complete, prId: requestId })).status, 409);
    const declined = harness(); declined.requests.push({ ...record, status: PRStatus.Declined });
    const template = await declined.template('declined'); assert.equal(template.status, 200); assert.deepEqual((template.body.data as Row).feedback, feedback);
    assert.equal((await declined.submit()).status, 201); assert.equal(declined.requests[0].status, PRStatus.Declined); assert.equal(declined.requests.length, 2); assert.notEqual(declined.requests[0].id, declined.requests[1].id);
    declined.requests[0].departmentId = 'other'; assert.equal((await declined.template('declined')).status, 404);
  }
  const stale = harness({ claimLoses: true }); stale.requests.push({ id: requestId, departmentId: 'department', status: PRStatus.Returned_for_Correction });
  assert.equal((await stale.correct({ ...complete, prId: requestId })).status, 409); assert.equal(stale.audits.length, 0);
});
