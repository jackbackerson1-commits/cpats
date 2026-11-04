import { z } from 'zod';

export const REQUEST_ITEM_CATEGORIES = [
  'Monitors & Displays',
  'Cables & Connectors (HDMI, VGA, LAN)',
  'Desktop Computers & Laptops',
  'Peripherals (Mouse, Keyboard, Webcam)',
  'Printers, Scanners & Consumables',
  'Networking Equipment (Switches, Routers)',
  'Office Supplies & Stationery',
  'Other / Custom Item',
] as const;

// Structural limits for unfinished forms; final submission still uses CreatePRSchema.
export const RequestDraftPayloadSchema = z.object({
  items: z.array(z.object({
    category: z.string().max(200).refine((value) => REQUEST_ITEM_CATEGORIES.some((category) => category === value), 'Choose a supported item category.'),
    specs: z.string().max(20000),
    quantity: z.number().nonnegative().max(2147483647),
  })).min(1).max(200),
  justification: z.string().max(50000),
  isDirectPoBypass: z.boolean(),
  adminProofFilePath: z.string().max(2000),
  attachedFileName: z.string().max(1000).nullable(),
  attachedFileSize: z.number().int().nonnegative().nullable(),
  attachedFileIsImage: z.boolean(),
});

export type RequestDraftPayload = z.infer<typeof RequestDraftPayloadSchema>;
export const DraftIdSchema = z.string().uuid();
export const SaveRequestDraftSchema = z.object({ payload: RequestDraftPayloadSchema });
export const RemoveRequestDraftSchema = z.object({
  id: DraftIdSchema,
  version: z.number().int().positive(),
});
export const UpdateRequestDraftSchema = SaveRequestDraftSchema.extend({
  id: DraftIdSchema,
  version: z.number().int().positive(),
});
export const SubmitRequestDraftSchema = z.object({
  draftId: DraftIdSchema,
  draftVersion: z.number().int().positive(),
});
