import { View } from 'react-native';

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
    <View
      style={{
        minWidth: 128,
        flexGrow: 1,
        flexBasis: 150,
        gap: theme.spacing.xxs,
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <VadText variant="heading" tone={tone}>{String(value)}</VadText>
      <VadText variant="caption" tone="secondary">{label}</VadText>
      {detail ? (
        <VadText variant="caption" tone="tertiary">{detail}</VadText>
      ) : null}
    </View>
  );
}
