import { View } from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';
import { VadButton } from './vad-button';
import { VadCard } from './vad-card';
import { VadText } from './vad-text';

export function VadErrorState({ title = 'Something did not load', message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  const theme = useVadTheme();
  return <VadCard variant="outlined" style={{ gap: theme.spacing.sm, borderColor: theme.colors.danger }}>
    <View style={{ gap: theme.spacing.xxs }}><VadText variant="heading">{title}</VadText><VadText tone="secondary">{message}</VadText></View>
    {onRetry ? <VadButton label="Try again" variant="secondary" onPress={onRetry} /> : null}
  </VadCard>;
}
