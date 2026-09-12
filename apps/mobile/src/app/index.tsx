import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AuthScreen } from '@/components/auth-screen';
import { PasswordRecoveryScreen } from '@/components/auth/password-recovery-screen';
import { PhoneVerificationScreen } from '@/components/auth/phone-verification-screen';
import { VadLogo } from '@/components/brand/vad-logo';
import { VadText } from '@/components/ui/vad-text';
import { useAuthMethods } from '@/hooks/use-auth-methods';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

const ENTRY_BOOTSTRAP_TIMEOUT_MS = 4000;
const entryBootstrapStartedAt = Date.now();

export default function IndexScreen() {
  const {
    isLoading,
    session,
    isPasswordRecovery,
    verificationPromptPending,
  } = useAuth();
  const { methods } = useAuthMethods();
  const theme = useVadTheme();
  const [bootstrapExpired, setBootstrapExpired] = useState(
    () => Date.now() - entryBootstrapStartedAt >= ENTRY_BOOTSTRAP_TIMEOUT_MS,
  );

  useEffect(() => {
    const elapsed = Date.now() - entryBootstrapStartedAt;
    const remaining = Math.max(0, ENTRY_BOOTSTRAP_TIMEOUT_MS - elapsed);
    const timeoutId = setTimeout(() => {
      setBootstrapExpired(true);
    }, remaining);

    return () => clearTimeout(timeoutId);
  }, []);

  if (isPasswordRecovery) return <PasswordRecoveryScreen />;

  // A valid session is authoritative. Optional remote configuration and a
  // stale auth-loading flag must never hold an authenticated member on the
  // splash screen. Policy enforcement continues in PolicyConsentBoundary.
  if (session) {
    if (
      methods.phoneVerification
      && verificationPromptPending
      && !session.user.phone_confirmed_at
    ) {
      return <PhoneVerificationScreen />;
    }

    return <Redirect href="/home" />;
  }

  if (isLoading && !bootstrapExpired) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.md,
          backgroundColor: theme.colors.background,
        }}
      >
        <VadLogo size={52} />
        <View style={{ alignItems: 'center', gap: 2 }}>
          <VadText variant="heading">VAD</VadText>
          <VadText variant="caption" tone="secondary">
            Getting things ready…
          </VadText>
        </View>
      </View>
    );
  }

  // If session restoration is unusually slow, return control to the sign-in
  // screen instead of leaving the app in a permanent startup state. A late
  // Supabase session event will still update AuthProvider and route to Home.
  return <AuthScreen />;
}
