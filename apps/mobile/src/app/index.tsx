import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

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
    <View style={styles.root}>
      <VadProductShell
        email={session.user.email ?? session.user.phone ?? 'VAD member'}
        canTrade={runtime.snapshot.capabilities.trade}
        canCreatePost={runtime.snapshot.capabilities.createPost}
        canSubmitProposal={runtime.snapshot.capabilities.submitMarketProposal}
        onSignOut={signOut}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="Open account operations" onPress={() => router.push('/account')} style={styles.accountButton}>
        <Text style={styles.accountButtonText}>Account</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: {
    alignItems: 'center',
    backgroundColor: palette.ink,
    flex: 1,
    justifyContent: 'center',
  },
  accountButton: {
    position: 'absolute',
    right: 18,
    top: 54,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.inkRaised,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  accountButtonText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '900',
  },
});
