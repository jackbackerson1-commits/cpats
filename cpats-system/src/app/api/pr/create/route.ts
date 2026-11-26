// src/app/api/pr/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PRStatus, Role } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { CreatePRSchema } from '@/validation/pr.schema';
import { authorizeRequest } from '@/shared/rbac';
import { dispatchNotificationForAuditLog } from '@/shared/notifications';
import { SubmitRequestDraftSchema } from '@/validation/request-draft.schema';
import { assertEvidenceReferences, EvidenceError } from '@/shared/evidence';

class DraftSubmissionError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, Role.Requesting_Office);
    if (!auth.success) return auth.response;
    const activeUser = auth.user;

    const rawBody = await request.json();
    const validation = CreatePRSchema.safeParse(rawBody);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, errors: validation.error.format() },
        { status: 422 }
      );
    }

    const { justification, isDirectPoBypass, adminProofFilePath, items } = validation.data;
    await assertEvidenceReferences(activeUser, adminProofFilePath);
    const hasDraftReference = rawBody.draftId !== undefined || rawBody.draftVersion !== undefined;
    const draftValidation = hasDraftReference ? SubmitRequestDraftSchema.safeParse(rawBody) : null;
    if (draftValidation && !draftValidation.success) {
      return NextResponse.json({ success: false, error: 'A valid draft reference and saved version are required.' }, { status: 422 });
    }
    const draftReference = draftValidation?.success ? draftValidation.data : null;

    // Fast-Track Business Office & Admin Recording Workflow:
    // Requisitions with Pre-Approved Letters enter Pending_Business_Approval to guarantee an auditable digital trail
    const initialStatus = PRStatus.Pending_Business_Approval;

    const executionResult = await prisma.$transaction(async (tx) => {
      if (draftReference) {
        const scope = { id: draftReference.draftId, ownerId: activeUser.id, departmentId: activeUser.departmentId };
        const draft = await tx.requestDraft.findFirst({ where: scope });
        if (!draft) throw new DraftSubmissionError('Draft not found for your account and department.', 404);
        // A retry after a committed submission returns the same request, even with an older version.
        if (draft.submittedRequestId) {
          const record = await tx.purchaseRequest.findUnique({ where: { id: draft.submittedRequestId } });
          if (!record) throw new DraftSubmissionError('The submitted request is unavailable.', 409);
          return { record, auditLogId: null, replayed: true };
        }
        const claimed = await tx.requestDraft.updateMany({
          where: { ...scope, version: draftReference.draftVersion, submittedAt: null },
          data: { version: { increment: 1 } },
        });
        if (!claimed.count) throw new DraftSubmissionError('This draft changed in another session or was submitted. Your edits are still in this form. Reopen the saved draft before continuing.', 409);
      }
      const newPR = await tx.purchaseRequest.create({
        data: {
          departmentId: activeUser.departmentId,
          creatorId: activeUser.id,
          justification: justification,
          isDirectPoBypass: isDirectPoBypass,
          adminProofFilePath: isDirectPoBypass ? adminProofFilePath : null,
          status: initialStatus,
          itemsPayload: items,
        },
      });

      const auditLog = await tx.auditLog.create({
        data: {
          prId: newPR.id,
          actorId: activeUser.id,
          previousState: null,
          newState: initialStatus,
          remarks: isDirectPoBypass
            ? `Requisition initialized with Executive Pre-Approved Letter attached [${adminProofFilePath}]. Dispatched to Business Office for fast-track fiscal recording and audit logging.`
            : "Purchase request created and submitted to Business Office for evaluation.",
        },
      });

      if (draftReference) {
        await tx.requestDraft.update({
          where: { id: draftReference.draftId },
          data: { submittedRequestId: newPR.id, submittedAt: new Date() },
        });
      }
      return { record: newPR, auditLogId: auditLog.id, replayed: false };
    });

    if (executionResult.auditLogId) await dispatchNotificationForAuditLog(executionResult.auditLogId);

    return NextResponse.json({ success: true, data: executionResult.record, ...(draftReference ? { replayed: executionResult.replayed } : {}) }, { status: executionResult.replayed ? 200 : 201 });
  } catch (error: unknown) {
    if (error instanceof EvidenceError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof DraftSubmissionError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error("CRITICAL BACKEND FAILURE:", error);
    return NextResponse.json({ success: false, error: "Internal Server Execution Failure" }, { status: 500 });
  }
}
