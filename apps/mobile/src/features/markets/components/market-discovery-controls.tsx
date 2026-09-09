import { Pressable, ScrollView, View } from 'react-native';

import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export type MarketSortMode = 'activity' | 'closing' | 'newest';

const SORT_OPTIONS: { value: MarketSortMode; label: string }[] = [
  { value: 'activity', label: 'Active' },
  { value: 'closing', label: 'Closing soon' },
  { value: 'newest', label: 'Newest' },
];

export function MarketDiscoveryControls({ query, onQueryChange, categories, activeCategory, onCategoryChange, sortMode, onSortModeChange, resultCount }: { query: string; onQueryChange: (value: string) => void; categories: string[]; activeCategory: string; onCategoryChange: (value: string) => void; sortMode: MarketSortMode; onSortModeChange: (value: MarketSortMode) => void; resultCount: number }) {
  const theme = useVadTheme();
  return <View style={{ gap: theme.spacing.sm }}>
    <VadInput value={query} onChangeText={onQueryChange} placeholder="Search questions, categories or assets" />

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.xs }}>
      {['All', ...categories].map((category) => {
        const active = category === activeCategory;
        return <Pressable key={category} onPress={() => onCategoryChange(category)} style={{ borderWidth: 1, borderColor: active ? theme.colors.brandPrimary : theme.colors.border, backgroundColor: active ? theme.colors.brandSoft : theme.colors.surfaceMuted, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }}><VadText variant="caption" tone={active ? 'brand' : 'secondary'}>{category}</VadText></Pressable>;
      })}
    </ScrollView>

    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
      <VadText variant="caption" tone="secondary">{resultCount} {resultCount === 1 ? 'market' : 'markets'}</VadText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.xxs }}>
        {SORT_OPTIONS.map((option) => {
          const active = option.value === sortMode;
          return <Pressable key={option.value} onPress={() => onSortModeChange(option.value)} style={{ backgroundColor: active ? theme.colors.surfaceRaised : 'transparent', borderWidth: 1, borderColor: active ? theme.colors.borderStrong : 'transparent', borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xxs }}><VadText variant="caption" tone={active ? 'primary' : 'tertiary'}>{option.label}</VadText></Pressable>;
        })}
      </ScrollView>
    </View>
  </View>;
}
