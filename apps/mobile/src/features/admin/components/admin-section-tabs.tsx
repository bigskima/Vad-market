import { Pressable, View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export function AdminSectionTabs({
  items,
  active,
  onChange,
}: {
  items: { key: string; label: string; count?: number }[];
  active: string;
  onChange: (key: string) => void;
}) {
  const theme = useVadTheme();

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      {items.map((item) => {
        const selected = item.key === active;

        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(item.key)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 46,
              alignItems: 'center',
              justifyContent: 'center',
              borderBottomWidth: 2,
              borderBottomColor: selected
                ? theme.colors.brandPrimary
                : 'transparent',
              paddingHorizontal: theme.spacing.xs,
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <VadText
              variant="caption"
              tone={selected ? 'brand' : 'secondary'}
              numberOfLines={1}
            >
              {item.label}
              {item.count != null ? ' ' + item.count : ''}
            </VadText>
          </Pressable>
        );
      })}
    </View>
  );
}
