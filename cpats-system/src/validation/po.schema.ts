// src/validation/po.schema.ts
import { z } from 'zod';
import { PURCHASE_METHODS } from '../shared/purchase-method';

export const CreatePOSchema = z.object({
  purchaseRequestId: z.string().uuid({
    message: "Audit Exception: Purchase Request reference pointer must be a valid UUIDv4 layout."
  }),
  poNumber: z.string().min(5, {
    message: "Format Discrepancy: Purchase Order numbers must contain a descriptive sequence of at least 5 characters."
  }),
  purchaseMethod: z.enum(PURCHASE_METHODS, { message: 'Choose a payment method for this purchase order.' }),
});

export type CreatePOInput = z.infer<typeof CreatePOSchema>;
