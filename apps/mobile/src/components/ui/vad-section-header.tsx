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
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: density.compact ? theme.spacing.sm : theme.spacing.md,
      }}
    >
      <View
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 220,
          gap: 3,
        }}
      >
        <VadText variant="heading" style={{ letterSpacing: -0.2 }}>{title}</VadText>
        {subtitle ? (
          <VadText variant="caption" tone="secondary" style={{ maxWidth: 620 }}>
            {subtitle}
          </VadText>
        ) : null}
      </View>

      {trailing ??
        (actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={onAction}
            hitSlop={4}
            style={({ pressed }) => ({
              minHeight: 38,
              justifyContent: 'center',
              alignItems: 'center',
              flexDirection: 'row',
              gap: 4,
              paddingHorizontal: theme.spacing.sm,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              borderColor: pressed ? theme.colors.brandPrimary : theme.colors.border,
              backgroundColor: pressed ? theme.colors.brandSoft : theme.colors.surface,
              opacity: pressed ? 0.78 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <VadText variant="label" tone="brand">
              {actionLabel}
            </VadText>
            <VadIcon name="chevronRight" size={13} tone="brand" />
          </Pressable>
        ) : null)}
    </View>
  );
}
