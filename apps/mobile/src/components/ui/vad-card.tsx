import type { PropsWithChildren } from 'react';
import { View, type ViewProps, type ViewStyle } from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';

type Variant = 'surface' | 'raised' | 'muted' | 'outlined';
type Props = PropsWithChildren<ViewProps & { variant?: Variant; style?: ViewStyle | ViewStyle[] }>;

export function VadCard({ variant = 'surface', style, children, ...props }: Props) {
  const theme = useVadTheme();
  const backgroundColor = variant === 'raised' ? theme.colors.surfaceRaised : variant === 'muted' ? theme.colors.surfaceMuted : theme.colors.surface;
  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: variant === 'outlined' ? 'transparent' : backgroundColor,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          padding: theme.spacing.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
