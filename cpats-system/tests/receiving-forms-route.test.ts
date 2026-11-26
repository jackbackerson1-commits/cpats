import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Role } from '@prisma/client';
import * as forms from '../src/shared/receiving-forms';
import * as documents from '../src/shared/po-documents';
import * as conflicts from '../src/shared/workflow-conflict';

const poId = '11111111-1111-4111-8111-111111111111', formId = '22222222-2222-4222-8222-222222222222', revisionId = '33333333-3333-4333-8333-333333333333';
const filePath = '/uploads/44444444-4444-4444-8444-444444444444.pdf';
type Row = Record<string, unknown>;
class EvidenceError extends Error { constructor(message: string, readonly status: number) { super(message); } }
function harness() {
  let role: Role = Role.Purchasing_Office, accessible = true, privateFile = false, missingFile = false;
  let form: { id: string; kind: string; version: number; purchaseOrderId: string } | null = null;
  const revisions: Row[] = [], files: Row[] = [], exports: unknown[] = [], queries: Row[] = [];
  const tx = {
    purchaseOrder: { findFirst: async (query: Row) => { queries.push(query); return accessible ? { id: poId, poNumber: 'PO-1', purchaseRequest: { department: { name: 'Science' }, itemsPayload: [] } } : null; }, findMany: async () => [], count: async () => 0 },
    receivingForm: {
      findFirst: async () => accessible && form ? { ...form } : null,
      create: async ({ data }: { data: Row }) => { if (form) throw Object.assign(new Error('duplicate'), { code: 'P2002' }); form = { id: formId, kind: String(data.kind), version: Number(data.version), purchaseOrderId: String(data.purchaseOrderId) }; return form; },
      update: async ({ where }: { where: Row }) => { if (!form || where.version !== form.version) throw Object.assign(new Error('stale'), { code: 'P2025' }); form = { ...form, version: form.version + 1 }; return form; },
      findMany: async () => [], count: async () => 0,
    },
    receivingFormRevision: {
      create: async ({ data }: { data: Row }) => { const saved = { id: revisionId, ...data, exportedAt: null }; revisions.push(saved); return saved; },
      findFirst: async () => accessible && revisions.length ? { ...revisions[0], form } : null,
      findMany: async () => revisions, count: async () => revisions.length,
      updateMany: async () => { if (!revisions[0].exportedAt) revisions[0].exportedAt = 'exported'; return { count: 1 }; },
    },
    purchaseOrderDocument: { upsert: async ({ create }: { create: Row }) => { const old = files.find(file => file.filePath === create.filePath); if (old) return old; const saved = { id: 'attachment', ...create }; files.push(saved); return saved; } },
  };
  const prisma = { ...tx, $transaction: async (action: (client: typeof tx) => Promise<unknown>) => {
    const before = { form, length: revisions.length, files: files.length };
    try { return await action(tx); } catch (error) { form = before.form; revisions.splice(before.length); files.splice(before.files); throw error; }
  } };
  const evidence = { EvidenceError, evidenceRecordScope: () => ({ departmentId: 'scoped' }), assertEvidenceReferences: async () => { if (privateFile) throw new EvidenceError('private', 403); }, uploadReferenceName: () => 'file.pdf', readEvidence: async () => { if (missingFile) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return {}; } };
  const modules: Record<string, unknown> = {
    'next/server': { NextResponse }, zod: { z }, '@prisma/client': { Role }, '@/shared/prisma': { prisma },
    '@/shared/rbac': { authorizeRequest: async (_: unknown, allowed: Role[]) => allowed.includes(role) ? { success: true, user: { id: 'actor', role } } : { success: false, response: NextResponse.json({ success: false }, { status: 403 }) } },
    '@/shared/evidence': evidence, '@/shared/receiving-forms': forms, '@/shared/po-documents': documents, '@/shared/workflow-conflict': conflicts,
    '@/shared/receiving-form-excel': { exportReceivingForm: async (_: unknown, payload: unknown) => { exports.push(payload); return new Uint8Array([1,2,3]); } },
  };
  function load(file: string) {
    const loaded: { POST?: (r: unknown) => Promise<Response>; GET?: (r: unknown) => Promise<Response> } = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: loaded, URLSearchParams, Uint8Array, console: { error() {} }, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
    return loaded;
  }
  const route = load('src/app/api/receiving/forms/route.ts'), exportRoute = load('src/app/api/receiving/forms/export/route.ts');
  return {
    revisions, files, exports, queries, setRole: (value: Role) => { role = value; }, deny: () => { accessible = false; }, private: () => { privateFile = true; }, missing: () => { missingFile = true; },
    save: (version = form?.version ?? 0, payload = forms.blankReceivingForm()) => route.POST!({ json: async () => ({ action: 'SAVE', poId, kind: 'RR', version, ...(form ? { documentId: formId } : { creationId: formId }), payload }) }),
    retryNew: () => route.POST!({ json: async () => ({ action: 'SAVE', poId, kind: 'RR', version: 0, creationId: formId, payload: forms.blankReceivingForm() }) }),
    attach: (overrides: Row = {}) => route.POST!({ json: async () => ({ action: 'ATTACH', poId, revisionId, filePath, fileName: 'Signed RR.pdf', reconciled: true, ...overrides }) }),
    export: (copies?: string) => exportRoute.GET!({ nextUrl: new URL('http://localhost/api/receiving/forms/export?revisionId=' + revisionId + (copies ? `&copies=${copies}` : '')) }),
  };
}

