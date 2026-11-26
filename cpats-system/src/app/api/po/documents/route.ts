import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/shared/prisma';
import { authorizeRequest } from '@/shared/rbac';
import { assertEvidenceReferences, EvidenceError, evidenceRecordScope, readEvidence, uploadReferenceName } from '@/shared/evidence';
import { PO_DOCUMENT_READERS, PO_DOCUMENT_WRITERS, PODocumentQuerySchema, SavePODocumentSchema } from '@/shared/po-documents';

const pageSize = 20;
const select = {
  id: true, kind: true, filePath: true, fileName: true, notes: true, createdAt: true,
  uploadedBy: { select: { email: true, role: true } },
} as const;

function failure(error: unknown) {
  if (error instanceof EvidenceError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
    return NextResponse.json({ success: false, error: 'The uploaded file could not be found. Please upload it again.' }, { status: 404 });
  }
  console.error('PO DOCUMENT FAILURE:', error);
  return NextResponse.json({ success: false, error: 'Supporting documents could not be loaded or saved. Please try again.' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, PO_DOCUMENT_READERS);
    if (!auth.success) return auth.response;
    const parsed = PODocumentQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Check the PO reference and document page.' }, { status: 422 });
    const scope = evidenceRecordScope(auth.user);
    if (!scope) return NextResponse.json({ success: false, error: 'Document access is unavailable for this account.' }, { status: 403 });
    const { poId, page } = parsed.data;
    const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, purchaseRequest: scope }, select: { id: true } });
    if (!po) return NextResponse.json({ success: false, error: 'This purchase order is unavailable to your account.' }, { status: 404 });
    const where = { purchaseOrderId: poId };
    const [data, total] = await Promise.all([
      prisma.purchaseOrderDocument.findMany({ where, select, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.purchaseOrderDocument.count({ where }),
    ]);
    return NextResponse.json({ success: true, data, total, page, pageSize, canAttach: PO_DOCUMENT_WRITERS.includes(auth.user.role) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, PO_DOCUMENT_WRITERS);
    if (!auth.success) return auth.response;
    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ success: false, error: 'Submit a valid document record.' }, { status: 400 }); }
    const parsed = SavePODocumentSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Choose a document type and uploaded file, and check the filename and notes.' }, { status: 422 });
    const { poId, kind, filePath, fileName, notes } = parsed.data;
    const scope = evidenceRecordScope(auth.user);
    if (!scope) return NextResponse.json({ success: false, error: 'Document access is unavailable for this account.' }, { status: 403 });
    const record = await prisma.$transaction(async tx => {
      const po = await tx.purchaseOrder.findFirst({ where: { id: poId, purchaseRequest: scope }, select: { id: true } });
      if (!po) throw new EvidenceError('This purchase order is unavailable to your account.', 404);
      await assertEvidenceReferences(auth.user, filePath);
      await readEvidence(uploadReferenceName(filePath)!);
      // A retry returns the original entry; metadata and workflow records stay intact.
      const saved = await tx.purchaseOrderDocument.upsert({
        where: { filePath }, update: {},
        create: { purchaseOrderId: poId, kind, filePath, fileName, notes: notes || null, uploadedById: auth.user.id },
        select: { ...select, purchaseOrderId: true },
      });
      if (saved.purchaseOrderId !== poId) throw new EvidenceError('This file is already attached to another purchase order. Upload a separate copy for this PO.', 409);
      return saved;
    });
    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error) { return failure(error); }
}
