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
      style={{
        flexDirection: 'row',
        padding: theme.spacing.xxs,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surfaceRaised,
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
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.md,
              backgroundColor: selected ? theme.colors.surface : 'transparent',
              paddingHorizontal: theme.spacing.xs,
            }}
          >
            <VadText
              variant="caption"
              tone={selected ? 'brand' : 'secondary'}
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
