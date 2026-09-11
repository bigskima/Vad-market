import { Pressable, type PressableProps, View } from 'react-native';

import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { VadIcon, type VadIconName } from './vad-icon';
import { VadText } from './vad-text';

type Tone = 'neutral' | 'brand' | 'yes' | 'no' | 'warning' | 'danger';

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
  const density = useProductDensity();
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
    danger: {
      background: theme.colors.noSoft,
      border: theme.colors.no,
      text: 'danger',
      icon: 'no',
    },
  } as const;
  const colors = palette[tone];
  const staticHeight = density.phone ? 28 : 32;
  const pressHeight = density.phone ? 32 : 36;
  const staticPadding = density.phone ? 10 : theme.spacing.sm;
  const pressPadding = density.phone ? 12 : theme.spacing.md;

  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: density.phone ? 5 : 6 }}>
      {icon ? <VadIcon name={icon} size={density.phone ? 13 : 14} tone={colors.icon} /> : null}
      <VadText variant="caption" tone={colors.text} numberOfLines={1}>{label}</VadText>
    </View>
  );

  if (!onPress) {
    return (
      <View
        style={{
          minHeight: staticHeight,
          paddingHorizontal: staticPadding,
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
      hitSlop={4}
      style={({ pressed }) => ({
        minHeight: pressHeight,
        paddingHorizontal: pressPadding,
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
