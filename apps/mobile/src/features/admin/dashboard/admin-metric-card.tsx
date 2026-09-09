import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export function AdminMetricCard({ label, value, tone = 'primary' }: { label: string; value: string | number; tone?: 'primary' | 'brand' | 'warning' | 'no' | 'yes' }) {
  const theme = useVadTheme();
  return <VadCard variant="raised" style={{ minWidth: 112, flexGrow: 1, gap: theme.spacing.xxs, padding: theme.spacing.sm }}><VadText variant="heading" tone={tone}>{String(value)}</VadText><VadText variant="caption" tone="secondary">{label}</VadText></VadCard>;
}
