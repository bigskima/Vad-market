import { Pressable, View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export type ProductTab = 'Home' | 'Markets' | 'Portfolio' | 'Create' | 'Admin';

export function ProductTabBar({ tabs, active, onChange }: { tabs: ProductTab[]; active: ProductTab; onChange: (tab: ProductTab) => void }) {
  const theme = useVadTheme();
  return <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface, paddingHorizontal: theme.spacing.xs, paddingVertical: theme.spacing.xs, gap: theme.spacing.xxs }}>{tabs.map((tab) => {
    const selected = tab === active;
    return <Pressable key={tab} onPress={() => onChange(tab)} style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.md, backgroundColor: selected ? theme.colors.brandSoft : 'transparent' }}><VadText variant="caption" tone={selected ? 'brand' : 'secondary'}>{tab}</VadText></Pressable>;
  })}</View>;
}
