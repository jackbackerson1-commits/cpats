import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { Role, PRStatus, Prisma } from '@prisma/client';
import { auditPage, latestRecordedReturn } from '../src/shared/audit-presentation';
import { AuditFilterSchema } from '../src/validation/audit.schema';

test('audit pages apply to the complete filtered list, preserve source order and clamp stale/empty pages', () => {
  const records = Array.from({ length: 31 }, (_, id) => ({ id, department: id % 2 ? 'CCS' : 'HRMO' }));
  const before = JSON.stringify(records);
  const page = auditPage(records, 3, 10);
  assert.deepEqual(page.records.map(record => record.id), [20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
  assert.equal(page.start, 21); assert.equal(page.end, 30);
  const filtered = records.filter(record => record.department === 'CCS');
  assert.equal(auditPage(filtered, 8, 10).page, 2);
  assert.equal(auditPage(filtered, 8, 25).page, 1);
  assert.equal(auditPage([], 2, 10).start, 0);
  assert.equal(auditPage([], 2, 10).totalPages, 1);
  assert.equal(JSON.stringify(records), before);
});

test('return feedback identifies the latest actual return and preserves its office, remarks and original event ID', () => {
  const events = [
    { id: 'old', previousState: PRStatus.Pending_Admin_Approval, newState: PRStatus.Returned_for_Correction, createdAt: '2026-10-01T00:00:00Z', actor: { role: Role.Admin_Office }, remarks: 'Clarify quantity' },
    { id: 'new', previousState: PRStatus.Pending_Business_Approval, newState: PRStatus.Returned_for_Correction, createdAt: '2026-10-12T00:00:00Z', actor: { role: Role.Business_Office }, remarks: 'Attach updated estimate' },
    { id: 'note', previousState: PRStatus.Returned_for_Correction, newState: PRStatus.Returned_for_Correction, createdAt: '2026-10-13T00:00:00Z', actor: { role: Role.Business_Office }, remarks: 'Follow-up note' },
  ];
  const before = JSON.stringify(events);
  assert.equal(latestRecordedReturn(events), events[1]);
  assert.equal(latestRecordedReturn(events)?.actor.role, Role.Business_Office);
  assert.equal(latestRecordedReturn([events[0]])?.actor.role, Role.Admin_Office);
  assert.equal(latestRecordedReturn([events[2]]), undefined);
  assert.equal(latestRecordedReturn([]), undefined);
  assert.equal(JSON.stringify(events), before);
});

test('audit endpoint remains read-only, with the same Global Auditor gate and stored-evidence query', async () => {
  const calls: unknown[] = [];
  let role: Role = Role.Global_Auditor;
  const exports: { POST?: (request: unknown) => Promise<{ status: number }> } = {};
  const modules: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (body: unknown, options: { status: number }) => ({ body, status: options.status }) } },
    '@prisma/client': { Role, PRStatus, Prisma }, '@/validation/audit.schema': { AuditFilterSchema },
    '@/shared/rbac': { authorizeRequest: async (_request: unknown, allowed: Role) => allowed === role ? { success: true } : { success: false, response: { status: 403 } } },
    '@/shared/prisma': { prisma: { purchaseRequest: { findMany: async (query: unknown) => { calls.push(query); return []; } } } },
  };
  const code = ts.transpileModule(readFileSync('src/app/api/audit/report/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, require: (key: string) => modules[key], console, Date });
  const request = { json: async () => ({ status: PRStatus.Returned_for_Correction, sortOrder: 'desc' }) };
  assert.equal((await exports.POST!(request)).status, 200);
  const query = JSON.stringify(calls[0]);
  assert.match(query, /Returned_for_Correction/); assert.match(query, /auditLogs/); assert.match(query, /invoiceFilePath/); assert.match(query, /asssetImageFilePath/);
  for (const other of Object.values(Role).filter(value => value !== Role.Global_Auditor)) {
    role = other; assert.equal((await exports.POST!(request)).status, 403);
  }
  assert.equal(calls.length, 1);
});
