import type { PropsWithChildren, ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { VadCard } from './vad-card';
import { VadIcon, type VadIconName } from './vad-icon';
import { VadText } from './vad-text';

type Props = PropsWithChildren<{
  title: string;
  description?: string;
  eyebrow?: string;
  icon?: VadIconName;
  defaultExpanded?: boolean;
  summary?: ReactNode;
  variant?: 'surface' | 'raised' | 'brand';
}>;

export function VadProgressiveSection({
  title,
  description,
  eyebrow,
  icon,
  defaultExpanded = false,
  summary,
  variant = 'surface',
  children,
}: Props) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <VadCard
      variant={variant}
      style={{
        padding: 0,
        overflow: 'hidden',
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${title}`}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => ({
          minHeight: density.compact ? 70 : 80,
          paddingHorizontal: density.compact ? theme.spacing.sm : theme.spacing.md,
          paddingVertical: density.compact ? theme.spacing.sm : theme.spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          opacity: pressed ? 0.78 : 1,
        })}
      >
        {icon ? (
          <View
            style={{
              width: density.compact ? 36 : 42,
              height: density.compact ? 36 : 42,
              borderRadius: theme.radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: variant === 'brand' ? theme.colors.surface : theme.colors.brandSoft,
              borderWidth: 1,
              borderColor: variant === 'brand' ? theme.colors.border : theme.colors.brandSoft,
            }}
          >
            <VadIcon name={icon} size={density.compact ? 17 : 19} tone="brand" />
          </View>
        ) : null}

        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {eyebrow ? (
            <VadText variant="caption" tone="brand" numberOfLines={1}>
              {eyebrow}
            </VadText>
          ) : null}
          <VadText variant="bodyStrong" numberOfLines={2}>{title}</VadText>
          {description ? (
            <VadText variant="caption" tone="secondary" numberOfLines={expanded ? undefined : 2}>
              {description}
            </VadText>
          ) : null}
          {!expanded && summary ? <View style={{ paddingTop: 3 }}>{summary}</View> : null}
        </View>

        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.surfaceRaised,
            transform: [{ rotate: expanded ? '90deg' : '0deg' }],
          }}
        >
          <VadIcon name="chevronRight" size={16} tone="secondary" />
        </View>
      </Pressable>

      {expanded ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            paddingHorizontal: density.compact ? theme.spacing.sm : theme.spacing.md,
            paddingVertical: density.compact ? theme.spacing.sm : theme.spacing.md,
            gap: density.compact ? theme.spacing.sm : theme.spacing.md,
          }}
        >
          {children}
        </View>
      ) : null}
    </VadCard>
  );
}
