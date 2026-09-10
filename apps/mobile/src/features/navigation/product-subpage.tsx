import { Redirect, router } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VadIconButton } from '@/components/ui/vad-icon-button';
import { VadScreen } from '@/components/ui/vad-screen';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

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
  const { width } = useWindowDimensions();
  const { isLoading, session } = useAuth();
  const compact = width < 380;
  const desktop = width >= 900;
  const headerWidth = Math.max(maxWidth, desktop ? 980 : 760);
  const horizontalPadding = desktop
    ? theme.spacing.xl
    : compact
      ? theme.spacing.md
      : theme.spacing.lg;

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={{ paddingTop: insets.top + theme.spacing.xs, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <View style={{ width: '100%', maxWidth: headerWidth, alignSelf: 'center', paddingHorizontal: horizontalPadding, paddingBottom: theme.spacing.sm, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <VadSkeleton width={42} height={42} radius={21} />
            <VadSkeleton width={150} height={18} />
          </View>
        </View>
        <View style={{ width: '100%', maxWidth, alignSelf: 'center', paddingHorizontal: horizontalPadding, paddingTop: desktop ? theme.spacing.xl : theme.spacing.lg, gap: theme.spacing.md }}>
          <VadSkeleton width="48%" height={28} />
          <VadSkeleton height={92} radius={theme.radius.lg} />
          <VadSkeleton height={64} />
          <VadSkeleton height={64} />
        </View>
      </View>
    );
  }

  if (!session) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ paddingTop: insets.top + theme.spacing.xs, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
        <View style={{ width: '100%', maxWidth: headerWidth, alignSelf: 'center', paddingHorizontal: horizontalPadding, paddingBottom: theme.spacing.sm, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <VadIconButton icon="back" label="Go back" variant="plain" size={40} onPress={() => router.back()} />
          <View style={{ flex: 1, alignItems: desktop ? 'flex-start' : 'center' }}>
            <VadText variant={desktop ? 'heading' : 'bodyStrong'} numberOfLines={1}>{title}</VadText>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </View>

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
          paddingTop: desktop ? theme.spacing.xl : theme.spacing.lg,
          paddingBottom: theme.spacing.xxxl,
          gap: theme.spacing.lg,
        }}
      >
        {children}
      </VadScreen>
    </View>
  );
}
