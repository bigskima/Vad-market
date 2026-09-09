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
          <VadText variant="caption" tone="tertiary">
            {count} {count === 1 ? 'item' : 'items'}
          </VadText>
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
  const normalized = status.toUpperCase();

  const tone =
    ready
      ? 'yes'
      : normalized.includes('FAIL') ||
          normalized.includes('REJECT') ||
          normalized.includes('DISABLED')
        ? 'danger'
        : normalized.includes('PENDING') ||
            normalized.includes('REVIEW') ||
            normalized.includes('UNCONFIGURED')
          ? 'warning'
          : 'secondary';

  return (
    <View
      style={{
        minHeight: 68,
        flexDirection: 'row',
        gap: theme.spacing.md,
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

      <VadText variant="caption" tone={tone}>
        {status}
      </VadText>
    </View>
  );
}
