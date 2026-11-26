import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { Role } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const poId = '11111111-1111-4111-8111-111111111111';
const otherPoId = '22222222-2222-4222-8222-222222222222';
const filePath = '/uploads/33333333-3333-4333-8333-333333333333.pdf';
const payload = { poId, kind: 'STATEMENT_OF_ACCOUNT', filePath, fileName: 'Supplier SOA.pdf' };

function load(file: string, modules: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports, console: { error() {} }, URLSearchParams,
    require: (name: string) => { assert.ok(name in modules, name); return modules[name]; },
  });
  return exports;
}

class EvidenceError extends Error { constructor(message: string, readonly status: number) { super(message); } }
type Row = Record<string, unknown>;
function harness(role: Role, options: { accessible?: boolean; owned?: boolean; missing?: boolean; offline?: boolean } = {}) {
  const records: Row[] = [];
  const workflowWrites: unknown[] = [];
  const queries: Row[] = [];
  const user = { id: 'actor', role, departmentId: 'A' };
  const documentSelect = { uploadedBy: { email: 'actor@example.test', role } };
  const tx = {
    purchaseOrder: { findFirst: async (query: Row) => {
      queries.push(query);
      if (options.offline) throw new Error('offline');
      return options.accessible === false ? null : { id: poId };
    } },
    purchaseOrderDocument: {
      findMany: async ({ where, skip, take }: { where: Row; skip: number; take: number }) => records.filter(r => r.purchaseOrderId === where.purchaseOrderId).slice(skip, skip + take),
      count: async () => records.length,
      upsert: async ({ where, create }: { where: Row; create: Row }) => {
        const existing = records.find(r => r.filePath === where.filePath);
        if (existing) return existing;
        const record = { id: 'document', ...create, createdAt: '2026-11-18T00:00:00Z', ...documentSelect };
        records.push(record);
        return record;
      },
    },
    purchaseRequest: { update: (...args: unknown[]) => workflowWrites.push(args) },
    auditLog: { create: (...args: unknown[]) => workflowWrites.push(args) },
  };
  const policy = load('src/shared/po-documents.ts', { '@prisma/client': { Role }, zod: { z } });
  const routes = load('src/app/api/po/documents/route.ts', {
    'next/server': { NextResponse },
    '@/shared/prisma': { prisma: { ...tx, $transaction: (action: (value: typeof tx) => unknown) => action(tx) } },
    '@/shared/rbac': { authorizeRequest: async (_: unknown, roles: Role[]) => roles.includes(role) ? { success: true, user } : { success: false, response: NextResponse.json({ success: false }, { status: 403 }) } },
    '@/shared/po-documents': policy,
    '@/shared/evidence': {
      EvidenceError,
      evidenceRecordScope: () => role === Role.System_Administrator ? null : role === Role.Requesting_Office ? { departmentId: 'A' } : {},
      assertEvidenceReferences: async () => { if (options.owned === false) throw new EvidenceError('File unavailable.', 403); },
      readEvidence: async () => { if (options.missing) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return { bytes: Buffer.from('%PDF-'), contentType: 'application/pdf' }; },
      uploadReferenceName: (reference: string) => reference.slice('/uploads/'.length),
    },
  }) as { GET: (r: unknown) => Promise<Response>; POST: (r: unknown) => Promise<Response> };
  return {
    records, workflowWrites, queries,
    get: (search = '?poId=' + poId) => routes.GET({ nextUrl: new URL('http://test/api/po/documents' + search) }),
    post: (body: unknown = payload) => routes.POST({ json: async () => body }),
  };
}

test('Purchasing and Receiving save late SOA evidence idempotently without workflow changes', async () => {
  for (const role of [Role.Purchasing_Office, Role.Receiving_Custodian]) {
    const h = harness(role);
    const first = await h.post();
    assert.equal(first.status, 201);
    assert.equal((await h.post({ ...payload, kind: 'DELIVERY_RECEIPT', notes: 'Attempted metadata replacement' })).status, 201);
    assert.equal(h.records.length, 1);
    assert.equal(h.records[0].kind, 'STATEMENT_OF_ACCOUNT');
    assert.equal(h.records[0].uploadedById, 'actor');
    assert.equal(h.workflowWrites.length, 0);
    const response = await h.get();
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const result = await response.json();
    assert.equal(result.data.length, 1);
    assert.equal(result.canAttach, true);
  }
});

test('existing record readers are read-only and department scope reaches the database', async () => {
  for (const role of [Role.Requesting_Office, Role.Business_Office, Role.Admin_Office, Role.Global_Auditor]) {
    const h = harness(role);
    assert.equal((await h.post()).status, 403);
    const result = await (await h.get()).json();
    assert.equal(result.canAttach, false);
    if (role === Role.Requesting_Office) assert.equal(JSON.stringify(h.queries[0]).includes('departmentId'), true);
    assert.equal(h.records.length, 0);
  }
  const denied = harness(Role.System_Administrator);
  assert.equal((await denied.get()).status, 403);
  assert.equal((await denied.post()).status, 403);
  assert.equal(denied.queries.length, 0);
});

test('unknown or inaccessible POs, private files, and missing bytes cannot become saved evidence', async () => {
  for (const options of [{ accessible: false }, { owned: false }, { missing: true }]) {
    const h = harness(Role.Purchasing_Office, options);
    assert.ok([403, 404].includes((await h.post()).status));
    assert.equal(h.records.length, 0);
  }
  assert.equal((await harness(Role.Requesting_Office, { accessible: false }).get()).status, 404);
  const h = harness(Role.Purchasing_Office);
  h.records.push({ ...payload, purchaseOrderId: otherPoId });
  assert.equal((await h.post()).status, 409);
});

test('malformed input, arbitrary links, and unknown fields fail before saving', async () => {
  const h = harness(Role.Purchasing_Office);
  for (const body of [
    { ...payload, poId: 'bad' }, { ...payload, kind: 'MOA' },
    { ...payload, filePath: 'https://example.test/proof.pdf' },
    { ...payload, filePath: '/uploads/../other.pdf' }, { ...payload, fileName: '../other.pdf' },
    { ...payload, notes: 'x'.repeat(1001) }, { ...payload, status: 'Received_and_Closed' },
  ]) assert.equal((await h.post(body)).status, 422);
  for (const query of ['?poId=bad', '?poId=' + poId + '&page=0']) assert.equal((await h.get(query)).status, 422);
  assert.equal(h.records.length, 0);
  assert.equal((await harness(Role.Purchasing_Office, { offline: true }).get()).status, 500);
});

test('saved document lists paginate without mutating earlier evidence', async () => {
  const h = harness(Role.Purchasing_Office);
  for (let i = 0; i < 25; i++) h.records.push({ id: String(i), purchaseOrderId: poId });
  const first = await (await h.get()).json();
  const second = await (await h.get('?poId=' + poId + '&page=2')).json();
  assert.equal(first.data.length, 20);
  assert.equal(first.total, 25);
  assert.equal(second.data.length, 5);
  assert.equal(h.records.length, 25);
  assert.equal(h.workflowWrites.length, 0);
});
