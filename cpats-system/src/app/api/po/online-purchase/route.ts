import { NextRequest, NextResponse } from 'next/server';
import { PRStatus, Role, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/shared/prisma';
import { authorizeRequest } from '@/shared/rbac';
import { evidenceRecordScope, assertEvidenceReferences, readEvidence, uploadReferenceName, EvidenceError } from '@/shared/evidence';
import { dispatchNotificationForAuditLog } from '@/shared/notifications';
import { isWorkflowConflict, WORKFLOW_CONFLICT_MESSAGE } from '@/shared/workflow-conflict';
import { ONLINE_PURCHASE_POLICY, ONLINE_PURCHASE_ROLES, OnlinePurchaseActionSchema, onlinePurchaseTransition } from '@/shared/online-purchase';

const querySchema = z.object({ poId: z.uuid().optional(), prId: z.uuid().optional(), page: z.coerce.number().int().min(1).max(100000).default(1) });
const pageSize = 20;
const select = {
  id: true, poNumber: true, paymentType: true, purchaseMethod: true, isCheckIssued: true,
  purchaseRequest: { select: { id: true, status: true, itemsPayload: true, department: { select: { name: true, code: true } } } },
  documents: { where: { kind: 'ORDER_CONFIRMATION' }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, fileName: true, filePath: true } },
  onlinePurchase: { include: {
    quoteDocument: { select: { fileName: true, filePath: true } },
    events: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, onlinePurchaseAction: true, onlinePurchaseAmount: true, onlinePurchaseRevision: true, remarks: true, createdAt: true, actor: { select: { role: true, email: true } } } },
  } },
} satisfies Prisma.PurchaseOrderSelect;

