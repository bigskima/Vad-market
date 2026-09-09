import type { ReactNode } from 'react';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export function AdminSectionCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const theme = useVadTheme();
  return <VadCard style={{ gap: theme.spacing.sm }}>
    <VadText variant="heading">{title}</VadText>
    {description ? <VadText variant="caption" tone="secondary">{description}</VadText> : null}
    {children}
  </VadCard>;
}