test('draft saves preserve immutable versions, reject stale forms, and never write procurement records', async () => {
  const h = harness(); assert.equal((await h.save()).status, 201);
  const next = { ...forms.blankReceivingForm(), supplier: 'Updated supplier' };
  assert.equal((await h.save(1, next)).status, 201);
  assert.equal((await h.save(1, next)).status, 409);
  assert.equal(h.revisions.length, 2); assert.equal((h.revisions[0].payload as forms.FormPayload).supplier, '');
  assert.equal((await h.retryNew()).status, 409); assert.equal(h.revisions.length, 2);
  assert.match(JSON.stringify(h.queries), /scoped/);
});

test('exports use a saved revision; signed copies require export, reconciliation, access, bytes and exact revision membership', async () => {
  const h = harness(); await h.save();
  assert.equal((await h.attach()).status, 409);
  assert.equal((await h.export()).status, 200); assert.equal(h.exports.length, 1);
  assert.equal((await h.attach({ reconciled: false })).status, 422);
  assert.equal((await h.attach()).status, 201); assert.equal((await h.attach()).status, 201); assert.equal(h.files.length, 1);
  assert.equal(h.files[0].receivingFormRevisionId, revisionId);
  h.files[0].receivingFormRevisionId = 'another-revision'; assert.equal((await h.attach()).status, 409);
  const privateCopy = harness(); await privateCopy.save(); await privateCopy.export(); privateCopy.private(); assert.equal((await privateCopy.attach()).status, 403);
  const missing = harness(); await missing.save(); await missing.export(); missing.missing(); assert.equal((await missing.attach()).status, 422);
});

test('the three-copy export is named explicitly and invalid copy counts are rejected', async () => {
  const h = harness();
  await h.save();
  assert.equal((await h.export('4')).status, 422);
  assert.equal(h.exports.length, 0);
  const response = await h.export('3');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Disposition') || '', /-3-copies\.xlsx/);
  assert.equal(h.exports.length, 1);
});

test('reader roles cannot save; inaccessible POs/revisions cannot be saved, exported or attached', async () => {
  for (const role of [Role.Requesting_Office, Role.Business_Office, Role.Admin_Office, Role.Global_Auditor, Role.System_Administrator]) {
    const h = harness(); h.setRole(role); assert.equal((await h.save()).status, 403); assert.equal(h.revisions.length, 0);
  }
  const h = harness(); await h.save(); h.deny();
  assert.equal((await h.save()).status, 404); assert.equal((await h.export()).status, 404); assert.equal((await h.attach()).status, 404);
});
