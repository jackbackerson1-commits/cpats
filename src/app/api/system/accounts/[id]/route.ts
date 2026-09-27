import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { authorizeRequest } from '@/shared/rbac';
import { AccountStatusSchema } from '@/validation/account.schema';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest(request, Role.System_Administrator);
  if (!auth.success) return auth.response;
  const validation = AccountStatusSchema.safeParse(await request.json());
  if (!validation.success) return NextResponse.json({ success: false, error: 'Choose Active or Disabled.' }, { status: 422 });
  const { id } = await context.params;
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true, accountStatus: true } });
  if (!target) return NextResponse.json({ success: false, error: 'Account not found.' }, { status: 404 });
  if (target.role === Role.System_Administrator) return NextResponse.json({ success: false, error: 'System administrator accounts cannot be changed here.' }, { status: 403 });
  if (target.accountStatus === 'Pending') return NextResponse.json({ success: false, error: 'Activate or resend the invitation before changing account access.' }, { status: 409 });
  if (target.accountStatus === validation.data.status) return NextResponse.json({ success: true });

  const changed = await prisma.$transaction(async (tx) => {
    const result = await tx.user.updateMany({
      where: { id, accountStatus: target.accountStatus },
      data: { accountStatus: validation.data.status, sessionVersion: { increment: 1 } },
    });
    if (result.count !== 1) return false;
    await tx.accountManagementEvent.create({ data: {
      actorId: auth.user.id,
      targetUserId: id,
      action: validation.data.status === 'Disabled' ? 'ACCOUNT_DISABLED' : 'ACCOUNT_REENABLED',
    } });
    return true;
  });
  if (!changed) return NextResponse.json({ success: false, error: 'This account changed. Refresh the list.' }, { status: 409 });
  return NextResponse.json({ success: true });
}
