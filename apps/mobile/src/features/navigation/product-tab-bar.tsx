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
  return <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface, paddingHorizontal: theme.spacing.sm, paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.sm, gap: theme.spacing.xxs }}>{tabs.map((tab) => {
    const selected = tab === active;
    const item = labels[tab];
    return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} key={tab} onPress={() => onChange(tab)} style={{ flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2 }}><View style={{ minWidth: 34, height: 26, borderRadius: 13, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? theme.colors.brandSoft : 'transparent' }}><VadText variant="bodyStrong" tone={selected ? 'brand' : 'secondary'}>{item.glyph}</VadText></View><VadText variant="caption" tone={selected ? 'brand' : 'secondary'}>{item.label}</VadText></Pressable>;
  })}</View>;
}