function failure(error: unknown) {
  if (error instanceof EvidenceError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  if (isWorkflowConflict(error) || error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return NextResponse.json({ success: false, error: WORKFLOW_CONFLICT_MESSAGE }, { status: 409 });
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return NextResponse.json({ success: false, error: 'The saved evidence file is missing. Upload it again before submitting.' }, { status: 422 });
  console.error('ONLINE PURCHASE FAILURE:', error);
  return NextResponse.json({ success: false, error: 'The online purchase could not be loaded or saved. Refresh and check the latest revision before retrying.' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, ONLINE_PURCHASE_ROLES);
    if (!auth.success) return auth.response;
    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Check the PO reference and page.' }, { status: 422 });
    const scope = evidenceRecordScope(auth.user);
    if (!scope) throw new EvidenceError('This purchase order is unavailable to your account.', 403);
    const { poId, prId, page } = parsed.data;
    const submittedOrders = { onlinePurchase: { isNot: null } } satisfies Prisma.PurchaseOrderWhereInput;
    const where: Prisma.PurchaseOrderWhereInput = {
      purchaseRequest: scope,
      ...(poId ? { id: poId } : {}), ...(prId ? { purchaseRequestId: prId } : {}),
      ...(auth.user.role === Role.Purchasing_Office ? {
        OR: [
          { purchaseRequest: { status: PRStatus.Awaiting_Check_Issuance }, isCheckIssued: false, paymentType: 'CASH_CHECK',
            OR: [{ purchaseMethod: null }, { purchaseMethod: 'ONLINE_CASH' }] },
          submittedOrders,
        ],
      } : submittedOrders),
    };
    const [data, total] = await Promise.all([
      prisma.purchaseOrder.findMany({ where, select, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: pageSize, skip: (page - 1) * pageSize }),
      prisma.purchaseOrder.count({ where }),
    ]);
    return NextResponse.json({ success: true, data, total, page, pageSize, role: auth.user.role }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, ONLINE_PURCHASE_ROLES);
    if (!auth.success) return auth.response;
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: 'Submit a valid online purchase action.' }, { status: 400 }); }
    const parsed = OnlinePurchaseActionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Check the amount, evidence, notes and required check/order details.' }, { status: 422 });
    const input = parsed.data;
    const result = await prisma.$transaction(async tx => {
      const scope = evidenceRecordScope(auth.user);
      if (!scope) throw new EvidenceError('This purchase order is unavailable to your account.', 403);
      const po = await tx.purchaseOrder.findFirst({ where: { id: input.poId, purchaseRequest: scope }, include: { onlinePurchase: true, purchaseRequest: true } });
      if (!po) throw new EvidenceError('This purchase order is unavailable to your account.', 404);
      const current = po.onlinePurchase;
      if ((current?.version ?? 0) !== input.version) throw new EvidenceError(WORKFLOW_CONFLICT_MESSAGE, 409);
      if (po.purchaseRequest.status !== PRStatus.Awaiting_Check_Issuance || po.paymentType !== 'CASH_CHECK') throw new EvidenceError('Only a pending cash/check PO can use this provisional online workflow.', 409);
      if (!current && po.purchaseMethod && po.purchaseMethod !== 'ONLINE_CASH') throw new EvidenceError('Purchasing must select online cash when preparing the PO to use this workflow.', 409);
      if (current && current.policyVersion !== ONLINE_PURCHASE_POLICY.version) throw new EvidenceError('This plan uses a different provisional policy version. Ask the administrator to review it.', 409);
      let nextStage;
      try { nextStage = onlinePurchaseTransition(input.action, current?.stage ?? 'RETURNED', auth.user.role); }
      catch (error) { throw new EvidenceError(error instanceof Error ? error.message : 'Action unavailable.', 409); }
      if (!current && input.action !== 'SUBMIT') throw new EvidenceError('Purchasing must submit an online amount first.', 409);
      if (po.isCheckIssued !== (current?.stage === 'CHECK_RELEASED')) throw new EvidenceError('Check release has already changed. Refresh this order.', 409);
      if (input.action === 'SUBMIT' && current && input.notes.length < 5) throw new EvidenceError('Explain the revised amount or evidence in at least 5 characters.', 422);
      if (input.action === 'RECORD_ORDER' && Number(input.actualAmount) !== Number(current!.amount.toString())) throw new EvidenceError('The order total differs from the released check amount. Ask BO to resolve it manually before recording the order; this provisional workflow cannot authorize liquidation differences.', 409);

      let documentId = current?.quoteDocumentId;
      if (input.action === 'SUBMIT' || input.action === 'RECORD_ORDER') {
        const document = await tx.purchaseOrderDocument.findFirst({ where: { id: input.documentId, purchaseOrderId: po.id, kind: 'ORDER_CONFIRMATION' } });
        if (!document) throw new EvidenceError('Choose checkout/order evidence saved against this exact PO.', 422);
        await assertEvidenceReferences(auth.user, document.filePath);
        await readEvidence(uploadReferenceName(document.filePath)!);
        documentId = document.id;
      }
      const amount = input.action === 'SUBMIT' ? input.amount : current!.amount;
      const revision = input.action === 'SUBMIT' ? (current?.revision ?? 0) + 1 : current!.revision;
      const nextStatus = input.action === 'RECORD_ORDER' ? PRStatus.Ready_for_Purchase : PRStatus.Awaiting_Check_Issuance;
      // Claim both records so enrollment cannot race the legacy clearance path.
      await tx.purchaseOrder.update({ where: { id: po.id, updatedAt: po.updatedAt, isCheckIssued: po.isCheckIssued }, data: { updatedAt: new Date(), ...(input.action === 'RELEASE_CHECK' ? { isCheckIssued: true } : {}) } });
      await tx.purchaseRequest.update({ where: { id: po.purchaseRequestId, status: po.purchaseRequest.status, updatedAt: po.purchaseRequest.updatedAt }, data: { status: nextStatus } });
      const plan = current
        ? await tx.onlinePurchasePlan.update({ where: { id: current.id, version: input.version }, data: {
          version: { increment: 1 }, stage: nextStage, amount, revision,
          ...(input.action === 'SUBMIT' ? { quoteDocumentId: documentId } : {}),
          ...(input.action === 'RELEASE_CHECK' ? { checkNumber: input.checkNumber, payee: input.payee } : {}),
          ...(input.action === 'RECORD_ORDER' ? { orderReference: input.orderReference, orderDocumentId: documentId } : {}),
        } })
        : await tx.onlinePurchasePlan.create({ data: { purchaseOrderId: po.id, stage: nextStage, amount, initialAmount: amount, revision, quoteDocumentId: documentId!, policyVersion: ONLINE_PURCHASE_POLICY.version } });
      const details = input.action === 'RELEASE_CHECK' ? ` Check: ${input.checkNumber}. Payee: ${input.payee}.` : input.action === 'RECORD_ORDER' ? ` Order: ${input.orderReference}.` : '';
      const audit = await tx.auditLog.create({ data: {
        prId: po.purchaseRequestId, actorId: auth.user.id, previousState: po.purchaseRequest.status, newState: nextStatus,
        onlinePurchasePlanId: plan.id, onlinePurchaseAction: input.action, onlinePurchaseAmount: amount,
        onlinePurchaseRevision: revision, onlinePurchaseDocumentId: documentId,
        remarks: `Provisional online policy v${plan.policyVersion}: ${input.action}. Revision ${revision}. Amount PHP ${amount.toString()}.${details}${input.notes ? ' ' + input.notes : ''}`,
      } });
      return { plan, auditLogId: audit.id };
    });
    await dispatchNotificationForAuditLog(result.auditLogId);
    return NextResponse.json({ success: true, data: result.plan });
  } catch (error) { return failure(error); }
}
