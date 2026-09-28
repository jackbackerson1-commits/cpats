import { createHash, randomBytes } from 'node:crypto';
import { AccountTokenPurpose } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { sendEmail } from '@/shared/email';

export type AccountDeliveryMode = 'log' | 'smtp';

export function accountDeliveryMode(): AccountDeliveryMode {
  const configured = process.env.CPATS_ACCOUNT_DELIVERY_MODE;
  if (configured === 'log' && process.env.NODE_ENV !== 'production') return 'log';
  if (configured === 'smtp' && process.env.EMAIL_DELIVERY_MODE === 'smtp') return 'smtp';
  if (!configured && process.env.NODE_ENV !== 'production') return 'log';
  throw new Error('Account message delivery is not configured.');
}

export function accountBaseUrl(): string {
  const configured = process.env.APP_BASE_URL;
  if (configured) return new URL(configured).origin;
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
  throw new Error('APP_BASE_URL is required for account messages.');
}

export function newAccountToken(): { value: string; hash: string } {
  const value = randomBytes(32).toString('base64url');
  return { value, hash: hashAccountToken(value) };
}

export function hashAccountToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function issueAccountToken(userId: string, purpose: AccountTokenPurpose, mode: AccountDeliveryMode): Promise<string> {
  const token = newAccountToken();
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.accountToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: now },
    });
    await tx.accountToken.create({ data: {
      userId,
      purpose,
      tokenHash: token.hash,
      deliveredViaSmtp: mode === 'smtp',
      expiresAt: new Date(now.getTime() + (purpose === AccountTokenPurpose.Activation ? 24 * 60 : 30) * 60_000),
    } });
  });
  return token.value;
}

export async function deliverAccountLink(email: string, purpose: AccountTokenPurpose, token: string, mode: AccountDeliveryMode): Promise<void> {
  const path = purpose === AccountTokenPurpose.Activation ? '/activate' : '/reset-password';
  const url = `${accountBaseUrl()}${path}?token=${encodeURIComponent(token)}`;
  const subject = purpose === AccountTokenPurpose.Activation ? '[CPATS] Activate your staff account' : '[CPATS] Reset your password';
  const text = purpose === AccountTokenPurpose.Activation
    ? `An account has been prepared for you in CPATS. Open this one-time link within 24 hours to set your password:\n\n${url}\n\nIf you were not expecting this, contact your institution's IT office.`
    : `A CPATS password reset was requested. Open this one-time link within 30 minutes:\n\n${url}\n\nIf you did not request it, ignore this message and contact your institution's IT office.`;
  if (mode === 'log') {
    console.info('[CPATS ACCOUNT MESSAGE - DEVELOPMENT]', { to: email, subject, text });
    return;
  }
  await sendEmail({ to: email, subject, text });
}
