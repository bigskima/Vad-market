import { ScrollView, View } from 'react-native';

import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export type MarketSortMode = 'activity' | 'closing' | 'newest';
export type MarketStageFilter = 'live' | 'result' | 'complete' | 'all';

const SORT_OPTIONS: { value: MarketSortMode; label: string }[] = [
  { value: 'activity', label: 'Most active' },
  { value: 'closing', label: 'Closing soon' },
  { value: 'newest', label: 'Newest' },
];

const STAGE_OPTIONS: { value: MarketStageFilter; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'result', label: 'Resolving' },
  { value: 'complete', label: 'Completed' },
  { value: 'all', label: 'All' },
];

export function MarketDiscoveryControls({
  query,
  onQueryChange,
  categories,
  activeCategory,
  onCategoryChange,
  stage,
  onStageChange,
  stageCounts,
  sortMode,
  onSortModeChange,
  resultCount,
  showAdvancedFilters = false,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  categories: string[];
  activeCategory: string;
  onCategoryChange: (value: string) => void;
  stage?: MarketStageFilter;
  onStageChange?: (value: MarketStageFilter) => void;
  stageCounts?: { live: number; result: number; complete: number; all: number };
  sortMode: MarketSortMode;
  onSortModeChange: (value: MarketSortMode) => void;
  resultCount: number;
  showAdvancedFilters?: boolean;
}) {
  const theme = useVadTheme();

  return (
    <View style={{ gap: theme.spacing.md }}>
      <VadInput
        value={query}
        onChangeText={onQueryChange}
        placeholder="Search markets, events or people..."
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel="Search markets, events or people"
        accessibilityHint="Search published market titles, categories, identifiers and supported market fields"
        leading={<VadIcon name="search" size={19} tone="tertiary" />}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.xs, paddingRight: theme.spacing.md }}>
        {['All', ...categories.filter((value) => value.toLowerCase() !== 'all')].map((category) => (
          <VadChip
            key={category}
            label={category}
            selected={category === activeCategory}
            tone={category === activeCategory ? 'brand' : 'neutral'}
            onPress={() => onCategoryChange(category)}
          />
        ))}
      </ScrollView>

      {showAdvancedFilters ? (
        <View style={{ gap: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, backgroundColor: theme.colors.surface, padding: theme.spacing.sm }}>
          {stage && onStageChange ? (
            <View style={{ gap: theme.spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
                <VadText variant="caption" tone="secondary">Market status</VadText>
                <VadText variant="caption" tone="secondary">{resultCount} matching</VadText>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingRight: theme.spacing.md }}>
                {STAGE_OPTIONS.map((option) => (
                  <VadChip
                    key={option.value}
                    label={stageCounts ? `${option.label} ${stageCounts[option.value]}` : option.label}
                    selected={option.value === stage}
                    tone={option.value === stage ? (option.value === 'live' ? 'yes' : 'brand') : 'neutral'}
                    onPress={() => onStageChange(option.value)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}
          <View style={{ gap: theme.spacing.xs }}>
            <VadText variant="caption" tone="secondary">Sort markets</VadText>
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
      ) : null}
    </View>
  );
}
