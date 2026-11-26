// src/app/api/po/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PRStatus, Role, PaymentType } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { CreatePOSchema } from '@/validation/po.schema';
import { authorizeRequest } from '@/shared/rbac';
import crypto from 'crypto';
import { dispatchNotificationForAuditLog } from '@/shared/notifications';
import { PURCHASE_METHOD_LABELS } from '@/shared/purchase-method';
import { isWorkflowConflict, WORKFLOW_CONFLICT_MESSAGE } from '@/shared/workflow-conflict';

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, Role.Purchasing_Office);
    if (!auth.success) return auth.response;
    const activeUser = auth.user;

    const rawBody = await request.json();
    const validation = CreatePOSchema.safeParse(rawBody);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, errors: validation.error.format() },
        { status: 422 }
      );
    }

    const { purchaseRequestId, poNumber, purchaseMethod } = validation.data;

    const transactionResult = await prisma.$transaction(async (tx) => {
      const targetPR = await tx.purchaseRequest.findUnique({
        where: { id: purchaseRequestId }
      });

      if (!targetPR) {
        throw new Error("REQUISITION_NOT_FOUND");
      }

      if (targetPR.status !== PRStatus.Approved_Awaiting_PO) {
        throw new Error("INVALID_LIFECYCLE_STAGE");
      }

      const duplicatePoNumber = await tx.purchaseOrder.findUnique({
        where: { poNumber }
      });

      if (duplicatePoNumber) {
        throw new Error("DUPLICATE_PO_NUMBER_VIOLATION");
      }

      const generatedQrToken = `PO-TOKEN-${crypto.randomUUID()}`;

      // Claim the eligible request before creating its downstream order.
      await tx.purchaseRequest.update({
        where: { id: purchaseRequestId, status: PRStatus.Approved_Awaiting_PO, updatedAt: targetPR.updatedAt },
        data: { status: PRStatus.Awaiting_Check_Issuance }
      });

      const newPO = await tx.purchaseOrder.create({
        data: {
          poNumber: poNumber,
          purchaseRequestId: purchaseRequestId,
          qrCodeToken: generatedQrToken,
          purchaseMethod,
          paymentType: purchaseMethod === 'SUPPLIER_CREDIT' ? PaymentType.CREDIT_TERMS : PaymentType.CASH_CHECK,
          isCheckIssued: false
        }
      });

      const auditLog = await tx.auditLog.create({
        data: {
          prId: purchaseRequestId,
          actorId: activeUser.id,
          previousState: PRStatus.Approved_Awaiting_PO,
          newState: PRStatus.Awaiting_Check_Issuance,
          remarks: `PO ${poNumber} prepared. Purchasing selected ${PURCHASE_METHOD_LABELS[purchaseMethod]}. QR reference generated. ${purchaseMethod === 'ONLINE_CASH' ? 'Awaiting Purchasing submission of the online amount and screenshot for review.' : 'Sent to Business Office for financial clearance.'}`
        }
      });

      return { record: newPO, auditLogId: auditLog.id };
    });

    await dispatchNotificationForAuditLog(transactionResult.auditLogId);

    return NextResponse.json({ success: true, data: transactionResult.record }, { status: 201 });
  } catch (error: unknown) {
    if (isWorkflowConflict(error) || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')) return NextResponse.json({ success: false, error: WORKFLOW_CONFLICT_MESSAGE }, { status: 409 });
    if (error instanceof Error) {
      switch (error.message) {
        case "REQUISITION_NOT_FOUND":
          return NextResponse.json({ success: false, error: "The specified Purchase Request tracking entity does not exist." }, { status: 404 });
        case "INVALID_LIFECYCLE_STAGE":
          return NextResponse.json({ success: false, error: "Workflow Exception: Target request must possess an 'Approved_Awaiting_PO' status." }, { status: 409 });
        case "DUPLICATE_PO_NUMBER_VIOLATION":
          return NextResponse.json({ success: false, error: "Data Integrity Violation: The specified PO reference code is already assigned." }, { status: 400 });
        default:
          return NextResponse.json({ success: false, error: "Storage Matrix Fault: Execution failure aborted transaction." }, { status: 500 });
      }
    }
    return NextResponse.json({ success: false, error: "An unclassified runtime exception occurred." }, { status: 500 });
  }
}
