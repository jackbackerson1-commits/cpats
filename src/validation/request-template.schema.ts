import { z } from 'zod';
import { RequestDraftPayloadSchema, type RequestDraftPayload } from './request-draft.schema';

export const RequestTemplatePayloadSchema = z.object({
  items: RequestDraftPayloadSchema.shape.items.refine(items => items.every(item => item.specs.trim().length > 0 && Number.isInteger(item.quantity) && item.quantity > 0), 'Give each template item specifications and a positive whole quantity.'),
  justification: RequestDraftPayloadSchema.shape.justification,
}).strict();
export type RequestTemplatePayload = z.infer<typeof RequestTemplatePayloadSchema>;
export const SaveRequestTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  payload: RequestTemplatePayloadSchema,
}).strict();
export const RemoveRequestTemplateSchema = z.object({ id: z.string().uuid(), version: z.number().int().positive() }).strict();

export function templateToNewDraft(payload: RequestTemplatePayload): RequestDraftPayload {
  return {
    items: payload.items.map(item => ({ ...item })), justification: payload.justification,
    isDirectPoBypass: false, adminProofFilePath: '', attachedFileName: null,
    attachedFileSize: null, attachedFileIsImage: false,
  };
}
