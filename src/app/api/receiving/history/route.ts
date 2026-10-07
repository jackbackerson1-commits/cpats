import { NextRequest, NextResponse } from 'next/server';
import { ConditionNote, Prisma, PRStatus, Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/shared/prisma';
import { authorizeRequest } from '@/shared/rbac';

const filters = z.object({
  q: z.string().trim().max(160).default(''),
  condition: z.enum(['', 'Good', 'Damaged']).default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  prId: z.uuid().optional(),
});
const pageSize = 20;

export async function GET(request: NextRequest) {
  const auth = await authorizeRequest(request, Role.Receiving_Custodian);
  if (!auth.success) return auth.response;
  const parsed = filters.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Check the history search, condition or request reference.' }, { status: 422 });
  const { q, condition, page, prId } = parsed.data;
  const where: Prisma.ReceivingReportWhereInput = {
    ...(condition ? { condition: condition as ConditionNote } : {}),
    ...(prId ? { purchaseOrder: { purchaseRequestId: prId } } : {}),
    ...(q ? { OR: [
      { purchaseOrder: { poNumber: { contains: q } } },
      { purchaseOrder: { purchaseRequestId: { contains: q } } },
      { purchaseOrder: { purchaseRequest: { department: { name: { contains: q } } } } },
      { purchaseOrder: { purchaseRequest: { department: { code: { contains: q } } } } },
    ] } : {}),
  };
  try {
    const [data, total] = await Promise.all([
      prisma.receivingReport.findMany({ where, skip: (page - 1) * pageSize, take: pageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: {
          id: true, condition: true, remarks: true, createdAt: true, invoiceFilePath: true, asssetImageFilePath: true,
          purchaseOrder: { select: { id: true, poNumber: true, purchaseRequest: { select: {
            id: true, status: true, justification: true, itemsPayload: true, isDirectPoBypass: true, adminProofFilePath: true,
            department: { select: { code: true, name: true } },
            auditLogs: { where: { previousState: PRStatus.Ready_for_Purchase, newState: PRStatus.Received_and_Closed },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: {
                id: true, createdAt: true, remarks: true, previousState: true, newState: true,
                actor: { select: { email: true } },
              } },
          } } } },
        } }),
      prisma.receivingReport.count({ where }),
    ]);
    return NextResponse.json({ success: true, data, total, page, pageSize }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('RECEIVING HISTORY LOAD FAILURE:', error);
    return NextResponse.json({ success: false, error: 'Receiving history could not be loaded. Please try again.' }, { status: 500 });
  }
}
