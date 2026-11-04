import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { Role } from '@prisma/client';
import { z } from 'zod';
import * as schemas from '../src/validation/request-template.schema';

const id = '11111111-1111-4111-8111-111111111111';
const payload = { items: [{ category: 'Other / Custom Item', specs: 'Exact model\nAdditional specifications', quantity: 2 }], justification: 'For recurring laboratory work' };
type Row = Record<string, unknown>;
type Reply = { status: number; body: { success: boolean; data?: Row | Row[]; error?: string; nextPage?: number | null } };
function harness(user: { id: string; role: Role; departmentId: string } | null = { id: 'owner', role: Role.Requesting_Office, departmentId: 'department' }) {
  const rows: Row[] = [], writes: Row[] = [];
  const match = (row: Row, where: Row) => Object.entries(where).every(([key, value]) => row[key] === value);
  const modules: Record<string, unknown> = {
    zod: { z }, '@prisma/client': { Role }, '@/validation/request-template.schema': schemas,
    'next/server': { NextResponse: { json: (body: unknown, options: Row) => ({ body, ...options }) } },
    '@/shared/rbac': { authorizeRequest: async (_request: unknown, role: Role) => user?.role === role ? { success: true, user } : { success: false, response: { status: user ? 403 : 401 } } },
    '@/shared/prisma': { prisma: { requestTemplate: {
      findFirst: async ({ where }: { where: Row }) => rows.find(row => match(row, where)) || null,
      findMany: async ({ where, skip, take }: { where: Row; skip: number; take: number }) => rows.filter(row => match(row, where)).slice(skip, skip + take),
      create: async ({ data }: { data: Row }) => { writes.push(data); const row = { ...data, id, version: 1, createdAt: '2026-10-14T00:00:00Z' }; rows.push(row); return row; },
      deleteMany: async ({ where }: { where: Row }) => { const index = rows.findIndex(row => match(row, where)); if (index < 0) return { count: 0 }; rows.splice(index, 1); writes.push(where); return { count: 1 }; },
    } } },
  };
  const exports: Record<string, (request: unknown) => Promise<Reply>> = {};
  const code = ts.transpileModule(readFileSync('src/app/api/pr/templates/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, console: { error() {} }, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  const request = (method: string, body?: unknown, query = '') => exports[method]({ nextUrl: new URL('https://cpats.test/api/pr/templates' + query), json: async () => body });
  return { rows, writes, request };
}

test('saving a named template preserves raw items and justification without procurement or evidence activity', async () => {
  const h = harness();
  assert.equal((await h.request('POST', { name: '  Laboratory equipment  ', payload })).status, 201);
  assert.equal(h.rows[0].name, 'Laboratory equipment');
  assert.deepEqual(h.rows[0].payload, payload);
  assert.equal(h.rows[0].ownerId, 'owner'); assert.equal(h.rows[0].departmentId, 'department');
  assert.equal(h.writes.length, 1);
  assert.equal((await h.request('GET', undefined, `?id=${id}`)).status, 200);
});
test('copying is independent, clears approval/evidence settings, and never mutates the reusable snapshot', () => {
  const original = structuredClone(payload), before = JSON.stringify(original);
  const copy = schemas.templateToNewDraft(original);
  assert.equal(copy.justification, payload.justification);
  assert.deepEqual(copy.items, payload.items);
  assert.equal(copy.isDirectPoBypass, false); assert.equal(copy.adminProofFilePath, '');
  assert.equal(copy.attachedFileName, null); assert.equal(copy.attachedFileSize, null); assert.equal(copy.attachedFileIsImage, false);
  copy.items[0].quantity = 9; copy.items[0].specs = 'New request edits';
  assert.equal(JSON.stringify(original), before);
});
test('all template endpoints deny guests and every non-requesting role', async () => {
  for (const role of [null, ...Object.values(Role).filter(role => role !== Role.Requesting_Office)]) {
    const h = harness(role ? { id: 'owner', role, departmentId: 'department' } : null);
    for (const method of ['GET', 'POST', 'DELETE']) assert.equal((await h.request(method, { name: 'Template', payload, id, version: 1 })).status, role ? 403 : 401);
    assert.equal(h.writes.length, 0);
  }
});
test('list, detail and removal stay scoped to both account and current department', async () => {
  for (const mismatch of [{ ownerId: 'other' }, { departmentId: 'other' }]) {
    const h = harness(); h.rows.push({ id, ownerId: 'owner', departmentId: 'department', version: 1, payload, ...mismatch });
    const before = JSON.stringify(h.rows);
    assert.deepEqual((await h.request('GET')).body.data, []);
    assert.equal((await h.request('GET', undefined, `?id=${id}`)).status, 404);
    assert.equal((await h.request('DELETE', { id, version: 1 })).status, 404);
    assert.equal(JSON.stringify(h.rows), before);
  }
});
test('malformed or incomplete templates and injected ownership/approval fields cannot be stored', async () => {
  const h = harness();
  for (const body of [
    { name: '', payload }, { name: 'x'.repeat(121), payload },
    { name: 'Template', payload: { ...payload, isDirectPoBypass: true, adminProofFilePath: '/uploads/prior.pdf' } },
    { name: 'Template', payload, ownerId: 'other' },
    ...[0, 1.5, -1].map(quantity => ({ name: 'Template', payload: { ...payload, items: [{ ...payload.items[0], quantity }] } })),
    { name: 'Template', payload: { ...payload, items: [{ ...payload.items[0], specs: '  ' }] } },
  ]) assert.equal((await h.request('POST', body)).status, 422);
  assert.equal(h.writes.length, 0);
});
test('stale removals fail safely and a current removal touches only the template', async () => {
  const h = harness(); await h.request('POST', { name: 'Template', payload });
  assert.equal((await h.request('DELETE', { id, version: 2 })).status, 409);
  assert.equal(h.rows.length, 1);
  assert.equal((await h.request('DELETE', { id, version: 1 })).status, 200);
  assert.equal(h.rows.length, 0);
  assert.equal((await h.request('GET', undefined, `?id=${id}`)).status, 404);
});
test('pagination keeps older private templates reachable and malformed stored payloads fail without a copy', async () => {
  const h = harness();
  for (let index = 0; index < 23; index++) h.rows.push({ id: `${index}`, name: `Template ${index}`, ownerId: 'owner', departmentId: 'department', version: 1, payload, createdAt: '2026-10-14' });
  const first = await h.request('GET'), last = await h.request('GET', undefined, '?page=1');
  assert.equal((first.body.data as Row[]).length, 20); assert.equal(first.body.nextPage, 1);
  assert.equal((last.body.data as Row[]).length, 3); assert.equal(last.body.nextPage, null);
  h.rows.push({ id, ownerId: 'owner', departmentId: 'department', payload: { unexpected: true } });
  assert.equal((await h.request('GET', undefined, `?id=${id}`)).status, 422);
  assert.equal((await h.request('GET', undefined, '?page=-1')).status, 400);
});
