import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  View,
} from 'react-native';

import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { VadText } from './vad-text';

type Variant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger';
type Size = 'small' | 'default' | 'large';

type Props = PressableProps & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
  size?: Size;
  leading?: ReactNode;
  trailing?: ReactNode;
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
  accessibilityLabel,
  hitSlop,
  leading,
  trailing,
  ...props
}: Props) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const isDisabled = Boolean(disabled || loading);
  const heights = {
    small: density.smallControlHeight,
    default: density.controlHeight,
    large: density.largeControlHeight,
  } as const;
  const paddings = density.phone
    ? { small: 12, default: 16, large: 20 }
    : { small: theme.spacing.md, default: theme.spacing.lg, large: theme.spacing.xl };

  const backgroundColor =
    variant === 'primary'
      ? theme.colors.brandPrimary
      : variant === 'danger'
        ? theme.colors.danger
        : variant === 'secondary'
          ? theme.colors.surface
          : variant === 'tonal'
            ? theme.colors.brandSoft
            : 'transparent';

  const borderColor =
    variant === 'secondary'
      ? theme.colors.borderStrong
      : variant === 'ghost'
        ? 'transparent'
        : backgroundColor;

  const tone =
    variant === 'primary' || variant === 'danger'
      ? 'inverse'
      : variant === 'tonal'
        ? 'brand'
        : 'primary';

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{
        ...accessibilityState,
        disabled: isDisabled,
        busy: loading || accessibilityState?.busy,
      }}
      hitSlop={hitSlop ?? (size === 'small' ? 4 : undefined)}
      style={(state) => [
        {
          minHeight: heights[size],
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: density.phone ? 6 : theme.spacing.xs,
          paddingHorizontal: paddings[size],
          borderRadius: theme.radius.pill,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor,
          backgroundColor,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: isDisabled ? 0.42 : state.pressed ? 0.78 : 1,
          transform: [{ scale: state.pressed && !isDisabled ? 0.985 : 1 }],
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
      ) : (
        leading ?? null
      )}

      <View style={{ minWidth: 0 }}>
        <VadText variant="label" tone={tone} numberOfLines={1}>
          {label}
        </VadText>
      </View>

      {!loading ? trailing ?? null : null}
    </Pressable>
  );
}
