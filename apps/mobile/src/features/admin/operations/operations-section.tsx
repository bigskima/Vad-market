import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export function OperationsSection({
  title,
  description,
  count,
  children,
}: PropsWithChildren<{
  title: string;
  description?: string;
  count?: number;
}>) {
  const theme = useVadTheme();

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
          alignItems: 'flex-start',
        }}
      >
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
          <VadText variant="heading">{title}</VadText>
          {description ? (
            <VadText variant="caption" tone="secondary">{description}</VadText>
          ) : null}
        </View>

        {count != null ? (
          <View
            style={{
              minWidth: 34,
              minHeight: 28,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.surfaceRaised,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: theme.spacing.xs,
            }}
          >
            <VadText variant="caption" tone="secondary">{count}</VadText>
          </View>
        ) : null}
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
        {children}
      </View>
    </View>
  );
}

export function OperationsRow({
  title,
  detail,
  status,
  ready = false,
}: {
  title: string;
  detail: string;
  status: string;
  ready?: boolean;
}) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        minHeight: 68,
        flexDirection: 'row',
        gap: theme.spacing.sm,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <VadText variant="bodyStrong" numberOfLines={2}>{title}</VadText>
        <VadText variant="caption" tone="secondary" numberOfLines={2}>
          {detail}
        </VadText>
      </View>

      <View
        style={{
          borderRadius: theme.radius.pill,
          backgroundColor: ready
            ? theme.colors.yesSoft
            : theme.colors.surfaceRaised,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.xs,
        }}
      >
        <VadText variant="caption" tone={ready ? 'yes' : 'secondary'}>
          {status}
        </VadText>
      </View>
    </View>
  );
}
