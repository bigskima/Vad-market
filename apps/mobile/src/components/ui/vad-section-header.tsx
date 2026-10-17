import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { VadIcon } from './vad-icon';
import { VadText } from './vad-text';

export function VadSectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
  trailing,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  trailing?: ReactNode;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: density.compact ? 6 : 8 }}>
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 180, gap: 2 }}>
        <VadText variant="heading" style={{ letterSpacing: -0.35, fontSize: density.compact ? 14 : 16, lineHeight: density.compact ? 17 : 20 }}>{title}</VadText>
        {subtitle ? <VadText variant="caption" tone="secondary" style={{ maxWidth: 620, fontSize: 10, lineHeight: 13 }}>{subtitle}</VadText> : null}
      </View>

      {trailing ?? (actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          hitSlop={4}
          style={({ pressed }) => ({
            minHeight: density.compact ? 25 : 28,
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'row',
            gap: 4,
            paddingHorizontal: density.compact ? 6 : 8,
            borderRadius: theme.radius.sm,
            borderWidth: 1,
            borderColor: pressed ? theme.colors.brandPrimary : theme.colors.border,
            backgroundColor: pressed ? theme.colors.brandSoft : theme.colors.surface,
            opacity: pressed ? 0.78 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <VadText variant="label" tone="brand">{actionLabel}</VadText>
          <VadIcon name="chevronRight" size={11} tone="brand" />
        </Pressable>
      ) : null)}
    </View>
  );
}
