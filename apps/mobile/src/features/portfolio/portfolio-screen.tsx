import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View, type DimensionValue } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { EmbeddedWalletModal } from '@/features/wallet/embedded-wallet-modal';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadProgressiveSection } from '@/components/ui/vad-progressive-section';
import { VadSegmentedControl } from '@/components/ui/vad-segmented-control';
import { VadText } from '@/components/ui/vad-text';
import { assetMoney, pct } from '@/features/markets/format';
import { marketCategoryLabel, marketStatusLabel } from '@/features/markets/market-display-labels';
import { TourTarget } from '@/features/tour/tour-provider';
import { useProductDensity } from '@/hooks/use-product-density';
import { useProgressiveList } from '@/hooks/use-progressive-list';
import { useVadTheme } from '@/providers/theme-provider';
import { useCurrencyPreference, type VADCurrency } from '@/providers/currency-preference-provider';
import {
  getPortfolioPositionMarks,
  getPortfolioOrderHistory,
  getPortfolioValuationHistory,
  marketMediaUrl,
  type MarketCatalogItem,
  type MarketHistoryRow,
  type OrderRow,
  type PortfolioOrderHistoryRow,
  type PortfolioPositionMarkRow,
  type PortfolioValuationSnapshotRow,
  type PoolStakeRow,
  type PositionRow,
  type SettlementReceiptRow,
} from '@/services/market-api';

type PortfolioTab = 'positions' | 'orders' | 'history' | 'performance';
type Period = '1D' | '1W' | '1M' | '1Y' | 'ALL';
type OutcomeFilter = 'all' | 'YES' | 'NO';
type StatusFilter = 'all' | 'marked' | 'unmarked';
type PerformanceFilter = 'all' | 'profit' | 'loss' | 'unmarked';
type PositionModel = PositionRow & Partial<PortfolioPositionMarkRow>;

const PERIOD_DAYS: Record<Period, number> = { '1D': 1, '1W': 7, '1M': 30, '1Y': 365, ALL: 3650 };

