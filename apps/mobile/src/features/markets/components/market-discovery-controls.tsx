import { Pressable, ScrollView, View } from 'react-native';

import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export type MarketSortMode = 'activity' | 'closing' | 'newest';
export type MarketStageFilter = 'live' | 'result' | 'complete' | 'all';

export type MarketCategoryOption = {
  value: string;
  label: string;
  count: number;
};

export type MarketSubcategoryOption = {
  value: string;
  label: string;
  count: number;
  kind: 'type' | 'group' | 'sport';
};

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
  subcategories,
  activeSubcategory,
  onSubcategoryChange,
  activeCategoryLabel,
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
  categories: MarketCategoryOption[];
  activeCategory: string;
  onCategoryChange: (value: string) => void;
  subcategories: MarketSubcategoryOption[];
  activeSubcategory: string;
  onSubcategoryChange: (value: string) => void;
  activeCategoryLabel: string | null;
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          alignItems: 'stretch',
          gap: theme.spacing.lg,
          paddingHorizontal: 2,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        {categories.map((option) => {
          const selected = option.value === activeCategory;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={`${option.label}, ${option.count} markets`}
              accessibilityState={{ selected }}
              onPress={() => onCategoryChange(option.value)}
              style={({ pressed }) => ({
                minHeight: 44,
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 5,
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 3 }}>
                <VadText
                  variant={selected ? 'bodyStrong' : 'body'}
                  tone={selected ? 'brand' : 'secondary'}
                  style={{ fontSize: 14, whiteSpace: 'nowrap' as never }}
                >
                  {option.label}
                </VadText>
                {option.count > 0 ? (
                  <VadText variant="caption" tone={selected ? 'brand' : 'tertiary'} style={{ fontSize: 10 }}>
                    {option.count}
                  </VadText>
                ) : null}
              </View>
              <View
                style={{
                  height: 3,
                  width: '100%',
                  borderTopLeftRadius: 3,
                  borderTopRightRadius: 3,
                  backgroundColor: selected ? theme.colors.brandPrimary : 'transparent',
                }}
              />
            </Pressable>
          );
        })}
      </ScrollView>

      {activeCategoryLabel && subcategories.length ? (
        <View style={{ gap: theme.spacing.xs }}>
          <VadText variant="caption" tone="secondary">
            {activeCategoryLabel} · Subcategories
          </VadText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: theme.spacing.xs, paddingRight: theme.spacing.md }}
          >
            <VadChip
              label={`All ${activeCategoryLabel.toLowerCase()} markets`}
              selected={activeSubcategory === 'all'}
              tone={activeSubcategory === 'all' ? 'brand' : 'neutral'}
              onPress={() => onSubcategoryChange('all')}
            />
            {subcategories.map((option) => {
              const selected = option.value === activeSubcategory;
              return (
                <VadChip
                  key={option.value}
                  label={option.count > 0 ? `${option.label} · ${option.count}` : option.label}
                  selected={selected}
                  tone={selected ? 'brand' : 'neutral'}
                  onPress={() => onSubcategoryChange(option.value)}
                />
              );
            })}
          </ScrollView>
        </View>
      ) : null}

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
