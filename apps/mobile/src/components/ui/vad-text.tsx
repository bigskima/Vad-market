import type { PropsWithChildren } from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'label' | 'caption';
type Tone = 'primary' | 'secondary' | 'tertiary' | 'brand' | 'yes' | 'no' | 'warning' | 'danger' | 'inverse';

type Props = PropsWithChildren<TextProps & { variant?: Variant; tone?: Tone; style?: TextStyle | TextStyle[] }>;

export function VadText({ variant = 'body', tone = 'primary', style, children, ...props }: Props) {
  const theme = useVadTheme();
  const tones = {
    primary: theme.colors.textPrimary,
    secondary: theme.colors.textSecondary,
    tertiary: theme.colors.textTertiary,
    brand: theme.colors.brandPrimary,
    yes: theme.colors.yes,
    no: theme.colors.no,
    warning: theme.colors.warning,
    danger: theme.colors.danger,
    inverse: theme.colors.textInverse,
  } as const;

  return (
    <Text
      {...props}
      style={[
        theme.typography[variant],
        style,
        // Keep the semantic/theme color last so arbitrary screen styles cannot
        // accidentally make ordinary text white in light mode or black in dark mode.
        { color: tones[tone] },
      ]}
    >
      {children}
    </Text>
  );
}
