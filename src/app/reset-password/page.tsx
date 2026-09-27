import AccountTokenPanel from '@/components/account/AccountTokenPanel';

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <AccountTokenPanel purpose="Password_Reset" token={token} />;
}
