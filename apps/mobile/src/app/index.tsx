import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { AuthScreen } from '@/components/auth-screen';
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
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator color={theme.colors.brandPrimary} size="large" />
      </View>
    );
  }

  if (!session) return <AuthScreen />;

  return <Redirect href="/home" />;
}
