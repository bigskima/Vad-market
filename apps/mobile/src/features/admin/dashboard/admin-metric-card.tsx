import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export function AdminMetricCard({
  label,
  value,
  tone = 'primary',
  detail,
}: {
  label: string;
  value: string | number;
  tone?: 'primary' | 'brand' | 'warning' | 'no' | 'yes';
  detail?: string;
}) {
  const theme = useVadTheme();

  return (
    <VadCard
      variant="raised"
      style={{
        minWidth: 128,
        flexGrow: 1,
        gap: theme.spacing.xxs,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.lg,
      }}
    >
      <VadText variant="heading" tone={tone}>{String(value)}</VadText>
      <VadText variant="caption" tone="secondary">{label}</VadText>
      {detail ? <VadText variant="caption" tone="tertiary">{detail}</VadText> : null}
    </VadCard>
  );
}
