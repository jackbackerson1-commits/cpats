import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { Role, PRStatus, type PurchaseMethod } from '@prisma/client';
import { NextResponse } from 'next/server';
import * as policy from '../src/shared/online-purchase';
import * as conflict from '../src/shared/workflow-conflict';
import { ReleaseCheckSchema } from '../src/validation/check.schema';

const poId = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';
type Row = Record<string, unknown>;
interface Plan { id: string; version: number; revision: number; stage: string; amount: string; initialAmount: string; quoteDocumentId: string; policyVersion: number }
class EvidenceError extends Error { constructor(message: string, readonly status: number) { super(message); } }

function harness(purchaseMethod: PurchaseMethod | null = null) {
  let role: Role = Role.Purchasing_Office;
  let version = 0;
  let plan: Plan | null = null;
  let po = { id: poId, purchaseRequestId: poId, purchaseMethod, paymentType: 'CASH_CHECK', isCheckIssued: false, updatedAt: new Date(1) };
  let pr = { id: poId, status: PRStatus.Awaiting_Check_Issuance as PRStatus, updatedAt: new Date(1) };
  const audits: Row[] = [];
  const notifications: string[] = [];
  let fail: string | undefined;
  let missingEvidence = false;
  let privateEvidence = false;
  let enrollmentRace = false;
  const document = { id: documentId, purchaseOrderId: poId, kind: 'ORDER_CONFIRMATION', filePath: '/uploads/33333333-3333-4333-8333-333333333333.pdf' };
  const list = ({ where }: { where: Row }) => {
    assert.equal(where.id, poId);
    if (role !== Role.Purchasing_Office) {
      assert.equal(JSON.stringify(where.onlinePurchase), '{"isNot":null}');
      if (!plan) return [];
    } else {
      assert.match(JSON.stringify(where.OR), /ONLINE_CASH/);
    }
    return [{ ...po, onlinePurchase: plan, documents: missingEvidence ? [] : [document] }];
  };
  const tx = {
    purchaseOrder: {
      findMany: async (query: { where: Row }) => list(query),
      count: async (query: { where: Row }) => list(query).length,
      findFirst: async () => ({ ...po, onlinePurchase: plan && { ...plan }, purchaseRequest: { ...pr } }),
      findUnique: async () => {
        const snapshot = { ...po, onlinePurchase: plan && { ...plan } };
        if (enrollmentRace) plan = { id: 'racing-plan', version: 1, revision: 1, stage: 'AWAITING_BO', amount: '1000', initialAmount: '1000', quoteDocumentId: documentId, policyVersion: 1 };
        return snapshot;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        if (fail || where.updatedAt !== po.updatedAt || where.isCheckIssued !== po.isCheckIssued) throw Object.assign(new Error('conflict'), { code: fail || 'P2025' });
        if ((where.onlinePurchase as { is?: unknown } | undefined)?.is === null && plan) throw Object.assign(new Error('enrolled'), { code: 'P2025' });
        po = { ...po, ...data, updatedAt: new Date(++version + 10) }; return po;
      },
    },
    purchaseRequest: { findUnique: async () => ({ ...pr }), update: async ({ where, data }: { where: Row; data: Row }) => {
      assert.equal(where.updatedAt, pr.updatedAt); assert.equal(where.status, pr.status);
      pr = { ...pr, ...data, updatedAt: new Date(++version + 10) }; return pr;
    } },
    purchaseOrderDocument: { findFirst: async ({ where }: { where: Row }) => !missingEvidence && where.id === documentId && where.purchaseOrderId === poId && where.kind === 'ORDER_CONFIRMATION' ? document : null },
    onlinePurchasePlan: {
      create: async ({ data }: { data: Row }) => { plan = { id: 'plan', version: 1, ...data } as unknown as Plan; return plan; },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        if (!plan || where.version !== plan.version) throw Object.assign(new Error('stale'), { code: 'P2025' });
        plan = { ...plan, ...data, version: plan.version + 1 } as Plan; return plan;
      },
    },
    auditLog: { create: async ({ data }: { data: Row }) => { audits.push(data); return { id: 'audit-' + audits.length }; } },
  };
  const prisma = { ...tx, $transaction: async (action: (client: typeof tx) => Promise<unknown>) => {
    const before = { po, pr, plan, length: audits.length };
    try { return await action(tx); }
    catch (error) { po = before.po; pr = before.pr; plan = before.plan; audits.splice(before.length); throw error; }
  } };
  const modules: Record<string, unknown> = {
    '@prisma/client': { Role, PRStatus }, zod: { z }, 'next/server': { NextResponse },
    '@/shared/online-purchase': policy, '@/shared/prisma': { prisma }, '@/shared/workflow-conflict': conflict,
    '@/validation/check.schema': { ReleaseCheckSchema },
    '@/shared/rbac': { authorizeRequest: async (_: unknown, roles: Role | Role[]) => (Array.isArray(roles) ? roles : [roles]).includes(role) ? { success: true, user: { id: role, role } } : { success: false, response: NextResponse.json({ success: false }, { status: 403 }) } },
    '@/shared/evidence': { EvidenceError, evidenceRecordScope: () => ({}), assertEvidenceReferences: async () => { if (privateEvidence) throw new EvidenceError('private', 403); }, readEvidence: async () => ({}), uploadReferenceName: () => 'proof.pdf' },
    '@/shared/notifications': { dispatchNotificationForAuditLog: async (id: string) => notifications.push(id) },
  };
  function load(file: string) {
    const exports: { POST?: (r: unknown) => Promise<Response>; GET?: (r: unknown) => Promise<Response> } = {};
    const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(source, { exports, Date, Object, URLSearchParams, console: { error() {} }, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
    return exports;
  }
  const { GET: read, POST: post } = load('src/app/api/po/online-purchase/route.ts');
  const { POST: legacy } = load('src/app/api/po/release-check/route.ts');
  return {
    audits, notifications, setRole: (value: Role) => { role = value; },
    setFailure: (value: string) => { fail = value; }, missing: () => { missingEvidence = true; }, private: () => { privateEvidence = true; },
    raceEnrollment: () => { enrollmentRace = true; },
    state: () => ({ po, pr, plan: plan as Plan | null }),
    read: () => read!({ nextUrl: new URL(`http://localhost/api/po/online-purchase?poId=${poId}`) }),
    submit: (action: string, fields: Row = {}) => post!({ json: async () => ({ action, poId, version: plan?.version ?? 0, ...fields }) }),
    legacy: () => legacy!({ json: async () => ({ poId, paymentType: 'CASH_CHECK', checkNumber: 'CHK-001' }) }),
  };
}

async function enroll(h: ReturnType<typeof harness>, amount = '1000') {
  assert.equal((await h.submit('SUBMIT', { amount, documentId, notes: 'Checkout quotation confirmed' })).status, 200);
}
async function authorize(h: ReturnType<typeof harness>) {
  h.setRole(Role.Business_Office); assert.equal((await h.submit('BO_APPROVE')).status, 200);
  h.setRole(Role.Admin_Office); assert.equal((await h.submit('ADMIN_APPROVE')).status, 200);
}

test('cash online sequence requires BO, Admin, release and ordering before Receiving is eligible', async () => {
  const h = harness(); await enroll(h);
  h.setRole(Role.Business_Office);
  assert.equal((await h.submit('RELEASE_CHECK', { checkNumber: 'CHK-001', payee: 'Purchaser' })).status, 409);
  await authorize(h);
  assert.equal(h.state().po.isCheckIssued, false);
  h.setRole(Role.Business_Office);
  assert.equal((await h.legacy()).status, 409);
  assert.equal((await h.submit('RELEASE_CHECK', { checkNumber: 'CHK-001', payee: 'Purchaser' })).status, 200);
  assert.equal(h.state().po.isCheckIssued, true);
  assert.equal(h.state().pr.status, PRStatus.Awaiting_Check_Issuance);
  assert.equal((await h.submit('SUBMIT', { amount: '1100', documentId })).status, 409);
  h.setRole(Role.Purchasing_Office);
  for (const actualAmount of ['1100', '900']) {
    assert.equal((await h.submit('RECORD_ORDER', { orderReference: 'ONLINE-001', documentId, actualAmount })).status, 409);
    assert.equal(h.state().pr.status, PRStatus.Awaiting_Check_Issuance);
    assert.equal(h.state().plan?.stage, 'CHECK_RELEASED');
  }
  assert.equal((await h.submit('RECORD_ORDER', { orderReference: 'ONLINE-001', documentId, actualAmount: '1000.00' })).status, 200);
  assert.equal(h.state().pr.status, PRStatus.Ready_for_Purchase);
  assert.equal(h.state().plan?.stage, 'ORDERED');
  assert.equal(h.audits.length, 5); assert.equal(h.notifications.length, 5);
  assert.equal((await h.submit('RECORD_ORDER', { orderReference: 'ONLINE-001', documentId, actualAmount: '1000' })).status, 409);
});

test('both price increases and decreases reset BO/Admin reviews while keeping old amount snapshots', async () => {
  for (const amount of ['1100.00', '900.00']) {
    const h = harness(); await enroll(h); await authorize(h);
    h.setRole(Role.Purchasing_Office);
    assert.equal((await h.submit('SUBMIT', { amount, documentId, notes: 'Final checkout changed' })).status, 200);
    assert.equal(h.state().plan?.stage, 'AWAITING_BO'); assert.equal(h.state().plan?.revision, 2);
    assert.equal(h.state().plan?.initialAmount, '1000');
    assert.equal(h.audits[0].onlinePurchaseAmount, '1000');
    assert.equal(h.audits.at(-1)?.onlinePurchaseAmount, amount);
    h.setRole(Role.Business_Office);
    assert.equal((await h.submit('RELEASE_CHECK', { checkNumber: 'CHK-001', payee: 'Purchaser' })).status, 409);
  }
});

test('stale saves, wrong roles, mismatched evidence and transaction conflicts never partially change the plan', async () => {
  const h = harness(); await enroll(h);
  assert.equal((await h.submit('BO_APPROVE')).status, 409);
  h.setRole(Role.Requesting_Office); assert.equal((await h.submit('BO_APPROVE')).status, 403);
  h.setRole(Role.Business_Office); assert.equal((await h.submit('BO_APPROVE', { version: 0 })).status, 409);
  for (const code of ['P2025', 'P2034']) {
    h.setFailure(code); assert.equal((await h.submit('BO_APPROVE')).status, 409);
    assert.equal(h.state().plan?.stage, 'AWAITING_BO'); assert.equal(h.audits.length, 1);
  }
  const bad = harness(); bad.missing(); assert.equal((await bad.submit('SUBMIT', { amount: '1000', documentId })).status, 422);
  assert.equal(bad.state().plan, null); assert.equal(bad.audits.length, 0);
  const privateFile = harness(); privateFile.private(); assert.equal((await privateFile.submit('SUBMIT', { amount: '1000', documentId })).status, 403);
  assert.equal(privateFile.state().plan, null);
});

test('return feedback, resubmission and ordinary cash clearances retain their respective paths', async () => {
  const h = harness(); await enroll(h);
  h.setRole(Role.Business_Office); assert.equal((await h.submit('BO_RETURN', { notes: 'Please verify shipping' })).status, 200);
  h.setRole(Role.Purchasing_Office); await enroll(h);
  const legacy = harness(); legacy.setRole(Role.Business_Office);
  assert.equal((await legacy.legacy()).status, 200);
  assert.equal(legacy.state().pr.status, PRStatus.Ready_for_Purchase);
  assert.equal(legacy.state().plan, null);
});

test('legacy release cannot bypass enrollment committed after its initial read even if the timestamp is unchanged', async () => {
  const h = harness(); h.setRole(Role.Business_Office); h.raceEnrollment();
  assert.equal((await h.legacy()).status, 409);
  assert.equal(h.state().po.isCheckIssued, false);
  assert.equal(h.state().pr.status, PRStatus.Awaiting_Check_Issuance);
  assert.equal(h.audits.length, 0); assert.equal(h.notifications.length, 0);
});

test('online POs require checkout evidence before BO action and local cash POs use ordinary clearance', async () => {
  const online = harness('ONLINE_CASH');
  online.setRole(Role.Business_Office);
  assert.equal((await online.legacy()).status, 409);
  assert.equal((await online.submit('RELEASE_CHECK', { checkNumber: 'CHK-001', payee: 'Purchaser' })).status, 409);
  assert.equal(online.audits.length, 0);
  online.setRole(Role.Purchasing_Office);
  assert.equal((await online.submit('SUBMIT', { amount: '1000' })).status, 422);
  await enroll(online);
  assert.equal(online.state().plan?.stage, 'AWAITING_BO');

  const local = harness('LOCAL_CASH');
  assert.equal((await local.submit('SUBMIT', { amount: '1000', documentId })).status, 409);
  local.setRole(Role.Business_Office);
  assert.equal((await local.legacy()).status, 200);
});

test('a saved screenshot survives a Purchasing reload while BO sees the PO only after submission', async () => {
  const online = harness('ONLINE_CASH');
  for (const role of [Role.Business_Office, Role.Admin_Office]) {
    online.setRole(role);
    const response = await online.read();
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, []);
  }
  online.setRole(Role.Purchasing_Office);
  const reopened = (await (await online.read()).json()).data[0];
  assert.equal(reopened.id, poId);
  assert.equal(reopened.documents[0].id, documentId);
  assert.equal(reopened.onlinePurchase, null);
  assert.equal(online.notifications.length, 0);

  await enroll(online);
  online.setRole(Role.Business_Office);
  const submitted = (await (await online.read()).json()).data[0];
  assert.equal(submitted.id, poId);
  assert.equal(submitted.onlinePurchase.stage, 'AWAITING_BO');
  assert.equal(submitted.onlinePurchase.quoteDocumentId, documentId);
  assert.equal(online.notifications.length, 1);
});
