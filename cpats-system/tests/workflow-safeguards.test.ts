import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { PRStatus, Role, type PurchaseMethod } from '@prisma/client';
import { BusinessEvaluationSchema } from '../src/validation/business.schema';
import { ReviewPRSchema } from '../src/validation/review.schema';
import { CreatePOSchema } from '../src/validation/po.schema';
import { ReleaseCheckSchema } from '../src/validation/check.schema';
import { CreateReceivingReportSchema } from '../src/validation/receiving.schema';
import * as conflict from '../src/shared/workflow-conflict';
import * as purchaseMethod from '../src/shared/purchase-method';

const id = '11111111-1111-4111-8111-111111111111';
type Reply = { status: number; body: { success: boolean; error?: string; errors?: unknown } };
type Row = Record<string, unknown>;
const routes = [
  { file: 'pr/evaluate-business', role: Role.Business_Office, status: PRStatus.Pending_Business_Approval, payload: { prId: id, action: 'APPROVE', remarks: 'Recorded evaluation' }, next: PRStatus.Pending_Admin_Approval },
  { file: 'pr/review', role: Role.Admin_Office, status: PRStatus.Pending_Admin_Approval, payload: { prId: id, action: 'APPROVE', remarks: 'Recorded approval' }, next: PRStatus.Approved_Awaiting_PO },
  { file: 'po/create', role: Role.Purchasing_Office, status: PRStatus.Approved_Awaiting_PO, payload: { purchaseRequestId: id, poNumber: 'PO-TEST-001', purchaseMethod: 'LOCAL_CASH' }, next: PRStatus.Awaiting_Check_Issuance },
  { file: 'po/release-check', role: Role.Business_Office, status: PRStatus.Awaiting_Check_Issuance, payload: { poId: id, paymentType: 'CREDIT_TERMS' }, next: PRStatus.Ready_for_Purchase },
  { file: 'receiving/create', role: Role.Receiving_Custodian, status: PRStatus.Ready_for_Purchase, payload: { purchaseOrderId: id, condition: 'Good', invoiceFilePath: '/uploads/invoice.pdf', asssetImageFilePath: '/uploads/photo.jpg' }, next: PRStatus.Received_and_Closed },
];