export function PortfolioScreen({
  positions,
  poolStakes,
  orders,
  settlements,
  marketHistory,
  markets,
  sectionErrors,
  loading = false,
  onRetry,
  onOpenPosition,
  onOpenOrder,
  onOpenMarket,
}: {
  positions: PositionRow[];
  poolStakes: PoolStakeRow[];
  orders: OrderRow[];
  settlements: SettlementReceiptRow[];
  marketHistory: MarketHistoryRow[];
  markets: MarketCatalogItem[];
  sectionErrors?: { positions?: string | null; poolStakes?: string | null; orders?: string | null; marketHistory?: string | null; settlements?: string | null };
  loading?: boolean;
  onRetry: () => void;
  onOpenPosition: (position: PositionRow) => void;
  onOpenOrder: (order: OrderRow | PortfolioOrderHistoryRow) => void;
  onOpenMarket: (marketId: string) => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const { enabledCurrencies } = useCurrencyPreference();
  const enabledCurrencySignature = enabledCurrencies.join('|');
  const [selectedAsset, setSelectedAsset] = useState<VADCurrency>('NGN');
  const [tab, setTab] = useState<PortfolioTab>('positions');
  const [period, setPeriod] = useState<Period>('ALL');
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [performanceFilter, setPerformanceFilter] = useState<PerformanceFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [visiblePositionCount, setVisiblePositionCount] = useState(5);
  const visibleOrderCount = 5;
  const visibleHistoryCount = 8;
  const [marks, setMarks] = useState<PortfolioPositionMarkRow[]>([]);
  const [snapshots, setSnapshots] = useState<PortfolioValuationSnapshotRow[]>([]);
  const [marksLoading, setMarksLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [marksError, setMarksError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [orderHistory, setOrderHistory] = useState<PortfolioOrderHistoryRow[]>([]);
  const [orderHistoryLoading, setOrderHistoryLoading] = useState(true);
  const [orderHistoryError, setOrderHistoryError] = useState<string | null>(null);
  const [retryValuation, setRetryValuation] = useState(0);
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([
      getPortfolioPositionMarks(),
      getPortfolioValuationHistory(3650, 600),
      getPortfolioOrderHistory(200),
    ]).then(([marksResult, snapshotsResult, orderHistoryResult]) => {
      if (cancelled) return;
      if (marksResult.status === 'fulfilled') {
        setMarks(marksResult.value);
        setMarksError(null);
      } else {
        setMarksError('Current position valuations could not be loaded.');
      }
      setMarksLoading(false);
      if (snapshotsResult.status === 'fulfilled') {
        setSnapshots(snapshotsResult.value);
        setHistoryError(null);
      } else {
        setHistoryError('Portfolio valuation history could not be loaded.');
      }
      setHistoryLoading(false);
      if (orderHistoryResult.status === 'fulfilled') {
        setOrderHistory(orderHistoryResult.value);
        setOrderHistoryError(null);
      } else {
        setOrderHistoryError('Historical orders could not be loaded.');
      }
      setOrderHistoryLoading(false);
    });
    return () => { cancelled = true; };
  }, [retryValuation, enabledCurrencySignature]);

  useEffect(() => {
    const timer = setInterval(() => setClockNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Ask the server for real snapshots on the same cadence used to avoid duplicates.
    const timer = setInterval(() => setRetryValuation((value) => value + 1), 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const assetOptions = useMemo(
    () => enabledCurrencies.filter((code): code is VADCurrency => ['NGN', 'USDC'].includes(code)),
    [enabledCurrencies],
  );
  const asset = assetOptions.includes(selectedAsset) ? selectedAsset : assetOptions[0] ?? 'NGN';

  const marketsById = useMemo(() => new Map(markets.map((market) => [market.instrument_public_id, market])), [markets]);
  const marksByKey = useMemo(() => new Map(marks.map((mark) => [positionKey(mark.instrument_id, mark.outcome_code), mark])), [marks]);
  const positionsForAsset = useMemo<PositionModel[]>(() => positions
    .filter((position) => position.asset_code === asset)
    .map((position) => {
      const mark = marksByKey.get(positionKey(position.instrument_id, position.outcome_code));
      return mark ? { ...position, ...mark } : position;
    }), [positions, asset, marksByKey]);
  const historyRows = useMemo(() => marketHistory
    .filter((row) => row.asset_code === asset)
    .sort((a, b) => (Date.parse(b.settled_at ?? '') || 0) - (Date.parse(a.settled_at ?? '') || 0)), [marketHistory, asset]);
  const settledRows = useMemo(() => historyRows.filter((row) =>
    ['WON', 'LOST', 'REFUNDED', 'VOID'].includes(String(row.result).toUpperCase()) && Boolean(row.settled_at)), [historyRows]);

  const currencySnapshots = useMemo(() => snapshots
    .filter((snapshot) => snapshot.asset_code === asset)
    .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at)), [snapshots, asset]);
  const latestSnapshot = currencySnapshots[currencySnapshots.length - 1] ?? null;
  const cutoff = period === 'ALL' ? 0 : clockNow - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000;
  const periodSnapshots = currencySnapshots.filter((snapshot) => Date.parse(snapshot.observed_at) >= cutoff);
  const completePeriodSnapshots = periodSnapshots.filter((snapshot) => snapshot.valuation_complete && snapshot.total_value != null);
  const startSnapshot = completePeriodSnapshots[0] ?? null;
  const endSnapshot = completePeriodSnapshots[completePeriodSnapshots.length - 1] ?? null;
  const externalFlows = startSnapshot && endSnapshot
    ? periodSnapshots.filter((snapshot) => Date.parse(snapshot.observed_at) > Date.parse(startSnapshot.observed_at))
      .reduce((sum, snapshot) => sum + amount(snapshot.net_external_flow), 0)
    : 0;
  const performanceDelta = completePeriodSnapshots.length >= 2 && startSnapshot && endSnapshot
    ? amount(endSnapshot.total_value) - amount(startSnapshot.total_value) - externalFlows
    : null;
  const performancePercent = performanceDelta != null && startSnapshot && amount(startSnapshot.total_value) > 0
    ? performanceDelta / amount(startSnapshot.total_value)
    : null;

  const openMarkedPositions = positionsForAsset.filter((position) => position.mark_status !== 'SETTLED');
  const activePoolStakes = poolStakes
    .filter((stake) => stake.asset_code === asset)
    .filter((stake) => !['SETTLED', 'VOIDED', 'CANCELLED', 'RESOLVED', 'FINAL'].includes(String(stake.market_status).toUpperCase()))
    .filter((stake) => !stake.final_outcome);
  const committedStakeAmount = activePoolStakes.reduce((sum, stake) => sum + amount(stake.amount), 0);
  const openPositionValue = activePoolStakes.length
    ? null
    : openMarkedPositions.every((position) => position.mark_status === 'MARKED')
      ? openMarkedPositions.reduce((sum, position) => sum + amount(position.current_value), 0)
      : null;
  const openCount = openMarkedPositions.length + activePoolStakes.length;
  const openValueText = openPositionValue == null ? '—' : assetMoney(openPositionValue, asset);
  const committedStakeText = activePoolStakes.length ? assetMoney(committedStakeAmount, asset) : '—';

  const categories = useMemo(() => [...new Set(markets
    .filter((market) => market.asset_code === asset && market.category)
    .map((market) => market.category as string))].sort(), [markets, asset]);
  const filteredPositions = positionsForAsset.filter((position) => {
    const positionStatus = String(position.status ?? '').toUpperCase();
    if (position.mark_status === 'SETTLED' || ['SETTLED', 'RESOLVED', 'FINAL'].includes(positionStatus)) return false;
    const category = marketsById.get(position.instrument_id)?.category ?? 'Other';
    const pnl = position.unrealized_pnl == null ? null : amount(position.unrealized_pnl);
    return (outcomeFilter === 'all' || position.outcome_code.toUpperCase() === outcomeFilter)
      && (statusFilter === 'all' || (statusFilter === 'marked' ? position.mark_status === 'MARKED' : position.mark_status !== 'MARKED'))
      && (categoryFilter === 'all' || category === categoryFilter)
      && (performanceFilter === 'all'
        || (performanceFilter === 'profit' && pnl != null && pnl > 0)
        || (performanceFilter === 'loss' && pnl != null && pnl < 0)
        || (performanceFilter === 'unmarked' && (pnl == null || position.mark_status !== 'MARKED')));
  });
  const visiblePositions = useProgressiveList({
    items: filteredPositions,
    initialCount: visiblePositionCount,
    step: 5,
    resetKey: `${asset}|${outcomeFilter}|${statusFilter}|${categoryFilter}|${performanceFilter}|${filteredPositions.length}`,
  });
  const visibleOrders = useProgressiveList({
    items: orders.filter((order) => order.asset_code === asset && amount(order.remaining_quantity) > 0),
    initialCount: visibleOrderCount,
    step: 5,
    resetKey: `${asset}|${orders.length}`,
  });
  const historicalOrders = useMemo(() => orderHistory
    .filter((row) => row.asset_code === asset && !['OPEN', 'PARTIALLY_FILLED'].includes(String(row.status).toUpperCase()))
    .sort((a, b) => (Date.parse(b.updated_at ?? b.created_at) || 0) - (Date.parse(a.updated_at ?? a.created_at) || 0)), [orderHistory, asset]);
  const historyEvents = useMemo(() => [
    ...historyRows.map((row, index) => ({ kind: 'market' as const, key: `market-${row.market_id}-${row.selected_outcome}-${row.settled_at ?? index}`, at: row.settled_at, market: row })),
    ...historicalOrders.map((row) => ({ kind: 'order' as const, key: `order-${row.order_id}`, at: row.updated_at ?? row.created_at, order: row })),
  ].sort((a, b) => (Date.parse(b.at ?? '') || 0) - (Date.parse(a.at ?? '') || 0)), [historyRows, historicalOrders]);
  const visibleHistory = useProgressiveList({
    items: historyEvents,
    initialCount: visibleHistoryCount,
    step: 8,
    resetKey: `${asset}|${historyEvents.length}`,
  });
  const periodSettledRows = settledRows.filter((row) => (Date.parse(row.settled_at ?? '') || 0) >= cutoff);
  const periodSettledPnl = periodSettledRows.reduce((sum, row) => sum + amount(row.realized_pnl), 0);
  const periodWinLossRows = periodSettledRows.filter((row) => ['WON', 'LOST'].includes(String(row.result).toUpperCase()));
  const periodWinRate = periodWinLossRows.length
    ? periodWinLossRows.filter((row) => String(row.result).toUpperCase() === 'WON').length / periodWinLossRows.length
    : null;
  const historicalPnlSeries = [...periodSettledRows]
    .sort((a, b) => Date.parse(a.settled_at ?? '') - Date.parse(b.settled_at ?? ''))
    .reduce<{ at: string; value: number }[]>((series, row) => {
      const previous = series.length ? series[series.length - 1].value : 0;
      series.push({ at: row.settled_at as string, value: previous + amount(row.realized_pnl) });
      return series;
    }, []);

  const retry = () => {
    setMarksLoading(true);
    setHistoryLoading(true);
    setOrderHistoryLoading(true);
    setRetryValuation((value) => value + 1);
    onRetry();
  };

  return (
    <View style={{ gap: density.phone ? 8 : density.sectionGap }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <VadText variant="title">Portfolio</VadText>
          <VadText variant="caption" tone="secondary">Track your predictions, positions and performance.</VadText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Show all-time portfolio performance" onPress={() => setPeriod('ALL')} style={({ pressed }) => ({
          minHeight: 31, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
          borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
          paddingHorizontal: 12, opacity: pressed ? 0.75 : 1,
        })}>
          <VadText variant="caption" tone="secondary">All Time</VadText>
          <VadIcon name="chevronRight" size={13} tone="tertiary" />
        </Pressable>
      </View>

      <TourTarget id="portfolio-summary">
        <VadCard style={{ padding: density.phone ? 12 : 16, gap: 9, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0, flex: 1 }}>
              <VadText variant="caption" tone="secondary" numberOfLines={1}>Total Portfolio Value</VadText>
              <Pressable accessibilityRole="button" accessibilityLabel={balanceHidden ? 'Show portfolio value' : 'Hide portfolio value'} onPress={() => setBalanceHidden((hidden) => !hidden)} hitSlop={7}>
                <VadIcon name={balanceHidden ? 'eyeOff' : 'eye'} size={17} tone="secondary" />
              </Pressable>
            </View>
            <CompactRangeSwitch value={period} onChange={setPeriod} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1.06, minWidth: 0, gap: 3 }}>
              <VadText variant="title" numberOfLines={1} adjustsFontSizeToFit>
                {balanceHidden ? '••••••••' : latestSnapshot?.valuation_complete && latestSnapshot.total_value != null ? assetMoney(latestSnapshot.total_value, asset) : '—'}
              </VadText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <VadText variant="caption" tone="secondary" numberOfLines={1}>
                  {historyLoading ? 'Updating value…' : latestSnapshot?.valuation_complete && latestSnapshot.total_value != null ? 'Account value' : 'Valuation unavailable'}
                </VadText>
                {assetOptions.length > 1 ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Change portfolio currency, current ${asset}`} onPress={() => {
                    const current = assetOptions.indexOf(asset);
                    setSelectedAsset(assetOptions[(current + 1) % assetOptions.length] ?? asset);
                  }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, backgroundColor: theme.colors.surfaceRaised, opacity: pressed ? 0.75 : 1 })}>
                    <VadText variant="caption" tone="brand" style={{ fontSize: 10 }}>{asset}</VadText>
                    <VadIcon name="chevronRight" size={10} tone="brand" />
                  </Pressable>
                ) : <VadText variant="caption" tone="tertiary">{asset}</VadText>}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 }}>
                <VadText variant="caption" tone={performanceDelta == null ? 'tertiary' : performanceDelta >= 0 ? 'yes' : 'no'} numberOfLines={1} adjustsFontSizeToFit>
                  {performanceDelta == null
                    ? 'Performance history building'
                    : `${performanceDelta >= 0 ? '+' : '−'}${assetMoney(Math.abs(performanceDelta), asset)}`}
                </VadText>
                {performancePercent != null ? (
                  <VadText variant="caption" tone={performancePercent >= 0 ? 'yes' : 'no'} numberOfLines={1}>
                    ({performancePercent >= 0 ? '+' : ''}{(performancePercent * 100).toFixed(2)}%)
                  </VadText>
                ) : null}
              </View>
              {latestSnapshot && !latestSnapshot.valuation_complete ? (
                <VadText variant="caption" tone="tertiary" numberOfLines={1}>
                  {latestSnapshot.unpriced_position_count} position(s) need a fresh mark
                </VadText>
              ) : null}
            </View>
            <View style={{ flex: 0.94, minWidth: 0, height: 76, justifyContent: 'center', alignItems: 'stretch' }}>
              {historyLoading ? (
                <View style={{ height: 2, width: '34%', borderRadius: 4, alignSelf: 'center', backgroundColor: theme.colors.brandPrimary, opacity: 0.55 }} />
              ) : completePeriodSnapshots.length >= 2 ? (
                <PortfolioLineChart
                  values={completePeriodSnapshots.map((snapshot) => amount(snapshot.total_value))}
                  width={Math.max(120, Math.min(200, density.width * 0.38))}
                  height={72}
                  positive={performanceDelta == null || performanceDelta >= 0}
                />
              ) : (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 2 }}>
                  <VadText variant="caption" tone="tertiary" style={{ textAlign: "right" }}>History building</VadText>
                </View>
              )}
            </View>
          </View>
          {historyError || marksError ? (
            <View style={{ gap: 5 }}>
              {historyError ? <InlineError message={historyError} onRetry={retry} /> : null}
              {marksError ? <InlineError message={marksError} onRetry={retry} /> : null}
            </View>
          ) : null}
        </VadCard>
      </TourTarget>

      <EmbeddedWalletModal showUsdcBalance={enabledCurrencies.includes('USDC')} compact />

      <TradingPerformanceCard
        asset={asset}
        period={period}
        settledRows={periodSettledRows}
        winLossRows={periodWinLossRows}
        realizedPnl={periodSettledPnl}
        winRate={periodWinRate}
        pnlSeries={historicalPnlSeries}
        openCount={openCount}
        openValueText={openValueText}
        committedStakeText={committedStakeText}
      />

      <TourTarget id="portfolio-switcher">
        <PortfolioTabControl
          value={tab}
          options={[
            { value: 'positions', label: 'Positions' },
            { value: 'orders', label: 'Open Orders' },
            { value: 'history', label: 'History' },
            { value: 'performance', label: 'Performance' },
          ]}
          onChange={setTab}
        />
      </TourTarget>

      {tab === 'positions' ? (
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <VadText variant="bodyStrong">My Positions</VadText>
            <Pressable accessibilityRole="button" accessibilityLabel="Filter positions" onPress={() => setFiltersOpen((open) => !open)} style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9,
              borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border,
              backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
            })}>
              <VadIcon name="filter" size={16} tone="secondary" />
              <VadText variant="caption" tone="secondary">Filter</VadText>
            </Pressable>
          </View>
          {filtersOpen ? (
            <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
              <View style={{ gap: 5 }}>
                <VadText variant="caption" tone="secondary">Outcome</VadText>
                <VadSegmentedControl value={outcomeFilter} options={[{ value: 'all', label: 'All' }, { value: 'YES', label: 'Yes' }, { value: 'NO', label: 'No' }]} onChange={(value) => { setOutcomeFilter(value); setVisiblePositionCount(5); }} />
              </View>
              <View style={{ gap: 5 }}>
                <VadText variant="caption" tone="secondary">Valuation status</VadText>
                <VadSegmentedControl value={statusFilter} options={[{ value: 'all', label: 'All' }, { value: 'marked', label: 'Marked' }, { value: 'unmarked', label: 'Unmarked' }]} onChange={(value) => { setStatusFilter(value); setVisiblePositionCount(5); }} />
              </View>
              <View style={{ gap: 5 }}>
                <VadText variant="caption" tone="secondary">Performance</VadText>
                <VadSegmentedControl value={performanceFilter} options={[{ value: 'all', label: 'All' }, { value: 'profit', label: 'Profit' }, { value: 'loss', label: 'Loss' }, { value: 'unmarked', label: 'Unmarked' }]} onChange={(value) => { setPerformanceFilter(value); setVisiblePositionCount(5); }} />
              </View>
              {categories.length ? (
                <View style={{ gap: 5 }}>
                  <VadText variant="caption" tone="secondary">Category</VadText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6 }}>
                    <FilterPill label="All" selected={categoryFilter === 'all'} onPress={() => setCategoryFilter('all')} />
                    {categories.map((category) => <FilterPill key={category} label={marketCategoryLabel(category)} selected={categoryFilter === category} onPress={() => setCategoryFilter(category)} />)}
                    <FilterPill label="Other" selected={categoryFilter === 'Other'} onPress={() => setCategoryFilter('Other')} />
                  </ScrollView>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <VadButton label="Clear filters" variant="secondary" size="small" fullWidth={false} onPress={() => {
                  setOutcomeFilter('all'); setStatusFilter('all'); setPerformanceFilter('all'); setCategoryFilter('all'); setVisiblePositionCount(5);
                }} />
              </View>
            </VadCard>
          ) : null}

          {sectionErrors?.poolStakes ? <InlineError message={sectionErrors.poolStakes} onRetry={retry} /> : null}
          {activePoolStakes.length ? (
            <View style={{ gap: theme.spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <VadText variant="bodyStrong">Committed predictions</VadText>
                <VadText variant="caption" tone="secondary">{activePoolStakes.length} active</VadText>
              </View>
              {activePoolStakes.map((stake) => (
                <PoolStakePositionCard
                  key={stake.stake_id}
                  stake={stake}
                  onPress={() => onOpenMarket(stake.market_id)}
                />
              ))}
            </View>
          ) : null}
          {sectionErrors?.positions ? (
            <InlineError message={sectionErrors.positions} onRetry={retry} />
          ) : loading && positionsForAsset.length === 0 && activePoolStakes.length === 0 ? (
            <LoadingState label="Loading your positions…" />
          ) : marksLoading && positionsForAsset.length > 0 ? (
            <LoadingState label="Loading your position valuations…" />
          ) : filteredPositions.length ? (
            <View style={{ gap: theme.spacing.sm }}>
              {visiblePositions.visibleItems.map((position) => (
                <PositionCard
                  key={positionKey(position.instrument_id, position.outcome_code)}
                  position={position}
                  market={marketsById.get(position.instrument_id)}
                  onPress={() => onOpenPosition(position)}
                />
              ))}
              {visiblePositions.remainingCount > 0 ? <VadButton label={`Show next ${visiblePositions.nextCount}`} variant="secondary" onPress={visiblePositions.showMore} /> : null}
            </View>
          ) : (
            <VadEmptyState
              title={activePoolStakes.length ? 'No additional exchange positions' : 'No positions match these filters'}
              body={activePoolStakes.length
                ? 'Your committed predictions are shown above. Exchange-traded positions will appear here when you hold matched contracts.'
                : 'Adjust the filters or trade a market to see your positions here.'}
            />
          )}
        </View>
      ) : null}

      {tab === 'orders' ? (
        sectionErrors?.orders ? <InlineError message={sectionErrors.orders} onRetry={retry} />
          : loading && visibleOrders.totalCount === 0 ? <LoadingState label="Loading your open orders…" />
          : visibleOrders.totalCount ? (
            <View style={{ gap: theme.spacing.sm }}>
              {visibleOrders.visibleItems.map((order) => <OrderCard key={order.order_id} order={order} onPress={() => onOpenOrder(order)} />)}
              {visibleOrders.remainingCount > 0 ? <VadButton label={`Show next ${visibleOrders.nextCount} orders`} variant="secondary" onPress={visibleOrders.showMore} /> : null}
            </View>
          ) : <VadEmptyState title="No open orders" body="Open and partially filled orders appear here. Filled and cancelled orders stay in History." />
      ) : null}

      {tab === 'history' ? (
        <View style={{ gap: theme.spacing.sm }}>
          {sectionErrors?.marketHistory ? <InlineError message={sectionErrors.marketHistory} onRetry={retry} /> : null}
          {sectionErrors?.settlements ? <InlineError message={sectionErrors.settlements} onRetry={retry} /> : null}
          {orderHistoryError ? <InlineError message={orderHistoryError} onRetry={retry} /> : null}
          {(loading || orderHistoryLoading) && historyEvents.length === 0 ? (
            <LoadingState label="Loading your trading and settlement history…" />
          ) : historyEvents.length ? (
            <View style={{ gap: theme.spacing.sm }}>
              {visibleHistory.visibleItems.map((event) => event.kind === 'market'
                ? <HistoryCard key={event.key} row={event.market} />
                : <OrderHistoryCard key={event.key} order={event.order} onPress={() => onOpenOrder(event.order)} />)}
              {visibleHistory.remainingCount > 0 ? <VadButton label={`Show next ${visibleHistory.nextCount} history records`} variant="secondary" onPress={visibleHistory.showMore} /> : null}
            </View>
          ) : !sectionErrors?.marketHistory && !orderHistoryError ? (
            <VadEmptyState title="No portfolio history yet" body="Trades, orders, outcomes, refunds and settlement results appear here from your account records." />
          ) : null}
          {settlements.filter((row) => row.asset_code === asset).length ? (
            <VadProgressiveSection title="Settlement receipts" icon="activity" summary={<VadText variant="caption" tone="tertiary">{settlements.filter((row) => row.asset_code === asset).length} persisted records</VadText>}>
              {settlements.filter((row) => row.asset_code === asset).slice(0, 8).map((receipt) => <SettlementCard key={receipt.settlement_id} receipt={receipt} />)}
            </VadProgressiveSection>
          ) : null}
        </View>
      ) : null}

      {tab === 'performance' ? (
        <View style={{ gap: theme.spacing.md }}>
          <View style={{ gap: 4 }}>
            <VadText variant="bodyStrong">Settled results · {period}</VadText>
            <VadText variant="caption" tone="secondary">Every item below is a persisted market settlement in {asset}. Refunds and voids remain visible here, but do not count as wins or losses.</VadText>
          </View>
          {periodSettledRows.length ? (
            <View style={{ gap: theme.spacing.sm }}>
              {periodSettledRows.slice(-8).reverse().map((row, index) => <HistoryCard key={`perf-${row.market_id}-${row.selected_outcome}-${row.settled_at ?? index}`} row={row} />)}
            </View>
          ) : <VadEmptyState title="No realized performance yet" body="Realized P&L is available after VAD records a settlement for one of your predictions." />}
        </View>
      ) : null}

    </View>
  );
}

function PoolStakePositionCard({ stake, onPress }: { stake: PoolStakeRow; onPress: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const outcome = String(stake.outcome_code).toUpperCase();
  const isYes = outcome === 'YES';
  const isNo = outcome === 'NO';
  const outcomeLabel = stake.outcome_label?.trim() || (isYes || isNo ? outcome === 'YES' ? 'Yes' : 'No' : outcome.replace(/[_-]+/g, ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase()));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${stake.market_title} prediction`} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}>
      <VadCard style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: density.phone ? 10 : 12, borderRadius: 15, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
        <View style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceRaised }}>
          <VadIcon name="activity" size={20} tone="brand" />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <VadText variant="bodyStrong" numberOfLines={2}>{stake.market_title}</VadText>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <VadChip label={outcomeLabel} tone={isYes ? 'yes' : isNo ? 'no' : 'neutral'} />
            <VadText variant="caption" tone="secondary">{marketStatusLabel(stake.market_status)}</VadText>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3, maxWidth: 116 }}>
          <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{assetMoney(stake.amount, stake.asset_code)}</VadText>
          <VadText variant="caption" tone="secondary">Stake</VadText>
          {amount(stake.trading_fee) > 0 ? <VadText variant="caption" tone="tertiary">{assetMoney(stake.trading_fee, stake.asset_code)} fee</VadText> : null}
        </View>
        <VadIcon name="chevronRight" size={16} tone="tertiary" />
      </VadCard>
    </Pressable>
  );
}

