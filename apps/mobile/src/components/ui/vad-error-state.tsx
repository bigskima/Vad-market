import { View } from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';
import { VadButton } from './vad-button';
import { VadText } from './vad-text';

export function VadErrorState({
  title = 'Something did not load',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  const theme = useVadTheme();

  return (
    <View
      accessibilityRole="alert"
      style={{
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.colors.danger,
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.sm,
      }}
    >
      <View style={{ gap: theme.spacing.xxs }}>
        <VadText variant="bodyStrong" tone="danger">{title}</VadText>
        <VadText variant="caption" tone="secondary">{message}</VadText>
      </View>

      {onRetry ? (
        <VadButton
          fullWidth={false}
          size="small"
          label="Try again"
          variant="secondary"
          onPress={onRetry}
        />
      ) : null}
    </View>
  );
}
