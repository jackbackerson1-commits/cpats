import { Role, type PurchaseMethod } from '@prisma/client';
import { z } from 'zod';

export const ONLINE_PURCHASE_POLICY = { version: 1, title: 'Provisional online cash workflow' } as const;
export const ONLINE_PURCHASE_ROLES: Role[] = [Role.Purchasing_Office, Role.Business_Office, Role.Admin_Office];
export const ONLINE_PURCHASE_STAGES = ['AWAITING_BO', 'AWAITING_ADMIN', 'AUTHORIZED', 'RETURNED', 'CHECK_RELEASED', 'ORDERED'] as const;
export type OnlinePurchaseStage = typeof ONLINE_PURCHASE_STAGES[number];
export const ONLINE_PURCHASE_STAGE_LABELS: Record<OnlinePurchaseStage, string> = {
  AWAITING_BO: 'Awaiting BO review', AWAITING_ADMIN: 'Awaiting Admin approval', AUTHORIZED: 'Approved for check release',
  RETURNED: 'Returned to Purchasing', CHECK_RELEASED: 'Check released · Purchasing to order', ORDERED: 'Order recorded · ready for Receiving',
};

const base = { poId: z.uuid(), version: z.number().int().nonnegative(), notes: z.string().trim().max(1000).default('') };
const amountSchema = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/).refine(value => Number(value) > 0);
export const OnlinePurchaseActionSchema = z.discriminatedUnion('action', [
  z.object({ ...base, action: z.literal('SUBMIT'), amount: amountSchema, documentId: z.uuid() }).strict(),
  z.object({ ...base, action: z.literal('BO_APPROVE') }).strict(),
  z.object({ ...base, action: z.literal('BO_RETURN'), notes: z.string().trim().min(5).max(1000) }).strict(),
  z.object({ ...base, action: z.literal('ADMIN_APPROVE') }).strict(),
  z.object({ ...base, action: z.literal('ADMIN_RETURN'), notes: z.string().trim().min(5).max(1000) }).strict(),
  z.object({ ...base, action: z.literal('RELEASE_CHECK'), checkNumber: z.string().trim().min(4).max(100), payee: z.string().trim().min(2).max(180) }).strict(),
  z.object({ ...base, action: z.literal('RECORD_ORDER'), orderReference: z.string().trim().min(3).max(180), actualAmount: amountSchema, documentId: z.uuid() }).strict(),
]);
export type OnlinePurchaseAction = z.infer<typeof OnlinePurchaseActionSchema>;

const transitions = {
  BO_APPROVE: { role: Role.Business_Office, from: 'AWAITING_BO', to: 'AWAITING_ADMIN' },
  BO_RETURN: { role: Role.Business_Office, from: 'AWAITING_BO', to: 'RETURNED' },
  ADMIN_APPROVE: { role: Role.Admin_Office, from: 'AWAITING_ADMIN', to: 'AUTHORIZED' },
  ADMIN_RETURN: { role: Role.Admin_Office, from: 'AWAITING_ADMIN', to: 'RETURNED' },
  RELEASE_CHECK: { role: Role.Business_Office, from: 'AUTHORIZED', to: 'CHECK_RELEASED' },
  RECORD_ORDER: { role: Role.Purchasing_Office, from: 'CHECK_RELEASED', to: 'ORDERED' },
} as const;

export function onlinePurchaseTransition(action: OnlinePurchaseAction['action'], stage: string, role: Role): OnlinePurchaseStage {
  if (action === 'SUBMIT') {
    if (role === Role.Purchasing_Office && ['AWAITING_BO', 'AWAITING_ADMIN', 'AUTHORIZED', 'RETURNED'].includes(stage)) return 'AWAITING_BO';
  } else {
    const rule = transitions[action];
    if (rule.role === role && rule.from === stage) return rule.to;
  }
  throw new Error('This action is unavailable at the current online purchase stage. Refresh and check the latest revision.');
}

type Notice = { role: Role; title: string; actionPath: string; description: string };
export function onlinePurchaseNotice(action: string | null | undefined): Notice | undefined {
  const descriptions: Record<OnlinePurchaseAction['action'], [Role, string, string]> = {
    SUBMIT: [Role.Business_Office, 'Online purchase amount submitted', 'Purchasing submitted an online cash purchase amount for provisional BO review.'],
    BO_APPROVE: [Role.Admin_Office, 'Online purchase awaiting Admin approval', 'Business Office reviewed the online amount and forwarded that revision to Admin.'],
    BO_RETURN: [Role.Purchasing_Office, 'BO returned the online purchase amount', 'Business Office returned the online purchase revision to Purchasing with feedback.'],
    ADMIN_APPROVE: [Role.Business_Office, 'Online purchase approved for check release', 'Admin authorized the online purchase revision for BO check release.'],
    ADMIN_RETURN: [Role.Purchasing_Office, 'Admin returned the online purchase amount', 'Admin returned the online purchase revision to Purchasing with feedback.'],
    RELEASE_CHECK: [Role.Purchasing_Office, 'Online check release recorded', 'Business Office recorded check release for the approved online amount. Purchasing must now record ordering.'],
    RECORD_ORDER: [Role.Receiving_Custodian, 'Online order ready for receiving', 'Purchasing recorded the online order after check release. Receiving can now inspect its delivery.'],
  };
  if (!action || !Object.hasOwn(descriptions, action)) return undefined;
  const [role, title, description] = descriptions[action as OnlinePurchaseAction['action']];
  return { role, title, description, actionPath: role === Role.Receiving_Custodian ? '/dashboard/receiving/new' : '/dashboard/po/online' };
}

export interface OnlinePurchaseRecord {
  id: string; poNumber: string; paymentType: string; purchaseMethod?: PurchaseMethod | null; isCheckIssued: boolean;
  purchaseRequest: { id: string; status: string; itemsPayload?: unknown; department: { name: string; code: string } };
  documents: { id: string; fileName: string; filePath: string }[];
  onlinePurchase: null | {
    id: string; policyVersion: number; version: number; revision: number; stage: OnlinePurchaseStage;
    amount: string; initialAmount: string; checkNumber: string | null; payee: string | null; orderReference: string | null;
    quoteDocumentId: string; quoteDocument: { fileName: string; filePath: string };
    events: { id: string; onlinePurchaseAction: string; onlinePurchaseAmount: string; onlinePurchaseRevision: number; remarks: string; createdAt: string; actor: { role: Role; email: string } }[];
  };
}
