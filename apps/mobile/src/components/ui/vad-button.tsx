import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  View,
} from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';
import { VadText } from './vad-text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'default' | 'small';

type Props = PressableProps & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
  size?: Size;
};

export function VadButton({
  label,
  variant = 'primary',
  loading = false,
  fullWidth = true,
  size = 'default',
  disabled,
  style,
  accessibilityState,
  ...props
}: Props) {
  const theme = useVadTheme();
  const isDisabled = Boolean(disabled || loading);
  const compact = size === 'small';

  const backgroundColor =
    variant === 'primary'
      ? theme.colors.brandPrimary
      : variant === 'danger'
        ? theme.colors.danger
        : variant === 'secondary'
          ? theme.colors.surfaceRaised
          : 'transparent';

  const borderColor =
    variant === 'ghost' || variant === 'secondary'
      ? theme.colors.border
      : backgroundColor;

  const tone =
    variant === 'primary' || variant === 'danger'
      ? 'inverse'
      : 'primary';

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{
        ...accessibilityState,
        disabled: isDisabled,
        busy: loading || accessibilityState?.busy,
      }}
      style={(state) => [
        {
          minHeight: compact ? 40 : 48,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: theme.spacing.xs,
          paddingHorizontal: compact
            ? theme.spacing.md
            : theme.spacing.lg,
          borderRadius: compact
            ? theme.radius.md
            : theme.radius.md,
          borderWidth:
            variant === 'primary' || variant === 'danger' ? 0 : 1,
          borderColor,
          backgroundColor,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: isDisabled ? 0.42 : state.pressed ? 0.72 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={
            variant === 'primary' || variant === 'danger'
              ? theme.colors.textInverse
              : theme.colors.brandPrimary
          }
        />
      ) : null}

      <View>
        <VadText variant="label" tone={tone}>{label}</VadText>
      </View>
    </Pressable>
  );
}
