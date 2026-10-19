import { useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { TourTarget } from '@/features/tour/tour-provider';
import { useProductDensity } from '@/hooks/use-product-density';
import { useProgressiveList } from '@/hooks/use-progressive-list';
import { useLiveNow } from '@/hooks/use-live-now';
import { useVadTheme } from '@/providers/theme-provider';
import { useCurrencyPreference, type VADCurrency } from '@/providers/currency-preference-provider';
import { getMarketTiming } from '@/lib/market-timing';
import type { MarketCatalogItem } from '@/services/market-api';
import { MarketCard } from './components/market-card';
import {
  MarketDiscoveryControls,
  type MarketSortMode,
  type MarketStageFilter,
} from './components/market-discovery-controls';

export function MarketsScreen({
  markets,
  onOpenMarket,
  onOpenWallet,
  initialCategory,
}: {
  markets: MarketCatalogItem[];
  onOpenMarket: (market: MarketCatalogItem) => void;
  onOpenWallet: () => void;
  initialCategory?: string;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const { enabledCurrencies } = useCurrencyPreference();
  const now = useLiveNow();
  const { width } = useWindowDimensions();
  const columns = width >= 920 ? 2 : 1;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(() =>
    initialCategory && markets.some((market) => market.category === initialCategory)
      ? initialCategory
      : 'All',
  );
  const [sortMode, setSortMode] = useState<MarketSortMode>('activity');
  const [stage, setStage] = useState<MarketStageFilter>('all');

  const categories = useMemo(
    () => [...new Set(markets.map((market) => market.category).filter((value): value is string => Boolean(value)))].sort(),
    [markets],
  );

  const baseFilteredMarkets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return markets
      .filter((market) => enabledCurrencies.includes(market.asset_code as VADCurrency))
      .filter((market) => category === 'All' || market.category === category)
      .filter((market) => !needle || [market.title, market.category, market.asset_code, market.status].some((value) => String(value ?? '').toLowerCase().includes(needle)));
  }, [markets, category, query, enabledCurrencies]);

  const stageCounts = useMemo(() => {
    const counts = { live: 0, result: 0, complete: 0, all: baseFilteredMarkets.length };
    for (const market of baseFilteredMarkets) {
      const timing = getMarketTiming(market, now);
      if (timing.tradingOpen) counts.live += 1;
      else if (['CLOSED', 'RESOLVING', 'SETTLEMENT_PENDING'].includes(timing.stage)) counts.result += 1;
      else if (['SETTLED', 'VOIDED'].includes(timing.stage)) counts.complete += 1;
    }
    return counts;
  }, [baseFilteredMarkets, now]);

  const orderedMarkets = useMemo(() => {
    const filtered = baseFilteredMarkets.filter((market) => {
      const timing = getMarketTiming(market, now);
      if (stage === 'live') return timing.tradingOpen;
      if (stage === 'result') return ['CLOSED', 'RESOLVING', 'SETTLEMENT_PENDING'].includes(timing.stage);
      if (stage === 'complete') return ['SETTLED', 'VOIDED'].includes(timing.stage);
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === 'closing') {
        const aClose = a.closes_at ? new Date(a.closes_at).getTime() : Number.MAX_SAFE_INTEGER;
        const bClose = b.closes_at ? new Date(b.closes_at).getTime() : Number.MAX_SAFE_INTEGER;
        const aFuture = aClose >= now;
        const bFuture = bClose >= now;
        if (aFuture !== bFuture) return aFuture ? -1 : 1;
        return aFuture ? aClose - bClose : bClose - aClose;
      }
      if (sortMode === 'newest') {
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
      return Number(Boolean(b.last_trade_at)) - Number(Boolean(a.last_trade_at)) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [baseFilteredMarkets, stage, sortMode, now]);

  const cardWidth = columns === 2 ? '48.7%' : '100%';
  const pageSize = columns === 2 ? 8 : 5;
  const progressive = useProgressiveList({
    items: orderedMarkets,
    initialCount: pageSize,
    step: pageSize,
    resetKey: `${query.trim().toLowerCase()}|${category}|${sortMode}|${stage}|${columns}`,
  });

  const visibleMarkets = progressive.visibleItems;

  return (
    <View style={{ gap: density.phone ? 14 : density.sectionGap }}>
      <View style={{ gap: 4, paddingBottom: theme.spacing.xs }}>
        <VadText variant="caption" tone="brand">VAD EXCHANGE</VadText>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: theme.spacing.sm }}>
          <VadText variant="title">{category === 'All' ? 'Markets' : category}</VadText>
          <VadText variant="caption" tone="secondary">{orderedMarkets.length} {orderedMarkets.length === 1 ? 'market' : 'markets'}</VadText>
        </View>
      </View>

      <TourTarget id="markets-discovery">
        <MarketDiscoveryControls
          query={query}
          onQueryChange={setQuery}
          categories={categories}
          activeCategory={category}
          onCategoryChange={setCategory}
          stage={stage}
          onStageChange={setStage}
          stageCounts={stageCounts}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          resultCount={orderedMarkets.length}
        />
      </TourTarget>

      <TourTarget id="markets-results">
        {orderedMarkets.length ? (
          <View style={{ gap: theme.spacing.sm }}>
            <View
              style={{
                flexDirection: columns > 1 ? 'row' : 'column',
                flexWrap: columns > 1 ? 'wrap' : 'nowrap',
                gap: theme.spacing.sm,
                alignItems: 'stretch',
              }}
            >
              {visibleMarkets.map((market) => (
                <View key={market.instrument_public_id} style={{ width: cardWidth }}>
                  <MarketCard market={market} onPress={() => onOpenMarket(market)} compact />
                </View>
              ))}
            </View>

            {progressive.hasMore ? (
              <VadCard variant="raised" style={{ gap: theme.spacing.sm, alignItems: 'center' }}>
                <View style={{ gap: 2, alignItems: 'center' }}>
                  <VadText variant="bodyStrong">More markets</VadText>
                  <VadText variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
                    {progressive.remainingCount} more {progressive.remainingCount === 1 ? 'market' : 'markets'} match this view.
                  </VadText>
                </View>
                <VadButton
                  label={`Show next ${progressive.nextCount}`}
                  variant="secondary"
                  size="small"
                  fullWidth={false}
                  onPress={progressive.showMore}
                  trailing={<VadIcon name="chevronRight" size={15} tone="primary" />}
                />
              </VadCard>
            ) : null}
          </View>
        ) : !markets.length ? (
          <VadEmptyState title="No markets yet" body="Markets will appear here as soon as they are published." />
        ) : !markets.some((market) => enabledCurrencies.includes(market.asset_code as VADCurrency)) ? (
          <VadEmptyState
            title="No enabled market currencies"
            body="Enable an eligible currency in Wallet to see markets settled in it."
            actionLabel="Open wallet"
            onAction={onOpenWallet}
          />
        ) : (
          <VadEmptyState
            title="No matching markets"
            body="Try another search, category or sorting option."
            actionLabel="Clear filters"
            onAction={() => {
              setQuery('');
              setCategory('All');
              setSortMode('activity');
              setStage('all');
            }}
          />
        )}
      </TourTarget>
    </View>
  );
}
