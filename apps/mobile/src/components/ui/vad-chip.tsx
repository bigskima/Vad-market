import { Pressable, type PressableProps, View } from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';
import { VadIcon, type VadIconName } from './vad-icon';
import { VadText } from './vad-text';

type Tone = 'neutral' | 'brand' | 'yes' | 'no' | 'warning';

export function VadChip({
  label,
  selected = false,
  tone = 'neutral',
  icon,
  onPress,
  ...props
}: Omit<PressableProps, 'children'> & {
  label: string;
  selected?: boolean;
  tone?: Tone;
  icon?: VadIconName;
  onPress?: () => void;
}) {
  const theme = useVadTheme();
  const palette = {
    neutral: {
      background: selected ? theme.colors.surfaceMuted : theme.colors.surfaceRaised,
      border: selected ? theme.colors.borderStrong : theme.colors.border,
      text: selected ? 'primary' : 'secondary',
      icon: selected ? 'primary' : 'secondary',
    },
    brand: {
      background: theme.colors.brandSoft,
      border: selected ? theme.colors.brandPrimary : theme.colors.border,
      text: 'brand',
      icon: 'brand',
    },
    yes: {
      background: theme.colors.yesSoft,
      border: theme.colors.yes,
      text: 'yes',
      icon: 'yes',
    },
    no: {
      background: theme.colors.noSoft,
      border: theme.colors.no,
      text: 'no',
      icon: 'no',
    },
    warning: {
      background: theme.colors.warningSoft,
      border: theme.colors.warning,
      text: 'warning',
      icon: 'secondary',
    },
  } as const;
  const colors = palette[tone];

  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon ? <VadIcon name={icon} size={14} tone={colors.icon} /> : null}
      <VadText variant="caption" tone={colors.text}>{label}</VadText>
    </View>
  );

  if (!onPress) {
    return (
      <View
        style={{
          minHeight: 32,
          paddingHorizontal: theme.spacing.sm,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radius.pill,
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 36,
        paddingHorizontal: theme.spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.pill,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: pressed ? 0.7 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      {content}
    </Pressable>
  );
}
