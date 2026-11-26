// src/app/api/pr/queue/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Role, PRStatus, type Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { QueueFetchSchema } from '@/validation/queue.schema';
import { authorizeRequest } from '@/shared/rbac';

const financialClearanceOrders = {
  OR: [
    { purchaseMethod: null },
    { purchaseMethod: { not: 'ONLINE_CASH' } },
    { onlinePurchase: { isNot: null } },
  ],
} satisfies Prisma.PurchaseOrderWhereInput;

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, Object.values(Role));
    if (!auth.success) return auth.response;
    const activeUser = auth.user;

    const rawBody = await request.json();
    const validation = QueueFetchSchema.safeParse(rawBody);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, errors: validation.error.format() },
        { status: 422 }
      );
    }

    const { role, departmentId } = validation.data;

    if (activeUser.role !== Role.Global_Auditor && activeUser.role !== role) {
      return NextResponse.json(
        { success: false, error: `FORBIDDEN: User role '${activeUser.role}' cannot access queue for '${role}'.` },
        { status: 403 }
      );
    }

    if (role === Role.Requesting_Office &&
        activeUser.role === Role.Requesting_Office &&
        departmentId && departmentId !== activeUser.departmentId) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN: Requesting Office records are limited to your own department.' },
        { status: 403 }
      );
    }

    const targetedDepartmentId = activeUser.role === Role.Global_Auditor
      ? departmentId || activeUser.departmentId
      : activeUser.departmentId;

    switch (role) {
      case Role.Requesting_Office:
        const regionalRequests = await prisma.purchaseRequest.findMany({
          where: { departmentId: targetedDepartmentId },
          orderBy: { updatedAt: 'desc' },
          include: {
            department: { select: { code: true, name: true } },
            auditLogs: {
              orderBy: { createdAt: 'desc' },
              include: {
                actor: { select: { email: true, role: true } }
              }
            }
          }
        });
        return NextResponse.json({ success: true, data: regionalRequests }, { status: 200 });

      case Role.Business_Office:
        const businessQueue = await prisma.purchaseRequest.findMany({
          where: {
            OR: [
              { status: { in: [PRStatus.Pending_Business_Approval, PRStatus.Returned_for_Correction] } },
              { status: PRStatus.Awaiting_Check_Issuance, purchaseOrders: { some: financialClearanceOrders } },
            ],
          },
          orderBy: { createdAt: 'asc' },
          include: {
            department: { select: { code: true, name: true } },
            purchaseOrders: {
              where: financialClearanceOrders,
              select: { id: true, poNumber: true, isCheckIssued: true, paymentType: true, purchaseMethod: true, onlinePurchase: { select: { stage: true } } },
            },
            auditLogs: {
              orderBy: { createdAt: 'desc' },
              include: {
                actor: { select: { email: true, role: true } }
              }
            }
          }
        });
        return NextResponse.json({ success: true, data: businessQueue }, { status: 200 });

      case Role.Admin_Office:
        const adminQueue = await prisma.purchaseRequest.findMany({
          where: {
            OR: [
              { status: PRStatus.Pending_Admin_Approval },
              {
                status: {
                  in: [PRStatus.Returned_for_Correction, PRStatus.Declined]
                },
                auditLogs: {
                  some: {
                    actor: { role: Role.Admin_Office },
                    previousState: PRStatus.Pending_Admin_Approval,
                    newState: {
                      in: [PRStatus.Returned_for_Correction, PRStatus.Declined]
                    }
                  }
                }
              }
            ]
          },
          orderBy: { updatedAt: 'desc' },
          include: {
            department: { select: { code: true, name: true } },
            auditLogs: {
              orderBy: { createdAt: 'desc' },
              include: {
                actor: { select: { email: true, role: true } }
              }
            }
          }
        });
        return NextResponse.json({ success: true, data: adminQueue }, { status: 200 });

      case Role.Purchasing_Office:
        const [purchasingQueue, pendingOnlineCheckouts] = await Promise.all([
          prisma.purchaseRequest.findMany({
            where: { status: PRStatus.Approved_Awaiting_PO },
            orderBy: { createdAt: 'asc' },
            include: { department: { select: { code: true, name: true } }, auditLogs: { select: { createdAt: true, previousState: true, newState: true } } },
          }),
          prisma.purchaseOrder.findMany({
            where: {
              purchaseMethod: 'ONLINE_CASH', isCheckIssued: false, onlinePurchase: { is: null },
              purchaseRequest: { status: PRStatus.Awaiting_Check_Issuance },
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 5,
            select: { id: true, poNumber: true, purchaseRequestId: true, purchaseRequest: { select: { department: { select: { code: true } } } } },
          }),
        ]);
        return NextResponse.json({ success: true, data: purchasingQueue, pendingOnlineCheckouts }, { status: 200 });

      case Role.Receiving_Custodian:
        const receivingQueue = await prisma.purchaseOrder.findMany({
          where: {
            purchaseRequest: { status: PRStatus.Ready_for_Purchase },
            receivingReports: { none: {} }
          },
          orderBy: { createdAt: 'asc' },
          include: {
            purchaseRequest: {
              include: { department: { select: { code: true, name: true } }, auditLogs: { select: { createdAt: true, previousState: true, newState: true } } }
            }
          }
        });
        return NextResponse.json({ success: true, data: receivingQueue }, { status: 200 });

      default:
        return NextResponse.json(
          { success: false, error: "CRITICAL COMPLIANCE ERROR: Role parameters match outside functional data queues." },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    console.error("QUEUE ACQUISITION ENGINE CRASH:", error);
    return NextResponse.json(
      { success: false, error: "Relational data tracking node failed to resolve matching line entities." },
      { status: 500 }
    );
  }
}
