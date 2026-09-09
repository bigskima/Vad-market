import { ActivityIndicator, View } from 'react-native';

import { AuthScreen } from '@/components/auth-screen';
import { ProductShell } from '@/features/navigation/product-shell';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function IndexScreen() {
  const { isLoading, session, signOut } = useAuth();
  const runtime = useRuntimeCapabilities(session);
  const theme = useVadTheme();

  if (isLoading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}><ActivityIndicator color={theme.colors.brandPrimary} size="large" /></View>;
  }

  if (!session) return <AuthScreen />;

  return <ProductShell
    email={session.user.email ?? session.user.phone ?? 'VAD member'}
    canTrade={runtime.snapshot.capabilities.trade}
    canCreatePost={runtime.snapshot.capabilities.createPost}
    canSubmitProposal={runtime.snapshot.capabilities.submitMarketProposal}
    onSignOut={signOut}
  />;
}
