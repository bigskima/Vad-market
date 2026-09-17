import { useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadText } from '@/components/ui/vad-text';
import { TourTarget } from '@/features/tour/tour-provider';
import { useLiveNow } from '@/hooks/use-live-now';
import { useProductDensity } from '@/hooks/use-product-density';
import { useProgressiveList } from '@/hooks/use-progressive-list';
import { getMarketTiming } from '@/lib/market-timing';
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
  const density = useProductDensity();
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
  }, [markets, category, query, sortMode, now]);

  const live = markets.filter((market) => getMarketTiming(market, now).tradingOpen).length;
  const results = markets.filter((market) => ['CLOSED', 'RESOLVING', 'SETTLEMENT_PENDING'].includes(getMarketTiming(market, now).stage)).length;
  const complete = markets.filter((market) => ['SETTLED', 'VOIDED'].includes(getMarketTiming(market, now).stage)).length;
  const cardWidth = columns === 2 ? '48.9%' : '100%';
  const pageSize = columns === 2 ? 8 : 6;
  const progressive = useProgressiveList({
    items: orderedMarkets,
    initialCount: pageSize,
    step: pageSize,
    resetKey: `${query.trim().toLowerCase()}|${category}|${sortMode}|${columns}`,
  });

  return (
    <View style={{ gap: density.sectionGap }}>
      <VadCard
        variant="brand"
        style={{
          gap: theme.spacing.md,
          padding: density.phone ? theme.spacing.lg : theme.spacing.xl,
          overflow: 'hidden',
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 190,
            height: 190,
            borderRadius: 95,
            right: -74,
            top: -90,
            backgroundColor: theme.colors.surface,
            opacity: theme.mode === 'dark' ? 0.06 : 0.45,
          }}
        />
        <View style={{ gap: 4, maxWidth: 680 }}>
          <VadText variant="caption" tone="brand" style={{ letterSpacing: 1.1 }}>MARKET DISCOVERY</VadText>
          <VadText variant={density.phone ? 'title' : 'display'}>
            {category === 'All' ? 'Explore markets' : `${category} markets`}
          </VadText>
          <VadText variant="body" tone="secondary">
            Compare live probabilities, follow result processing and review completed markets without loading the whole catalogue at once.
          </VadText>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
          <VadChip label={`${live} LIVE`} tone="yes" />
          <VadChip label={`${results} RESULT / PAYOUT`} tone="brand" />
          <VadChip label={`${complete} COMPLETE`} />
        </View>
      </VadCard>

      <TourTarget id="markets-discovery">
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
      </TourTarget>

      <View style={{ gap: theme.spacing.sm }}>
        <VadSectionHeader
          title={category === 'All' ? 'Market catalogue' : `${category} catalogue`}
          subtitle={orderedMarkets.length
            ? `Showing ${progressive.visibleCount} of ${progressive.totalCount}. Reveal more only when you want them.`
            : 'Try another search, category or sorting option.'}
        />
        {orderedMarkets.length ? (
          <View
            style={{
              minHeight: 44,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.surfaceRaised,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.spacing.sm,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <VadIcon name="markets" size={16} tone="brand" />
              <VadText variant="caption" tone="secondary">{progressive.visibleCount} visible</VadText>
            </View>
            <VadText variant="caption" tone={live ? 'yes' : 'brand'}>{live ? `${live} live now` : 'Lifecycle history'}</VadText>
          </View>
        ) : null}
      </View>

      <TourTarget id="markets-results">
        {orderedMarkets.length ? (
          <View style={{ gap: theme.spacing.md }}>
            <View
              style={{
                flexDirection: columns > 1 ? 'row' : 'column',
                flexWrap: columns > 1 ? 'wrap' : 'nowrap',
                gap: theme.spacing.md,
                alignItems: 'stretch',
              }}
            >
              {progressive.visibleItems.map((market) => (
                <View key={market.instrument_public_id} style={{ width: cardWidth }}>
                  <MarketCard market={market} onPress={() => onOpenMarket(market)} />
                </View>
              ))}
            </View>

            {progressive.hasMore ? (
              <VadCard variant="raised" style={{ gap: theme.spacing.sm, alignItems: 'center' }}>
                <View style={{ gap: 2, alignItems: 'center' }}>
                  <VadText variant="bodyStrong">Keep exploring when you are ready</VadText>
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
              setCategory('All');
              setSortMode('activity');
            }}
          />
        )}
      </TourTarget>
    </View>
  );
}
