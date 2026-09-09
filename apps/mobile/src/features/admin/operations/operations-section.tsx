import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export function OperationsSection({ title, description, count, children }: PropsWithChildren<{ title: string; description?: string; count?: number }>) {
  const theme = useVadTheme();

  return <VadCard style={{ gap: theme.spacing.md, borderRadius: theme.radius.xl }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <VadText variant="heading">{title}</VadText>
        {description ? <VadText variant="caption" tone="secondary">{description}</VadText> : null}
      </View>
      {count != null ? (
        <View style={{ borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceMuted, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }}>
          <VadText variant="caption" tone="secondary">{count}</VadText>
        </View>
      ) : null}
    </View>
    {children}
  </VadCard>;
}

export function OperationsRow({ title, detail, status, ready = false }: { title: string; detail: string; status: string; ready?: boolean }) {
  const theme = useVadTheme();

  return <View
    style={{
      flexDirection: 'row',
      gap: theme.spacing.sm,
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceRaised,
      borderRadius: theme.radius.lg,
      padding: theme.spacing.sm,
    }}
  >
    <View style={{ flex: 1, gap: theme.spacing.xxs }}>
      <VadText variant="bodyStrong" numberOfLines={2}>{title}</VadText>
      <VadText variant="caption" tone="secondary" numberOfLines={2}>{detail}</VadText>
    </View>
    <View style={{ borderRadius: theme.radius.pill, backgroundColor: ready ? theme.colors.yesSoft : theme.colors.surfaceMuted, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }}>
      <VadText variant="caption" tone={ready ? 'yes' : 'secondary'}>{status}</VadText>
    </View>
  </View>;
}
