import { router } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadScreen } from '@/components/ui/vad-screen';
import { VadText } from '@/components/ui/vad-text';
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
            paddingHorizontal: theme.spacing.lg,
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
            <VadText variant="bodyStrong">{title}</VadText>
          </View>

          <View style={{ width: 44, alignItems: 'flex-end' }}>
            <VadLogo size={26} />
          </View>
        </View>
      </View>

      <VadScreen
        contentStyle={{
          alignSelf: 'center',
          width: '100%',
          maxWidth,
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
