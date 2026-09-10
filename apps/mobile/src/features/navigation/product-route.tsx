import { Redirect, router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  RefreshControl,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';

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

export function ProductRoute({
  active,
  children,
  allowCreate = false,
}: Props) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const compact = width < 380;
  const { isLoading, session } = useAuth();
  const data = useProductDataContext();
  const runtime = useRuntimeCapabilities(session);

  if (!isLoading && !session) return <Redirect href="/" />;

  if (isLoading || data.loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View
          style={{
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
            paddingTop: 18,
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.sm,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 1180,
              alignSelf: 'center',
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
            }}
          >
            <VadSkeleton width={34} height={34} radius={17} />
            <VadSkeleton width={72} height={18} />
            <View style={{ flex: 1 }} />
            <VadSkeleton width={38} height={38} radius={19} />
          </View>
        </View>

        <View
          style={{
            flex: 1,
            width: '100%',
            maxWidth: 1120,
            alignSelf: 'center',
            paddingHorizontal: desktop
              ? theme.spacing.xl
              : compact
                ? theme.spacing.md
                : theme.spacing.lg,
            paddingTop: desktop
              ? theme.spacing.xl
              : theme.spacing.lg,
            gap: theme.spacing.lg,
          }}
        >
          <VadSkeleton width="38%" height={22} />
          <VadSkeleton width="62%" height={32} />
          <VadSkeleton height={126} radius={theme.radius.xl} />
          <VadSkeleton height={82} radius={theme.radius.lg} />
          <VadSkeleton height={82} radius={theme.radius.lg} />
        </View>

        {!desktop ? (
          <View
            style={{
              minHeight: 66,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
            }}
          />
        ) : null}
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
        canCreate={
          allowCreate &&
          runtime.snapshot.capabilities.submitMarketProposal
        }
        showNavigation={desktop}
        onNavigate={navigate}
        onCreate={() => router.push('/create-market')}
        onAdmin={() => router.push('/admin')}
        onAccount={() => router.replace('/account')}
      />

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
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
          paddingHorizontal: desktop
            ? theme.spacing.xl
            : compact
              ? theme.spacing.md
              : theme.spacing.lg,
          paddingTop: desktop
            ? theme.spacing.xl
            : compact
              ? theme.spacing.md
              : theme.spacing.lg,
          paddingBottom: desktop ? theme.spacing.xxxl : 112,
          gap: theme.spacing.lg,
        }}
      >
        {data.error ? (
          <VadErrorState
            message={data.error}
            onRetry={() => void data.load()}
          />
        ) : null}
        {children}
      </ScrollView>

      {!desktop ? (
        <ProductTabBar active={active} onChange={navigate} />
      ) : null}
    </View>
  );
}
