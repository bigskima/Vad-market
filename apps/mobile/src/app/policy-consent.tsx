import { Redirect } from 'expo-router';

import { useAuth } from '@/providers/auth-provider';

export default function PolicyConsentRoute() {
  const { isLoading, session } = useAuth();

  if (isLoading) return null;
  if (!session) return <Redirect href="/" />;
  return <Redirect href="/home" />;
}
