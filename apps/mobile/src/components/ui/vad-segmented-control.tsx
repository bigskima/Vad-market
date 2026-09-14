import { Pressable, View } from 'react-native';

import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { VadText } from './vad-text';

export type VadSegmentedOption<T extends string> = {
  value: T;
  label: string;
};

export function VadSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  fullWidth = true,
}: {
  value: T;
  options: readonly VadSegmentedOption<T>[];
  onChange: (value: T) => void;
  fullWidth?: boolean;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
        borderRadius: theme.radius.xl,
        backgroundColor: theme.colors.surfaceRaised,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 4,
        gap: 3,
      }}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            hitSlop={2}
            style={({ pressed }) => ({
              flex: fullWidth ? 1 : undefined,
              minHeight: density.compact ? 40 : 44,
              minWidth: fullWidth ? 0 : 88,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: density.phone ? 9 : theme.spacing.md,
              borderRadius: theme.radius.lg,
              backgroundColor: selected ? theme.colors.surface : pressed ? theme.colors.surfaceMuted : 'transparent',
              borderWidth: 1,
              borderColor: selected ? theme.colors.brandPrimary : 'transparent',
              opacity: pressed ? 0.78 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
              ...(selected ? theme.shadows.subtle : {}),
            })}
          >
            <VadText
              variant="caption"
              tone={selected ? 'brand' : 'secondary'}
              numberOfLines={1}
              style={{ fontWeight: selected ? '700' : '600' }}
            >
              {option.label}
            </VadText>
          </Pressable>
        );
      })}
    </View>
  );
}