function PositionCard({ position, market, onPress }: { position: PositionModel; market?: MarketCatalogItem; onPress: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const markStatus = String(position.mark_status ?? 'UNAVAILABLE').toUpperCase();
  const pnl = position.unrealized_pnl == null ? null : amount(position.unrealized_pnl);
  const imagePath = position.media_path ?? market?.media_path ?? null;
  const imageUrl = marketMediaUrl(imagePath);
  const statusLabel = markStatus === 'STALE' ? 'Stale price'
    : markStatus === 'UNPRICED' ? 'Not priced'
      : markStatus === 'SETTLED' ? 'Settled'
        : 'No mark';
  const pnlTone = pnl == null ? 'secondary' : pnl >= 0 ? 'yes' : 'no';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${position.market_title} ${position.outcome_code} position`} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}>
      <VadCard style={{ padding: density.phone ? 7 : 9, borderRadius: 15, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, gap: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: density.phone ? 7 : 9 }}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} resizeMode="cover" style={{ width: density.phone ? 62 : 74, height: density.phone ? 52 : 60, borderRadius: 9, backgroundColor: theme.colors.surfaceMuted, flexShrink: 0 }} />
          ) : (
            <View style={{ width: density.phone ? 62 : 74, height: density.phone ? 52 : 60, borderRadius: 9, backgroundColor: theme.colors.surfaceMuted, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <VadIcon name="activity" size={21} tone="tertiary" />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 70, gap: 4 }}>
            <VadText variant="bodyStrong" numberOfLines={2} style={{ fontSize: density.phone ? 11 : 13, lineHeight: density.phone ? 14 : 17 }}>{position.market_title}</VadText>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
              <VadChip label={position.outcome_code === 'YES' ? 'Yes' : position.outcome_code === 'NO' ? 'No' : position.outcome_code} tone={position.outcome_code === 'YES' ? 'yes' : 'no'} />
              <VadText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: density.phone ? 9 : 10, lineHeight: density.phone ? 11 : 13 }}>{amount(position.quantity).toLocaleString()} contracts</VadText>
            </View>
          </View>
          <View style={{ width: density.phone ? 72 : 92, flexShrink: 0, gap: 3 }}>
            <View style={{ gap: 0 }}>
              <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: density.phone ? 10 : 12, lineHeight: density.phone ? 13 : 15 }}>{assetMoney(position.total_cost_basis, position.asset_code)}</VadText>
              <VadText variant="caption" tone="secondary" style={{ fontSize: density.phone ? 8 : 9, lineHeight: density.phone ? 10 : 12 }}>Total Stake</VadText>
            </View>
            <View style={{ gap: 0 }}>
              <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: density.phone ? 10 : 12, lineHeight: density.phone ? 13 : 15 }}>{position.current_value == null || markStatus === 'SETTLED' ? '—' : assetMoney(position.current_value, position.asset_code)}</VadText>
              <VadText variant="caption" tone="secondary" style={{ fontSize: density.phone ? 8 : 9, lineHeight: density.phone ? 10 : 12 }}>Current Value</VadText>
            </View>
          </View>
          <View style={{ width: density.phone ? 79 : 96, minHeight: 42, flexShrink: 0, borderRadius: 10, borderWidth: 1, borderColor: pnl == null ? theme.colors.border : pnl >= 0 ? theme.colors.yes : theme.colors.no, backgroundColor: pnl == null ? theme.colors.surfaceRaised : pnl >= 0 ? theme.colors.yesSoft : theme.colors.noSoft, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 5, gap: 1 }}>
            <VadText variant="bodyStrong" tone={pnlTone} numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: density.phone ? 10 : 12, lineHeight: density.phone ? 13 : 15 }}>
              {pnl == null ? statusLabel : `${pnl >= 0 ? '+' : '−'}${assetMoney(Math.abs(pnl), position.asset_code)}`}
            </VadText>
            <VadText variant="caption" tone={pnlTone} numberOfLines={1} style={{ fontSize: density.phone ? 9 : 10, lineHeight: density.phone ? 11 : 13 }}>
              {pnl == null ? 'P&L' : position.return_percentage == null ? 'P&L' : `${amount(position.return_percentage) >= 0 ? '+' : ''}${(amount(position.return_percentage) * 100).toFixed(2)}%`}
            </VadText>
          </View>
          <VadIcon name="chevronRight" size={15} tone="tertiary" />
        </View>
      </VadCard>
    </Pressable>
  );
}

function OrderCard({ order, onPress }: { order: OrderRow; onPress: () => void }) {
  const theme = useVadTheme();
  const quantity = amount(order.quantity);
  const fillPercent = quantity > 0 ? Math.max(0, Math.min(1, amount(order.filled_quantity) / quantity)) : 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${order.market_title} order`} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      <VadCard variant="raised" style={{ gap: theme.spacing.sm, padding: 13 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1, gap: 3 }}>
            <VadText variant="bodyStrong" numberOfLines={2}>{order.market_title}</VadText>
            <VadText variant="caption" tone="secondary">{order.side} {order.outcome_code} · {order.asset_code} · {new Date(order.created_at).toLocaleDateString()}</VadText>
          </View>
          <VadChip label={String(order.status).replaceAll('_', ' ')} tone="brand" />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <MetricTile label="Limit price" value={pct(order.limit_price)} />
          <MetricTile label="Remaining contracts" value={amount(order.remaining_quantity).toLocaleString()} />
          <MetricTile label="Filled" value={pct(fillPercent)} />
        </View>
        <View style={{ height: 5, borderRadius: 99, backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(fillPercent * 100)}%` as DimensionValue, height: '100%', backgroundColor: theme.colors.brandPrimary }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
          <VadText variant="caption" tone="brand">View order</VadText>
          <VadIcon name="chevronRight" size={16} tone="brand" />
        </View>
      </VadCard>
    </Pressable>
  );
}

function OrderHistoryCard({ order, onPress }: { order: PortfolioOrderHistoryRow; onPress: () => void }) {
  const theme = useVadTheme();
  const status = String(order.status).toUpperCase();
  const filled = amount(order.filled_quantity);
  const total = amount(order.quantity);
  const isSuccessful = status === 'FILLED' || status === 'COMPLETE' || status === 'COMPLETED';
  const needsAttention = status.includes('CANCEL') || status.includes('EXPIRE') || status.includes('REJECT') || status.includes('FAIL');
  const tone = isSuccessful ? 'yes' : needsAttention ? 'no' : 'brand';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open historical ${status.toLowerCase()} order for ${order.market_title}`} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      <VadCard variant="raised" style={{ gap: theme.spacing.sm, padding: 13 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <VadText variant="bodyStrong" numberOfLines={2}>{order.market_title}</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <VadChip label={order.outcome_code} tone={order.outcome_code === 'YES' ? 'yes' : 'no'} />
              <VadText variant="caption" tone="secondary">{order.side} · {order.asset_code}</VadText>
            </View>
          </View>
          <VadChip label={status.replaceAll('_', ' ')} tone={tone} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <MetricTile label="Limit price" value={pct(order.limit_price)} />
          <MetricTile label="Contracts filled" value={filled.toLocaleString()} />
          <MetricTile label="Contracts total" value={total.toLocaleString()} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <VadText variant="caption" tone="tertiary">Last updated {new Date(order.updated_at || order.created_at).toLocaleString()}</VadText>
          <VadIcon name="chevronRight" size={16} tone="tertiary" />
        </View>
      </VadCard>
    </Pressable>
  );
}

function HistoryCard({ row }: { row: MarketHistoryRow }) {
  const result = String(row.result).toUpperCase();
  const settled = ['WON', 'LOST', 'REFUNDED', 'VOID'].includes(result);
  const pnl = amount(row.realized_pnl);
  return (
    <VadCard variant="raised" style={{ gap: 8, padding: 13 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <VadText variant="bodyStrong" numberOfLines={2}>{row.market_title}</VadText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <VadChip label={row.selected_outcome} tone={row.selected_outcome === 'YES' ? 'yes' : 'no'} />
            <VadText variant="caption" tone="secondary">{row.asset_code} · {result}</VadText>
          </View>
        </View>
        <VadText variant="caption" tone="tertiary">{row.settled_at ? new Date(row.settled_at).toLocaleDateString() : 'Pending settlement'}</VadText>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <MetricTile label="Recorded stake" value={assetMoney(amount(row.stake_amount) + amount(row.trading_fee), row.asset_code)} />
        <MetricTile label="Net payout" value={settled ? assetMoney(row.net_payout, row.asset_code) : '—'} />
        <MetricTile label="Realized P&L" value={settled ? `${pnl >= 0 ? '+' : '−'}${assetMoney(Math.abs(pnl), row.asset_code)}` : '—'} tone={settled ? (pnl >= 0 ? 'yes' : 'no') : 'secondary'} />
      </View>
      {row.final_outcome ? <VadText variant="caption" tone="tertiary">Final outcome: {row.final_outcome}</VadText> : null}
    </VadCard>
  );
}

function SettlementCard({ receipt }: { receipt: SettlementReceiptRow }) {
  const theme = useVadTheme();
  return (
    <VadCard variant="raised" style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <VadText variant="bodyStrong" numberOfLines={2}>{receipt.market_title}</VadText>
          <VadText variant="caption" tone="secondary">{receipt.asset_code} · {new Date(receipt.settled_at).toLocaleString()}</VadText>
        </View>
        <VadChip label={receipt.outcome_code} tone={receipt.outcome_code === 'YES' ? 'yes' : 'no'} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <MetricTile label="Gross" value={assetMoney(receipt.gross_amount, receipt.asset_code)} />
        <MetricTile label="Fees" value={assetMoney(receipt.fee_amount, receipt.asset_code)} />
        <MetricTile label="Net credited" value={assetMoney(receipt.net_amount, receipt.asset_code)} tone="yes" />
      </View>
    </VadCard>
  );
}

function PortfolioTabControl({ value, options, onChange }: {
  value: PortfolioTab;
  options: { value: PortfolioTab; label: string }[];
  onChange: (value: PortfolioTab) => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignItems: 'center', padding: 3, gap: 3, borderRadius: 23, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(option.value)} style={({ pressed }) => ({
            flex: 1, minWidth: 0, minHeight: density.phone ? 34 : 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
            paddingHorizontal: density.phone ? 3 : 7, backgroundColor: selected ? theme.colors.brandPrimary : 'transparent',
            opacity: pressed ? 0.78 : 1,
          })}>
            <VadText variant="caption" tone={selected ? 'inverse' : 'secondary'} numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: density.phone ? 10 : 12, lineHeight: density.phone ? 13 : 15, fontWeight: selected ? '700' : '500' }}>{option.label}</VadText>
          </Pressable>
        );
      })}
    </View>
  );
}

