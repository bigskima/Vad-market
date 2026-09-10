import { View } from 'react-native';

import { useProductDensity } from '@/hooks/use-product-density';
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
  const density = useProductDensity();

  return (
    <View
      style={{
        minHeight: density.compact ? 104 : density.phone ? 112 : 124,
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: density.phone ? 6 : theme.spacing.xs,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
        paddingVertical: density.phone ? 14 : theme.spacing.lg,
      }}
    >
      <View
        style={{
          width: 26,
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
          style={{ marginTop: theme.spacing.xxs }}
        />
      ) : null}
    </View>
  );
}
