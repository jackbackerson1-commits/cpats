import type { PurchaseMethod } from '@prisma/client';

export const PURCHASE_METHODS = ['LOCAL_CASH', 'ONLINE_CASH', 'SUPPLIER_CREDIT'] as const;

export const PURCHASE_METHOD_LABELS: Record<PurchaseMethod, string> = {
  LOCAL_CASH: 'Local cash / check',
  ONLINE_CASH: 'Online cash / check',
  SUPPLIER_CREDIT: 'Supplier credit',
};
