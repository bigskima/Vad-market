import type { RuntimeCapabilityKey } from '@vad/types';
import { Redirect, router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { runtimeCapabilityReason } from '@/features/policy/runtime-capability-copy';
import { useProductDensity } from '@/hooks/use-product-density';
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
  requiredCapability?: RuntimeCapabilityKey;
  capabilityTitle?: string;
};

export function ProductRoute({
  active,
  children,
  allowCreate = false,
  requiredCapability,
  capabilityTitle = 'This section is not available yet',
}: Props) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const desktop = density.desktop;
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
            paddingTop: density.phone ? 8 : 18,
            paddingHorizontal: density.horizontalPadding,
            paddingBottom: density.phone ? 8 : theme.spacing.sm,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 1180,
              alignSelf: 'center',
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
            }}
          >
            <VadSkeleton width={density.phone ? 30 : 34} height={density.phone ? 30 : 34} radius={17} />
            <VadSkeleton width={64} height={16} />
            <View style={{ flex: 1 }} />
            <VadSkeleton width={density.phone ? 36 : 38} height={density.phone ? 36 : 38} radius={19} />
          </View>
        </View>

        <View
          style={{
            flex: 1,
            width: '100%',
            maxWidth: 1120,
            alignSelf: 'center',
            paddingHorizontal: density.horizontalPadding,
            paddingTop: density.pageTopPadding,
            gap: density.compact ? theme.spacing.sm : theme.spacing.lg,
          }}
        >
          <VadSkeleton width="38%" height={20} />
          <VadSkeleton width="62%" height={28} />
          <VadSkeleton height={density.compact ? 104 : 120} radius={theme.radius.lg} />
          <VadSkeleton height={density.compact ? 64 : 76} radius={theme.radius.lg} />
          <VadSkeleton height={density.compact ? 64 : 76} radius={theme.radius.lg} />
        </View>

        {!desktop ? (
          <View
            style={{
              minHeight: density.compact ? 54 : 58,
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

  const requiredAllowed = requiredCapability
    ? runtime.snapshot.capabilities[requiredCapability]
    : true;
  const requiredReason = requiredCapability
    ? runtime.snapshot.reasons[requiredCapability]
    : undefined;
  const requiredMessage = requiredCapability
    ? runtime.snapshot.messages?.[requiredCapability]
    : undefined;
  const requiredLoading = Boolean(
    requiredCapability &&
      runtime.isRefreshing &&
      requiredReason === 'CAPABILITIES_LOADING',
  );
  const maintenance = runtime.snapshot.context.platformStatus === 'MAINTENANCE';
  const maintenanceLabel =
    runtime.snapshot.context.platformPauseScope === 'USER'
      ? 'ACCOUNT ACTIONS PAUSED'
      : 'VAD MAINTENANCE MODE';
  const maintenanceMessage =
    runtime.snapshot.context.platformMessage ??
    (runtime.snapshot.context.platformPauseScope === 'USER'
      ? 'New actions are temporarily paused for this account. Read-only areas remain available.'
      : 'VAD is temporarily read-only while maintenance is in progress.');
  const resumesAt = runtime.snapshot.context.platformResumesAt;

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
          paddingHorizontal: density.horizontalPadding,
          paddingTop: density.pageTopPadding,
          paddingBottom: desktop ? theme.spacing.xxxl : theme.spacing.xxl,
          gap: density.compact ? theme.spacing.sm : theme.spacing.lg,
        }}
      >
        {data.error ? (
          <VadErrorState
            message={data.error}
            onRetry={() => void data.load()}
          />
        ) : null}

        {maintenance ? (
          <View
            accessibilityRole="alert"
            style={{
              borderWidth: 1,
              borderColor: theme.colors.warning,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.warningSoft,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: density.compact ? theme.spacing.sm : theme.spacing.md,
              gap: 3,
            }}
          >
            <VadText variant="caption" tone="warning">{maintenanceLabel}</VadText>
            <VadText variant="caption" tone="secondary">{maintenanceMessage}</VadText>
            {resumesAt ? (
              <VadText variant="caption" tone="tertiary">
                Scheduled to resume {new Date(resumesAt).toLocaleString()}.
              </VadText>
            ) : null}
          </View>
        ) : null}

        {requiredLoading ? (
          <View style={{ gap: theme.spacing.md }}>
            <VadSkeleton width="48%" height={26} />
            <VadSkeleton height={density.compact ? 92 : 106} radius={theme.radius.lg} />
            <VadSkeleton height={56} />
          </View>
        ) : requiredCapability && !requiredAllowed ? (
          <VadEmptyState
            title={capabilityTitle}
            body={requiredMessage ?? runtimeCapabilityReason(requiredReason)}
            actionLabel="Refresh availability"
            onAction={() => void runtime.refresh()}
          />
        ) : (
          children
        )}
      </ScrollView>

      {!desktop ? (
        <ProductTabBar active={active} onChange={navigate} />
      ) : null}
    </View>
  );
}
