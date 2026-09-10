import { Redirect, router } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
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
        <View
          style={{
            paddingTop: insets.top + theme.spacing.xs,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: headerWidth,
              alignSelf: 'center',
              paddingHorizontal: horizontalPadding,
              paddingBottom: theme.spacing.sm,
              minHeight: desktop ? 58 : 50,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
            }}
          >
            <VadSkeleton width={desktop ? 68 : 44} height={34} />
            <VadSkeleton width={desktop ? 150 : 110} height={18} />
            <View style={{ flex: 1 }} />
            <VadSkeleton width={28} height={28} radius={8} />
          </View>
        </View>

        <View
          style={{
            width: '100%',
            maxWidth,
            alignSelf: 'center',
            paddingHorizontal: horizontalPadding,
            paddingTop: desktop ? theme.spacing.xl : theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
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
      <View
        style={{
          paddingTop: insets.top + theme.spacing.xs,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: headerWidth,
            alignSelf: 'center',
            paddingHorizontal: horizontalPadding,
            paddingBottom: theme.spacing.sm,
            minHeight: desktop ? 58 : 50,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            hitSlop={8}
            style={({ pressed }) => ({
              minWidth: desktop ? 68 : 44,
              height: 40,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: theme.spacing.xs,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <VadText variant="heading">‹</VadText>
            {desktop ? (
              <VadText variant="caption" tone="secondary">Back</VadText>
            ) : null}
          </Pressable>

          <View
            style={{
              flex: 1,
              alignItems: desktop ? 'flex-start' : 'center',
            }}
          >
            <VadText
              variant={desktop ? 'heading' : 'bodyStrong'}
              numberOfLines={1}
            >
              {title}
            </VadText>
          </View>

          <View style={{ width: desktop ? 68 : 44, alignItems: 'flex-end' }}>
            <VadLogo size={desktop ? 28 : 26} />
          </View>
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
