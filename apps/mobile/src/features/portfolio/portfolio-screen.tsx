import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View, type DimensionValue } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadProgressiveSection } from '@/components/ui/vad-progressive-section';
import { VadSegmentedControl } from '@/components/ui/vad-segmented-control';
import { VadText } from '@/components/ui/vad-text';
import { assetMoney, pct } from '@/features/markets/format';
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
  type PoolStakeRow,
  type PortfolioOrderHistoryRow,
  type PortfolioPositionMarkRow,
  type PortfolioValuationSnapshotRow,
  type PositionRow,
  type SettlementReceiptRow,
  type WalletRow,
} from '@/services/market-api';

type PortfolioTab = 'positions' | 'orders' | 'history' | 'performance';
type Period = '1D' | '1W' | '1M' | '1Y' | 'ALL';
type OutcomeFilter = 'all' | 'YES' | 'NO';
type StatusFilter = 'all' | 'active' | 'completed';
type PerformanceFilter = 'all' | 'profit' | 'loss' | 'unmarked';
type PositionModel = PositionRow & Partial<PortfolioPositionMarkRow>;

const PERIOD_DAYS: Record<Period, number> = { '1D': 1, '1W': 7, '1M': 30, '1Y': 365, ALL: 3650 };

export function PortfolioScreen({
  positions,
  orders,
  settlements,
  marketHistory,
  poolStakes,
  markets,
  wallet,
  sectionErrors,
  loading = false,
  onRetry,
  onOpenPosition,
  onOpenOrder,
}: {
  positions: PositionRow[];
  orders: OrderRow[];
  settlements: SettlementReceiptRow[];
  marketHistory: MarketHistoryRow[];
  poolStakes: PoolStakeRow[];
  markets: MarketCatalogItem[];
  wallet: WalletRow[];
  sectionErrors?: { positions?: string | null; orders?: string | null; poolStakes?: string | null; marketHistory?: string | null; settlements?: string | null };
  loading?: boolean;
  onRetry: () => void;
  onOpenPosition: (position: PositionRow) => void;
  onOpenOrder: (order: OrderRow | PortfolioOrderHistoryRow) => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const { enabledCurrencies } = useCurrencyPreference();
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
  }, [retryValuation, positions, orders, wallet, marketHistory, poolStakes, settlements, markets]);

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
    () => enabledCurrencies.filter((code): code is VADCurrency => ['NGN', 'USDC', 'TNGN'].includes(code)),
    [enabledCurrencies],
  );
  const asset = assetOptions.includes(selectedAsset) ? selectedAsset : assetOptions[0] ?? 'NGN';
  const isTngn = asset === 'TNGN';

  const marketsById = useMemo(() => new Map(markets.map((market) => [market.instrument_public_id, market])), [markets]);
  const marksByKey = useMemo(() => new Map(marks.map((mark) => [positionKey(mark.instrument_id, mark.outcome_code), mark])), [marks]);
  const positionsForAsset = useMemo<PositionModel[]>(() => positions
    .filter((position) => position.asset_code === asset)
    .map((position) => {
      const mark = marksByKey.get(positionKey(position.instrument_id, position.outcome_code));
      return mark ? { ...position, ...mark } : position;
    }), [positions, asset, marksByKey]);
  const activeStakes = useMemo(() => poolStakes.filter((stake) => stake.asset_code === asset
    && !['SETTLED', 'VOIDED', 'CANCELLED', 'REFUNDED'].includes(String(stake.market_status).toUpperCase())), [poolStakes, asset]);
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
  const markedPositions = positionsForAsset.filter((position) => position.mark_status === 'MARKED');
  const winningPositions = markedPositions.filter((position) => amount(position.unrealized_pnl) > 0);
  const losingPositions = markedPositions.filter((position) => amount(position.unrealized_pnl) < 0);
  const realizedWinningRows = settledRows.filter((row) => String(row.result).toUpperCase() === 'WON');
  const realizedLosingRows = settledRows.filter((row) => String(row.result).toUpperCase() === 'LOST');
  const winningPnl = winningPositions.reduce((sum, position) => sum + amount(position.unrealized_pnl), 0)
    + realizedWinningRows.reduce((sum, row) => sum + Math.max(0, amount(row.realized_pnl)), 0);
  const losingPnl = losingPositions.reduce((sum, position) => sum + amount(position.unrealized_pnl), 0)
    + realizedLosingRows.reduce((sum, row) => sum + Math.min(0, amount(row.realized_pnl)), 0);
  const openPositionValue = openMarkedPositions.every((position) => position.mark_status === 'MARKED')
    ? openMarkedPositions.reduce((sum, position) => sum + amount(position.current_value), 0)
    : null;
  const tngnWins = isTngn ? settledRows.filter((row) => row.result === 'WON') : [];
  const tngnLosses = isTngn ? settledRows.filter((row) => row.result === 'LOST') : [];
  const winnersCount = isTngn ? tngnWins.length : winningPositions.length + realizedWinningRows.length;
  const losersCount = isTngn ? tngnLosses.length : losingPositions.length + realizedLosingRows.length;
  const winnersValue = isTngn
    ? tngnWins.reduce((sum, row) => sum + Math.max(0, amount(row.realized_pnl)), 0)
    : winningPnl;
  const losersValue = isTngn
    ? tngnLosses.reduce((sum, row) => sum + Math.min(0, amount(row.realized_pnl)), 0)
    : losingPnl;
  const openCount = isTngn ? activeStakes.length : openMarkedPositions.length;
  const openValueText = isTngn
    ? (activeStakes.length ? 'Unmarked' : assetMoney(0, asset))
    : openPositionValue == null ? '—' : assetMoney(openPositionValue, asset);

  const categories = useMemo(() => [...new Set(markets
    .filter((market) => market.asset_code === asset && market.category)
    .map((market) => market.category as string))].sort(), [markets, asset]);
  const filteredPositions = positionsForAsset.filter((position) => {
    const status = String(position.market_status ?? position.status ?? '').toUpperCase();
    const completed = position.mark_status === 'SETTLED' || ['SETTLED', 'RESOLVED', 'FINAL'].includes(status);
    const category = marketsById.get(position.instrument_id)?.category ?? 'Other';
    const pnl = position.unrealized_pnl == null ? null : amount(position.unrealized_pnl);
    return (outcomeFilter === 'all' || position.outcome_code.toUpperCase() === outcomeFilter)
      && (statusFilter === 'all' || (statusFilter === 'active' ? !completed : completed))
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
    setRetryValuation((value) => value + 1);
    onRetry();
  };

  return (
    <View style={{ gap: density.phone ? 14 : density.sectionGap }}>
      <View style={{ gap: 3 }}>
        <VadText variant="title">Portfolio</VadText>
        <VadText variant="caption" tone="secondary">Track your positions, orders and performance.</VadText>
      </View>

      <TourTarget id="portfolio-summary">
        <VadCard variant="brand" style={{ padding: density.phone ? 16 : theme.spacing.xl, gap: theme.spacing.md, borderRadius: 24, borderWidth: 1, borderColor: theme.colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: 3 }}>
              <VadText variant="caption" tone="secondary">TOTAL PORTFOLIO VALUE</VadText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <VadText variant="heading">{balanceHidden ? '••••••••' : latestSnapshot?.valuation_complete && latestSnapshot.total_value != null ? assetMoney(latestSnapshot.total_value, asset) : '—'}</VadText>
                <Pressable accessibilityRole="button" accessibilityLabel={balanceHidden ? 'Show portfolio value' : 'Hide portfolio value'} onPress={() => setBalanceHidden((hidden) => !hidden)} hitSlop={8}>
                  <VadIcon name={balanceHidden ? 'eyeOff' : 'eye'} size={19} tone="secondary" />
                </Pressable>
              </View>
              <VadText variant="caption" tone="secondary">
                {historyLoading ? 'Updating valuation…'
                  : latestSnapshot?.valuation_complete && latestSnapshot.total_value != null
                    ? `Cash ${balanceHidden ? '••••' : assetMoney(latestSnapshot.cash_balance, asset)} · Positions ${balanceHidden ? '••••' : assetMoney(latestSnapshot.positions_value, asset)}`
                    : `${latestSnapshot?.unpriced_position_count ?? (marks.length ? positionsForAsset.filter((p) => p.mark_status !== 'MARKED' && p.mark_status !== 'SETTLED').length : 0)} position(s) need a fresh price or confirmed settlement. Total is withheld until valuation is complete.`}
              </VadText>
            </View>
            {assetOptions.length > 1 ? (
              <View style={{ alignSelf: 'flex-start' }}>
                <VadChip label={asset} tone="brand" />
              </View>
            ) : null}
          </View>

          {assetOptions.length > 1 ? (
            <View style={{ gap: 5 }}>
              <VadText variant="caption" tone="secondary">Account currency</VadText>
              <VadSegmentedControl value={asset} options={assetOptions.map((code) => ({ value: code, label: code }))} onChange={setSelectedAsset} />
            </View>
          ) : null}

          <View style={{ gap: 8 }}>
            <VadSegmentedControl value={period} options={[{ value: '1D', label: '1D' }, { value: '1W', label: '1W' }, { value: '1M', label: '1M' }, { value: '1Y', label: '1Y' }, { value: 'ALL', label: 'ALL' }]} onChange={setPeriod} />
            <View style={{ height: 92, justifyContent: 'center' }}>
              {historyLoading ? (
                <View style={{ height: 3, width: '32%', borderRadius: 4, backgroundColor: theme.colors.brandPrimary, opacity: 0.6 }} />
              ) : (
                <PortfolioLineChart
                  values={completePeriodSnapshots.map((snapshot) => amount(snapshot.total_value))}
                  width={Math.max(220, Math.min(720, density.width - 72))}
                  height={88}
                  positive={performanceDelta == null || performanceDelta >= 0}
                />
              )}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <VadText variant="caption" tone="secondary">
                  {performanceDelta == null ? 'Period performance' : `${performanceDelta >= 0 ? '+' : '−'}${assetMoney(Math.abs(performanceDelta), asset)}`}
                </VadText>
                <VadText variant="caption" tone={performanceDelta == null ? 'tertiary' : performanceDelta >= 0 ? 'yes' : 'no'}>
                  {performanceDelta == null
                    ? (completePeriodSnapshots.length < 2 ? 'More real snapshots needed for a trend' : 'No comparable complete valuations')
                    : performancePercent == null ? 'Return percentage unavailable'
                      : `${performancePercent >= 0 ? '+' : ''}${(performancePercent * 100).toFixed(2)}% · net of recorded deposits/withdrawals`}
                </VadText>
              </View>
              <VadText variant="caption" tone="tertiary">{completePeriodSnapshots.length ? new Date(completePeriodSnapshots[completePeriodSnapshots.length - 1].observed_at).toLocaleDateString() : 'No history yet'}</VadText>
            </View>
          </View>
          {historyError ? <InlineError message={historyError} onRetry={retry} /> : null}
          {marksError ? <InlineError message={marksError} onRetry={retry} /> : null}
        </VadCard>
      </TourTarget>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SummaryMetric title="Winning positions" count={winnersCount} amount={winnersValue} asset={asset} tone="yes" />
        <SummaryMetric title="Losing positions" count={losersCount} amount={losersValue} asset={asset} tone="no" />
        <SummaryMetric title="Open positions" count={openCount} value={openValueText} />
      </View>

      <TourTarget id="portfolio-switcher">
        <VadSegmentedControl
          value={tab}
          options={[
            { value: 'positions', label: `Positions ${isTngn ? activeStakes.length : openMarkedPositions.length}` },
            { value: 'orders', label: `Open Orders ${orders.filter((order) => order.asset_code === asset && amount(order.remaining_quantity) > 0).length}` },
            { value: 'history', label: `History ${historyRows.length}` },
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
              <VadIcon name="operations" size={16} tone="secondary" />
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
                <VadText variant="caption" tone="secondary">Position status</VadText>
                <VadSegmentedControl value={statusFilter} options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Open' }, { value: 'completed', label: 'Settled' }]} onChange={(value) => { setStatusFilter(value); setVisiblePositionCount(5); }} />
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
                    {categories.map((category) => <FilterPill key={category} label={category} selected={categoryFilter === category} onPress={() => setCategoryFilter(category)} />)}
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

          {isTngn ? (
            sectionErrors?.poolStakes ? (
              <InlineError message={sectionErrors.poolStakes} onRetry={retry} />
            ) : loading && poolStakes.length === 0 ? (
              <LoadingState label="Loading your TNGN predictions…" />
            ) : activeStakes.length ? (
              <View style={{ gap: theme.spacing.sm }}>
                {activeStakes.slice(0, visiblePositionCount).map((stake) => <DemoStakeCard key={stake.stake_id} stake={stake} />)}
                {activeStakes.length > visiblePositionCount ? <VadButton label="Show more positions" variant="secondary" onPress={() => setVisiblePositionCount((count) => count + 5)} /> : null}
              </View>
            ) : (
              <VadEmptyState title="No open TNGN predictions" body="TNGN is a practice balance. Open demo predictions appear here; settled results remain in History." />
            )
          ) : sectionErrors?.positions ? (
            <InlineError message={sectionErrors.positions} onRetry={retry} />
          ) : loading && positionsForAsset.length === 0 ? (
            <LoadingState label="Loading your positions…" />
          ) : marksLoading ? (
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
            <VadEmptyState title="No positions match these filters" body="Adjust the filters or trade a market to see your positions here." />
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
          <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
            <View style={{ gap: 3 }}>
              <VadText variant="caption" tone="secondary">REALIZED PERFORMANCE · {asset} · {period}</VadText>
              <VadText variant="heading" tone={periodSettledRows.length && periodSettledPnl >= 0 ? 'yes' : periodSettledRows.length ? 'no' : 'secondary'}>{periodSettledRows.length ? `${periodSettledPnl >= 0 ? '+' : '−'}${assetMoney(Math.abs(periodSettledPnl), asset)}` : '—'}</VadText>
              <VadText variant="caption" tone="secondary">Persisted settlement results within the selected period; pending and voided positions are not counted as wins or losses.</VadText>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <MetricTile label="Settled records" value={String(periodSettledRows.length)} />
              <MetricTile label="Win rate" value={periodWinRate == null ? '—' : pct(periodWinRate)} />
              <MetricTile label="Avg. result" value={periodSettledRows.length ? assetMoney(periodSettledPnl / periodSettledRows.length, asset) : '—'} />
            </View>
            {historicalPnlSeries.length >= 2 ? (
              <View style={{ height: 94 }}>
                <PortfolioLineChart values={historicalPnlSeries.map((point) => point.value)} width={Math.max(220, Math.min(720, density.width - 72))} height={90} positive={periodSettledPnl >= 0} />
              </View>
            ) : (
              <VadEmptyState title="More settled results needed" body="The cumulative realized-performance chart appears after at least two dated settlement results. No history is synthesized." />
            )}
          </VadCard>
          {periodSettledRows.length ? (
            <View style={{ gap: theme.spacing.sm }}>
              <VadText variant="bodyStrong">Settled results · {period}</VadText>
              {periodSettledRows.slice(-8).reverse().map((row, index) => <HistoryCard key={`perf-${row.market_id}-${row.selected_outcome}-${row.settled_at ?? index}`} row={row} />)}
            </View>
          ) : <VadEmptyState title="No realized performance yet" body="Realized P&L is available after VAD records a settlement for one of your predictions." />}
        </View>
      ) : null}

    </View>
  );
}

function PositionCard({ position, market, onPress }: { position: PositionModel; market?: MarketCatalogItem; onPress: () => void }) {
  const theme = useVadTheme();
  const markStatus = String(position.mark_status ?? 'UNAVAILABLE').toUpperCase();
  const pnl = position.unrealized_pnl == null ? null : amount(position.unrealized_pnl);
  const imagePath = position.media_path ?? market?.media_path ?? null;
  const imageUrl = marketMediaUrl(imagePath);
  const statusLabel = markStatus === 'MARKED' ? 'Live mark' : markStatus === 'STALE' ? 'Stale price'
    : markStatus === 'UNPRICED' ? 'No trade price' : markStatus === 'SETTLED' ? 'Settled'
      : 'Value unavailable';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${position.market_title} ${position.outcome_code} position`} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      <VadCard variant="raised" style={{ padding: 10, gap: 9, borderRadius: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} resizeMode="cover" style={{ width: 72, height: 72, borderRadius: 12, backgroundColor: theme.colors.surfaceMuted }} />
          ) : (
            <View style={{ width: 72, height: 72, borderRadius: 12, backgroundColor: theme.colors.surfaceMuted, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <VadIcon name="activity" size={22} tone="tertiary" />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <VadText variant="bodyStrong" numberOfLines={2}>{position.market_title}</VadText>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <VadChip label={position.outcome_code} tone={position.outcome_code === 'YES' ? 'yes' : 'no'} />
              <VadText variant="caption" tone="tertiary">{position.asset_code} · {statusLabel}</VadText>
            </View>
            <VadText variant="caption" tone="secondary" numberOfLines={1}>{Number(position.quantity ?? 0).toLocaleString()} contracts · Avg {pct(position.average_price)}</VadText>
          </View>
          <VadIcon name="chevronRight" size={18} tone="tertiary" />
        </View>
        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 8, flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <VadText variant="caption" tone="tertiary">Total stake</VadText>
            <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{assetMoney(position.total_cost_basis, position.asset_code)}</VadText>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <VadText variant="caption" tone="tertiary">Current value</VadText>
            <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{position.current_value == null ? '—' : markStatus === 'SETTLED' ? 'Paid out' : assetMoney(position.current_value, position.asset_code)}</VadText>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end', gap: 2 }}>
            <VadText variant="caption" tone="tertiary">Profit / loss</VadText>
            <VadText variant="bodyStrong" tone={pnl == null ? 'secondary' : pnl >= 0 ? 'yes' : 'no'} numberOfLines={1} adjustsFontSizeToFit>{pnl == null ? statusLabel : `${pnl >= 0 ? '+' : '−'}${assetMoney(Math.abs(pnl), position.asset_code)}`}</VadText>
            {pnl != null && position.return_percentage != null ? <VadText variant="caption" tone={pnl >= 0 ? 'yes' : 'no'}>{`${amount(position.return_percentage) >= 0 ? '+' : ''}${(amount(position.return_percentage) * 100).toFixed(2)}%`}</VadText> : null}
          </View>
        </View>
      </VadCard>
    </Pressable>
  );
}

function DemoStakeCard({ stake }: { stake: PoolStakeRow }) {
  const theme = useVadTheme();
  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <VadText variant="caption" tone="brand">TNGN PRACTICE PREDICTION</VadText>
          <VadText variant="bodyStrong" numberOfLines={3}>{stake.market_title}</VadText>
          <VadText variant="caption" tone="secondary">{stake.outcome_code} · {stake.market_status}</VadText>
        </View>
        <VadIcon name="activity" size={18} tone="brand" />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ gap: 2 }}>
          <VadText variant="caption" tone="tertiary">Recorded stake</VadText>
          <VadText variant="bodyStrong">{assetMoney(stake.amount, 'TNGN')}</VadText>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end', gap: 2 }}>
          <VadText variant="caption" tone="tertiary">Current value</VadText>
          <VadText variant="bodyStrong">Unavailable until a valid mark or settlement</VadText>
        </View>
      </View>
    </VadCard>
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

function SummaryMetric({ title, count, amount: value, asset, tone, value: customValue }: {
  title: string; count: number; amount?: number; asset?: string; tone?: 'yes' | 'no'; value?: string;
}) {
  const label = customValue ?? (count === 0 || value == null ? '—' : `${value >= 0 ? '+' : '−'}${assetMoney(Math.abs(value), asset)}`);
  return (
    <VadCard variant="raised" style={{ flex: 1, minWidth: 0, padding: 10, gap: 5, borderRadius: 16 }}>
      <View style={{ width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: tone === 'yes' ? 'rgba(16,214,157,0.14)' : tone === 'no' ? 'rgba(255,75,95,0.14)' : theme.colors.surfaceMuted }}>
        <VadIcon name={tone === 'yes' ? 'arrowUp' : tone === 'no' ? 'arrowDown' : 'activity'} size={17} tone={tone ?? 'secondary'} />
      </View>
      <VadText variant="caption" tone="secondary" numberOfLines={2}>{title}</VadText>
      <VadText variant="heading">{count.toLocaleString()}</VadText>
      <VadText variant="caption" tone={tone ?? 'secondary'} numberOfLines={1} adjustsFontSizeToFit>{label}</VadText>
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

function PortfolioLineChart({ values, width, height, positive }: { values: number[]; width: number; height: number; positive: boolean }) {
  const theme = useVadTheme();
  if (values.length < 2 || values.some((value) => !Number.isFinite(value))) {
    return <View style={{ height, justifyContent: "center", alignItems: "center", paddingHorizontal: 12 }}><VadText variant="caption" tone="tertiary">Record more genuine valuations to show this trend. No historical values are estimated.</VadText></View>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.max(Math.abs(max), 1);
  const inset = 8;
  const innerHeight = height - inset * 2;
  const coords = values.map((value, index) => ({
    x: inset + (index / (values.length - 1)) * Math.max(1, width - inset * 2),
    y: inset + (1 - (value - min) / range) * innerHeight,
  }));
  const color = positive ? '#16D7A0' : '#FF5B70';
  return (
    <View style={{ width: '100%', height, position: 'relative', overflow: 'hidden' }}>
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
