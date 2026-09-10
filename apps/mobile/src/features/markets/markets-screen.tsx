import { useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { MarketCard } from './components/market-card';
import {
  MarketDiscoveryControls,
  type MarketSortMode,
} from './components/market-discovery-controls';

export function MarketsScreen({
  markets,
  onOpenMarket,
  initialCategory,
}: {
  markets: MarketCatalogItem[];
  onOpenMarket: (market: MarketCatalogItem) => void;
  initialCategory?: string;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const columns = width >= 1120 ? 3 : width >= 760 ? 2 : 1;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(() =>
    initialCategory && markets.some((market) => market.category === initialCategory)
      ? initialCategory
      : 'All',
  );
  const [sortMode, setSortMode] = useState<MarketSortMode>('activity');

  const categories = useMemo(
    () => [...new Set(markets.map((market) => market.category).filter((value): value is string => Boolean(value)))].sort(),
    [markets],
  );

  const orderedMarkets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = markets
      .filter((market) => category === 'All' || market.category === category)
      .filter((market) => !needle || [market.title, market.category, market.asset_code, market.status].some((value) => String(value ?? '').toLowerCase().includes(needle)));

    return [...filtered].sort((a, b) => {
      if (sortMode === 'closing') {
        const aClose = a.closes_at ? new Date(a.closes_at).getTime() : Number.MAX_SAFE_INTEGER;
        const bClose = b.closes_at ? new Date(b.closes_at).getTime() : Number.MAX_SAFE_INTEGER;
        return aClose - bClose;
      }
      if (sortMode === 'newest') {
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
      return Number(Boolean(b.last_trade_at)) - Number(Boolean(a.last_trade_at)) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [markets, category, query, sortMode]);

  const live = markets.filter((market) => market.status === 'OPEN' || market.status === 'ACTIVE').length;
  const recentlyTraded = markets.filter((market) => market.last_trade_at).length;
  const visibleLive = orderedMarkets.filter((market) => market.status === 'OPEN' || market.status === 'ACTIVE').length;
  const cardWidth = columns === 3 ? '32.2%' : columns === 2 ? '49.2%' : '100%';

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      <View style={{ gap: theme.spacing.sm }}>
        <VadText variant="caption" tone="brand">DISCOVER</VadText>
        <VadText variant="title">{category === 'All' ? 'Markets' : category + ' markets'}</VadText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
          <VadChip label={`${live} live`} tone="yes" />
          <VadChip label={`${recentlyTraded} traded`} />
          <VadChip label={`${categories.length} categories`} />
        </View>
      </View>

      <MarketDiscoveryControls
        query={query}
        onQueryChange={setQuery}
        categories={categories}
        activeCategory={category}
        onCategoryChange={setCategory}
        sortMode={sortMode}
        onSortModeChange={setSortMode}
        resultCount={orderedMarkets.length}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md, alignItems: 'center' }}>
        <VadText variant="bodyStrong">{orderedMarkets.length} shown</VadText>
        <VadText variant="caption" tone="tertiary">{visibleLive} currently live</VadText>
      </View>

      {orderedMarkets.length ? (
        <View style={{ flexDirection: columns > 1 ? 'row' : 'column', flexWrap: columns > 1 ? 'wrap' : 'nowrap', gap: theme.spacing.md, alignItems: 'stretch' }}>
          {orderedMarkets.map((market) => (
            <View key={market.instrument_public_id} style={{ width: cardWidth }}>
              <MarketCard market={market} onPress={() => onOpenMarket(market)} />
            </View>
          ))}
        </View>
      ) : !markets.length ? (
        <VadEmptyState title="No live markets yet" body="Approved canonical markets will appear here automatically once governance activates them." />
      ) : (
        <VadEmptyState
          title="No matching markets"
          body="Try another search, category or sorting option."
          actionLabel="Clear filters"
          onAction={() => {
            setQuery('');
            setCategory('All');
            setSortMode('activity');
          }}
        />
      )}
    </View>
  );
}
