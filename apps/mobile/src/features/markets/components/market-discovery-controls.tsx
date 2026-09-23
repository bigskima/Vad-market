import { ScrollView, useWindowDimensions, View } from 'react-native';

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
  { value: 'live', label: 'Live now' },
  { value: 'result', label: 'Result / payout' },
  { value: 'complete', label: 'Completed' },
  { value: 'all', label: 'All stages' },
];

export function MarketDiscoveryControls({
  query,
  onQueryChange,
  categories,
  activeCategory,
  onCategoryChange,
  stage,
  onStageChange,
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
  sortMode: MarketSortMode;
  onSortModeChange: (value: MarketSortMode) => void;
  resultCount: number;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 820;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {stage && onStageChange ? (
        <View style={{ gap: theme.spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <VadText variant="caption" tone="tertiary">Stage</VadText>
            <VadText variant="caption" tone="secondary">{resultCount} matching</VadText>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.xs, paddingRight: theme.spacing.md }}>
            {STAGE_OPTIONS.map((option) => (
              <VadChip
                key={option.value}
                label={option.label}
                selected={option.value === stage}
                tone={option.value === stage ? (option.value === 'live' ? 'yes' : 'brand') : 'neutral'}
                onPress={() => onStageChange(option.value)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'flex-end' : 'stretch', gap: theme.spacing.md }}>
        <View style={{ flex: 1 }}>
          <VadInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="Search this stage"
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search markets"
            accessibilityHint="Search the selected market stage"
            leading={<VadIcon name="search" size={19} tone="tertiary" />}
          />
        </View>

        <View style={{ gap: theme.spacing.xs, minWidth: wide ? 360 : undefined }}>
          <VadText variant="caption" tone="tertiary">Prioritise</VadText>
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
        <VadText variant="caption" tone="tertiary">Theme</VadText>
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
