import type { PropsWithChildren } from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';

type Variant = 'surface' | 'raised' | 'muted' | 'outlined' | 'brand';
type Props = PropsWithChildren<ViewProps & { variant?: Variant; style?: StyleProp<ViewStyle> }>;

export function VadCard({ variant = 'surface', style, children, ...props }: Props) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const backgroundColor =
    variant === 'raised'
      ? theme.colors.surfaceRaised
      : variant === 'muted'
        ? theme.colors.surfaceMuted
        : variant === 'brand'
          ? theme.colors.brandSoft
          : theme.colors.surface;

  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: variant === 'outlined' ? 'transparent' : backgroundColor,
          borderColor: variant === 'brand' ? theme.colors.brandPrimary : theme.colors.border,
          borderRadius: density.cardRadius,
          borderWidth: 1,
          padding: density.cardPadding,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
