import { z } from 'zod';

export const FORM_KINDS = ['RR', 'MR'] as const;
export type FormKind = typeof FORM_KINDS[number];
const text = (max = 180) => z.string().trim().max(max);
const decimal = z.string().regex(/^(?:|(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?)$/);
export function receivingLineTotal(quantity: string, unitCost: string): string {
  if (!quantity || !unitCost || !decimal.safeParse(quantity).success || !decimal.safeParse(unitCost).success) return '';
  const scaled = (value: string) => { const [whole, fraction = ''] = value.split('.'); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')); };
  const cents = (scaled(quantity) * scaled(unitCost) + 50n) / 100n;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
export const FormItemSchema = z.object({ quantity: decimal, unit: text(30), description: text(600), invoiceQuantity: decimal, receivedQuantity: decimal, unitCost: decimal, remarks: text(240) }).strict();
export const FormPayloadSchema = z.object({
  supplier: text(), employee: text(), designation: text(), department: text(),
  number: text(60), date: z.string().refine(value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value),
  poReference: text(100), rivReference: text(100), preparedBy: text(), receivedBy: text(), centralOfficer: text(), issuedBy: text(), administrator: text(),
  classification: z.enum(['UNCONFIRMED', 'CONSUMABLE', 'PROPERTY']), classificationNotes: text(500),
  items: z.array(FormItemSchema).min(1).max(100),
}).strict().superRefine((payload, ctx) => {
  payload.items.forEach((item, index) => {
    if ([item.quantity, item.receivedQuantity].some(quantity => Number(receivingLineTotal(quantity, item.unitCost)) >= 1e12)) ctx.addIssue({ code: 'custom', path: ['items', index, 'unitCost'], message: 'Each line total must be below PHP 1 trillion.' });
  });
});
export type FormPayload = z.infer<typeof FormPayloadSchema>;
export const blankFormItem = (): FormPayload['items'][number] => ({ quantity: '', unit: '', description: '', invoiceQuantity: '', receivedQuantity: '', unitCost: '', remarks: '' });
export function blankReceivingForm(): FormPayload {
  return { supplier: '', employee: '', designation: '', department: '', number: '', date: '', poReference: '', rivReference: '', preparedBy: '', receivedBy: '', centralOfficer: '', issuedBy: '', administrator: '', classification: 'UNCONFIRMED', classificationNotes: '', items: [blankFormItem()] };
}
export interface FormSource { poNumber: string; paymentType: string; purchaseRequest: { department: { name: string }; itemsPayload: unknown } }
export function prefillReceivingForm(kind: FormKind, source: FormSource): FormPayload {
  const payload = blankReceivingForm();
  payload.poReference = source.poNumber; payload.department = source.purchaseRequest.department.name;
  if (Array.isArray(source.purchaseRequest.itemsPayload) && source.purchaseRequest.itemsPayload.length > 100) throw new Error('This PO has more than 100 item lines. Prepare separate documents manually so no item is omitted.');
  if (Array.isArray(source.purchaseRequest.itemsPayload)) payload.items = source.purchaseRequest.itemsPayload.map(value => {
    const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return { ...blankFormItem(), description: [item.itemName, item.specifications].filter(value => typeof value === 'string' && value).join(' — '), quantity: kind === 'RR' && typeof item.quantity === 'number' && item.quantity > 0 ? String(item.quantity) : '', unitCost: source.paymentType !== 'CREDIT_TERMS' && typeof item.unitPrice === 'number' && item.unitPrice > 0 ? String(item.unitPrice) : '' };
  });
  if (!payload.items.length) payload.items = [blankFormItem()];
  return payload;
}
export const FormActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('SAVE'), poId: z.uuid(), documentId: z.uuid().optional(), creationId: z.uuid().optional(), version: z.number().int().nonnegative(), kind: z.enum(FORM_KINDS), payload: FormPayloadSchema }).strict(),
  z.object({ action: z.literal('ATTACH'), poId: z.uuid(), revisionId: z.uuid(), filePath: z.string().regex(/^\/uploads\/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg|gif|webp)$/i), fileName: z.string().trim().min(1).max(180).regex(/^[^\\/:\x00-\x1f]+$/), reconciled: z.literal(true) }).strict(),
]).refine(value => value.action !== 'SAVE' || Boolean(value.documentId) !== Boolean(value.creationId), 'Choose an existing document or provide a unique creation reference.');
export interface FormRevisionView { id: string; version: number; payload: FormPayload; createdAt: string; createdBy: { email: string }; exportedAt: string | null; signedCopies: { id: string; filePath: string; fileName: string; createdAt: string; uploadedBy: { email: string } }[] }
export interface FormDocumentView { id: string; kind: FormKind; version: number; revisions: FormRevisionView[] }
