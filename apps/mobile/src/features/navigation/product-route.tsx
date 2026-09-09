import { Redirect, router } from 'expo-router';
import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { ProductTabBar, type ProductTab } from './product-tab-bar';
import { ProductTopBar } from './product-top-bar';

type Props = {
  active: ProductTab;
  children: ReactNode;
  allowCreate?: boolean;
};

export function ProductRoute({ active, children, allowCreate = false }: Props) {
  const theme = useVadTheme();
  const { isLoading, session } = useAuth();
  const data = useProductDataContext();
  const runtime = useRuntimeCapabilities(session);

  if (!isLoading && !session) return <Redirect href="/" />;

  if (isLoading || data.loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          paddingTop: 72,
          paddingHorizontal: theme.spacing.lg,
          gap: theme.spacing.lg,
        }}
      >
        <VadSkeleton width={110} height={22} />
        <VadSkeleton height={110} radius={theme.radius.xl} />
        <VadSkeleton width="62%" height={26} />
        <VadSkeleton height={96} radius={theme.radius.lg} />
        <VadSkeleton height={96} radius={theme.radius.lg} />
      </View>
    );
  }

  if (!session) return <Redirect href="/" />;

  const navigate = (tab: ProductTab) => {
    const route =
      tab === 'Home'
        ? '/home'
        : tab === 'Markets'
          ? '/markets'
          : tab === 'Wallet'
            ? '/wallet'
            : tab === 'Portfolio'
              ? '/portfolio'
              : '/account';

    router.replace(route);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ProductTopBar
        active={active}
        email={session.user.email ?? session.user.phone ?? 'VAD member'}
        isAdmin={Boolean(data.adminSummary)}
        canCreate={allowCreate && runtime.snapshot.capabilities.submitMarketProposal}
        onCreate={() => router.push('/create-market')}
        onAdmin={() => router.push('/admin')}
        onAccount={() => router.replace('/account')}
      />

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={data.refreshing}
            onRefresh={data.refresh}
            tintColor={theme.colors.brandPrimary}
            colors={[theme.colors.brandPrimary]}
          />
        }
        contentContainerStyle={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: 1120,
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.lg,
          paddingBottom: theme.spacing.xxxl,
          gap: theme.spacing.lg,
        }}
      >
        {data.error ? <VadErrorState message={data.error} onRetry={() => void data.load()} /> : null}
        {children}
      </ScrollView>

      <ProductTabBar active={active} onChange={navigate} />
    </View>
  );
}