function CompactRangeSwitch({ value, onChange }: { value: Period; onChange: (value: Period) => void }) {
  const theme = useVadTheme();
  const options: { value: Period; label: string }[] = [
    { value: '1D', label: '1D' },
    { value: '1W', label: '1W' },
    { value: '1M', label: '1M' },
    { value: '1Y', label: '1Y' },
    { value: 'ALL', label: 'ALL' },
  ];
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 14, backgroundColor: theme.colors.surfaceRaised, padding: 3 }}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable key={option.value} accessibilityRole="tab" accessibilityLabel={option.value === 'ALL' ? 'All time' : option.label} accessibilityState={{ selected }} onPress={() => onChange(option.value)} style={({ pressed }) => ({
            minWidth: 26, minHeight: 25, paddingHorizontal: 4, borderRadius: 9,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: selected ? theme.colors.brandPrimary : 'transparent',
            opacity: pressed ? 0.75 : 1,
          })}>
            <VadText variant="caption" tone={selected ? 'inverse' : 'secondary'} style={{ fontSize: 10, lineHeight: 12, fontWeight: selected ? '700' : '500' }}>{option.label}</VadText>
          </Pressable>
        );
      })}
    </View>
  );
}

function TradingPerformanceCard({
  asset,
  period,
  settledRows,
  winLossRows,
  realizedPnl,
  winRate,
  pnlSeries,
  openCount,
  openValueText,
  committedStakeText,
}: {
  asset: string;
  period: Period;
  settledRows: MarketHistoryRow[];
  winLossRows: MarketHistoryRow[];
  realizedPnl: number;
  winRate: number | null;
  pnlSeries: { at: string; value: number }[];
  openCount: number;
  openValueText: string;
  committedStakeText: string;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const wins = winLossRows.filter((row) => String(row.result).toUpperCase() === 'WON').length;
  const losses = winLossRows.filter((row) => String(row.result).toUpperCase() === 'LOST').length;
  const decidedCount = wins + losses;
  const pnlTone = settledRows.length === 0 ? 'secondary' : realizedPnl >= 0 ? 'yes' : 'no';
  const winWidth = `${decidedCount ? (wins / decidedCount) * 100 : 0}%` as DimensionValue;
  const lossWidth = `${decidedCount ? (losses / decidedCount) * 100 : 0}%` as DimensionValue;

  return (
    <VadCard style={{
      padding: density.phone ? 12 : 16,
      gap: 11,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surface,
      overflow: 'hidden',
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.brandPrimary }} />
          <VadText variant="caption" tone="secondary">TRADING PERFORMANCE</VadText>
        </View>
        <VadChip label={`${asset} · ${period}`} tone="brand" />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <VadText variant="caption" tone="tertiary">NET REALIZED P&L</VadText>
          <VadText
            variant={density.phone ? 'title' : 'heading'}
            tone={pnlTone}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {settledRows.length ? `${realizedPnl >= 0 ? '+' : '−'}${assetMoney(Math.abs(realizedPnl), asset)}` : '—'}
          </VadText>
          <VadText variant="caption" tone="secondary" numberOfLines={1}>
            {settledRows.length} settled record{settledRows.length === 1 ? '' : 's'}
          </VadText>
        </View>
        <View style={{ minWidth: density.phone ? 84 : 112, alignItems: 'flex-end', gap: 3 }}>
          <VadText variant="caption" tone="tertiary">WIN RATE</VadText>
          <VadText variant="heading" tone={winRate == null ? 'secondary' : 'yes'} numberOfLines={1}>
            {winRate == null ? '—' : pct(winRate)}
          </VadText>
          <VadText variant="caption" tone="secondary">{wins}W · {losses}L</VadText>
        </View>
      </View>

      <View style={{ gap: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <VadText variant="caption" tone="tertiary">CUMULATIVE REALIZED P&L</VadText>
          <VadText variant="caption" tone="tertiary">Zero baseline</VadText>
        </View>
        {pnlSeries.length >= 2 ? (
          <View style={{ height: 84 }}>
            <PortfolioLineChart
              values={pnlSeries.map((point) => point.value)}
              width={Math.max(220, density.width - 72)}
              height={82}
              positive={realizedPnl >= 0}
              zeroBaseline
            />
          </View>
        ) : (
          <View style={{
            minHeight: 56,
            justifyContent: 'center',
            paddingHorizontal: 10,
            borderRadius: 12,
            backgroundColor: theme.colors.surfaceRaised,
          }}>
            <VadText variant="caption" tone="secondary">
              {pnlSeries.length === 1
                ? 'One dated result recorded. Another settled result is needed to plot a trend.'
                : 'Your realized P&L trend will appear after two dated settlement results. No results are estimated.'}
            </VadText>
          </View>
        )}
      </View>

      <View style={{ gap: 7 }}>
        <View style={{ height: 6, flexDirection: 'row', borderRadius: 99, overflow: 'hidden', backgroundColor: theme.colors.surfaceMuted }}>
          {decidedCount > 0 ? (
            <>
              {wins > 0 ? <View style={{ width: winWidth, height: '100%', backgroundColor: theme.colors.yes }} /> : null}
              {losses > 0 ? <View style={{ width: lossWidth, height: '100%', backgroundColor: theme.colors.no }} /> : null}
            </>
          ) : <View style={{ width: '100%', height: '100%', backgroundColor: theme.colors.surfaceMuted }} />}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.yes }} />
            <VadText variant="caption" tone="secondary">{wins} wins</VadText>
          </View>
          <VadText variant="caption" tone="tertiary">{decidedCount} decided</VadText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <VadText variant="caption" tone="secondary">{losses} losses</VadText>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.no }} />
          </View>
        </View>
      </View>

      <View style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 10,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        paddingTop: 9,
      }}>
        <View style={{ flex: 0.7, minWidth: 0, gap: 2 }}>
          <VadText variant="caption" tone="tertiary">OPEN POSITIONS</VadText>
          <VadText variant="bodyStrong">{openCount}</VadText>
        </View>
        <View style={{ flex: 1.15, minWidth: 0, alignItems: 'center', gap: 2 }}>
          <VadText variant="caption" tone="tertiary" numberOfLines={1}>COMMITTED STAKES</VadText>
          <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{committedStakeText}</VadText>
        </View>
        <View style={{ flex: 1.1, minWidth: 0, alignItems: 'flex-end', gap: 2 }}>
          <VadText variant="caption" tone="tertiary">CURRENT VALUE</VadText>
          <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>
            {openValueText}
          </VadText>
        </View>
      </View>
    </VadCard>
  );
}

