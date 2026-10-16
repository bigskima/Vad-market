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
        minWidth: 120,
        flexGrow: 1,
        flexBasis: 140,
        minHeight: 92,
        justifyContent: 'center',
        gap: theme.spacing.xxs,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        borderWidth: 1,
        borderRadius: theme.radius.lg,
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
