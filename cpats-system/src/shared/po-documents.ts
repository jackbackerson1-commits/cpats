import { Role } from '@prisma/client';
import { z } from 'zod';

export const PO_DOCUMENT_KINDS = [
  'ORDER_CONFIRMATION', 'DELIVERY_RECEIPT', 'CLAIM_SLIP',
  'STATEMENT_OF_ACCOUNT', 'SIGNED_RECEIVING_REPORT', 'SIGNED_MEMORANDUM_RECEIPT',
] as const;
export type PODocumentKind = typeof PO_DOCUMENT_KINDS[number];

export const PO_DOCUMENT_LABELS: Record<PODocumentKind, string> = {
  ORDER_CONFIRMATION: 'Online checkout / order confirmation',
  DELIVERY_RECEIPT: 'Delivery receipt',
  CLAIM_SLIP: 'Claim slip',
  STATEMENT_OF_ACCOUNT: 'Statement of Account (SOA)',
  SIGNED_RECEIVING_REPORT: 'Signed Receiving Report (RR)',
  SIGNED_MEMORANDUM_RECEIPT: 'Signed Memorandum Receipt (MR)',
};

export const PO_DOCUMENT_READERS: Role[] = [Role.Purchasing_Office, Role.Receiving_Custodian,
  Role.Business_Office, Role.Admin_Office, Role.Requesting_Office, Role.Global_Auditor];
export const PO_DOCUMENT_WRITERS: Role[] = [Role.Purchasing_Office, Role.Receiving_Custodian];

export const PODocumentQuerySchema = z.object({
  poId: z.uuid(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});

export const SavePODocumentSchema = z.object({
  poId: z.uuid(),
  kind: z.enum(PO_DOCUMENT_KINDS),
  filePath: z.string().regex(/^\/uploads\/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg|gif|webp)$/i),
  fileName: z.string().trim().min(1).max(180).regex(/^[^\\/:\x00-\x1f]+$/),
  notes: z.string().trim().max(1000).default(''),
}).strict();

export interface SavedPODocument {
  id: string;
  kind: PODocumentKind;
  filePath: string;
  fileName: string;
  notes: string | null;
  createdAt: string;
  uploadedBy: { email: string; role: Role };
}
