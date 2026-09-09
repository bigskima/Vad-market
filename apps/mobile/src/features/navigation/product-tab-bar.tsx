import { Pressable, View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export type ProductTab = 'Home' | 'Markets' | 'Portfolio' | 'Create';

const labels: Record<ProductTab, { glyph: string; label: string }> = {
  Home: { glyph: '⌂', label: 'Home' },
  Markets: { glyph: '◫', label: 'Markets' },
  Portfolio: { glyph: '◒', label: 'Portfolio' },
  Create: { glyph: '+', label: 'Create' },
};

export function ProductTabBar({ active, onChange }: { active: ProductTab; onChange: (tab: ProductTab) => void }) {
  const theme = useVadTheme();
  const tabs = Object.keys(labels) as ProductTab[];

  return (
    <View style={{ backgroundColor: theme.colors.background, paddingHorizontal: theme.spacing.sm, paddingTop: theme.spacing.xxs, paddingBottom: theme.spacing.sm }}>
      <View
        style={{
          flexDirection: 'row',
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.xl,
          paddingHorizontal: theme.spacing.xs,
          paddingVertical: theme.spacing.xs,
          gap: theme.spacing.xxs,
          elevation: 8,
          shadowColor: theme.colors.borderStrong,
          shadowOpacity: 0.18,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 5 },
        }}
      >
        {tabs.map((tab) => {
          const selected = tab === active;
          const item = labels[tab];
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={tab}
              onPress={() => onChange(tab)}
              style={{ flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', gap: 3 }}
            >
              <View
                style={{
                  minWidth: 38,
                  height: 28,
                  borderRadius: theme.radius.pill,
                  paddingHorizontal: theme.spacing.xs,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? theme.colors.brandSoft : 'transparent',
                }}
              >
                <VadText variant="bodyStrong" tone={selected ? 'brand' : 'secondary'}>{item.glyph}</VadText>
              </View>
              <VadText variant="caption" tone={selected ? 'brand' : 'secondary'}>{item.label}</VadText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
