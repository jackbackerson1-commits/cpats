import { redirect } from 'next/navigation';
import { Role } from '@prisma/client';
import { getAuthenticatedUser } from '@/shared/session';
import { getWorkflowGuide } from '@/shared/workflow-guide';
import WorkflowGuide from '@/components/ui/WorkflowGuide';

export default async function HelpPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/login');
  const waveBackground = user.role === Role.Requesting_Office ||
    user.role === Role.Business_Office || user.role === Role.Admin_Office ||
    user.role === Role.Purchasing_Office || user.role === Role.Global_Auditor ||
    user.role === Role.System_Administrator || user.role === Role.Receiving_Custodian;
  return <WorkflowGuide guide={getWorkflowGuide(user.role)} waveBackground={waveBackground} waveAccent={user.role === Role.Receiving_Custodian} compact={user.role === Role.System_Administrator || user.role === Role.Global_Auditor || user.role === Role.Receiving_Custodian || user.role === Role.Admin_Office || user.role === Role.Business_Office || user.role === Role.Requesting_Office || user.role === Role.Purchasing_Office} />;
}
