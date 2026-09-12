import type { RuntimeCapabilityKey } from '@vad/types';
import { Redirect, router } from 'expo-router';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { runtimeCapabilityReason } from '@/features/policy/runtime-capability-copy';
import { useProductTour } from '@/features/tour/tour-provider';
import { useProductDensity } from '@/hooks/use-product-density';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { ProductAnnouncementBar } from './product-announcement-bar';
import { ProductRightRail } from './product-right-rail';
import { ProductSidebar } from './product-sidebar';
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
  const { isLoading, session } = useAuth();
  const data = useProductDataContext();
  const runtime = useRuntimeCapabilities(session);
  const { registerScrollController } = useProductTour();
  const [noticesOpen, setNoticesOpen] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollOffsetRef = useRef(0);

  if (!isLoading && !session) return <Redirect href="/" />;

  if (isLoading || data.loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View
          style={{
            minHeight: density.phone ? 56 : 64,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            paddingHorizontal: density.horizontalPadding,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <VadSkeleton width={density.phone ? 34 : 142} height={density.phone ? 34 : 22} radius={17} />
          <VadSkeleton width={density.phone ? '46%' : 320} height={44} radius={22} />
          <View style={{ flex: 1 }} />
          <VadSkeleton width={44} height={44} radius={22} />
        </View>

        <View style={{ flex: 1, flexDirection: 'row' }}>
          {density.desktop ? (
            <View
              style={{
                width: 232,
                borderRightWidth: 1,
                borderRightColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                padding: theme.spacing.md,
                gap: theme.spacing.sm,
              }}
            >
              <VadSkeleton width={120} height={36} />
              <VadSkeleton height={48} radius={theme.radius.lg} />
              <VadSkeleton height={48} radius={theme.radius.lg} />
              <VadSkeleton height={48} radius={theme.radius.lg} />
              <VadSkeleton height={48} radius={theme.radius.lg} />
            </View>
          ) : null}

          <View
            style={{
              flex: 1,
              width: '100%',
              maxWidth: density.wide ? 840 : 800,
              alignSelf: 'center',
              paddingHorizontal: density.horizontalPadding,
              paddingTop: density.pageTopPadding,
              gap: density.compact ? theme.spacing.sm : theme.spacing.lg,
            }}
          >
            <VadSkeleton width="38%" height={20} />
            <VadSkeleton width="68%" height={30} />
            <VadSkeleton height={density.compact ? 104 : 132} radius={theme.radius.xl} />
            <VadSkeleton height={density.compact ? 74 : 92} radius={theme.radius.xl} />
            <VadSkeleton height={density.compact ? 74 : 92} radius={theme.radius.xl} />
          </View>

          {density.wide ? (
            <View style={{ width: 292, padding: theme.spacing.lg, gap: theme.spacing.md }}>
              <VadSkeleton height={180} radius={theme.radius.xl} />
              <VadSkeleton height={126} radius={theme.radius.xl} />
            </View>
          ) : null}
        </View>

        {density.phone ? (
          <View style={{ minHeight: 60, borderTopWidth: 1, borderTopColor: theme.colors.border }} />
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
  const requiredLoading = Boolean(
    requiredCapability &&
      runtime.isRefreshing &&
      requiredReason === 'CAPABILITIES_LOADING',
  );
  const maintenance = runtime.snapshot.context.platformStatus === 'MAINTENANCE';
  const maintenanceLabel =
    runtime.snapshot.context.platformPauseScope === 'USER'
      ? 'ACCOUNT NOTICE'
      : 'VAD MAINTENANCE';
  const maintenanceMessage =
    runtime.snapshot.context.platformMessage ??
    (runtime.snapshot.context.platformPauseScope === 'USER'
      ? 'Some actions are temporarily unavailable for your account. You can still view your existing information.'
      : 'Some actions are temporarily unavailable while we carry out maintenance.');
  const resumesAt = runtime.snapshot.context.platformResumesAt;
  const publicNotice = data.publicNotices[0] ?? null;
  const noticeCount = data.publicNotices.length + (maintenance ? 1 : 0);
  const email = session.user.email ?? session.user.phone ?? 'VAD member';
  const canCreate = Boolean(
    allowCreate && runtime.snapshot.capabilities.submitMarketProposal,
  );

  function connectTourScroller(node: ScrollView | null) {
    scrollRef.current = node;
    if (!node) {
      registerScrollController(null);
      return;
    }

    registerScrollController({
      ensureVisible: (rect) => {
        const safeTop = density.phone ? 120 : 132;
        const safeBottom = density.height - (density.phone ? 300 : 270);
        const alreadyVisible = rect.y >= safeTop && rect.y + rect.height <= safeBottom;
        if (alreadyVisible) return false;

        const targetCenter = rect.y + rect.height / 2;
        const idealCenter = Math.max(safeTop + 54, Math.min(density.height * 0.38, 360));
        const nextY = Math.max(0, scrollOffsetRef.current + targetCenter - idealCenter);
        node.scrollTo({ y: nextY, animated: true });
        return true;
      },
    });
  }

  function rememberScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ProductTopBar
        active={active}
        email={email}
        isAdmin={Boolean(data.adminSummary)}
        canCreate={canCreate}
        onCreate={() => router.push('/create-market')}
        onAdmin={() => router.push('/admin')}
        onAccount={() => router.replace('/account')}
        onSearch={() => router.push('/markets')}
        onNotices={() => setNoticesOpen(true)}
        noticeCount={noticeCount}
      />

      <ProductAnnouncementBar notice={publicNotice} />

      <View style={{ flex: 1, flexDirection: 'row', minHeight: 0 }}>
        {density.desktop ? (
          <ProductSidebar
            active={active}
            email={email}
            isAdmin={Boolean(data.adminSummary)}
            canCreate={canCreate}
            onNavigate={navigate}
            onCommunity={() => router.push('/community')}
            onCreate={() => router.push('/create-market')}
            onAdmin={() => router.push('/admin')}
          />
        ) : null}

        <View style={{ flex: 1, minWidth: 0, backgroundColor: theme.colors.background }}>
          <ScrollView
            ref={connectTourScroller}
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentInsetAdjustmentBehavior="automatic"
            onScroll={rememberScroll}
            scrollEventThrottle={16}
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
              maxWidth: density.desktop ? 820 : 760,
              paddingHorizontal: density.horizontalPadding,
              paddingTop: density.pageTopPadding,
              paddingBottom: density.contentBottomPadding,
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
                  borderRadius: theme.radius.xl,
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
                body={runtimeCapabilityReason(requiredReason)}
                actionLabel="Try again"
                onAction={() => void runtime.refresh()}
              />
            ) : (
              children
            )}
          </ScrollView>
        </View>

        {density.wide ? (
          <ProductRightRail
            markets={data.markets}
            notice={publicNotice}
            onOpenMarkets={() => router.push('/markets')}
            onOpenWallet={() => router.push('/wallet')}
            onOpenCommunity={() => router.push('/community')}
          />
        ) : null}
      </View>

      {density.phone ? (
        <ProductTabBar active={active} onChange={navigate} />
      ) : null}

      <VadBottomSheet
        visible={noticesOpen}
        title="VAD updates"
        onClose={() => setNoticesOpen(false)}
      >
        <View style={{ gap: theme.spacing.md }}>
          {maintenance ? (
            <View style={{ gap: 4, paddingBottom: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              <VadText variant="caption" tone="warning">{maintenanceLabel}</VadText>
              <VadText variant="bodyStrong">{maintenanceMessage}</VadText>
              {resumesAt ? (
                <VadText variant="caption" tone="tertiary">Scheduled to resume {new Date(resumesAt).toLocaleString()}.</VadText>
              ) : null}
            </View>
          ) : null}

          {data.publicNotices.length ? data.publicNotices.map((notice) => (
            <View key={notice.public_id} style={{ gap: 4, paddingBottom: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              <VadText variant="caption" tone={notice.tone === 'WARNING' ? 'warning' : 'yes'}>
                {notice.tone === 'WARNING' ? 'SERVICE NOTICE' : 'VAD UPDATE'}
              </VadText>
              <VadText>{notice.message}</VadText>
            </View>
          )) : maintenance ? null : (
            <VadText tone="secondary">There are no active service notices right now.</VadText>
          )}
        </View>
      </VadBottomSheet>
    </View>
  );
}
