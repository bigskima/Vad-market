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
          gap: theme.spacing.md,
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
              paddingHorizontal: theme.spacing.sm,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.surfaceRaised,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <VadText variant="caption" tone="secondary">
              {count}
            </VadText>
          </View>
        ) : null}
      </View>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        }}
      >
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
  meta,
}: {
  title: string;
  detail: string;
  status: string;
  ready?: boolean;
  meta?: string;
}) {
  const theme = useVadTheme();
  const normalized = status.toUpperCase();

  const tone =
    ready
      ? 'yes'
      : normalized.includes('FAIL') ||
          normalized.includes('REJECT') ||
          normalized.includes('DISABLED') ||
          normalized.includes('ERROR')
        ? 'danger'
        : normalized.includes('PENDING') ||
            normalized.includes('REVIEW') ||
            normalized.includes('UNCONFIGURED') ||
            normalized.includes('CREATED')
          ? 'warning'
          : normalized.includes('ACTIVE') ||
              normalized.includes('READY') ||
              normalized.includes('SETTLED') ||
              normalized.includes('VERIFIED')
            ? 'yes'
            : 'secondary';

  const statusBackground =
    tone === 'yes'
      ? theme.colors.yesSoft
      : tone === 'warning'
        ? theme.colors.warningSoft
        : tone === 'danger'
          ? theme.colors.noSoft
          : theme.colors.surfaceRaised;

  return (
    <View
      style={{
        minHeight: meta ? 82 : 72,
        flexDirection: 'row',
        gap: theme.spacing.md,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        paddingVertical: theme.spacing.md,
      }}
    >
      <View
        style={{
          width: 3,
          alignSelf: 'stretch',
          borderRadius: theme.radius.pill,
          backgroundColor:
            tone === 'yes'
              ? theme.colors.yes
              : tone === 'warning'
                ? theme.colors.warning
                : tone === 'danger'
                  ? theme.colors.danger
                  : theme.colors.borderStrong,
        }}
      />

      <View style={{ flex: 1, minWidth: 0, gap: theme.spacing.xxs }}>
        <VadText variant="bodyStrong" numberOfLines={2}>{title}</VadText>
        <VadText variant="caption" tone="secondary" numberOfLines={2}>
          {detail}
        </VadText>
        {meta ? (
          <VadText variant="caption" tone="tertiary" numberOfLines={1}>
            {meta}
          </VadText>
        ) : null}
      </View>

      <View
        style={{
          maxWidth: 132,
          minHeight: 30,
          borderRadius: theme.radius.pill,
          backgroundColor: statusBackground,
          paddingHorizontal: theme.spacing.sm,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <VadText
          variant="caption"
          tone={tone}
          numberOfLines={1}
        >
          {status.replaceAll('_', ' ')}
        </VadText>
      </View>
    </View>
  );
}
