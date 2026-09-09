import type { ReactNode } from 'react';
import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export function AdminSectionCard({
  title,
  description,
  meta,
  children,
}: {
  title: string;
  description?: string;
  meta?: string;
  children: ReactNode;
}) {
  const theme = useVadTheme();

  return <VadCard style={{ gap: theme.spacing.md, borderRadius: theme.radius.xl }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <VadText variant="heading">{title}</VadText>
        {description ? <VadText variant="caption" tone="secondary">{description}</VadText> : null}
      </View>
      {meta ? (
        <View style={{ borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceMuted, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }}>
          <VadText variant="caption" tone="secondary">{meta}</VadText>
        </View>
      ) : null}
    </View>
    {children}
  </VadCard>;
}
