import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
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
  { value: 'all', label: 'All markets' },
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
}) {
  const theme = useVadTheme();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = Number(Boolean(stage && stage !== 'all')) + Number(sortMode !== 'activity');

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <VadInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="Search markets"
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search markets"
            accessibilityHint="Search market titles, topics, currencies and status"
            leading={<VadIcon name="search" size={19} tone="tertiary" />}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={activeFilterCount ? `Open filters, ${activeFilterCount} active` : 'Open market filters'}
          accessibilityState={{ expanded: filtersOpen }}
          onPress={() => setFiltersOpen(true)}
          style={({ pressed }) => ({
            minWidth: 48,
            minHeight: 48,
            paddingHorizontal: theme.spacing.sm,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: activeFilterCount ? theme.colors.brandPrimary : theme.colors.border,
            backgroundColor: activeFilterCount ? theme.colors.brandSoft : theme.colors.surface,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.xxs,
            opacity: pressed ? 0.78 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          })}
        >
          <VadIcon name="operations" size={18} tone={activeFilterCount ? 'brand' : 'secondary'} />
          {activeFilterCount ? <VadText variant="caption" tone="brand">{activeFilterCount}</VadText> : null}
        </Pressable>
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
          <VadText variant="caption" tone="tertiary">Explore topics</VadText>
          <VadText variant="caption" tone="secondary">{resultCount} markets</VadText>
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

      <VadBottomSheet visible={filtersOpen} title="Filter markets" onClose={() => setFiltersOpen(false)}>
        <View style={{ gap: theme.spacing.xl }}>
          {stage && onStageChange ? (
            <View style={{ gap: theme.spacing.sm }}>
              <VadText variant="heading">Market status</VadText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                {STAGE_OPTIONS.map((option) => (
                  <VadChip
                    key={option.value}
                    label={stageCounts ? `${option.label} · ${stageCounts[option.value]}` : option.label}
                    selected={option.value === stage}
                    tone={option.value === stage ? (option.value === 'live' ? 'yes' : 'brand') : 'neutral'}
                    onPress={() => onStageChange(option.value)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <View style={{ gap: theme.spacing.sm }}>
            <VadText variant="heading">Sort results</VadText>
            <View style={{ gap: theme.spacing.xs }}>
              {SORT_OPTIONS.map((option) => {
                const selected = option.value === sortMode;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => onSortModeChange(option.value)}
                    style={({ pressed }) => ({
                      minHeight: 48,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: theme.spacing.md,
                      borderRadius: theme.radius.md,
                      borderWidth: 1,
                      borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
                      backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
                      opacity: pressed ? 0.82 : 1,
                    })}
                  >
                    <VadText variant="bodyStrong" tone={selected ? 'brand' : 'primary'}>{option.label}</VadText>
                    {selected ? <VadIcon name="yes" size={18} tone="brand" /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => setFiltersOpen(false)}
            style={({ pressed }) => ({
              minHeight: 48,
              borderRadius: theme.radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.brandPrimary,
              opacity: pressed ? 0.82 : 1,
            })}
          >
            <VadText variant="label" tone="inverse">Show {resultCount} markets</VadText>
          </Pressable>
        </View>
      </VadBottomSheet>
    </View>
  );
}
