import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export function OperationsSection({ title, children }: PropsWithChildren<{ title: string }>) {
  const theme = useVadTheme();
  return <VadCard style={{ gap: theme.spacing.sm }}><VadText variant="heading">{title}</VadText>{children}</VadCard>;
}

export function OperationsRow({ title, detail, status, ready = false }: { title: string; detail: string; status: string; ready?: boolean }) {
  const theme = useVadTheme();
  return <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center', backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.md, padding: theme.spacing.sm }}><View style={{ flex: 1, gap: theme.spacing.xxs }}><VadText variant="bodyStrong">{title}</VadText><VadText variant="caption" tone="secondary">{detail}</VadText></View><VadText variant="caption" tone={ready ? 'yes' : 'secondary'}>{status}</VadText></View>;
}
