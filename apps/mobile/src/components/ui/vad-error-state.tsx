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
        gap: theme.spacing.sm,
        borderLeftWidth: 3,
        borderLeftColor: theme.colors.danger,
        backgroundColor: theme.colors.surfaceRaised,
        borderRadius: theme.radius.md,
        padding: theme.spacing.md,
      }}
    >
      <View style={{ gap: theme.spacing.xxs }}>
        <VadText variant="bodyStrong">{title}</VadText>
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
