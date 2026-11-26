import { NextRequest, NextResponse } from 'next/server';
import { AccountTokenPurpose } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { hashPassword } from '@/shared/password';
import { hashAccountToken } from '@/shared/account-delivery';
import { CompleteTokenSchema } from '@/validation/account.schema';

class InvalidAccountTokenError extends Error {}

export async function POST(request: NextRequest) {
  const validation = CompleteTokenSchema.safeParse(await request.json());
  if (!validation.success) return NextResponse.json({ success: false, error: 'Check the link and use a password of at least 16 characters.' }, { status: 422 });

  const { token, purpose, newPassword } = validation.data;
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const record = await tx.accountToken.findUnique({
        where: { tokenHash: hashAccountToken(token) },
        include: { user: true },
      });
      if (!record || record.purpose !== purpose || record.usedAt || record.expiresAt <= now) throw new InvalidAccountTokenError();
      if (purpose === AccountTokenPurpose.Activation && record.user.accountStatus !== 'Pending') throw new InvalidAccountTokenError();
      if (purpose === AccountTokenPurpose.Password_Reset && record.user.accountStatus !== 'Active') throw new InvalidAccountTokenError();

      const consumed = await tx.accountToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new InvalidAccountTokenError();

      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash: hashPassword(newPassword),
          sessionVersion: { increment: 1 },
          ...(purpose === AccountTokenPurpose.Activation ? {
            accountStatus: 'Active',
            activatedAt: now,
            ...(record.deliveredViaSmtp ? { emailVerifiedAt: now } : {}),
          } : {}),
        },
      });
      await tx.accountToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: now },
      });
      await tx.accountManagementEvent.create({ data: {
        targetUserId: record.userId,
        action: purpose === AccountTokenPurpose.Activation ? 'ACCOUNT_ACTIVATED' : 'PASSWORD_RESET_COMPLETED',
      } });
    });
    return NextResponse.json({ success: true, message: purpose === AccountTokenPurpose.Activation ? 'Account activated. Sign in with your new password.' : 'Password changed. Sign in again.' });
  } catch (error) {
    if (error instanceof InvalidAccountTokenError) {
      return NextResponse.json({ success: false, error: 'This link is invalid, expired, or already used.' }, { status: 409 });
    }
    console.error('Account token completion failed:', error);
    return NextResponse.json({ success: false, error: 'Unable to complete this account change.' }, { status: 500 });
  }
}
