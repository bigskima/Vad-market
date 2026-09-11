import { Redirect, router } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VadIconButton } from '@/components/ui/vad-icon-button';
import { VadScreen } from '@/components/ui/vad-screen';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useAuth } from '@/providers/auth-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { ProductAnnouncementBar } from './product-announcement-bar';

export function ProductSubpage({
  title,
  maxWidth = 760,
  children,
}: PropsWithChildren<{
  title: string;
  maxWidth?: number;
}>) {
  const theme = useVadTheme();
  const insets = useSafeAreaInsets();
  const density = useProductDensity();
  const { isLoading, session } = useAuth();
  const data = useProductDataContext();
  const desktop = density.desktop;
  const headerWidth = Math.max(maxWidth, desktop ? 980 : 760);
  const horizontalPadding = density.horizontalPadding;
  const headerHeight = density.phone ? 52 : 60;
  const backSize = 44;

  if (isLoading || data.loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={{ paddingTop: insets.top + (density.phone ? 2 : theme.spacing.xs), backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <View style={{ width: '100%', maxWidth: headerWidth, alignSelf: 'center', paddingHorizontal: horizontalPadding, paddingBottom: density.phone ? 4 : theme.spacing.sm, minHeight: headerHeight, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <VadSkeleton width={backSize} height={backSize} radius={backSize / 2} />
            <VadSkeleton width={140} height={17} />
          </View>
        </View>
        <View style={{ width: '100%', maxWidth, alignSelf: 'center', paddingHorizontal: horizontalPadding, paddingTop: density.pageTopPadding, gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
          <VadSkeleton width="48%" height={26} />
          <VadSkeleton height={density.compact ? 76 : 88} radius={theme.radius.lg} />
          <VadSkeleton height={56} />
          <VadSkeleton height={56} />
        </View>
      </View>
    );
  }

  if (!session) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={[
          theme.shadows.subtle,
          {
            paddingTop: insets.top + (density.phone ? 2 : theme.spacing.xs),
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            zIndex: 20,
          },
        ]}
      >
        <View style={{ width: '100%', maxWidth: headerWidth, alignSelf: 'center', paddingHorizontal: horizontalPadding, paddingBottom: density.phone ? 4 : theme.spacing.sm, minHeight: headerHeight, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <VadIconButton icon="back" label="Go back" variant="plain" size={backSize} onPress={() => router.back()} />
          <View style={{ flex: 1, alignItems: desktop ? 'flex-start' : 'center', minWidth: 0 }}>
            {desktop ? <VadText variant="caption" tone="tertiary">VAD</VadText> : null}
            <VadText variant={desktop ? 'heading' : 'bodyStrong'} numberOfLines={1}>{title}</VadText>
          </View>
          <View style={{ width: backSize }} />
        </View>
      </View>

      <ProductAnnouncementBar notice={data.publicNotices[0] ?? null} />

      <VadScreen
        scrollProps={{
          keyboardShouldPersistTaps: 'handled',
          keyboardDismissMode: 'on-drag',
          contentInsetAdjustmentBehavior: 'automatic',
        }}
        contentStyle={{
          alignSelf: 'center',
          width: '100%',
          maxWidth,
          paddingHorizontal: horizontalPadding,
          paddingTop: density.pageTopPadding,
          paddingBottom: density.phone ? theme.spacing.xxl : theme.spacing.xxxl,
          gap: density.compact ? theme.spacing.sm : theme.spacing.lg,
        }}
      >
        {children}
      </VadScreen>
    </View>
  );
}
