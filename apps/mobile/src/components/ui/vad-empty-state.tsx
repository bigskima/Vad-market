import { View } from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';
import { VadButton } from './vad-button';
import { VadCard } from './vad-card';
import { VadText } from './vad-text';

export function VadEmptyState({ title, body, actionLabel, onAction }: { title: string; body: string; actionLabel?: string; onAction?: () => void }) {
  const theme = useVadTheme();
  return <VadCard variant="outlined" style={{ alignItems: 'flex-start', gap: theme.spacing.xs, paddingVertical: theme.spacing.lg }}>
    <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: theme.colors.brandPrimary }} />
    <VadText variant="heading">{title}</VadText>
    <VadText tone="secondary">{body}</VadText>
    {actionLabel && onAction ? <VadButton fullWidth={false} label={actionLabel} variant="secondary" onPress={onAction} /> : null}
  </VadCard>;
}
