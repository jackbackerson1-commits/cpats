import LoginForm from './LoginForm';

const LOGIN_ERRORS = {
  invalid: 'Enter a valid institutional email and password.',
  rejected: 'Invalid email or password.',
  unavailable: 'Sign-in is temporarily unavailable. Please try again.',
};

export default async function InstitutionalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ signInError?: string | string[] }>;
}) {
  const { signInError } = await searchParams;
  const initialError = signInError === 'invalid' || signInError === 'rejected' || signInError === 'unavailable'
    ? LOGIN_ERRORS[signInError]
    : null;

  return <LoginForm initialError={initialError} />;
}
