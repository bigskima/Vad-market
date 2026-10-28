import { View } from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';
import { userFacingErrorMessage } from '@/lib/user-facing-error';
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
  const includesTechnicalDetails = /\\b(?:supabase|postgrest|postgres(?:ql)?|pgrst\\d*|sqlstate|rpc|edge function|database error|schema cache|column .+ does not exist|relation .+ does not exist|api key|environment variable|internal server error|http [45]\\d{2}|typeerror|referenceerror|syntaxerror|stack trace|not configured|unexpected token|econnrefused|econnreset|connection refused|failed to fetch|networkerror|invalid input syntax|row[- ]level security|permission denied|check constraint)\\b/i.test(message);
  const displayMessage = includesTechnicalDetails
    ? userFacingErrorMessage(message, 'general', 'Please try again shortly.')
    : message;

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
        <VadText variant="caption" tone="secondary">{displayMessage}</VadText>
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
