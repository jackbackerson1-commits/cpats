import { NextRequest, NextResponse } from 'next/server';
import { AccountTokenPurpose, Role } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { authorizeRequest } from '@/shared/rbac';
import { AccountLinkSchema } from '@/validation/account.schema';
import { accountBaseUrl, accountDeliveryMode, deliverAccountLink, issueAccountToken } from '@/shared/account-delivery';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest(request, Role.System_Administrator);
  if (!auth.success) return auth.response;
  const validation = AccountLinkSchema.safeParse(await request.json());
  if (!validation.success) return NextResponse.json({ success: false, error: 'Choose an invitation or password reset.' }, { status: 422 });
  let mode;
  try {
    mode = accountDeliveryMode();
    accountBaseUrl();
  } catch {
    return NextResponse.json({ success: false, error: 'Account messages are not configured.' }, { status: 503 });
  }

  const { id } = await context.params;
  const target = await prisma.user.findUnique({ where: { id }, select: { email: true, role: true, accountStatus: true, emailVerifiedAt: true } });
  if (!target) return NextResponse.json({ success: false, error: 'Account not found.' }, { status: 404 });
  if (target.role === Role.System_Administrator) return NextResponse.json({ success: false, error: 'System administrator accounts cannot be changed here.' }, { status: 403 });
  const purpose = validation.data.purpose as AccountTokenPurpose;
  if ((purpose === AccountTokenPurpose.Activation && target.accountStatus !== 'Pending') ||
      (purpose === AccountTokenPurpose.Password_Reset && target.accountStatus !== 'Active')) {
    return NextResponse.json({ success: false, error: 'This link is not available for the account’s current state.' }, { status: 409 });
  }
  if (purpose === AccountTokenPurpose.Password_Reset && mode === 'smtp' && !target.emailVerifiedAt) {
    return NextResponse.json({ success: false, error: 'The account email has not been verified for recovery.' }, { status: 409 });
  }
  const recent = await prisma.accountToken.findFirst({
    where: { userId: id, purpose, createdAt: { gte: new Date(Date.now() - 60_000) } },
    select: { id: true },
  });
  if (recent) return NextResponse.json({ success: false, error: 'Wait one minute before sending another link.' }, { status: 429 });

  try {
    const token = await issueAccountToken(id, purpose, mode);
    await prisma.accountManagementEvent.create({ data: {
      actorId: auth.user.id,
      targetUserId: id,
      action: purpose === AccountTokenPurpose.Activation ? 'ACTIVATION_RESENT' : 'ADMIN_RESET_REQUESTED',
    } });
    await deliverAccountLink(target.email, purpose, token, mode);
    return NextResponse.json({ success: true, message: mode === 'log' ? 'Link captured in the development server log.' : 'Message sent.' });
  } catch (error) {
    console.error('Account link delivery failed:', error);
    return NextResponse.json({ success: false, error: 'The link could not be delivered. Retry later.' }, { status: 503 });
  }
}