function harness(route: typeof routes[number], failCode?: string, role: Role = route.role, method?: PurchaseMethod) {
  class MockEvidenceError extends Error { readonly status = 403; }
  const updatedAt = new Date('2026-10-13T01:00:00Z');
  let record: Row = { id, departmentId: 'department', status: route.status, updatedAt, adminProofFilePath: null };
  let order: Row = { id, purchaseRequestId: id, isCheckIssued: false, updatedAt, purchaseMethod: method ?? null, paymentType: method === 'SUPPLIER_CREDIT' ? 'CREDIT_TERMS' : 'CASH_CHECK' };
  const writes: Row[] = [], audits: Row[] = [], notifications: string[] = [];
  const update = async ({ where, data }: { where: Row; data: Row }, kind: 'request' | 'order') => {
    assert.equal(where.id, id); assert.equal(where.updatedAt, updatedAt);
    if (kind === 'request') assert.equal(where.status, route.status);
    else assert.equal(where.isCheckIssued, false);
    if (failCode) throw Object.assign(new Error('Concurrent write'), { code: failCode });
    if (kind === 'request') record = { ...record, ...data }; else order = { ...order, ...data };
    writes.push({ kind, data }); return kind === 'request' ? record : order;
  };
  const tx = {
    purchaseRequest: { findUnique: async () => ({ ...record }), update: (query: { where: Row; data: Row }) => update(query, 'request') },
    purchaseOrder: { findUnique: async ({ where }: { where: Row }) => where.poNumber ? null : { ...order, purchaseRequest: { ...record } }, update: (query: { where: Row; data: Row }) => update(query, 'order'), create: async ({ data }: { data: Row }) => { assert.equal(record.status, route.next); writes.push({ kind: 'create-order', data }); return { id, ...data }; } },
    receivingReport: { create: async ({ data }: { data: Row }) => { assert.equal(record.status, PRStatus.Received_and_Closed); writes.push({ kind: 'create-receipt', data }); return { id, ...data }; } },
    auditLog: { create: async ({ data }: { data: Row }) => { audits.push(data); return { id: 'audit-1', ...data }; } },
  };
  const modules: Record<string, unknown> = {
    crypto: { default: { randomUUID }, randomUUID },
    'next/server': { NextResponse: { json: (body: Reply['body'], init?: { status?: number }) => ({ body, status: init?.status ?? 200 }) } },
    '@prisma/client': { Role, PRStatus, PaymentType: { CASH_CHECK: 'CASH_CHECK', CREDIT_TERMS: 'CREDIT_TERMS' } },
    '@/validation/business.schema': { BusinessEvaluationSchema }, '@/validation/review.schema': { ReviewPRSchema }, '@/validation/po.schema': { CreatePOSchema }, '@/validation/check.schema': { ReleaseCheckSchema }, '@/validation/receiving.schema': { CreateReceivingReportSchema },
    '@/shared/workflow-conflict': conflict,
    '@/shared/purchase-method': purchaseMethod,
    '@/shared/evidence': { assertEvidenceReferences: async () => { if (failCode === 'EVIDENCE_DENIED') throw new MockEvidenceError('Attachment belongs to another account'); }, EvidenceError: MockEvidenceError },
    '@/shared/rbac': { authorizeRequest: async (_: unknown, allowed: Role) => role === allowed ? { success: true, user: { id: 'actor', departmentId: 'department', role } } : { success: false, response: { status: 403, body: { success: false } } } },
    '@/shared/notifications': { dispatchNotificationForAuditLog: async (auditId: string) => { notifications.push(auditId); } },
    '@/shared/prisma': { prisma: { ...tx, $transaction: async (run: (client: typeof tx) => Promise<unknown>) => {
      const before = { record, order, writes: writes.length, audits: audits.length };
      try { return await run(tx); } catch (error) { record = before.record; order = before.order; writes.splice(before.writes); audits.splice(before.audits); throw error; }
    } } },
  };
  const exports: { POST?: (request: unknown) => Promise<Reply> } = {};
  const source = ts.transpileModule(readFileSync(`src/app/api/${route.file}/route.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, console: { error() {} }, crypto: { randomUUID }, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  return { writes, audits, notifications, state: () => record.status, submit: (payload: object = route.payload) => exports.POST!({ json: async () => payload }) };
}

test('all existing workflow success paths use conditional writes and retain one audit/notification', async () => {
  for (const route of routes) {
    const h = harness(route); const response = await h.submit(); assert.ok(response.body.success, `${route.file}: ${response.body.error}`);
    assert.equal(h.state(), route.next); assert.equal(h.audits.length, 1); assert.equal(h.notifications.length, 1);
    assert.equal(h.audits[0].previousState, route.status); assert.equal(h.audits[0].newState, route.next);
    assert.equal((await h.submit()).body.success, false);
    assert.equal(h.audits.length, 1); assert.equal(h.notifications.length, 1);
    assert.ok(h.writes.filter((entry) => String(entry.kind).startsWith('create-')).length <= 1);
  }
});

test('lost updates and deadlocks return actionable conflicts with no partial record, audit or notification', async () => {
  for (const route of routes) for (const code of ['P2025', 'P2034']) {
    const h = harness(route, code); const response = await h.submit();
    assert.equal(response.status, 409, `${route.file}: ${code}`); assert.match(response.body.error || '', /Refresh/);
    assert.equal(h.state(), route.status); assert.equal(h.writes.length, 0); assert.equal(h.audits.length, 0); assert.equal(h.notifications.length, 0);
  }
});

test('return/decline decisions and cash/check clearance retain their existing destinations', async () => {
  for (const route of routes.slice(0, 2)) for (const [action, next] of [['DECLINE', PRStatus.Declined], ['RETURN_FOR_CORRECTION', PRStatus.Returned_for_Correction]]) {
    const h = harness(route); assert.equal((await h.submit({ ...route.payload, action })).status, 200); assert.equal(h.state(), next);
  }
  const cash = harness(routes[3]); assert.equal((await cash.submit({ poId: id, paymentType: 'CASH_CHECK', checkNumber: 'CHECK-001' })).status, 200);
  assert.equal(cash.state(), PRStatus.Ready_for_Purchase);
});

test('damaged intake requires meaningful server-side remarks before any write, and preserves existing closure', async () => {
  for (const remarks of [undefined, '', '    ', 'abcd', '  ab  ']) {
    const h = harness(routes[4]); const response = await h.submit({ ...routes[4].payload, condition: 'Damaged', remarks });
    assert.equal(response.status, 422); assert.equal(h.writes.length, 0); assert.equal(h.audits.length, 0);
  }
  const h = harness(routes[4]); assert.equal((await h.submit({ ...routes[4].payload, condition: 'Damaged', remarks: 'Packaging cracked' })).status, 201);
  assert.equal(h.state(), PRStatus.Received_and_Closed);
});

test('other roles cannot submit workflow actions', async () => {
  for (const route of routes) {
    const h = harness(route, undefined, Role.System_Administrator);
    assert.equal((await h.submit()).status, 403); assert.equal(h.writes.length, 0);
  }
});

test('Purchasing must select a valid payment method when creating a PO', async () => {
  for (const method of purchaseMethod.PURCHASE_METHODS) {
    const h = harness(routes[2]);
    assert.equal((await h.submit({ ...routes[2].payload, purchaseMethod: method })).status, 201);
    const order = h.writes.find(write => write.kind === 'create-order')?.data as Row;
    assert.equal(order.purchaseMethod, method);
    assert.equal(order.paymentType, method === 'SUPPLIER_CREDIT' ? 'CREDIT_TERMS' : 'CASH_CHECK');
    assert.match(String(h.audits[0].remarks), new RegExp(purchaseMethod.PURCHASE_METHOD_LABELS[method]));
  }
  for (const method of [undefined, 'DEBIT']) {
    const h = harness(routes[2]);
    assert.equal((await h.submit({ ...routes[2].payload, purchaseMethod: method })).status, 422);
    assert.equal(h.writes.length, 0);
  }
});

test('clearance follows Purchasing’s method and credit approval preserves the request items', async () => {
  const h = harness(routes[3], undefined, Role.Business_Office, 'SUPPLIER_CREDIT');
  assert.equal((await h.submit({ poId: id, paymentType: 'CASH_CHECK', checkNumber: 'CHK-001' })).status, 409);
  assert.equal((await h.submit({ ...routes[3].payload, items: [{ itemName: 'Paper', quantity: 1, unitPrice: 100 }] })).status, 422);
  assert.equal(h.writes.length, 0);
  assert.equal((await h.submit()).status, 200);
  assert.equal(h.state(), PRStatus.Ready_for_Purchase);
  const request = h.writes.find(write => write.kind === 'request')?.data as Row;
  assert.equal(request.itemsPayload, undefined);
  const local = harness(routes[3], undefined, Role.Business_Office, 'LOCAL_CASH');
  assert.equal((await local.submit()).status, 409);
  assert.equal((await local.submit({ poId: id, paymentType: 'CASH_CHECK', checkNumber: 'CHK-001' })).status, 200);
});

test('Admin accepts managed upload references while unauthorized evidence never reaches a write', async () => {
  const payload = { ...routes[1].payload, adminProofFilePath: '/uploads/proof.pdf' };
  const allowed = harness(routes[1]); assert.equal((await allowed.submit(payload)).status, 200);
  const rejected = harness(routes[1], 'EVIDENCE_DENIED'); assert.equal((await rejected.submit(payload)).status, 403);
  assert.equal(rejected.writes.length, 0); assert.equal(rejected.audits.length, 0);
  const receiving = harness(routes[4], 'EVIDENCE_DENIED'); assert.equal((await receiving.submit()).status, 403);
  assert.equal(receiving.writes.length, 0); assert.equal(receiving.audits.length, 0);
});
