import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { VadLogo } from '@/components/brand/vad-logo';
import { AuthScreen } from '@/components/auth-screen';
import { VadText } from '@/components/ui/vad-text';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function IndexScreen() {
  const { isLoading, session } = useAuth();
  const theme = useVadTheme();

  if (isLoading) {
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
            Preparing your workspace…
          </VadText>
        </View>
      </View>
    );
  }

  if (!session) return <AuthScreen />;

  return <Redirect href="/home" />;
}
