import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AuthScreen } from '@/components/auth-screen';
import { VadProductShell } from '@/components/vad-product-shell';
import { palette } from '@/constants/palette';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';

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
    <VadProductShell
      email={session.user.email ?? session.user.phone ?? 'VAD member'}
      canTrade={runtime.snapshot.capabilities.trade}
      canCreatePost={runtime.snapshot.capabilities.createPost}
      canSubmitProposal={runtime.snapshot.capabilities.submitMarketProposal}
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
