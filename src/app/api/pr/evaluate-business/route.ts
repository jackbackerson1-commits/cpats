import { NextRequest, NextResponse } from 'next/server';
import { PRStatus, Role } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { BusinessEvaluationSchema } from '@/validation/business.schema';
import { authorizeRequest } from '@/shared/rbac';
import { dispatchNotificationForAuditLog } from '@/shared/notifications';
import { isWorkflowConflict, WORKFLOW_CONFLICT_MESSAGE } from '@/shared/workflow-conflict';

class StaleAdminReturnError extends Error {}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, Role.Business_Office);
    if (!auth.success) return auth.response;
    const activeUser = auth.user;

    const rawBody = await request.json();
    const validation = BusinessEvaluationSchema.safeParse(rawBody);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, errors: validation.error.format() },
        { status: 422 }
      );
    }

    const { prId, action, remarks, necessityVerified, budgetAvailable } = validation.data;

    const currentPR = await prisma.purchaseRequest.findUnique({
      where: { id: prId },
      select: { id: true, status: true, updatedAt: true }
    });

    if (!currentPR) {
      return NextResponse.json(
        { success: false, error: "NOT FOUND: Target purchase request could not be located." },
        { status: 404 }
      );
    }

    if (currentPR.status !== PRStatus.Pending_Business_Approval) {
      return NextResponse.json(
        { success: false, error: `INVALID OPERATION STATE: Target request is currently in '${currentPR.status}' status.` },
        { status: 400 }
      );
    }

    let nextState: PRStatus;
    if (action === 'APPROVE') {
      nextState = PRStatus.Pending_Admin_Approval;
    } else if (action === 'DECLINE') {
      nextState = PRStatus.Declined;
    } else {
      nextState = PRStatus.Returned_for_Correction;
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
      const updatedRequest = await tx.purchaseRequest.update({
        where: { id: prId, status: PRStatus.Pending_Business_Approval, updatedAt: currentPR.updatedAt },
        data: { status: nextState }
      });

      const auditLog = await tx.auditLog.create({
        data: {
          prId: prId,
          actorId: activeUser.id,
          previousState: currentPR.status,
          newState: nextState,
          remarks: remarks,
          businessNecessityVerified: necessityVerified ?? null,
          businessBudgetAvailable: budgetAvailable ?? null,
        }
      });

      return { record: updatedRequest, auditLogId: auditLog.id };
    });

    await dispatchNotificationForAuditLog(transactionResult.auditLogId);

    return NextResponse.json({ success: true, data: transactionResult.record }, { status: 200 });
  } catch (error: unknown) {
    if (isWorkflowConflict(error)) return NextResponse.json({ success: false, error: WORKFLOW_CONFLICT_MESSAGE }, { status: 409 });
    console.error("CRITICAL REQUISITION EVALUATION FAILURE:", error);
    return NextResponse.json({ success: false, error: "Critical Execution Fault during state mutation." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, Role.Business_Office);
    if (!auth.success) return auth.response;
    const validation = BusinessEvaluationSchema.safeParse(await request.json());
    if (!validation.success) return NextResponse.json({ success: false, errors: validation.error.format() }, { status: 422 });
    const { prId, action, remarks, necessityVerified, budgetAvailable } = validation.data;
    if (action !== 'APPROVE') {
      return NextResponse.json({ success: false, error: 'Returned Admin requests can only be revised and sent back for approval.' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const record = await tx.purchaseRequest.findUnique({
        where: { id: prId },
        select: {
          status: true,
          updatedAt: true,
          auditLogs: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { previousState: true, newState: true, actor: { select: { role: true } } },
          },
        },
      });
      if (!record) return null;
      const latest = record.auditLogs[0];
      if (record.status !== PRStatus.Returned_for_Correction ||
          latest?.actor.role !== Role.Admin_Office ||
          latest.previousState !== PRStatus.Pending_Admin_Approval ||
          latest.newState !== PRStatus.Returned_for_Correction) throw new StaleAdminReturnError();

      const update = await tx.purchaseRequest.updateMany({
        where: { id: prId, status: PRStatus.Returned_for_Correction, updatedAt: record.updatedAt },
        data: { status: PRStatus.Pending_Admin_Approval },
      });
      if (update.count !== 1) throw new StaleAdminReturnError();
      const auditLog = await tx.auditLog.create({
        data: {
          prId,
          actorId: auth.user.id,
          previousState: PRStatus.Returned_for_Correction,
          newState: PRStatus.Pending_Admin_Approval,
          remarks,
          businessNecessityVerified: necessityVerified ?? null,
          businessBudgetAvailable: budgetAvailable ?? null,
        },
      });
      return { auditLogId: auditLog.id };
    });
    if (!result) return NextResponse.json({ success: false, error: 'Request not found.' }, { status: 404 });
    await dispatchNotificationForAuditLog(result.auditLogId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (isWorkflowConflict(error)) return NextResponse.json({ success: false, error: WORKFLOW_CONFLICT_MESSAGE }, { status: 409 });
    if (error instanceof StaleAdminReturnError) {
      return NextResponse.json({ success: false, error: 'This Admin return is no longer available for Business Office revision. Refresh the workspace.' }, { status: 409 });
    }
    console.error('BUSINESS REVISION FAILURE:', error);
    return NextResponse.json({ success: false, error: 'Unable to resubmit the revised evaluation.' }, { status: 500 });
  }
}
