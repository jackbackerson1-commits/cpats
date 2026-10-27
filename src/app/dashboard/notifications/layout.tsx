import type { ReactNode } from 'react';
import { Role } from '@prisma/client';
import { getAuthenticatedUser } from '@/shared/session';
import waves from '@/components/requesting/requester-waves.module.css';
import receivingStyles from '@/components/receiving/receiving-notifications.module.css';

export default async function NotificationsLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser();
  if (user?.role === Role.Requesting_Office || user?.role === Role.Business_Office || user?.role === Role.Admin_Office || user?.role === Role.Purchasing_Office || user?.role === Role.System_Administrator || user?.role === Role.Global_Auditor) {
    return <div className={`${waves.notificationWorkspace} ${receivingStyles.workspace}`}>{children}</div>;
  }
  if (user?.role === Role.Receiving_Custodian) {
    return <div className={receivingStyles.workspace}>{children}</div>;
  }
  return children;
}
