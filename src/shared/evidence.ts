import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink, lstat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { Prisma, PRStatus, Role } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import type { AuthUser } from '@/shared/session';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 256 * 1024;
const types: Record<string, string> = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

export class EvidenceError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function evidenceRoot() {
  // Runtime evidence is supplied by persistent storage, never bundled as application assets.
  return path.join(process.cwd(), 'storage', 'evidence');
}
export function safeEvidenceName(name: string): boolean {
  return Boolean(name) && name.length <= 240 && name !== '.' && name !== '..' && !/[\\/:\x00-\x1f]/.test(name) && path.basename(name) === name && Boolean(types[path.extname(name).toLowerCase()]);
}

export function uploadReferenceName(reference: string): string | null {
  if (!reference.startsWith('/uploads/')) return null;
  let name: string;
  try { name = decodeURIComponent(reference.slice('/uploads/'.length)); } catch { throw new EvidenceError('Invalid attachment reference.', 422); }
  if (!safeEvidenceName(name)) throw new EvidenceError('Invalid attachment reference.', 422);
  return name;
}

export async function parseBoundedUpload(request: Request): Promise<File> {
  const length = Number(request.headers.get('content-length'));
  if (length > MAX_REQUEST_BYTES) throw new EvidenceError('Upload must be 10 MB or smaller.', 413);
  if (!request.body) throw new EvidenceError('No file provided.', 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) { await reader.cancel(); throw new EvidenceError('Upload must be 10 MB or smaller.', 413); }
      chunks.push(Uint8Array.from(value));
    }
  } finally { reader.releaseLock(); }
  let form: FormData;
  try { form = await new Response(new Blob(chunks), { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData(); }
  catch { throw new EvidenceError('Choose a file and submit it as a file upload.', 400); }
  const files = form.getAll('file');
  if (files.length !== 1 || !(files[0] instanceof File)) throw new EvidenceError('Choose one file to upload.', 400);
  return files[0];
}

export async function validateEvidence(file: File): Promise<{ bytes: Buffer; extension: string; contentType: string }> {
  if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new EvidenceError('Choose a non-empty file of 10 MB or smaller.', 413);
  if (!safeEvidenceName(file.name)) throw new EvidenceError('Use a PDF, JPEG, PNG, GIF or WebP file with a valid filename.', 422);
  const extension = path.extname(file.name).toLowerCase();
  const contentType = types[extension];
  if (file.type && file.type !== contentType) throw new EvidenceError('The file type does not match its filename.', 422);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (extension === '.pdf') {
    if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-' || !bytes.subarray(Math.max(0, bytes.length - 2048)).includes(Buffer.from('%%EOF'))) throw new EvidenceError('This file does not contain a valid PDF signature.', 422);
  } else {
    try {
      const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
      const format = extension === '.jpg' || extension === '.jpeg' ? 'jpeg' : extension.slice(1);
      if (metadata.format !== format || !metadata.width || !metadata.height) throw new Error('Image mismatch');
    } catch { throw new EvidenceError('This file is not a supported, readable image.', 422); }
  }
  return { bytes, extension: extension === '.jpeg' ? '.jpg' : extension, contentType };
}

interface EvidenceMetadata { ownerId: string; departmentId: string; contentType: string; createdAt: string }
export async function saveEvidence(file: File, user: AuthUser): Promise<string> {
  const { bytes, extension, contentType } = await validateEvidence(file);
  const root = evidenceRoot();
  await mkdir(root, { recursive: true });
  const name = `${randomUUID()}${extension}`;
  const filePath = path.join(root, name);
  await writeFile(filePath, bytes, { flag: 'wx' });
  try { await writeFile(`${filePath}.json`, JSON.stringify({ ownerId: user.id, departmentId: user.departmentId, contentType, createdAt: new Date().toISOString() } satisfies EvidenceMetadata), { flag: 'wx' }); }
  catch (error) { await unlink(filePath); throw error; }
  return `/uploads/${name}`;
}

export function evidenceRecordScope(user: AuthUser): Prisma.PurchaseRequestWhereInput | null {
  switch (user.role) {
    case Role.Requesting_Office: return { departmentId: user.departmentId };
    case Role.Business_Office: return { OR: [{ status: PRStatus.Pending_Business_Approval }, { auditLogs: { some: { actor: { role: Role.Business_Office } } } }, { purchaseOrders: { some: {} } }] };
    case Role.Admin_Office: return { OR: [{ status: PRStatus.Pending_Admin_Approval }, { auditLogs: { some: { actor: { role: Role.Admin_Office } } } }] };
    case Role.Purchasing_Office: return { OR: [{ status: PRStatus.Approved_Awaiting_PO }, { purchaseOrders: { some: {} } }] };
    case Role.Receiving_Custodian: return { OR: [
      { status: { in: [PRStatus.Ready_for_Purchase, PRStatus.Received_and_Closed] }, purchaseOrders: { some: {} } },
      { purchaseOrders: { some: { receivingReports: { some: {} } } } },
    ] };
    case Role.Global_Auditor: return {};
    default: return null;
  }
}

export async function canAccessEvidence(name: string, user: AuthUser): Promise<boolean> {
  if (!safeEvidenceName(name)) return false;
  try {
    const metadata: EvidenceMetadata = JSON.parse(await readFile(/* turbopackIgnore: true */ path.join(evidenceRoot(), `${name}.json`), 'utf8'));
    if (metadata.ownerId === user.id && metadata.departmentId === user.departmentId) return true;
  } catch (error) { if (!(typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT')) throw error; }
  const reference = `/uploads/${name}`;
  const scope = evidenceRecordScope(user);
  if (scope && await prisma.purchaseRequest.findFirst({ where: { AND: [scope, { OR: [
    { adminProofFilePath: reference },
    { purchaseOrders: { some: { receivingReports: { some: { OR: [{ invoiceFilePath: reference }, { asssetImageFilePath: reference }] } } } } },
  ] }] }, select: { id: true } })) return true;
  if (user.role === Role.Requesting_Office && await prisma.requestDraft.findFirst({ where: { ownerId: user.id, departmentId: user.departmentId, payload: { path: '$.adminProofFilePath', equals: reference } }, select: { id: true } })) return true;
  return false;
}

export async function assertEvidenceReferences(user: AuthUser, ...references: (string | null | undefined)[]): Promise<void> {
  for (const reference of references) {
    if (!reference) continue;
    const name = uploadReferenceName(reference);
    if (name && !await canAccessEvidence(name, user)) throw new EvidenceError('This attachment is not available to your account. Reopen the saved record or upload your own evidence.', 403);
  }
}

export async function readEvidence(name: string): Promise<{ bytes: Buffer; contentType: string }> {
  if (!safeEvidenceName(name)) throw new EvidenceError('Attachment not found.', 404);
  const filePath = path.join(evidenceRoot(), name);
  const entry = await lstat(filePath);
  if (!entry.isFile() || entry.isSymbolicLink()) throw new EvidenceError('Attachment not found.', 404);
  return { bytes: await readFile(/* turbopackIgnore: true */ filePath), contentType: types[path.extname(name).toLowerCase()] };
}
