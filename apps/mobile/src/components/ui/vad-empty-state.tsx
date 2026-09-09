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
        minHeight: 124,
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: theme.spacing.xs,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
        paddingVertical: theme.spacing.lg,
      }}
    >
      <View
        style={{
          width: 30,
          height: 3,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.brandPrimary,
          marginBottom: theme.spacing.xxs,
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
