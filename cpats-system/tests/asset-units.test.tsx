import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { Role, PRStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import QRCodeSVG from '../src/components/ui/QRCodeSVG';
import { assetItemLines, RegisterAssetUnitsSchema, validateAssetSelection } from '../src/shared/asset-units';
import { AssetRegisterQuery, assetRegisterWhere, assetRegisterOrder } from '../src/shared/asset-register-query';
import { ASSET_REGISTER_ROLES } from '../src/shared/asset-access';

test('actual QR component decodes PO and three distinct equipment references', async () => {
  const tokens = ['PO-TOKEN-' + randomUUID(), ...Array.from({ length: 3 }, () => 'ASSET-TOKEN-' + randomUUID())];
  assert.equal(new Set(tokens).size, 4);
  for (const value of tokens) for (const size of [130, 170, 340]) {
    const svg = renderToStaticMarkup(<QRCodeSVG value={value} size={size} />);
    const raster = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const decoded = jsQR(new Uint8ClampedArray(raster.data), raster.info.width, raster.info.height);
    assert.equal(decoded?.data, value);
  }
});

const items = [{ itemName: 'Dell computer', quantity: 3 }, { itemName: 'Printer', quantity: 2 }];
test('same-brand units, mixed lines, legacy indexes, quantities and duplicate serial guards', () => {
  assert.equal(validateAssetSelection(items, 0, [{ unitNumber: 1 }, { unitNumber: 2 }, { unitNumber: 3 }], []).itemName, 'Dell computer');
  assert.equal(validateAssetSelection(items, 1, [{ unitNumber: 2 }], []).itemName, 'Printer');
  assert.throws(() => validateAssetSelection(items, 0, [{ unitNumber: 4 }], []), /UNIT_OUTSIDE_ORDER/);
  assert.throws(() => validateAssetSelection(items, 0, [{ unitNumber: 1 }], [{ lineIndex: 0, unitNumber: 1, serialNumber: null }]), /UNIT_ALREADY_TAGGED/);
  assert.throws(() => validateAssetSelection(items, 1, [{ unitNumber: 1, serialNumber: 'abc' }], [{ lineIndex: 0, unitNumber: 1, serialNumber: 'ABC' }]), /SERIAL_ALREADY_RECORDED/);
  assert.equal(assetItemLines([null, ...items])[0].lineIndex, 1);
  const base = { receivingReportId: randomUUID(), lineIndex: 0 };
  assert.equal(RegisterAssetUnitsSchema.safeParse({ ...base, units: [{ unitNumber: 1 }, { unitNumber: 1 }] }).success, false);
  assert.equal(RegisterAssetUnitsSchema.safeParse({ ...base, units: [{ unitNumber: 1, serialNumber: 'same' }, { unitNumber: 2, serialNumber: 'SAME' }] }).success, false);
  assert.equal(RegisterAssetUnitsSchema.safeParse({ ...base, units: [{ unitNumber: 1 }, { unitNumber: 2 }] }).success, true);
});

interface SavedUnit { id: string; lineIndex: number; unitNumber: number; serialNumber: string | null; assetTag: string; qrCodeToken: string }
interface Reply { status: number; body: { success: boolean; assets?: SavedUnit[]; canRegister?: boolean; receivedOrders?: unknown[] } }
function endpointHarness(role: Role, received = true) {
  const saved: SavedUnit[] = [];
  const reportId = randomUUID();
  const report = { id: reportId, purchaseOrderId: randomUUID(), purchaseOrder: {
    poNumber: 'PO-TEST-001', purchaseRequest: { status: received ? PRStatus.Received_and_Closed : PRStatus.Ready_for_Purchase, itemsPayload: items }, assetUnits: saved,
  } };
  const auditWrites: unknown[] = [];
  const client = {
    receivingReport: { findUnique: async () => report, findMany: async () => [report] },
    assetUnit: { findMany: async () => saved, count: async () => saved.length, create: async ({ data }: { data: SavedUnit }) => { saved.push(data); return data; } },
    $queryRaw: async (sql: TemplateStringsArray) => sql[0].includes('FROM AssetUnit') ? saved : [],
    purchaseRequest: { update: (...args: unknown[]) => auditWrites.push(args) },
    auditLog: { create: (...args: unknown[]) => auditWrites.push(args) },
  };
  const exports: Record<string, (request: unknown) => Promise<Reply>> = {};
  const modules: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (body: Reply['body'], options?: { status?: number }) => ({ body, status: options?.status || 200 }) } },
    '@prisma/client': { Role, PRStatus, Prisma },
    '@/shared/prisma': { prisma: { ...client, $transaction: async (fn: (tx: typeof client) => Promise<unknown>) => { const before = saved.length; try { return await fn(client); } catch (error) { saved.splice(before); throw error; } } } },
    '@/shared/rbac': { authorizeRequest: async (_request: unknown, allowed: Role | Role[]) => (Array.isArray(allowed) ? allowed : [allowed]).includes(role)
      ? { success: true, user: { role, id: 'receiving-user' } } : { success: false, response: { status: 403, body: { success: false } } } },
    '@/shared/asset-access': { ASSET_REGISTER_ROLES },
    '@/shared/asset-register-query': { AssetRegisterQuery, assetRegisterWhere, assetRegisterOrder },
    '@/shared/asset-units': { assetItemLines, RegisterAssetUnitsSchema, validateAssetSelection },
  };
  const source = readFileSync('src/app/api/assets/route.ts', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { exports, crypto: { randomUUID }, Promise, Error, require: (key: string) => modules[key] });
  return { saved, auditWrites, post: (lineIndex: number, units: { unitNumber: number; serialNumber?: string }[]) => exports.POST({ json: async () => ({ receivingReportId: reportId, lineIndex, units }) }),
    get: () => exports.GET({ nextUrl: new URL('http://localhost/api/assets') }) };
}

