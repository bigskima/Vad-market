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
  const wide = width >= 820;
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

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.md }}>
        <View style={{ gap: theme.spacing.xs }}>
          <VadText variant="label" tone="brand">DISCOVER</VadText>
          <VadText variant="title">Markets</VadText>
          <VadText tone="secondary">
            Search the catalogue, compare live probability, and open one
            market at a time for trading, discussion and rules.
          </VadText>
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.xl }}>
          <Metric label="Live" value={String(live)} />
          <Metric label="All markets" value={String(markets.length)} />
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

      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          flexWrap: wide ? 'wrap' : 'nowrap',
          gap: theme.spacing.md,
          alignItems: 'stretch',
        }}
      >
        {orderedMarkets.map((market) => (
          <View
            key={market.instrument_public_id}
            style={{ width: wide ? '48.8%' : '100%' }}
          >
            <MarketCard
              market={market}
              onPress={() => onOpenMarket(market)}
            />
          </View>
        ))}
      </View>

      {!markets.length ? (
        <VadEmptyState
          title="No live markets yet"
          body="Approved canonical markets will appear here automatically once governance activates them."
        />
      ) : orderedMarkets.length === 0 ? (
        <VadEmptyState
          title="No matching markets"
          body="Try another search, category or sorting option."
        />
      ) : null}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 86, gap: 2 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="bodyStrong">{value}</VadText>
    </View>
  );
}
