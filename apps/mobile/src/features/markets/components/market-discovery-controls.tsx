import {
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';

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
    <View style={{ gap: theme.spacing.md }}>
      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          alignItems: wide ? 'flex-end' : 'stretch',
          gap: theme.spacing.md,
        }}
      >
        <View style={{ flex: 1 }}>
          <VadInput
            label="Search markets"
            value={query}
            onChangeText={onQueryChange}
            placeholder="Question, category or asset"
          />
        </View>

        <View style={{ gap: theme.spacing.xs, minWidth: wide ? 290 : undefined }}>
          <VadText variant="label" tone="secondary">Sort by</VadText>
          <View
            style={{
              flexDirection: 'row',
              padding: theme.spacing.xxs,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.surfaceRaised,
            }}
          >
            {SORT_OPTIONS.map((option) => {
              const active = option.value === sortMode;

              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => onSortModeChange(option.value)}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 42,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: theme.radius.md,
                    backgroundColor: active
                      ? theme.colors.surface
                      : 'transparent',
                    paddingHorizontal: theme.spacing.xs,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <VadText
                    variant="caption"
                    tone={active ? 'brand' : 'secondary'}
                  >
                    {option.label}
                  </VadText>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: theme.spacing.sm,
            alignItems: 'center',
          }}
        >
          <VadText variant="label" tone="secondary">Category</VadText>
          <VadText variant="caption" tone="tertiary">
            {resultCount} {resultCount === 1 ? 'market' : 'markets'}
          </VadText>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: theme.spacing.xs }}
        >
          {['All', ...categories].map((category) => {
            const active = category === activeCategory;

            return (
              <Pressable
                key={category}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onCategoryChange(category)}
                style={({ pressed }) => ({
                  minHeight: 36,
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: active
                    ? theme.colors.brandPrimary
                    : theme.colors.border,
                  backgroundColor: active
                    ? theme.colors.brandSoft
                    : 'transparent',
                  borderRadius: theme.radius.pill,
                  paddingHorizontal: theme.spacing.sm,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <VadText
                  variant="caption"
                  tone={active ? 'brand' : 'secondary'}
                >
                  {category}
                </VadText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}
