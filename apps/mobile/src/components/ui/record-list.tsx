import { View } from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';
import { VadCard } from './vad-card';
import { VadText } from './vad-text';

export function RecordList({ rows, empty }: { rows: Record<string, unknown>[]; empty: string }) {
  const theme = useVadTheme();
  if (!rows.length) return <VadCard variant="outlined"><VadText tone="secondary">{empty}</VadText></VadCard>;
  return <View style={{ gap: theme.spacing.xs }}>{rows.slice(0, 12).map((row, index) => {
    const title = String(row.market_title ?? row.question ?? row.event_title ?? row.outcome_code ?? row.side ?? 'VAD record');
    const detail = Object.entries(row).slice(0, 5).map(([key, value]) => `${key}: ${String(value ?? '—')}`).join(' · ');
    return <VadCard key={String(row.public_id ?? row.order_id ?? row.instrument_id ?? index)} style={{ gap: theme.spacing.xxs }}><VadText variant="bodyStrong">{title}</VadText><VadText variant="caption" tone="secondary" numberOfLines={3}>{detail}</VadText></VadCard>;
  })}</View>;
}
