import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { Role, PRStatus } from '@prisma/client';
import { QueueFetchSchema } from '../src/validation/queue.schema';

function handler(user: { role: Role; departmentId: string } | null) {
  const reads: { model: string; query: Record<string, unknown> }[] = [];
  const prisma = Object.fromEntries(['purchaseRequest', 'purchaseOrder'].map(model => [model, { findMany: async (query: Record<string, unknown>) => { reads.push({ model, query }); return []; } }]));
  const modules: Record<string, unknown> = {
    '@prisma/client': { Role, PRStatus }, '@/shared/prisma': { prisma }, '@/validation/queue.schema': { QueueFetchSchema },
    'next/server': { NextResponse: { json: (body: unknown, options: { status: number }) => ({ body, status: options.status }) } },
    '@/shared/rbac': { authorizeRequest: async () => user ? { success: true, user } : { success: false, response: { status: 401 } } },
  };
  const exports: { POST?: (request: { json: () => Promise<unknown> }) => Promise<{ status: number }> } = {};
  const code = ts.transpileModule(readFileSync('src/app/api/pr/queue/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, require: (name: string) => { if (!(name in modules)) throw Error(`Unexpected dependency ${name}`); return modules[name]; }, console });
  return { reads, call: (body: unknown) => exports.POST!({ json: async () => body }) };
}
test('filters cannot broaden requester department scope or switch to another office queue', async () => {
  const route = handler({ role: Role.Requesting_Office, departmentId: '11111111-1111-4111-8111-111111111111' });
  assert.equal((await route.call({ role: Role.Requesting_Office, departmentId: '22222222-2222-4222-8222-222222222222' })).status, 403);
  assert.equal((await route.call({ role: Role.Admin_Office })).status, 403);
  assert.equal(route.reads.length, 0);
  assert.equal((await route.call({ role: Role.Requesting_Office })).status, 200);
  assert.equal(JSON.stringify(route.reads[0].query.where), JSON.stringify({ departmentId: '11111111-1111-4111-8111-111111111111' }));
});
test('Purchasing timestamps are additive reads on the existing approved-only queue', async () => {
  const route = handler({ role: Role.Purchasing_Office, departmentId: 'fixture' });
  assert.equal((await route.call({ role: Role.Purchasing_Office })).status, 200);
  assert.equal(JSON.stringify(route.reads[0].query.where), JSON.stringify({ status: PRStatus.Approved_Awaiting_PO }));
  assert.match(JSON.stringify(route.reads[0].query.include), /auditLogs.*createdAt.*previousState.*newState/);
});
test('Receiving timestamps retain readiness and no-prior-inspection eligibility', async () => {
  const route = handler({ role: Role.Receiving_Custodian, departmentId: 'fixture' });
  assert.equal((await route.call({ role: Role.Receiving_Custodian })).status, 200);
  assert.equal(route.reads[0].model, 'purchaseOrder');
  assert.equal(JSON.stringify(route.reads[0].query.where), JSON.stringify({ purchaseRequest: { status: PRStatus.Ready_for_Purchase }, receivingReports: { none: {} } }));
  assert.match(JSON.stringify(route.reads[0].query.include), /auditLogs.*createdAt.*previousState.*newState/);
});
test('guests cannot read queue data', async () => {
  const route = handler(null);
  assert.equal((await route.call({ role: Role.Receiving_Custodian })).status, 401);
  assert.equal(route.reads.length, 0);
});
