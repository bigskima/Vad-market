import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'label' | 'caption';
type Tone = 'primary' | 'secondary' | 'tertiary' | 'brand' | 'yes' | 'no' | 'warning' | 'danger' | 'inverse';

type Props = PropsWithChildren<TextProps & { variant?: Variant; tone?: Tone; style?: TextStyle | TextStyle[] }>;

const UNSAFE_PLAIN_COLORS = new Set([
  'white',
  '#fff',
  '#ffffff',
  'rgb(255,255,255)',
  'rgba(255,255,255,1)',
  'black',
  '#000',
  '#000000',
  'rgb(0,0,0)',
  'rgba(0,0,0,1)',
]);

function normalizeColor(value: unknown) {
  return typeof value === 'string' ? value.toLowerCase().replaceAll(' ', '') : '';
}

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

  const requestedStyleColor = StyleSheet.flatten(style)?.color;
  const safeStyleColor =
    tone === 'primary' &&
    requestedStyleColor != null &&
    !UNSAFE_PLAIN_COLORS.has(normalizeColor(requestedStyleColor))
      ? requestedStyleColor
      : undefined;

  return (
    <Text
      {...props}
      style={[
        theme.typography[variant],
        style,
        {
          // Semantic tones always win. Plain text may keep a theme/semantic custom
          // color, but raw black/white is rejected so it cannot disappear when the
          // user switches between light and dark mode.
          color: safeStyleColor ?? tones[tone],
        },
      ]}
    >
      {children}
    </Text>
  );
}
