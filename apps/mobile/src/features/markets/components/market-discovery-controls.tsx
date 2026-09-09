import { Pressable, ScrollView, View } from 'react-native';

import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export function MarketDiscoveryControls({ query, onQueryChange, categories, activeCategory, onCategoryChange }: { query: string; onQueryChange: (value: string) => void; categories: string[]; activeCategory: string; onCategoryChange: (value: string) => void }) {
  const theme = useVadTheme();
  return <View style={{ gap: theme.spacing.sm }}>
    <VadInput value={query} onChangeText={onQueryChange} placeholder="Search markets, categories or outcomes" />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.xs }}>
      {['All', ...categories].map((category) => {
        const active = category === activeCategory;
        return <Pressable key={category} onPress={() => onCategoryChange(category)} style={{ borderWidth: 1, borderColor: active ? theme.colors.brandPrimary : theme.colors.border, backgroundColor: active ? theme.colors.brandSoft : theme.colors.surfaceMuted, borderRadius: 999, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }}><VadText variant="caption" tone={active ? 'brand' : 'secondary'}>{category}</VadText></Pressable>;
      })}
    </ScrollView>
  </View>;
}
