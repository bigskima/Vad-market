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
  children,
}: PropsWithChildren<{ title: string }>) {
  const theme = useVadTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingTop: insets.top + theme.spacing.xs,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.background,
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

      <VadScreen
        contentStyle={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: 760,
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
