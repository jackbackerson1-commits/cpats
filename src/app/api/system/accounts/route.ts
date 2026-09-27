import { NextRequest, NextResponse } from 'next/server';
import { AccountTokenPurpose, Role, Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { authorizeRequest } from '@/shared/rbac';
import { accountBaseUrl, accountDeliveryMode, deliverAccountLink, newAccountToken } from '@/shared/account-delivery';
import { AccountCreateSchema } from '@/validation/account.schema';
import { hashPassword } from '@/shared/password';
import { randomBytes } from 'node:crypto';

const OPERATIONAL_DEPARTMENT: Partial<Record<Role, string>> = {
  [Role.Business_Office]: 'BFO',
  [Role.Admin_Office]: 'OVPA',
  [Role.Purchasing_Office]: 'PPO',
  [Role.Receiving_Custodian]: 'PAMU',
  [Role.Global_Auditor]: 'IAO',
};

export async function GET(request: NextRequest) {
  const auth = await authorizeRequest(request, Role.System_Administrator);
  if (!auth.success) return auth.response;
  const accounts = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, email: true, role: true, accountStatus: true, emailVerifiedAt: true, createdAt: true,
      department: { select: { id: true, code: true, name: true } },
    },
  });
  return NextResponse.json({ success: true, data: accounts });
}

export async function POST(request: NextRequest) {
  const auth = await authorizeRequest(request, Role.System_Administrator);
  if (!auth.success) return auth.response;
  const validation = AccountCreateSchema.safeParse(await request.json());
  if (!validation.success) return NextResponse.json({ success: false, error: 'Enter a valid email, role, and department.' }, { status: 422 });

  let mode;
  try {
    mode = accountDeliveryMode();
    accountBaseUrl();
  } catch {
    return NextResponse.json({ success: false, error: 'Account messages are not configured.' }, { status: 503 });
  }

  const { email, role, departmentId } = validation.data;
  const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { code: true } });
  if (!department) return NextResponse.json({ success: false, error: 'Select an existing department.' }, { status: 422 });
  const requiredCode = OPERATIONAL_DEPARTMENT[role];
  if ((requiredCode && department.code !== requiredCode) ||
      (role === Role.Requesting_Office && ['BFO', 'OVPA', 'PPO', 'PAMU', 'IAO', 'SYS'].includes(department.code))) {
    return NextResponse.json({ success: false, error: 'The selected department does not match this role.' }, { status: 422 });
  }

  const token = newAccountToken();
  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: {
        email,
        role,
        departmentId,
        accountStatus: 'Pending',
        passwordHash: hashPassword(randomBytes(32).toString('base64url')),
      } });
      await tx.accountToken.create({ data: {
        userId: created.id,
        purpose: AccountTokenPurpose.Activation,
        tokenHash: token.hash,
        deliveredViaSmtp: mode === 'smtp',
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      } });
      await tx.accountManagementEvent.create({ data: { actorId: auth.user.id, targetUserId: created.id, action: 'ACCOUNT_CREATED' } });
      return created;
    });
    try {
      await deliverAccountLink(email, AccountTokenPurpose.Activation, token.value, mode);
    } catch (error) {
      console.error('Account activation delivery failed:', error);
      return NextResponse.json({ success: true, data: { id: user.id }, warning: 'Account created, but its activation message could not be delivered. Retry the invitation.' }, { status: 201 });
    }
    return NextResponse.json({ success: true, data: { id: user.id }, message: mode === 'log' ? 'Account created. Activation link captured in the development server log.' : 'Account created. Activation message sent.' }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'An account with this email already exists.' }, { status: 409 });
    }
    console.error('Account creation failed:', error);
    return NextResponse.json({ success: false, error: 'Unable to create the account.' }, { status: 500 });
  }
}