test('real endpoint registers three different equipment IDs, reuses persisted labels, rejects retries and preserves workflow', async () => {
  const h = endpointHarness(Role.Receiving_Custodian);
  const reply = await h.post(0, [{ unitNumber: 1, serialNumber: 'PC-1' }, { unitNumber: 2, serialNumber: 'PC-2' }, { unitNumber: 3 }]);
  assert.equal(reply.status, 201);
  assert.equal(new Set(h.saved.map((a) => a.assetTag)).size, 3);
  assert.equal(new Set(h.saved.map((a) => a.qrCodeToken)).size, 3);
  const ids = h.saved.map((a) => a.id);
  assert.equal((await h.post(0, [{ unitNumber: 1 }])).status, 409);
  assert.equal((await h.post(1, [{ unitNumber: 3 }])).status, 409);
  assert.equal((await h.post(1, [{ unitNumber: 1, serialNumber: 'pc-1' }])).status, 409);
  assert.equal((await h.post(1, [{ unitNumber: 1 }, { unitNumber: 2 }])).status, 201);
  const loaded = await h.get();
  assert.equal(loaded.body.assets?.length, 5);
  assert.deepEqual(h.saved.slice(0, 3).map((a) => a.id), ids);
  assert.equal(h.auditWrites.length, 0);
});

test('role gates and receipt prerequisite restrict new asset writes without changing procurement access', async () => {
  assert.equal((await endpointHarness(Role.Receiving_Custodian, false).post(0, [{ unitNumber: 1 }])).status, 409);
  for (const role of Object.values(Role)) {
    const h = endpointHarness(role);
    assert.equal((await h.get()).status, ASSET_REGISTER_ROLES.includes(role) ? 200 : 403);
    const response = await h.post(0, [{ unitNumber: 1 }]);
    assert.equal(response.status, role === Role.Receiving_Custodian ? 201 : 403);
    if (role !== Role.Receiving_Custodian) assert.equal(h.saved.length, 0);
  }
});
