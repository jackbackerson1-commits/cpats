import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { Role, PRStatus, Prisma } from '@prisma/client';
import { z } from 'zod';

type Where = Prisma.ReceivingReportWhereInput;
type Query = { where: Where; skip: number; take: number };
type Reply = { status: number; body: { success: boolean; data?: typeof reports; total?: number; error?: string } };
const prId = '11111111-1111-4111-8111-111111111111';
const reports = Array.from({ length: 25 }, (_, index) => ({ id: `report-${index}`, condition: index % 2 ? 'Damaged' : 'Good', remarks: 'Saved inspection remarks', invoiceFilePath: '/uploads/invoice.pdf', asssetImageFilePath: '/uploads/photo.jpg',
  purchaseOrder: { poNumber: `PO-${index}`, purchaseRequestId: prId, purchaseRequest: { id: prId, status: PRStatus.Declined, department: { name: 'Computer Studies', code: 'CCS' } } } }));
function matches(record: typeof reports[number], where: Where): boolean {
  if (where.condition && record.condition !== where.condition) return false;
  const order = where.purchaseOrder as { purchaseRequestId?: string } | undefined;
  if (order?.purchaseRequestId && record.purchaseOrder.purchaseRequestId !== order.purchaseRequestId) return false;
  if (where.OR) return where.OR.some(condition => {
    const filter = condition.purchaseOrder as { poNumber?: { contains: string }; purchaseRequestId?: { contains: string }; purchaseRequest?: { department?: { name?: { contains: string }; code?: { contains: string } } } };
    return filter.poNumber ? record.purchaseOrder.poNumber.includes(filter.poNumber.contains)
      : filter.purchaseRequestId ? record.purchaseOrder.purchaseRequestId.includes(filter.purchaseRequestId.contains)
      : filter.purchaseRequest?.department?.name ? record.purchaseOrder.purchaseRequest.department.name.includes(filter.purchaseRequest.department.name.contains)
      : record.purchaseOrder.purchaseRequest.department.code.includes(filter.purchaseRequest?.department?.code?.contains || '');
  });
  return true;
}
function harness(role: Role, fails = false) {
  const queries: Query[] = [];
  const writes: unknown[] = [];
  const exports: { GET?: (request: unknown) => Promise<Reply> } = {};
  const modules: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (body: Reply['body'], options?: { status?: number }) => ({ body, status: options?.status || 200 }) } },
    '@prisma/client': { Role, PRStatus }, 'zod': { z },
    '@/shared/rbac': { authorizeRequest: async () => role === Role.Receiving_Custodian ? { success: true } : { success: false, response: { status: 403, body: { success: false } } } },
    '@/shared/prisma': { prisma: {
      receivingReport: { findMany: async (query: Query) => { queries.push(query); if (fails) throw new Error('offline'); return reports.filter(report => matches(report, query.where)).slice(query.skip, query.skip + query.take); },
        count: async ({ where }: { where: Where }) => reports.filter(report => matches(report, where)).length, create: (...args: unknown[]) => writes.push(args) },
      purchaseRequest: { update: (...args: unknown[]) => writes.push(args) }, auditLog: { create: (...args: unknown[]) => writes.push(args) },
    } },
  };
  const source = ts.transpileModule(readFileSync('src/app/api/receiving/history/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, console: { error: () => {} }, URLSearchParams, Object, Promise, require: (name: string) => modules[name] });
  return { queries, writes, get: (search = '') => exports.GET!({ nextUrl: new URL('http://localhost/api/receiving/history' + search) }) };
}

test('Receiving history uses saved reports independently of current status and paginates without writes', async () => {
  const h = harness(Role.Receiving_Custodian);
  const first = await h.get();
  assert.equal(first.status, 200); assert.equal(first.body.data?.length, 20); assert.equal(first.body.total, 25);
  const second = await h.get('?page=2');
  assert.equal(second.body.data?.length, 5); assert.equal(second.body.data?.[0].id, 'report-20');
  assert.equal(first.body.data?.[0].purchaseOrder.purchaseRequest.status, PRStatus.Declined);
  assert.equal(h.writes.length, 0);
});
test('condition, PO/department searches and notification request links stay within the matching report set', async () => {
  const h = harness(Role.Receiving_Custodian);
  assert.equal((await h.get('?condition=Damaged')).body.total, 12);
  assert.equal((await h.get('?q=PO-24')).body.data?.[0].id, 'report-24');
  assert.equal((await h.get('?q=CCS')).body.total, 25);
  assert.equal((await h.get('?prId=' + prId + '&condition=Good')).body.total, 13);
  assert.equal((await h.get('?prId=22222222-2222-4222-8222-222222222222')).body.total, 0);
  assert.equal((await h.get('?q=NO-MATCH')).body.total, 0);
  assert.equal(h.writes.length, 0);
});
test('other roles, invalid filters and failed database loads cannot expose or alter receiving history', async () => {
  for (const role of Object.values(Role).filter(role => role !== Role.Receiving_Custodian)) {
    const h = harness(role); assert.equal((await h.get()).status, 403); assert.equal(h.queries.length, 0);
  }
  const h = harness(Role.Receiving_Custodian);
  for (const query of ['?page=0', '?page=1.5', '?condition=Approved', '?prId=invalid']) assert.equal((await h.get(query)).status, 422);
  assert.equal(h.queries.length, 0);
  assert.equal((await harness(Role.Receiving_Custodian, true).get()).status, 500);
});
