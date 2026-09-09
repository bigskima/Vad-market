import type { PropsWithChildren } from 'react';
import {
  ScrollView,
  View,
  type ScrollViewProps,
  type ViewStyle,
} from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';

type Props = PropsWithChildren<{
  scroll?: boolean;
  contentStyle?: ViewStyle;
  scrollProps?: ScrollViewProps;
}>;

export function VadScreen({
  scroll = true,
  contentStyle,
  scrollProps,
  children,
}: Props) {
  const theme = useVadTheme();

  const base = {
    flexGrow: 1,
    padding: theme.spacing.lg,
    paddingBottom: 96,
    gap: theme.spacing.md,
  } as const;

  if (scroll) {
    return (
      <ScrollView
        {...scrollProps}
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
        }}
        contentContainerStyle={[base, contentStyle]}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: theme.colors.background,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
        },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );
}
