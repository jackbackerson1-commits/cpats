import type { ReactNode } from 'react';
import { Role } from '@prisma/client';
import { getAuthenticatedUser } from '@/shared/session';
import waves from '@/components/requesting/requester-waves.module.css';

export default async function AssetsLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser();
  if (user?.role !== Role.Purchasing_Office && user?.role !== Role.Global_Auditor && user?.role !== Role.Receiving_Custodian) return children;

  return <div className={waves.assetWorkspace}>{children}</div>;
}