function MetricTile({ label, value, tone }: { label: string; value: string; tone?: 'yes' | 'no' | 'brand' | 'secondary' }) {
  const theme = useVadTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: 11, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, padding: 9, gap: 3 }}>
      <VadText variant="caption" tone="tertiary" numberOfLines={1}>{label}</VadText>
      <VadText variant="bodyStrong" tone={tone ?? 'secondary'} numberOfLines={2} adjustsFontSizeToFit>{value}</VadText>
    </View>
  );
}

function FilterPill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => ({
      borderRadius: 12, borderWidth: 1, borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
      backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
      paddingHorizontal: 11, paddingVertical: 8, opacity: pressed ? 0.78 : 1,
    })}>
      <VadText variant="caption" tone={selected ? 'brand' : 'secondary'}>{label}</VadText>
    </Pressable>
  );
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const theme = useVadTheme();
  return (
    <VadCard variant="raised" style={{ gap: 8, borderColor: theme.colors.border }}>
      <VadText variant="bodyStrong">Portfolio data is temporarily unavailable</VadText>
      <VadText variant="caption" tone="secondary">{message}</VadText>
      <VadButton label="Try again" variant="secondary" onPress={onRetry} />
    </VadCard>
  );
}

function LoadingState({ label }: { label: string }) {
  const theme = useVadTheme();
  return (
    <VadCard variant="raised" style={{ alignItems: 'center', padding: theme.spacing.lg, gap: 8 }}>
      <VadIcon name="activity" size={21} tone="brand" />
      <VadText variant="caption" tone="secondary">{label}</VadText>
    </VadCard>
  );
}

