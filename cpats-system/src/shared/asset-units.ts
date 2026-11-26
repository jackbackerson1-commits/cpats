import { z } from 'zod';

export const RegisterAssetUnitsSchema = z.object({
  receivingReportId: z.string().uuid(),
  lineIndex: z.number().int().min(0),
  units: z.array(z.object({
    unitNumber: z.number().int().positive(),
    serialNumber: z.string().trim().max(120).optional(),
  })).min(1).max(100),
}).superRefine(({ units }, ctx) => {
  if (new Set(units.map((u) => u.unitNumber)).size !== units.length)
    ctx.addIssue({ code: 'custom', path: ['units'], message: 'Each physical unit must have a distinct unit number.' });
  const serials = units.map((u) => u.serialNumber?.toLocaleUpperCase()).filter(Boolean);
  if (new Set(serials).size !== serials.length)
    ctx.addIssue({ code: 'custom', path: ['units'], message: 'Serial numbers must distinguish the physical units. Leave unknown serials blank.' });
});

export function assetItemLines(payload: unknown): { lineIndex: number; itemName: string; quantity: number }[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((entry, lineIndex) => {
    if (!entry || typeof entry !== 'object') return [];
    const itemName = typeof entry.itemName === 'string' ? entry.itemName.trim() : '';
    const quantity = Number(entry.quantity);
    return itemName && Number.isSafeInteger(quantity) && quantity > 0 ? [{ lineIndex, itemName, quantity }] : [];
  });
}

export function validateAssetSelection(payload: unknown, lineIndex: number, units: { unitNumber: number; serialNumber?: string }[], existing: { lineIndex: number; unitNumber: number; serialNumber: string | null }[]) {
  const line = assetItemLines(payload).find((item) => item.lineIndex === lineIndex);
  if (!line || units.some((unit) => unit.unitNumber > line.quantity)) throw new Error('UNIT_OUTSIDE_ORDER');
  if (units.some((unit) => existing.some((asset) => asset.lineIndex === lineIndex && asset.unitNumber === unit.unitNumber))) throw new Error('UNIT_ALREADY_TAGGED');
  if (units.some((unit) => unit.serialNumber && existing.some((asset) => asset.serialNumber?.toLocaleUpperCase() === unit.serialNumber?.toLocaleUpperCase()))) throw new Error('SERIAL_ALREADY_RECORDED');
  return line;
}
