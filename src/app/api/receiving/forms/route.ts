import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/shared/prisma';
import { authorizeRequest } from '@/shared/rbac';
import { EvidenceError, evidenceRecordScope, assertEvidenceReferences, uploadReferenceName, readEvidence } from '@/shared/evidence';
import { PO_DOCUMENT_READERS, PO_DOCUMENT_WRITERS } from '@/shared/po-documents';
import { FormActionSchema } from '@/shared/receiving-forms';
import { isWorkflowConflict, WORKFLOW_CONFLICT_MESSAGE } from '@/shared/workflow-conflict';

const query = z.object({ poId: z.uuid().optional(), documentId: z.uuid().optional(), page: z.coerce.number().int().min(1).max(100000).default(1) }).refine(value => !value.documentId || value.poId);
const revisionInclude = { createdBy: { select: { email: true } }, signedCopies: { orderBy: { createdAt: 'desc' as const }, select: { id: true, filePath: true, fileName: true, createdAt: true, uploadedBy: { select: { email: true } } } } };
function failure(error: unknown) {
  if (error instanceof EvidenceError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  if (isWorkflowConflict(error) || error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return NextResponse.json({ success: false, error: WORKFLOW_CONFLICT_MESSAGE }, { status: 409 });
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return NextResponse.json({ success: false, error: 'The signed file is missing. Upload it again.' }, { status: 422 });
  console.error('RECEIVING FORM FAILURE:', error);
  return NextResponse.json({ success: false, error: 'The receiving document could not be loaded or saved. Refresh before retrying.' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, PO_DOCUMENT_READERS);
    if (!auth.success) return auth.response;
    const parsed = query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) throw new EvidenceError('Check the purchase order, document and page references.', 422);
    const scope = evidenceRecordScope(auth.user);
    if (!scope) throw new EvidenceError('Receiving document access is unavailable.', 403);
    const { poId, documentId, page } = parsed.data;
    const take = 20, skip = (page - 1) * take;
    const canEdit = PO_DOCUMENT_WRITERS.includes(auth.user.role);
    if (!poId) {
      const where = { purchaseRequest: scope };
      const [data, total] = await Promise.all([
        prisma.purchaseOrder.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take, skip, select: { id: true, poNumber: true, purchaseRequest: { select: { department: { select: { name: true, code: true } } } } } }),
        prisma.purchaseOrder.count({ where }),
      ]);
      return NextResponse.json({ success: true, data, total, page, pageSize: take, canEdit }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, purchaseRequest: scope }, select: { id: true, poNumber: true, paymentType: true, purchaseRequest: { select: { status: true, itemsPayload: true, department: { select: { name: true, code: true } } } } } });
    if (!po) throw new EvidenceError('This purchase order is unavailable to your account.', 404);
    if (documentId) {
      const document = await prisma.receivingForm.findFirst({ where: { id: documentId, purchaseOrderId: poId } });
      if (!document) throw new EvidenceError('This receiving document is unavailable for this PO.', 404);
      const [revisions, total] = await Promise.all([
        prisma.receivingFormRevision.findMany({ where: { formId: documentId }, orderBy: { version: 'desc' }, take, skip, include: revisionInclude }),
        prisma.receivingFormRevision.count({ where: { formId: documentId } }),
      ]);
      return NextResponse.json({ success: true, po, document: { ...document, revisions }, total, page, pageSize: take, canEdit }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const where = { purchaseOrderId: poId };
    const [data, total] = await Promise.all([
      prisma.receivingForm.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take, skip, include: { revisions: { orderBy: { version: 'desc' }, take: 1, include: revisionInclude } } }),
      prisma.receivingForm.count({ where }),
    ]);
    return NextResponse.json({ success: true, po, data, total, page, pageSize: take, canEdit }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, PO_DOCUMENT_WRITERS);
    if (!auth.success) return auth.response;
    if (Number(request.headers?.get('content-length')) > 200000) throw new EvidenceError('The draft is too large. Use up to 100 item lines.', 413);
    let raw: unknown;
    try { raw = await request.json(); } catch { throw new EvidenceError('Submit a valid receiving document.', 400); }
    const parsed = FormActionSchema.safeParse(raw);
    if (!parsed.success) throw new EvidenceError('Check document fields, non-negative quantities/costs, date and attachment confirmation. Maximum 100 item lines.', 422);
    const input = parsed.data;
    const scope = evidenceRecordScope(auth.user);
    if (!scope) throw new EvidenceError('Receiving document access is unavailable.', 403);
    const result = await prisma.$transaction(async tx => {
      const po = await tx.purchaseOrder.findFirst({ where: { id: input.poId, purchaseRequest: scope }, select: { id: true } });
      if (!po) throw new EvidenceError('This purchase order is unavailable to your account.', 404);
      if (input.action === 'SAVE') {
        let form;
        if (input.documentId) {
          const current = await tx.receivingForm.findFirst({ where: { id: input.documentId, purchaseOrderId: input.poId, kind: input.kind } });
          if (!current) throw new EvidenceError('This receiving document is unavailable for this PO/type.', 404);
          if (current.version !== input.version) throw new EvidenceError(WORKFLOW_CONFLICT_MESSAGE, 409);
          form = await tx.receivingForm.update({ where: { id: current.id, version: input.version }, data: { version: { increment: 1 } } });
        } else {
          if (input.version !== 0) throw new EvidenceError(WORKFLOW_CONFLICT_MESSAGE, 409);
          form = await tx.receivingForm.create({ data: { id: input.creationId!, purchaseOrderId: po.id, kind: input.kind, version: 1 } });
        }
        const revision = await tx.receivingFormRevision.create({ data: { formId: form.id, version: form.version, payload: input.payload, createdById: auth.user.id } });
        return { documentId: form.id, revisionId: revision.id, version: form.version };
      }
      const revision = await tx.receivingFormRevision.findFirst({ where: { id: input.revisionId, form: { purchaseOrderId: po.id } }, include: { form: true } });
      if (!revision) throw new EvidenceError('This revision is unavailable for this PO.', 404);
      if (!revision.exportedAt) throw new EvidenceError('Export the saved revision before attaching its physically signed copy.', 409);
      await assertEvidenceReferences(auth.user, input.filePath);
      await readEvidence(uploadReferenceName(input.filePath)!);
      const kind = revision.form.kind === 'RR' ? 'SIGNED_RECEIVING_REPORT' : 'SIGNED_MEMORANDUM_RECEIPT';
      const saved = await tx.purchaseOrderDocument.upsert({ where: { filePath: input.filePath }, update: {}, create: { purchaseOrderId: po.id, kind, filePath: input.filePath, fileName: input.fileName, receivingFormRevisionId: revision.id, uploadedById: auth.user.id, notes: `${revision.form.kind} revision ${revision.version}. Uploader confirmed the signed copy matches this saved revision, including any Excel edits. Signatures are not automatically verified.` } });
      if (saved.purchaseOrderId !== po.id || saved.receivingFormRevisionId !== revision.id || saved.kind !== kind) throw new EvidenceError('This file is already saved against another document or revision. Upload a separate copy.', 409);
      return saved;
    });
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) { return failure(error); }
}
