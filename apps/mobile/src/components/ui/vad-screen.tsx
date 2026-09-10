import type { PropsWithChildren } from 'react';
import {
  ScrollView,
  View,
  type ScrollViewProps,
  type ViewStyle,
} from 'react-native';

import { useProductDensity } from '@/hooks/use-product-density';
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
  const density = useProductDensity();

  const base = {
    flexGrow: 1,
    padding: density.phone ? density.horizontalPadding : theme.spacing.lg,
    paddingBottom: density.phone ? theme.spacing.xxl : 96,
    gap: density.compact ? theme.spacing.sm : theme.spacing.md,
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
          padding: density.phone ? density.horizontalPadding : theme.spacing.lg,
          gap: density.compact ? theme.spacing.sm : theme.spacing.md,
        },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );
}
