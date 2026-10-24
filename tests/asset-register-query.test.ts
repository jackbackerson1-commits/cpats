import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { Prisma, PRStatus, Role } from '@prisma/client';
import { AssetRegisterQuery, assetRegisterWhere, assetRegisterOrder } from '../src/shared/asset-register-query';
import { assetItemLines, RegisterAssetUnitsSchema, validateAssetSelection } from '../src/shared/asset-units';
import { ASSET_REGISTER_ROLES } from '../src/shared/asset-access';

test('validated register query combines exact filters and lookup with search without changing stored values', () => {
  const id = '123e4567-e89b-42d3-a456-426614174000';
  const query = AssetRegisterQuery.parse({ q: ' Monitor ', poId: id, department: 'CCS', condition: 'Damaged', page: 12, pageSize: 10, ids: [id] });
  const where = assetRegisterWhere(query);
  assert.equal(where.purchaseOrderId, id);
  assert.deepEqual(where.id, { in: [id] });
  assert.deepEqual(where.purchaseOrder, { purchaseRequest: { department: { code: 'CCS' } } });
  assert.deepEqual(where.receivingReport, { condition: 'Damaged' });
  assert.deepEqual(where.OR?.[0], { assetTag: { contains: 'Monitor' } });
  for (const bad of [{ page: 0 }, { page: -1 }, { page: 1.2 }, { pageSize: 200 }, { pageSize: 0 }, { sort: 'status' }, { poId: 'invalid' }, { condition: 'Repaired' }, { ids: ['invalid'] }]) assert.equal(AssetRegisterQuery.safeParse(bad).success, false);
  assert.equal(AssetRegisterQuery.parse({}).pageSize, 100);
  assert.deepEqual(assetRegisterOrder('po').slice(0, 3), [{ purchaseOrder: { poNumber: 'asc' } }, { lineIndex: 'asc' }, { unitNumber: 'asc' }]);
  assert.deepEqual(assetRegisterOrder('item')[0], { itemName: 'asc' });
});

function harness(role: Role, total = 125) {
  const calls: Array<{ where: unknown; skip: number; take: number; orderBy: unknown }> = [];
  const exports: Record<string, (request: unknown) => Promise<{ status: number; body: { page: number; pageSize: number; total: number; assets: { id: number }[]; canRegister: boolean; receivedOrders: unknown[] } }>> = {};
  const modules: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ body, status: options?.status || 200 }) } },
    '@prisma/client': { Prisma, PRStatus, Role },
    '@/shared/prisma': { prisma: {
      assetUnit: { count: async () => total, findMany: async (args: typeof calls[number]) => { calls.push(args); return Array.from({ length: Math.max(0, Math.min(args.take, total - args.skip)) }, (_, i) => ({ id: args.skip + i })); } },
      receivingReport: { findMany: async () => [] }, purchaseOrder: { findMany: async () => [] },
    } },
    '@/shared/rbac': { authorizeRequest: async () => ASSET_REGISTER_ROLES.includes(role) ? { success: true, user: { role } } : { success: false, response: { status: 403 } } },
    '@/shared/asset-access': { ASSET_REGISTER_ROLES },
    '@/shared/asset-units': { assetItemLines, RegisterAssetUnitsSchema, validateAssetSelection },
    '@/shared/asset-register-query': { AssetRegisterQuery, assetRegisterWhere, assetRegisterOrder },
  };
  const code = ts.transpileModule(readFileSync('src/app/api/assets/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, Promise, Error, Math, require: (key: string) => modules[key] });
  return { calls, get: (query = '') => exports.GET({ nextUrl: new URL('http://localhost/api/assets' + query) }) };
}

test('actual GET reaches units beyond the former 100-result cap, clamps removed pages, and retains the legacy limit', async () => {
  const h = harness(Role.Purchasing_Office);
  const later = await h.get('?page=12&pageSize=10&sort=po&department=CCS&condition=Good');
  assert.equal(later.status, 200);
  assert.equal(later.body.assets[0].id, 110);
  assert.equal(later.body.assets.length, 10);
  assert.equal(later.body.total, 125);
  assert.equal(h.calls[0].skip, 110);
  const clamped = await h.get('?page=200&pageSize=25');
  assert.equal(clamped.body.page, 5);
  assert.equal(clamped.body.assets[0].id, 100);
  const legacy = await h.get();
  assert.equal(legacy.body.assets.length, 100);
  assert.equal((await h.get('?page=0')).status, 422);
  assert.equal((await h.get('?pageSize=200')).status, 422);
  assert.equal((await harness(Role.Global_Auditor, 0).get('?page=3&pageSize=10')).body.page, 1);
});

test('read pagination and option lookup retain every existing role gate and Receiving registration visibility', async () => {
  for (const role of Object.values(Role)) {
    const h = harness(role);
    const response = await h.get('?page=1&pageSize=10&options=1');
    assert.equal(response.status, ASSET_REGISTER_ROLES.includes(role) ? 200 : 403);
    if (response.status === 200) assert.equal(response.body.canRegister, role === Role.Receiving_Custodian);
    else assert.equal(h.calls.length, 0);
  }
});
