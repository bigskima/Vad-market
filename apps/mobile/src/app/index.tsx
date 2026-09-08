import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AuthScreen } from '@/components/auth-screen';
import { FoundationHome } from '@/components/foundation-home';
import { palette } from '@/constants/palette';
import { useAuth } from '@/providers/auth-provider';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';

export default function IndexScreen() {
  const { isLoading, session, signOut } = useAuth();
  const runtime = useRuntimeCapabilities(session);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.signal} size="large" />
      </View>
    );
  }

  if (!session) return <AuthScreen />;

  return (
    <FoundationHome
      email={session.user.email ?? session.user.phone ?? 'VAD member'}
      runtime={runtime}
      onRefresh={runtime.refresh}
      onSignOut={signOut}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    backgroundColor: palette.ink,
    flex: 1,
    justifyContent: 'center',
  },
});
