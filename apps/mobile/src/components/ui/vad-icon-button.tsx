import { Pressable, type PressableProps } from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';
import { VadIcon, type VadIconName } from './vad-icon';

type Variant = 'plain' | 'tonal' | 'brand';

export function VadIconButton({
  icon,
  label,
  variant = 'tonal',
  size = 42,
  ...props
}: Omit<PressableProps, 'children'> & {
  icon: VadIconName;
  label: string;
  variant?: Variant;
  size?: number;
}) {
  const theme = useVadTheme();
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
      hitSlop={6}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
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
        size={Math.round(size * 0.48)}
        tone={variant === 'brand' ? 'inverse' : 'primary'}
      />
    </Pressable>
  );
}
