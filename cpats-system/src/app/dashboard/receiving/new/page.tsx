import { headers } from 'next/headers';
import { initialHeaderAccount } from '@/shared/header-account';
import ReceivingIntakeWorkspace from './ReceivingIntakeWorkspace';

export default async function ReceivingCustodianPage() {
  // The dashboard proxy validates this role from the current account before rendering.
  const initialRole = initialHeaderAccount(await headers())?.role ?? null;
  return <ReceivingIntakeWorkspace initialRole={initialRole} />;
}
