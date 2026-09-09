import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';
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

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
      }}
    >
      <View
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 220,
          gap: theme.spacing.xxs,
        }}
      >
        <VadText variant="heading">{title}</VadText>
        {subtitle ? (
          <VadText variant="caption" tone="secondary">
            {subtitle}
          </VadText>
        ) : null}
      </View>

      {trailing ??
        (actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            onPress={onAction}
            hitSlop={8}
            style={({ pressed }) => ({
              minHeight: 34,
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <VadText variant="label" tone="brand">
              {actionLabel}
            </VadText>
          </Pressable>
        ) : null)}
    </View>
  );
}
