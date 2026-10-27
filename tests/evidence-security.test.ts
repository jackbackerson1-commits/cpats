import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import ts from 'typescript';
import sharp from 'sharp';
import { PRStatus, Role } from '@prisma/client';
import { NextResponse } from 'next/server';
import type { AuthUser } from '../src/shared/session';
import type * as Evidence from '../src/shared/evidence';

let root = '';
let workspace = '';
let png: Buffer;
before(async () => { workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'cpats-evidence-test-')); root = path.join(workspace, 'storage', 'evidence'); png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).png().toBuffer(); });
after(async () => { assert.equal(path.dirname(workspace), path.resolve(os.tmpdir())); assert.ok(path.basename(workspace).startsWith('cpats-evidence-test-')); await fs.rm(workspace, { recursive: true }); });
type Row = Record<string, unknown>;
const records: Row[] = [];
const drafts: Row[] = [];
const owner: AuthUser = { id: 'owner', role: Role.Requesting_Office, departmentId: 'A', departmentCode: 'A', departmentName: 'Department A', email: 'test@example.test' };
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return (value as Row[]).every((condition) => matches(row, condition));
    if (key === 'OR') return (value as Row[]).some((condition) => matches(row, condition));
    if (value && typeof value === 'object') {
      const filter = value as Row;
      if ('in' in filter) return (filter.in as unknown[]).includes(row[key]);
      if ('some' in filter) return Array.isArray(row[key]) && (row[key] as Row[]).some((item) => matches(item, filter.some as Row));
      if ('path' in filter) return (row[key] as Row)?.adminProofFilePath === filter.equals;
      return Boolean(row[key]) && matches(row[key] as Row, filter);
    }
    return row[key] === value;
  });
}
const modules: Record<string, unknown> = {
  'node:crypto': crypto, 'node:fs/promises': fs, 'node:path': { default: path }, sharp: { default: sharp },
  '@prisma/client': { PRStatus, Role },
  '@/shared/prisma': { prisma: {
    purchaseRequest: { findFirst: async ({ where }: { where: Row }) => records.find((record) => matches(record, where)) ?? null },
    requestDraft: { findFirst: async ({ where }: { where: Row }) => drafts.find((draft) => matches(draft, where)) ?? null },
  } },
};
function load<T>(file: string, extra: Record<string, unknown> = {}): T {
  const exports = {};
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, Buffer, Uint8Array, File, Blob, Response, FormData, Error, Date, process: { cwd: () => workspace }, console: { error() {} }, require: (name: string) => { const dependencies = { ...modules, ...extra }; assert.ok(name in dependencies, name); return dependencies[name]; } });
  return exports as T;
}
const evidence = load<typeof Evidence>('src/shared/evidence.ts');
const image = () => new File([Uint8Array.from(png)], 'proof.png', { type: 'image/png' });

test('uploads validate content, file type, filename and size rather than trusting the browser', async () => {
  assert.equal((await evidence.validateEvidence(image())).contentType, 'image/png');
  assert.equal((await evidence.validateEvidence(new File(['%PDF-1.4\nfixture\n%%EOF'], 'invoice.pdf', { type: 'application/pdf' }))).contentType, 'application/pdf');
  for (const file of [new File(['<html>script</html>'], 'fake.pdf', { type: 'application/pdf' }), new File(['<svg/>'], 'proof.svg', { type: 'image/svg+xml' }), new File([Uint8Array.from(png)], 'proof.jpg', { type: 'image/jpeg' }), new File(['fake'], '../proof.pdf', { type: 'application/pdf' }), new File(['fake'], 'proof.pdf:stream', { type: 'application/pdf' }), new File([Uint8Array.from(png)], 'proof.png', { type: 'application/pdf' })]) await assert.rejects(evidence.validateEvidence(file));
  await assert.rejects(evidence.validateEvidence(new File([new Uint8Array(evidence.MAX_UPLOAD_BYTES + 1)], 'large.pdf', { type: 'application/pdf' })), (error: unknown) => error instanceof evidence.EvidenceError && error.status === 413);
});

test('multipart parsing bounds total bytes and rejects absent or duplicate files', async () => {
  const form = new FormData(); form.set('file', image());
  const parsed = await evidence.parseBoundedUpload(new Request('http://test/upload', { method: 'POST', body: form })); assert.equal(parsed.name, 'proof.png');
  const duplicate = new FormData(); duplicate.append('file', image()); duplicate.append('file', image());
  await assert.rejects(evidence.parseBoundedUpload(new Request('http://test/upload', { method: 'POST', body: duplicate })));
  await assert.rejects(evidence.parseBoundedUpload(new Request('http://test/upload', { method: 'POST', body: new Uint8Array(evidence.MAX_UPLOAD_BYTES + 300000) })), (error: unknown) => error instanceof evidence.EvidenceError && error.status === 413);
});

