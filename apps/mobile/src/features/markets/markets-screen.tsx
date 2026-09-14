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
import { useProductDensity } from '@/hooks/use-product-density';
import { useProgressiveList } from '@/hooks/use-progressive-list';
import { useVadTheme } from '@/providers/theme-provider';
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
  initialCategory,
}: {
  markets: MarketCatalogItem[];
  onOpenMarket: (market: MarketCatalogItem) => void;
  initialCategory?: string;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const { width } = useWindowDimensions();
  const columns = width >= 920 ? 2 : 1;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(() =>
    initialCategory && markets.some((market) => market.category === initialCategory)
      ? initialCategory
      : 'All',
  );
  const [stage, setStage] = useState<MarketStageFilter>('live');
  const [sortMode, setSortMode] = useState<MarketSortMode>('activity');

  const categories = useMemo(
    () => [...new Set(markets.map((market) => market.category).filter((value): value is string => Boolean(value)))].sort(),
    [markets],
  );

  const counts = useMemo(() => ({
    live: markets.filter((market) => marketStage(market.status) === 'live').length,
    result: markets.filter((market) => marketStage(market.status) === 'result').length,
    complete: markets.filter((market) => marketStage(market.status) === 'complete').length,
  }), [markets]);

  const orderedMarkets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = markets
      .filter((market) => stage === 'all' || marketStage(market.status) === stage)
      .filter((market) => category === 'All' || market.category === category)
      .filter((market) => !needle || [market.title, market.category, market.asset_code, market.status].some((value) => String(value ?? '').toLowerCase().includes(needle)));

    return [...filtered].sort((a, b) => {
      if (sortMode === 'closing') {
        const aClose = a.closes_at ? new Date(a.closes_at).getTime() : Number.MAX_SAFE_INTEGER;
        const bClose = b.closes_at ? new Date(b.closes_at).getTime() : Number.MAX_SAFE_INTEGER;
        const now = Date.now();
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
  }, [markets, category, query, sortMode, stage]);

  const cardWidth = columns === 2 ? '48.9%' : '100%';
  const pageSize = columns === 2 ? 8 : 6;
  const progressive = useProgressiveList({
    items: orderedMarkets,
    initialCount: pageSize,
    step: pageSize,
    resetKey: `${query.trim().toLowerCase()}|${category}|${stage}|${sortMode}|${columns}`,
  });

  const stageCopy = stagePresentation(stage);

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
            {category === 'All' ? stageCopy.title : `${category} · ${stageCopy.shortTitle}`}
          </VadText>
          <VadText variant="body" tone="secondary">
            {stageCopy.subtitle}
          </VadText>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
          <VadChip label={`${counts.live} LIVE`} tone="yes" />
          <VadChip label={`${counts.result} RESULT / PAYOUT`} tone="brand" />
          <VadChip label={`${counts.complete} COMPLETE`} />
        </View>
      </VadCard>

      <TourTarget id="markets-discovery">
        <MarketDiscoveryControls
          query={query}
          onQueryChange={setQuery}
          categories={categories}
          activeCategory={category}
          onCategoryChange={setCategory}
          stage={stage}
          onStageChange={setStage}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          resultCount={orderedMarkets.length}
        />
      </TourTarget>

      <View style={{ gap: theme.spacing.sm }}>
        <VadSectionHeader
          title={stageCopy.resultsTitle}
          subtitle={orderedMarkets.length
            ? `Showing ${progressive.visibleCount} of ${progressive.totalCount}. Reveal more only when you want them.`
            : stageCopy.emptySubtitle}
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
            <VadText variant="caption" tone={stage === 'live' ? 'yes' : 'brand'}>{stageCopy.batchLabel}</VadText>
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
          <VadEmptyState
            title="No markets yet"
            body="Markets will appear here as soon as they are published."
          />
        ) : (
          <VadEmptyState
            title={stageCopy.emptyTitle}
            body={stageCopy.emptySubtitle}
            actionLabel="Show live markets"
            onAction={() => {
              setQuery('');
              setCategory('All');
              setStage('live');
              setSortMode('activity');
            }}
          />
        )}
      </TourTarget>
    </View>
  );
}

function marketStage(status: string): Exclude<MarketStageFilter, 'all'> {
  const normalized = status.toUpperCase();
  if (normalized === 'OPEN' || normalized === 'ACTIVE' || normalized === 'SUSPENDED') return 'live';
  if (['CLOSED', 'AWAITING_ORACLE', 'RESOLVING', 'RESOLVED', 'FINALIZED', 'SETTLEMENT_PENDING'].includes(normalized)) return 'result';
  return 'complete';
}

function stagePresentation(stage: MarketStageFilter) {
  if (stage === 'live') {
    return {
      title: 'Markets open now',
      shortTitle: 'Live markets',
      subtitle: 'Focus on questions that can still be traded. Compare conviction, urgency and time-to-close before opening the full market.',
      resultsTitle: 'Live markets',
      batchLabel: 'Actionable now',
      emptyTitle: 'No live markets match this view',
      emptySubtitle: 'Try another category or search, or check the result stage for markets that already closed.',
    };
  }
  if (stage === 'result') {
    return {
      title: 'Follow the result journey',
      shortTitle: 'Result / payout',
      subtitle: 'Track markets after trading closes as they move through evidence review, final result and settlement.',
      resultsTitle: 'Result & payout',
      batchLabel: 'Post-trade stage',
      emptyTitle: 'No markets are in result or payout',
      emptySubtitle: 'Markets will move here after trading closes and before they become fully completed.',
    };
  }
  if (stage === 'complete') {
    return {
      title: 'Review completed markets',
      shortTitle: 'Completed',
      subtitle: 'Look back at settled, voided or cancelled markets without mixing them into the live trading catalogue.',
      resultsTitle: 'Completed markets',
      batchLabel: 'Historical stage',
      emptyTitle: 'No completed markets match this view',
      emptySubtitle: 'Completed markets will appear here after settlement, voiding or cancellation.',
    };
  }
  return {
    title: 'Explore the full market lifecycle',
    shortTitle: 'All markets',
    subtitle: 'Search across live trading, result review and completed markets while keeping each market’s current state visible.',
    resultsTitle: 'All markets',
    batchLabel: 'All lifecycle stages',
    emptyTitle: 'No markets match this view',
    emptySubtitle: 'Try another search, category or lifecycle stage.',
  };
}
