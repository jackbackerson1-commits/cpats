import AccountTokenPanel from '@/components/account/AccountTokenPanel';

export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <AccountTokenPanel purpose="Activation" token={token} />;
}
