import { NextRequest, NextResponse } from 'next/server';
import { AccountTokenPurpose } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { RequestResetSchema } from '@/validation/account.schema';
import { accountBaseUrl, accountDeliveryMode, deliverAccountLink, issueAccountToken } from '@/shared/account-delivery';

const GENERIC_MESSAGE = 'If this account can be recovered, reset instructions have been sent.';

export async function POST(request: NextRequest) {
  const validation = RequestResetSchema.safeParse(await request.json());
  if (!validation.success) return NextResponse.json({ success: false, error: 'Enter a valid email address.' }, { status: 422 });

  let mode;
  try {
    mode = accountDeliveryMode();
    accountBaseUrl();
  } catch {
    return NextResponse.json({ success: false, error: 'Password recovery is unavailable. Contact your institution\'s IT office.' }, { status: 503 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: validation.data.email } });
    if (user?.accountStatus === 'Active' && (user.emailVerifiedAt || mode === 'log')) {
      const recent = await prisma.accountToken.findFirst({
        where: { userId: user.id, purpose: AccountTokenPurpose.Password_Reset, createdAt: { gte: new Date(Date.now() - 60_000) } },
        select: { id: true },
      });
      if (!recent) {
        const token = await issueAccountToken(user.id, AccountTokenPurpose.Password_Reset, mode);
        await prisma.accountManagementEvent.create({ data: { targetUserId: user.id, action: 'PASSWORD_RESET_REQUESTED' } });
        try {
          await deliverAccountLink(user.email, AccountTokenPurpose.Password_Reset, token, mode);
        } catch (error) {
          console.error('Account reset delivery failed:', error);
        }
      }
    }
    return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
  } catch (error) {
    console.error('Account reset request failed:', error);
    return NextResponse.json({ success: false, error: 'Password recovery is temporarily unavailable.' }, { status: 503 });
  }
}