test('private storage preserves bytes, generated names and account/department ownership', async () => {
  const reference = await evidence.saveEvidence(image(), owner); const name = evidence.uploadReferenceName(reference)!;
  assert.match(name, /^[0-9a-f-]{36}\.png$/);
  assert.deepEqual((await evidence.readEvidence(name)).bytes, png);
  assert.equal(await evidence.canAccessEvidence(name, owner), true);
  assert.equal(await evidence.canAccessEvidence(name, { ...owner, id: 'other' }), false);
  assert.equal(await evidence.canAccessEvidence(name, { ...owner, departmentId: 'B' }), false);
  await assert.rejects(evidence.assertEvidenceReferences({ ...owner, id: 'other' }, reference), (error: unknown) => error instanceof evidence.EvidenceError && error.status === 403);
  await evidence.assertEvidenceReferences(owner, reference);
  for (const value of ['/uploads/../proof.png', '/uploads/%2e%2e%2fproof.png', '/uploads/proof.png:stream', '/uploads/%00.png']) assert.throws(() => evidence.uploadReferenceName(value));
});

test('legacy evidence follows department and office visibility; private drafts remain private', async () => {
  records.splice(0); drafts.splice(0);
  const name = 'legacy-proof.png'; await fs.writeFile(path.join(root, name), png);
  records.push({ id: 'request', departmentId: 'A', status: PRStatus.Pending_Admin_Approval, adminProofFilePath: `/uploads/${name}`, auditLogs: [{ actor: { role: Role.Business_Office } }], purchaseOrders: [] });
  assert.equal(await evidence.canAccessEvidence(name, owner), true);
  assert.equal(await evidence.canAccessEvidence(name, { ...owner, departmentId: 'B' }), false);
  for (const role of [Role.Business_Office, Role.Admin_Office, Role.Global_Auditor]) assert.equal(await evidence.canAccessEvidence(name, { ...owner, id: role, role }), true);
  for (const role of [Role.Purchasing_Office, Role.Receiving_Custodian, Role.System_Administrator]) assert.equal(await evidence.canAccessEvidence(name, { ...owner, id: role, role }), false);
  records[0].status = PRStatus.Ready_for_Purchase; records[0].purchaseOrders = [{ receivingReports: [] }]; records[0].auditLogs = [{ actor: { role: Role.Business_Office } }, { actor: { role: Role.Admin_Office } }];
  for (const role of [Role.Business_Office, Role.Admin_Office, Role.Purchasing_Office, Role.Receiving_Custodian, Role.Global_Auditor]) assert.equal(await evidence.canAccessEvidence(name, { ...owner, id: role, role }), true);
  records[0].status = PRStatus.Declined; records[0].purchaseOrders = [{ receivingReports: [{ invoiceFilePath: `/uploads/${name}` }] }];
  assert.equal(await evidence.canAccessEvidence(name, { ...owner, id: 'receiver', role: Role.Receiving_Custodian }), true);
  const draftName = 'draft-only.png'; drafts.push({ ownerId: owner.id, departmentId: 'A', payload: { adminProofFilePath: `/uploads/${draftName}` } });
  assert.equal(await evidence.canAccessEvidence(draftName, owner), true);
  assert.equal(await evidence.canAccessEvidence(draftName, { ...owner, id: 'colleague' }), false);
  assert.equal(await evidence.canAccessEvidence(draftName, { ...owner, id: 'auditor', role: Role.Global_Auditor }), false);
  records.splice(0); drafts.splice(0);
});

test('download endpoint denies guests and foreign files and serves authorized evidence without public caching', async () => {
  const reference = await evidence.saveEvidence(image(), owner); const name = evidence.uploadReferenceName(reference)!;
  const route = (user: AuthUser | null) => load<{ GET: (request: unknown, context: { params: Promise<{ name: string }> }) => Promise<NextResponse> }>('src/app/api/evidence/[name]/route.ts', {
    'next/server': { NextResponse }, '@/shared/evidence': evidence,
    '@/shared/rbac': { authorizeRequest: async () => user ? { success: true, user } : { success: false, response: NextResponse.json({ success: false }, { status: 401 }) } },
  });
  const context = { params: Promise.resolve({ name }) };
  assert.equal((await route(null).GET({}, context)).status, 401);
  assert.equal((await route({ ...owner, id: 'other' }).GET({}, context)).status, 404);
  const response = await route(owner).GET({}, context);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
});
