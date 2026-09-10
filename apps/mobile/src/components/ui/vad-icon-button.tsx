import { Pressable, type PressableProps } from 'react-native';

import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { VadIcon, type VadIconName } from './vad-icon';

type Variant = 'plain' | 'tonal' | 'brand';

export function VadIconButton({
  icon,
  label,
  variant = 'tonal',
  size,
  ...props
}: Omit<PressableProps, 'children'> & {
  icon: VadIconName;
  label: string;
  variant?: Variant;
  size?: number;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const resolvedSize = size ?? (density.phone ? 38 : 42);
  const backgroundColor =
    variant === 'brand'
      ? theme.colors.brandPrimary
      : variant === 'tonal'
        ? theme.colors.surfaceRaised
        : 'transparent';

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={density.phone ? 7 : 6}
      style={({ pressed }) => ({
        width: resolvedSize,
        height: resolvedSize,
        borderRadius: resolvedSize / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor,
        borderWidth: variant === 'tonal' ? 1 : 0,
        borderColor: theme.colors.border,
        opacity: pressed ? 0.66 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      <VadIcon
        name={icon}
        size={Math.round(resolvedSize * 0.46)}
        tone={variant === 'brand' ? 'inverse' : 'primary'}
      />
    </Pressable>
  );
}
