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
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.surfaceRaised,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 3,
        gap: 2,
      }}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            hitSlop={2}
            style={({ pressed }) => ({
              flex: fullWidth ? 1 : undefined,
              minHeight: density.compact ? 32 : density.phone ? 34 : 38,
              minWidth: fullWidth ? 0 : 84,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: density.phone ? 10 : theme.spacing.md,
              borderRadius: theme.radius.pill,
              backgroundColor: selected ? theme.colors.surface : 'transparent',
              borderWidth: selected ? 1 : 0,
              borderColor: selected ? theme.colors.borderStrong : 'transparent',
              opacity: pressed ? 0.7 : 1,
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
