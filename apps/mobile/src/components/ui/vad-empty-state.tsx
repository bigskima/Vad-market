import { View } from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';
import { VadButton } from './vad-button';
import { VadText } from './vad-text';

export function VadEmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        minHeight: 150,
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: theme.spacing.xs,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
        paddingVertical: theme.spacing.xl,
      }}
    >
      <View
        style={{
          width: 34,
          height: 4,
          borderRadius: 999,
          backgroundColor: theme.colors.brandPrimary,
          marginBottom: theme.spacing.xs,
        }}
      />
      <VadText variant="heading">{title}</VadText>
      <VadText tone="secondary">{body}</VadText>

      {actionLabel && onAction ? (
        <VadButton
          fullWidth={false}
          size="small"
          label={actionLabel}
          variant="secondary"
          onPress={onAction}
          style={{ marginTop: theme.spacing.xs }}
        />
      ) : null}
    </View>
  );
}
