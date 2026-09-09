import { useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

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
}: {
  markets: MarketCatalogItem[];
  onOpenMarket: (market: MarketCatalogItem) => void;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const columns = width >= 1120 ? 3 : width >= 760 ? 2 : 1;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [sortMode, setSortMode] = useState<MarketSortMode>('activity');

  const categories = useMemo(
    () =>
      [
        ...new Set(
          markets
            .map((market) => market.category)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [markets],
  );

  const orderedMarkets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = markets
      .filter((market) => category === 'All' || market.category === category)
      .filter(
        (market) =>
          !needle ||
          [
            market.title,
            market.category,
            market.asset_code,
            market.status,
          ].some((value) =>
            String(value ?? '')
              .toLowerCase()
              .includes(needle),
          ),
      );

    return [...filtered].sort((a, b) => {
      if (sortMode === 'closing') {
        const aClose = a.closes_at
          ? new Date(a.closes_at).getTime()
          : Number.MAX_SAFE_INTEGER;
        const bClose = b.closes_at
          ? new Date(b.closes_at).getTime()
          : Number.MAX_SAFE_INTEGER;
        return aClose - bClose;
      }

      if (sortMode === 'newest') {
        return (
          new Date(b.updated_at).getTime() -
          new Date(a.updated_at).getTime()
        );
      }

      return (
        Number(Boolean(b.last_trade_at)) -
        Number(Boolean(a.last_trade_at))
      );
    });
  }, [markets, category, query, sortMode]);

  const live = markets.filter(
    (market) => market.status === 'OPEN' || market.status === 'ACTIVE',
  ).length;

  const recentlyTraded = markets.filter((market) => market.last_trade_at).length;

  const cardWidth =
    columns === 3 ? '32.2%' : columns === 2 ? '49.2%' : '100%';

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      <View
        style={{
          flexDirection: width >= 820 ? 'row' : 'column',
          justifyContent: 'space-between',
          gap: theme.spacing.lg,
          alignItems: width >= 820 ? 'flex-end' : 'stretch',
        }}
      >
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="label" tone="brand">DISCOVER</VadText>
          <VadText variant="title">Markets</VadText>
          <VadText tone="secondary">
            Compare live probability first. Open a market only when you want its
            trade ticket, discussion and resolution rules.
          </VadText>
        </View>

        <View
          style={{
            flexDirection: 'row',
            gap: theme.spacing.xl,
            flexWrap: 'wrap',
          }}
        >
          <Metric label="Live" value={String(live)} />
          <Metric label="Traded" value={String(recentlyTraded)} />
          <Metric label="Categories" value={String(categories.length)} />
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

      {orderedMarkets.length ? (
        <View
          style={{
            flexDirection: columns > 1 ? 'row' : 'column',
            flexWrap: columns > 1 ? 'wrap' : 'nowrap',
            gap: theme.spacing.md,
            alignItems: 'stretch',
          }}
        >
          {orderedMarkets.map((market) => (
            <View
              key={market.instrument_public_id}
              style={{ width: cardWidth }}
            >
              <MarketCard
                market={market}
                onPress={() => onOpenMarket(market)}
              />
            </View>
          ))}
        </View>
      ) : !markets.length ? (
        <VadEmptyState
          title="No live markets yet"
          body="Approved canonical markets will appear here automatically once governance activates them."
        />
      ) : (
        <VadEmptyState
          title="No matching markets"
          body="Try another search, category or sorting option."
        />
      )}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 76, gap: 2 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="bodyStrong">{value}</VadText>
    </View>
  );
}
