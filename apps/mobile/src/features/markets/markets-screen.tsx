import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';

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
import type { FeaturedMarketRow, TrendingMarketRow, VadMarketRow } from '@/services/home-content-api';
import { FeaturedMarketsCarousel } from './featured-markets-carousel';
import { requestMarketImageGeneration } from '@/services/market-image-generation';
import { getMarketCategoryExperiences, type MarketCategoryExperience } from '@/services/crypto-market-data-api';
import { MarketCard } from './components/market-card';
import { PageHeader } from '@/features/navigation/page-header';
import {
  MarketDiscoveryControls,
  type MarketSortMode,
  type MarketStageFilter,
} from './components/market-discovery-controls';

export function MarketsScreen({
  markets,
  onOpenMarket,
  initialCategory,
  featuredMarkets = [],
  curatedMarkets = [],
  trendingMarkets = [],
  unreadNotifications = false,
}: {
  markets: MarketCatalogItem[];
  onOpenMarket: (market: MarketCatalogItem) => void;
  initialCategory?: string;
  featuredMarkets?: FeaturedMarketRow[];
  curatedMarkets?: VadMarketRow[];
  trendingMarkets?: TrendingMarketRow[];
  unreadNotifications?: boolean;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const { enabledCurrencies } = useCurrencyPreference();
  const now = useLiveNow();
  const { width } = useWindowDimensions();
  const columns = width >= 920 ? 2 : 1;
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [categoryExperiences, setCategoryExperiences] = useState<MarketCategoryExperience[]>([]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    let active = true;
    void getMarketCategoryExperiences()
      .then((items) => { if (active) setCategoryExperiences(items); })
      .catch(() => { if (active) setCategoryExperiences([]); });
    return () => { active = false; };
  }, []);

  // Lazily fill missing AI artwork for the live catalogue while keeping the
  // requests bounded by the shared generation queue and server-side idempotency.
  useEffect(() => {
    for (const market of markets) {
      if (!market.media_path) void requestMarketImageGeneration(market.instrument_public_id);
    }
  }, [markets]);
  const [category, setCategory] = useState(() =>
    initialCategory && markets.some((market) => market.category === initialCategory)
      ? initialCategory
      : 'All',
  );
  const [sortMode, setSortMode] = useState<MarketSortMode>('activity');
  const [stage, setStage] = useState<MarketStageFilter>('all');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [showAllMarkets, setShowAllMarkets] = useState(false);

  const categories = useMemo(
    () => [...new Set([
      ...categoryExperiences.map((item) => item.name),
      ...markets.map((market) => market.category).filter((value): value is string => Boolean(value)),
    ])].sort((a, b) => {
      const aOrder = categoryExperiences.find((item) => item.name === a)?.display_order;
      const bOrder = categoryExperiences.find((item) => item.name === b)?.display_order;
      if (aOrder != null || bOrder != null) return (aOrder ?? 10_000) - (bOrder ?? 10_000) || a.localeCompare(b);
      return a.localeCompare(b);
    }),
    [markets, categoryExperiences],
  );

  const activeCategoryExperience = useMemo(
    () => categoryExperiences.find((item) => item.name === category)
      ?? categoryExperiences.find((item) => item.code === category)
      ?? null,
    [categoryExperiences, category],
  );
  const baseFilteredMarkets = useMemo(() => {
    const needle = debouncedQuery.toLowerCase();
    return markets
      .filter((market) => enabledCurrencies.includes(market.asset_code as VADCurrency))
      .filter((market) => category === 'All'
        || market.category === category
        || Boolean(activeCategoryExperience?.code && market.category_code === activeCategoryExperience.code))
      .filter((market) => !needle || marketSearchText(market).includes(needle));
  }, [markets, category, debouncedQuery, enabledCurrencies, activeCategoryExperience]);

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
      if (sortMode === 'activity' && trendingMarkets.length) {
        const aRank = trendingMarkets.find((entry) => entry.instrument_public_id === a.instrument_public_id)?.rank;
        const bRank = trendingMarkets.find((entry) => entry.instrument_public_id === b.instrument_public_id)?.rank;
        if (aRank != null || bRank != null) {
          if (aRank == null) return 1;
          if (bRank == null) return -1;
          if (aRank !== bRank) return aRank - bRank;
        }
      }
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
  }, [baseFilteredMarkets, stage, sortMode, now, trendingMarkets]);

  const listingMarkets = useMemo(() => {
    const discoveryHasFilters = Boolean(debouncedQuery) || category !== 'All' || stage !== 'all' || sortMode !== 'activity';
    if (showAllMarkets || discoveryHasFilters) return orderedMarkets;
    const ranked = trendingMarkets
      .map((entry) => orderedMarkets.find((market) => market.instrument_public_id === entry.instrument_public_id))
      .filter((market): market is MarketCatalogItem => Boolean(market));
    return ranked.length ? ranked : orderedMarkets;
  }, [orderedMarkets, trendingMarkets, showAllMarkets, debouncedQuery, category, stage, sortMode]);

  const cardWidth = columns === 2 ? '48.7%' : '100%';
  const pageSize = columns === 2 ? 8 : 5;
  const progressive = useProgressiveList({
    items: listingMarkets,
    initialCount: pageSize,
    step: pageSize,
    resetKey: `${debouncedQuery.toLowerCase()}|${category}|${sortMode}|${stage}|${columns}|${showAllMarkets}`,
  });

  const visibleMarkets = progressive.visibleItems;
  const visibleMarketGroups = useMemo(() => {
    const groupField = activeCategoryExperience?.group_field?.trim() ?? '';
    if (!groupField || visibleMarkets.length === 0) {
      return [{ key: 'all', label: '', markets: visibleMarkets }];
    }
    const groups = new Map<string, MarketCatalogItem[]>();
    for (const market of visibleMarkets) {
      const label = market.group_key?.trim() || '';
      const key = label || '__ungrouped__';
      const rows = groups.get(key) ?? [];
      rows.push(market);
      groups.set(key, rows);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a === '__ungrouped__' ? 1 : b === '__ungrouped__' ? -1 : a.localeCompare(b))
      .map(([key, rows]) => ({
        key,
        label: key === '__ungrouped__' ? 'Other markets' : key,
        markets: rows,
      }));
  }, [visibleMarkets, activeCategoryExperience]);

  return (
    <View style={{ gap: density.phone ? 14 : density.sectionGap }}>
      <PageHeader
        title="Markets"
        subtitle="Discover and trade on real-world events."
        actions={[
          { icon: 'bell', label: 'Notifications', onPress: () => router.push('/notifications'), badge: unreadNotifications },
          { icon: 'globe', label: 'Financial markets', onPress: () => router.push('/financial-markets') },
          { icon: 'operations', label: 'Market filters', onPress: () => setFiltersExpanded((value) => !value) },
        ]}
      />
      <View style={{ alignItems: 'flex-end', marginTop: -8 }}>
        <VadText variant="caption" tone="secondary">{orderedMarkets.length} {orderedMarkets.length === 1 ? 'market' : 'markets'}</VadText>
      </View>

      <TourTarget id="markets-discovery">
        <MarketDiscoveryControls
          query={query}
          onQueryChange={setQuery}
          categories={categories}
          activeCategory={category}
          onCategoryChange={setCategory}
          stage={filtersExpanded ? stage : undefined}
          onStageChange={filtersExpanded ? setStage : undefined}
          stageCounts={filtersExpanded ? stageCounts : undefined}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          resultCount={orderedMarkets.length}
          showAdvancedFilters={filtersExpanded}
        />
      </TourTarget>


      <FeaturedMarketsCarousel markets={markets} featured={featuredMarkets} curated={curatedMarkets} category={category} onOpenMarket={onOpenMarket} />

      {orderedMarkets.length ? (
        <View style={{ gap: theme.spacing.sm, paddingTop: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <VadIcon name="activity" size={20} tone="brand" />
              <VadText variant="bodyStrong" style={{ fontSize: 19 }}>Trending Markets</VadText>
            </View>
            <VadButton label="See all" variant="ghost" size="small" fullWidth={false} onPress={() => { setCategory('All'); setStage('all'); setSortMode('activity'); setQuery(''); setDebouncedQuery(''); setShowAllMarkets(true); }} />
          </View>
          <VadText variant="caption" tone="secondary">{trendingMarkets.length && !showAllMarkets && !debouncedQuery && category === 'All' && stage === 'all' ? 'Ranked from verified trading activity.' : trendingMarkets.length ? 'Live market catalogue.' : 'No published trending ranking is available; showing the live catalogue by recent activity.'}</VadText>
        </View>
      ) : null}

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
              {visibleMarketGroups.map((group) => (
                <View key={group.key} style={{ width: '100%', gap: theme.spacing.xs }}>
                  {group.label ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: theme.spacing.sm }}>
                      <VadText variant="bodyStrong">{group.label}</VadText>
                      <VadText variant="caption" tone="secondary">{group.markets.length} {group.markets.length === 1 ? 'market' : 'markets'}</VadText>
                    </View>
                  ) : null}
                  <View style={{
                    flexDirection: columns > 1 ? 'row' : 'column',
                    flexWrap: columns > 1 ? 'wrap' : 'nowrap',
                    gap: theme.spacing.sm,
                    alignItems: 'stretch',
                  }}>
                    {group.markets.map((market) => (
                      <View key={market.instrument_public_id} style={{ width: cardWidth }}>
                        <MarketCard market={market} onPress={() => onOpenMarket(market)} onSelectOutcome={(outcome) => router.push({ pathname: '/market/[marketId]', params: { marketId: market.instrument_public_id, outcome } })} compact />
                      </View>
                    ))}
                  </View>
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
        ) : (
          <VadEmptyState
            title="No matching markets"
            body="Try another search, category or sorting option."
            actionLabel="Clear filters"
            onAction={() => {
              setQuery('');
              setDebouncedQuery('');
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

function marketSearchText(market: MarketCatalogItem) {
  const values: string[] = [
    market.title,
    market.category,
    market.category_code,
    market.asset_code,
    market.status,
    market.market_type,
    market.group_key,
    market.event_public_id,
    market.instrument_public_id,
  ].map((value) => String(value ?? ''));

  const context = market.market_context;
  if (context && typeof context === 'object' && !Array.isArray(context)) {
    for (const value of Object.values(context)) {
      if (typeof value === 'string' || typeof value === 'number') values.push(String(value));
      else if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const nested of Object.values(value as Record<string, unknown>)) {
          if (typeof nested === 'string' || typeof nested === 'number') values.push(String(nested));
        }
      }
    }
  }
  return values.join(' ').toLowerCase();
}
