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
              maxWidth: Math.max(maxWidth, 760),
              alignSelf: 'center',
              paddingHorizontal: compact
                ? theme.spacing.md
                : theme.spacing.lg,
              paddingBottom: theme.spacing.sm,
              minHeight: 50,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
            }}
          >
            <VadSkeleton width={44} height={34} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <VadSkeleton width={110} height={18} />
            </View>
            <VadSkeleton width={26} height={26} radius={8} />
          </View>
        </View>

        <View
          style={{
            width: '100%',
            maxWidth,
            alignSelf: 'center',
            paddingHorizontal: compact
              ? theme.spacing.md
              : theme.spacing.lg,
            paddingTop: theme.spacing.lg,
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
            maxWidth: Math.max(maxWidth, 760),
            alignSelf: 'center',
            paddingHorizontal: compact
              ? theme.spacing.md
              : theme.spacing.lg,
            paddingBottom: theme.spacing.sm,
            minHeight: 50,
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
              minWidth: 44,
              height: 40,
              alignItems: 'flex-start',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <VadText variant="heading">‹</VadText>
          </Pressable>

          <View style={{ flex: 1, alignItems: 'center' }}>
            <VadText variant="bodyStrong" numberOfLines={1}>
              {title}
            </VadText>
          </View>

          <View style={{ width: 44, alignItems: 'flex-end' }}>
            <VadLogo size={26} />
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
          paddingHorizontal: compact
            ? theme.spacing.md
            : theme.spacing.lg,
          paddingTop: theme.spacing.lg,
          paddingBottom: theme.spacing.xxxl,
          gap: theme.spacing.lg,
        }}
      >
        {children}
      </VadScreen>
    </View>
  );
}
