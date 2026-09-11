import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { AuthScreen } from '@/components/auth-screen';
import { PasswordRecoveryScreen } from '@/components/auth/password-recovery-screen';
import { PhoneVerificationScreen } from '@/components/auth/phone-verification-screen';
import { VadLogo } from '@/components/brand/vad-logo';
import { VadText } from '@/components/ui/vad-text';
import { useAuthMethods } from '@/hooks/use-auth-methods';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function IndexScreen() {
  const {
    isLoading,
    session,
    isPasswordRecovery,
    verificationPromptPending,
  } = useAuth();
  const { methods, loading: authMethodsLoading } = useAuthMethods();
  const theme = useVadTheme();

  if (isLoading || (Boolean(session) && authMethodsLoading)) {
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

  if (isPasswordRecovery) return <PasswordRecoveryScreen />;
  if (!session) return <AuthScreen />;
  if (
    methods.phoneVerification
    && verificationPromptPending
    && !session.user.phone_confirmed_at
  ) {
    return <PhoneVerificationScreen />;
  }

  return <Redirect href="/home" />;
}
