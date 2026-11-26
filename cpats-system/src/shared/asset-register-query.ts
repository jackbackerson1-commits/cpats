import { z } from 'zod';
import type { Prisma } from '@prisma/client';

export const AssetRegisterQuery = z.object({
  q: z.string().trim().max(160).default(''),
  poId: z.union([z.uuid(), z.literal('')]).default(''),
  department: z.string().trim().max(80).default(''),
  condition: z.enum(['', 'Good', 'Damaged']).default(''),
  sort: z.enum(['recent', 'po', 'item']).default('recent'),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().refine(n => [10, 25, 100].includes(n)).default(100),
  ids: z.array(z.uuid()).max(100).optional(),
});

export function assetRegisterWhere(query: z.infer<typeof AssetRegisterQuery>): Prisma.AssetUnitWhereInput {
  return {
    ...(query.ids ? { id: { in: query.ids } } : {}),
    ...(query.poId ? { purchaseOrderId: query.poId } : {}),
    ...(query.department ? { purchaseOrder: { purchaseRequest: { department: { code: query.department } } } } : {}),
    ...(query.condition ? { receivingReport: { condition: query.condition } } : {}),
    ...(query.q ? { OR: [
      { assetTag: { contains: query.q } }, { qrCodeToken: { equals: query.q } }, { serialNumber: { contains: query.q } },
      { itemName: { contains: query.q } }, { purchaseOrder: { poNumber: { contains: query.q } } },
    ] } : {}),
  };
}

export function assetRegisterOrder(sort: z.infer<typeof AssetRegisterQuery>['sort']): Prisma.AssetUnitOrderByWithRelationInput[] {
  const unitOrder: Prisma.AssetUnitOrderByWithRelationInput[] = [{ purchaseOrder: { poNumber: 'asc' } }, { lineIndex: 'asc' }, { unitNumber: 'asc' }, { id: 'asc' }];
  return sort === 'po' ? unitOrder : sort === 'item' ? [{ itemName: 'asc' }, ...unitOrder] : [{ createdAt: 'desc' }, { id: 'desc' }];
}
