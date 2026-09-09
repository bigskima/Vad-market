import { ActivityIndicator, Pressable, type PressableProps, View } from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';
import { VadText } from './vad-text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Props = PressableProps & { label: string; variant?: Variant; loading?: boolean; fullWidth?: boolean };

export function VadButton({ label, variant = 'primary', loading = false, fullWidth = true, disabled, style, ...props }: Props) {
  const theme = useVadTheme();
  const isDisabled = Boolean(disabled || loading);
  const backgroundColor = variant === 'primary' ? theme.colors.brandPrimary : variant === 'danger' ? theme.colors.danger : variant === 'secondary' ? theme.colors.surfaceRaised : 'transparent';
  const borderColor = variant === 'ghost' ? theme.colors.border : backgroundColor;
  const tone = variant === 'primary' || variant === 'danger' ? 'inverse' : 'primary';

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      accessibilityRole="button"
      style={(state) => [
        {
          minHeight: 48,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: theme.spacing.xs,
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.radius.md,
          borderWidth: variant === 'primary' || variant === 'danger' ? 0 : 1,
          borderColor,
          backgroundColor,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: isDisabled ? 0.45 : state.pressed ? 0.8 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {loading ? <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? theme.colors.textInverse : theme.colors.brandPrimary} /> : null}
      <View><VadText variant="label" tone={tone}>{label}</VadText></View>
    </Pressable>
  );
}
