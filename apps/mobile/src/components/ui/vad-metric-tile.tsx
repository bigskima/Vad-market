import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { VadText } from './vad-text';

type Tone = 'primary' | 'brand' | 'yes' | 'no';

export function VadMetricTile({
  label,
  value,
  detail,
  tone = 'primary',
  icon,
  style,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: Tone;
  icon?: ReactNode;
  style?: ViewStyle;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const backgroundColor =
    tone === 'brand'
      ? theme.colors.brandSoft
      : tone === 'yes'
        ? theme.colors.yesSoft
        : tone === 'no'
          ? theme.colors.noSoft
          : theme.colors.surfaceRaised;

  return (
    <View
      style={[
        {
          flexGrow: 1,
          flexBasis: density.phone ? 116 : 140,
          minWidth: 0,
          minHeight: density.phone ? 76 : 88,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor,
          padding: density.phone ? 11 : theme.spacing.md,
          justifyContent: 'space-between',
          gap: theme.spacing.xs,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.xs, alignItems: 'center' }}>
        <VadText variant="caption" tone="tertiary" numberOfLines={1}>{label}</VadText>
        {icon ?? null}
      </View>
      <View style={{ gap: 1 }}>
        <VadText variant={density.phone ? 'bodyStrong' : 'heading'} tone={tone} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </VadText>
        {detail ? <VadText variant="caption" tone="secondary" numberOfLines={1}>{detail}</VadText> : null}
      </View>
    </View>
  );
}
