import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/shared/prisma';
import { authorizeRequest } from '@/shared/rbac';
import { evidenceRecordScope, EvidenceError } from '@/shared/evidence';
import { PO_DOCUMENT_READERS } from '@/shared/po-documents';
import { FormPayloadSchema, type FormKind } from '@/shared/receiving-forms';
import { exportReceivingForm } from '@/shared/receiving-form-excel';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, PO_DOCUMENT_READERS);
    if (!auth.success) return auth.response;
    const id = z.uuid().safeParse(request.nextUrl.searchParams.get('revisionId'));
    if (!id.success) throw new EvidenceError('Choose a saved document revision.', 422);
    const copies = request.nextUrl.searchParams.get('copies');
    if (copies !== null && copies !== '2' && copies !== '3') throw new EvidenceError('Choose two or three print copies.', 422);
    const scope = evidenceRecordScope(auth.user);
    if (!scope) throw new EvidenceError('Receiving document access is unavailable.', 403);
    const revision = await prisma.receivingFormRevision.findFirst({ where: { id: id.data, form: { purchaseOrder: { purchaseRequest: scope } } }, include: { form: true } });
    if (!revision) throw new EvidenceError('This revision is unavailable to your account.', 404);
    if (!['RR', 'MR'].includes(revision.form.kind)) throw new EvidenceError('This document type cannot be exported.', 422);
    const payload = FormPayloadSchema.safeParse(revision.payload);
    if (!payload.success) throw new EvidenceError('This saved draft cannot be exported. Review its fields in a new revision.', 422);
    const bytes = await exportReceivingForm(revision.form.kind as FormKind, payload.data, { id: revision.form.id, version: revision.version, copies: copies === '3' ? 3 : 2 });
    // First export metadata is independent of procurement and saved document content.
    await prisma.receivingFormRevision.updateMany({ where: { id: revision.id, exportedAt: null }, data: { exportedAt: new Date(), exportedById: auth.user.id } });
    const suffix = copies === '3' ? '-3-copies' : '';
    return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${revision.form.kind}-${revision.form.id}-v${revision.version}${suffix}.xlsx"`, 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof EvidenceError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('RECEIVING FORM EXPORT FAILURE:', error);
    return NextResponse.json({ success: false, error: 'The Excel export failed. Your saved revision is retained; please retry.' }, { status: 500 });
  }
}