function PortfolioLineChart({ values, width, height, positive, zeroBaseline = false }: { values: number[]; width: number; height: number; positive: boolean; zeroBaseline?: boolean }) {
  const theme = useVadTheme();
  if (values.length < 2 || values.some((value) => !Number.isFinite(value))) {
    return <View style={{ height, justifyContent: "center", alignItems: "center", paddingHorizontal: 12 }}><VadText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>Record more genuine valuations to show this trend. No historical values are estimated.</VadText></View>;
  }
  const min = zeroBaseline ? Math.min(0, ...values) : Math.min(...values);
  const max = zeroBaseline ? Math.max(0, ...values) : Math.max(...values);
  const range = max - min || Math.max(Math.abs(max), 1);
  const inset = 8;
  const innerHeight = height - inset * 2;
  const baselineY = inset + (1 - (0 - min) / range) * innerHeight;
  const coords = values.map((value, index) => ({
    x: inset + (index / (values.length - 1)) * Math.max(1, width - inset * 2),
    y: inset + (1 - (value - min) / range) * innerHeight,
  }));
  const color = positive ? '#16D7A0' : '#FF5B70';
  return (
    <View style={{ width: '100%', height, position: 'relative', overflow: 'hidden' }}>
      {zeroBaseline ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: baselineY, borderTopWidth: 1, borderTopColor: theme.colors.borderStrong, borderStyle: 'dashed', opacity: 0.85 }} />
      ) : null}
      {coords.slice(1).map((point, index) => {
        const previous = coords[index];
        const dx = point.x - previous.x;
        const dy = point.y - previous.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        return <View key={index} style={{ position: 'absolute', left: (previous.x + point.x) / 2 - length / 2, top: (previous.y + point.y) / 2 - 1.5, width: length, height: 3, borderRadius: 3, backgroundColor: color, transform: [{ rotate: `${angle}rad` }] }} />;
      })}
      <View style={{ position: 'absolute', right: 2, top: Math.min(...coords.map((point) => point.y)) - 3, width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, borderBottomWidth: 1, borderBottomColor: theme.colors.border, opacity: 0.5 }} />
    </View>
  );
}

function positionKey(instrumentId: string, outcome: string) {
  return `${instrumentId}|${outcome.toUpperCase()}`;
}

function amount(value: unknown) {
  if (value == null || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
