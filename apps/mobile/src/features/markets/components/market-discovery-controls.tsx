import { ScrollView, useWindowDimensions, View } from 'react-native';

import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export type MarketSortMode = 'activity' | 'closing' | 'newest';

const SORT_OPTIONS: { value: MarketSortMode; label: string }[] = [
  { value: 'activity', label: 'Active' },
  { value: 'closing', label: 'Closing soon' },
  { value: 'newest', label: 'Newest' },
];

export function MarketDiscoveryControls({
  query,
  onQueryChange,
  categories,
  activeCategory,
  onCategoryChange,
  sortMode,
  onSortModeChange,
  resultCount,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  categories: string[];
  activeCategory: string;
  onCategoryChange: (value: string) => void;
  sortMode: MarketSortMode;
  onSortModeChange: (value: MarketSortMode) => void;
  resultCount: number;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 820;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'flex-end' : 'stretch', gap: theme.spacing.md }}>
        <View style={{ flex: 1 }}>
          <VadInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="Search markets"
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search markets"
            accessibilityHint="Search the live market catalogue"
            leading={<VadIcon name="search" size={19} tone="tertiary" />}
          />
        </View>

        <View style={{ gap: theme.spacing.xs, minWidth: wide ? 330 : undefined }}>
          <VadText variant="caption" tone="tertiary">Sort</VadText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            {SORT_OPTIONS.map((option) => (
              <VadChip
                key={option.value}
                label={option.label}
                selected={option.value === sortMode}
                tone={option.value === sortMode ? 'brand' : 'neutral'}
                onPress={() => onSortModeChange(option.value)}
              />
            ))}
          </View>
        </View>
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
          <VadText variant="caption" tone="tertiary">Categories</VadText>
          <VadText variant="caption" tone="secondary">{resultCount} {resultCount === 1 ? 'market' : 'markets'}</VadText>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.xs, paddingRight: theme.spacing.md }}>
          {['All', ...categories].map((category) => (
            <VadChip
              key={category}
              label={category}
              selected={category === activeCategory}
              tone={category === activeCategory ? 'brand' : 'neutral'}
              onPress={() => onCategoryChange(category)}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}
