import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { AssistantEntry } from '@/features/assistant/assistant-entry';
import { SocialConvictionFeed } from '@/features/social/social-conviction-feed';
import { useLiveNow } from '@/hooks/use-live-now';
import { useProductDensity } from '@/hooks/use-product-density';
import { exactTime, getMarketTiming } from '@/lib/market-timing';
import { useVadTheme } from '@/providers/theme-provider';
import { useCurrencyPreference, type VADCurrency } from '@/providers/currency-preference-provider';
import { getMarketOutcomeSummary, getPublishedMarketDetail, type MarketCatalogItem, type MarketOutcomeSummaryRow, type PoolStakeRow, type PositionRow, type PublishedMarketDetail } from '@/services/market-api';
import { MarketDetailHeader } from './components/market-detail-header';
import { FinancialMarketLivePanel, hasLiveFinancialContext } from './components/financial-market-live-panel';
import { MarketDepthPanel } from './components/market-depth-panel';
import { TradingTicket } from './components/trading-ticket';
import { MarketPriceHistoryPanel } from './components/market-price-history-panel';
import { assetMoney, probability } from './format';
import { marketStatusLabel } from './market-display-labels';

type DetailTab = 'Overview' | 'Trade' | 'Chart' | 'Discussion' | 'Rules';
type MarketTiming = ReturnType<typeof getMarketTiming>;

const tabs: { value: DetailTab; label: string }[] = [
  { value: 'Overview', label: 'Overview' },
  { value: 'Trade', label: 'Trade' },
  { value: 'Chart', label: 'Activity' },
  { value: 'Discussion', label: 'Chat' },
  { value: 'Rules', label: 'Rules' },
];

export function MarketDetailScreen({
  market,
  markets,
  positions,
  poolStakes,
  initialOutcome,
  canTrade,
  tradeReason,
  tradeCapabilityLoading = false,
  canCreatePost,
  onPlaced,
  onOpenMarket,
  onRefreshMarket,
}: {
  market: MarketCatalogItem;
  markets: MarketCatalogItem[];
  positions: PositionRow[];
  poolStakes: PoolStakeRow[];
  initialOutcome?: string;
  canTrade: boolean;
  tradeReason?: string;
  tradeCapabilityLoading?: boolean;
  canCreatePost: boolean;
  onPlaced: () => Promise<void>;
  onOpenMarket: (market: MarketCatalogItem) => void;
  onRefreshMarket?: () => Promise<void>;
}) {
  const density = useProductDensity();
  const currencyPreference = useCurrencyPreference();
  const now = useLiveNow();
  const timing = getMarketTiming(market, now);
  const screenKey = `${market.instrument_public_id}:${initialOutcome ?? 'none'}`;
  const multiOutcomeMarket = market.market_type === 'MULTI_OUTCOME';
  const [outcomeSummaryState, setOutcomeSummaryState] = useState<{
    instrumentId: string;
    rows: MarketOutcomeSummaryRow[];
    loading: boolean;
    error: string | null;
  }>(() => ({ instrumentId: market.instrument_public_id, rows: [], loading: multiOutcomeMarket, error: null }));
  const outcomeRows = outcomeSummaryState.instrumentId === market.instrument_public_id ? outcomeSummaryState.rows : [];
  const outcomeRowsLoading = outcomeSummaryState.instrumentId === market.instrument_public_id && outcomeSummaryState.loading;
  const outcomeRowsError = outcomeSummaryState.instrumentId === market.instrument_public_id ? outcomeSummaryState.error : null;
  const [chosenOutcome, setChosenOutcome] = useState<{ instrumentId: string; code: string } | null>(null);
  const selectedOutcomeCode = chosenOutcome?.instrumentId === market.instrument_public_id
    ? chosenOutcome.code
    : initialOutcome ?? (multiOutcomeMarket ? outcomeRows[0]?.outcome_code : undefined);
  const [tabState, setTabState] = useState<{ key: string; tab: DetailTab }>(() => ({ key: screenKey, tab: initialOutcome ? 'Trade' : 'Overview' }));
  const tab = tabState.key === screenKey ? tabState.tab : initialOutcome ? 'Trade' : 'Overview';
  const setTab = (nextTab: DetailTab) => setTabState({ key: screenKey, tab: nextTab });
  const openTrade = (outcomeCode?: string) => {
    if (outcomeCode) setChosenOutcome({ instrumentId: market.instrument_public_id, code: outcomeCode });
    setTab('Trade');
  };
  const closeRefreshDone = useRef(false);
  const resolveRefreshDone = useRef(false);

  useEffect(() => {
    closeRefreshDone.current = false;
    resolveRefreshDone.current = false;
  }, [market.instrument_public_id]);

  useEffect(() => {
    if (!multiOutcomeMarket) return;
    let active = true;
    void getMarketOutcomeSummary(market.instrument_public_id)
      .then((rows) => {
        if (active) setOutcomeSummaryState({ instrumentId: market.instrument_public_id, rows, loading: false, error: null });
      })
      .catch((reason: unknown) => {
        if (active) setOutcomeSummaryState({
          instrumentId: market.instrument_public_id,
          rows: [],
          loading: false,
          error: reason instanceof Error ? reason.message : 'Outcome choices could not be loaded.',
        });
      });
    return () => { active = false; };
  }, [market.instrument_public_id, multiOutcomeMarket]);

  useEffect(() => {
    if (!onRefreshMarket) return;
    if (timing.closesAt != null && now >= timing.closesAt && !closeRefreshDone.current) {
      closeRefreshDone.current = true;
      void onRefreshMarket();
    }
    if (timing.resolvesAt != null && now >= timing.resolvesAt && !resolveRefreshDone.current) {
      resolveRefreshDone.current = true;
      void onRefreshMarket();
    }
  }, [now, onRefreshMarket, timing.closesAt, timing.resolvesAt]);

  const marketCurrency = market.asset_code as VADCurrency;
  const currencyAllowed = currencyPreference.isCurrencyEligible(marketCurrency)
    && currencyPreference.isCurrencyEnabled(marketCurrency);
  const effectiveCanTrade = canTrade && timing.tradingOpen && currencyAllowed;
  const effectiveTradeReason = !currencyAllowed
    ? 'CURRENCY_NOT_ENABLED'
    : timing.tradingOpen
      ? tradeReason
      : timing.stage === 'SCHEDULED'
        ? 'MARKET_NOT_OPEN'
        : 'MARKET_CLOSED';

  if (!currencyAllowed) {
    return (
      <View style={{ gap: 10 }}>
        <VadCard variant="surface" style={{ padding: 16, gap: 8 }}>
          <VadIcon name="wallet" size={22} tone="secondary" />
          <VadText variant="bodyStrong">Market unavailable for your currency settings</VadText>
          <VadText variant="caption" tone="secondary">
            This market is hidden because its settlement currency is not enabled or is not supported in your region.
          </VadText>
        </VadCard>
      </View>
    );
  }

  return (
    <View style={{ gap: density.compact ? 12 : density.sectionGap, paddingBottom: 200 }}>
      <MarketDetailHeader market={market} />
      <MarketStakeSummary market={market} positions={positions} poolStakes={poolStakes} outcomes={outcomeRows} />
      {hasLiveFinancialContext(market) ? <FinancialMarketLivePanel key={market.instrument_public_id} market={market} now={now} /> : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4, paddingHorizontal: 1, paddingRight: 12 }}
        accessibilityLabel="Market detail sections"
      >
        {tabs.map((item) => (
          <VadChip
            key={item.value}
            label={item.label}
            selected={tab === item.value}
            tone={tab === item.value ? 'brand' : 'neutral'}
            onPress={() => setTab(item.value)}
          />
        ))}
      </ScrollView>

      {tab === 'Overview' ? (
        <Overview
          market={market}
          timing={timing}
          outcomes={outcomeRows}
          outcomesLoading={outcomeRowsLoading}
          outcomesError={outcomeRowsError}
          onTrade={openTrade}
        />
      ) : null}
      {tab === 'Chart' ? <Activity market={market} /> : null}
      {tab === 'Trade' ? (
        <TradingTicket
          key={`${market.instrument_public_id}:${selectedOutcomeCode ?? 'default'}`}
          market={market}
          initialOutcome={selectedOutcomeCode}
          outcomes={outcomeRows}
          canTrade={effectiveCanTrade}
          tradeReason={effectiveTradeReason}
          capabilityLoading={tradeCapabilityLoading}
          onPlaced={onPlaced}
        />
      ) : null}
      {tab === 'Discussion' ? (
        <SocialConvictionFeed markets={markets} canCreatePost={canCreatePost} onOpenMarket={onOpenMarket} marketFilter={market} />
      ) : null}
      {tab === 'Rules' ? <Rules key={market.instrument_public_id} market={market} timing={timing} /> : null}

    </View>
  );
}

function Overview({ market, timing, outcomes, outcomesLoading, outcomesError, onTrade }: {
  market: MarketCatalogItem;
  timing: MarketTiming;
  outcomes: MarketOutcomeSummaryRow[];
  outcomesLoading: boolean;
  outcomesError: string | null;
  onTrade: (outcomeCode?: string) => void;
}) {
  const density = useProductDensity();
  return (
    <View style={{ gap: density.compact ? 8 : 12 }}>
      <MarketSnapshot key={market.instrument_public_id} market={market} timing={timing} outcomes={outcomes} />
      {market.market_type === 'MULTI_OUTCOME' ? (
        <MultiOutcomeChoices market={market} timing={timing} outcomes={outcomes} loading={outcomesLoading} error={outcomesError} onTrade={onTrade} />
      ) : null}
      <MarketContextPanel key={market.instrument_public_id} market={market} />
      <VadButton
        label={market.market_type === 'MULTI_OUTCOME' ? 'Trade this market' : 'Trade this market'}
        onPress={() => onTrade(market.market_type === 'MULTI_OUTCOME' ? outcomes[0]?.outcome_code : undefined)}
        disabled={market.market_type === 'MULTI_OUTCOME' && outcomes.length === 0}
        size="small"
        leading={<VadIcon name="markets" size={15} tone="inverse" />}
      />
      <AssistantEntry
        label="Ask VAD AI about this market"
        detail="Understand the market and its published rules."
        prompt="Explain this market using its current data, published resolution criteria, trading model, prices and settlement rules."
        marketId={market.instrument_public_id}
        sourceRoute="/markets"
        compact
      />
    </View>
  );
}

function Activity({ market }: { market: MarketCatalogItem }) {
  const density = useProductDensity();
  const poolMarket = isPoolMarket(market);
  return (
    <View style={{ gap: density.compact ? 8 : 12 }}>
      <MarketPriceHistoryPanel instrumentId={market.instrument_public_id} liquidityMode={market.liquidity_mode} />
      {!poolMarket ? <MarketDepthPanel instrumentId={market.instrument_public_id} /> : null}
    </View>
  );
}

function MarketStakeSummary({ market, positions, poolStakes, outcomes }: { market: MarketCatalogItem; positions: PositionRow[]; poolStakes: PoolStakeRow[]; outcomes: MarketOutcomeSummaryRow[] }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const outcomeLabels = new Map(outcomes.map((option) => [option.outcome_code, option.outcome_label]));
  const matchingStakes = poolStakes
    .filter((stake) => stake.market_id === market.instrument_public_id && stake.asset_code === market.asset_code)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const matchingPositions = positions
    .filter((position) => position.instrument_id === market.instrument_public_id
      && position.asset_code === market.asset_code
      && Number(position.quantity) > 0);
  if (!matchingStakes.length && !matchingPositions.length) return null;

  const terminalStatuses = ['SETTLED', 'VOIDED', 'CANCELLED', 'RESOLVED', 'FINAL'];
  const activeStakes = matchingStakes.filter((stake) =>
    !terminalStatuses.includes(String(stake.market_status).toUpperCase()) && !stake.final_outcome,
  );
  const visibleStakes = activeStakes.length ? activeStakes : matchingStakes;
  const byOutcome = new Map<string, {
    outcome: string;
    poolStake: number;
    positionCost: number;
    quantity: number;
    fee: number;
    poolCount: number;
  }>();
  const getOutcome = (outcomeValue: string) => {
    const outcome = String(outcomeValue).toUpperCase();
    const current = byOutcome.get(outcome) ?? {
      outcome,
      poolStake: 0,
      positionCost: 0,
      quantity: 0,
      fee: 0,
      poolCount: 0,
    };
    byOutcome.set(outcome, current);
    return current;
  };
  for (const stake of visibleStakes) {
    const current = getOutcome(stake.outcome_code);
    current.poolStake += Number(stake.amount) || 0;
    current.fee += Number(stake.trading_fee) || 0;
    current.poolCount += 1;
  }
  for (const position of matchingPositions) {
    const current = getOutcome(position.outcome_code);
    current.positionCost += Number(position.total_cost_basis) || 0;
    current.quantity += Number(position.quantity) || 0;
  }

  const rows = [...byOutcome.values()];
  const totalCommitted = rows.reduce((sum, row) => sum + row.poolStake + row.positionCost, 0);
  const totalFees = rows.reduce((sum, row) => sum + row.fee, 0);
  const hasActivePosition = matchingPositions.some((position) => ['OPEN', 'ACTIVE'].includes(String(position.status).toUpperCase()));
  const hasActiveExposure = activeStakes.length > 0 || hasActivePosition;
  const status = activeStakes.length
    ? marketStatusLabel(activeStakes[0]?.market_status)
    : matchingPositions[0]
      ? marketStatusLabel(matchingPositions[0].status)
      : marketStatusLabel(matchingStakes[0]?.market_status);
  const title = hasActiveExposure ? 'Your position in this market' : 'Your market record';

  return (
    <VadCard variant="raised" style={{ gap: 10, padding: density.phone ? 12 : 15, borderRadius: 18, borderColor: theme.colors.brandSoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <VadText variant="caption" tone="brand">YOUR POSITION</VadText>
          <VadText variant="bodyStrong">{title}</VadText>
        </View>
        <VadChip label={status} tone={hasActiveExposure ? 'yes' : 'neutral'} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 8 }}>
        {rows.map((row) => (
          <View key={row.outcome} style={{ flex: 1, minWidth: 0, gap: 5, padding: 10, borderRadius: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: row.outcome === 'YES' ? theme.colors.yes : row.outcome === 'NO' ? theme.colors.no : theme.colors.border }}>
            <VadChip label={outcomeLabels.get(row.outcome) ?? displayOutcomeCode(row.outcome)} tone={row.outcome === 'YES' ? 'yes' : row.outcome === 'NO' ? 'no' : 'neutral'} />
            <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{assetMoney(row.poolStake + row.positionCost, market.asset_code)}</VadText>
            <VadText variant="caption" tone="secondary">Stake / cost basis</VadText>
            {row.poolCount ? <VadText variant="caption" tone="tertiary">{row.poolCount} pooled stake{row.poolCount === 1 ? '' : 's'}</VadText> : null}
            {row.quantity > 0 ? <VadText variant="caption" tone="tertiary">{row.quantity.toLocaleString()} contracts</VadText> : null}
            {row.fee > 0 ? <VadText variant="caption" tone="tertiary">{assetMoney(row.fee, market.asset_code)} pool fees</VadText> : null}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 8 }}>
        <VadText variant="caption" tone="secondary">{hasActiveExposure ? 'Total exposure in this market' : 'Recorded stake in this market'}</VadText>
        <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{assetMoney(totalCommitted, market.asset_code)}</VadText>
      </View>
      {totalFees > 0 ? <VadText variant="caption" tone="tertiary">Pooled trading fees recorded: {assetMoney(totalFees, market.asset_code)}</VadText> : null}
    </VadCard>
  );
}

function MultiOutcomeChoices({ market, timing, outcomes, loading, error, onTrade }: {
  market: MarketCatalogItem;
  timing: MarketTiming;
  outcomes: MarketOutcomeSummaryRow[];
  loading: boolean;
  error: string | null;
  onTrade: (outcomeCode?: string) => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ gap: 3 }}>
        <VadText variant="bodyStrong">Possible outcomes</VadText>
        <VadText variant="caption" tone="secondary">Choose the option you expect to win. Current pool share is based on committed stakes, not a promise of payout.</VadText>
      </View>
      {loading ? (
        <VadCard variant="muted" style={{ gap: 4 }}>
          <VadText variant="bodyStrong">Loading outcome choices…</VadText>
          <VadText variant="caption" tone="secondary">Getting the latest options and pool shares.</VadText>
        </VadCard>
      ) : error ? (
        <VadCard variant="muted" style={{ gap: 4, borderWidth: 1, borderColor: theme.colors.no }}>
          <VadText variant="bodyStrong">Outcome choices unavailable</VadText>
          <VadText variant="caption" tone="secondary">{error}</VadText>
        </VadCard>
      ) : outcomes.length ? (
        <View style={{ gap: theme.spacing.xs }}>
          {outcomes.map((outcome, index) => (
            <Pressable
              key={outcome.outcome_code}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${outcome.outcome_label} for this market`}
              accessibilityState={{ disabled: !timing.tradingOpen }}
              disabled={!timing.tradingOpen}
              onPress={() => onTrade(outcome.outcome_code)}
              style={({ pressed }) => ({ opacity: !timing.tradingOpen ? 0.65 : pressed ? 0.76 : 1 })}
            >
              <VadCard style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: density.phone ? 10 : 12 }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border }}>
                  <VadText variant="bodyStrong" tone="brand">{index + 1}</VadText>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <VadText variant="bodyStrong" numberOfLines={2}>{outcome.outcome_label}</VadText>
                  <VadText variant="caption" tone="secondary">
                    {outcome.total_stake == null || Number(outcome.total_stake) <= 0
                      ? 'No stakes yet'
                      : `${assetMoney(outcome.total_stake, market.asset_code)} committed · ${outcome.participant_count} participant${outcome.participant_count === 1 ? '' : 's'}`}
                  </VadText>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3, maxWidth: 88 }}>
                  <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>
                    {outcome.pool_share == null ? '—' : probability(outcome.pool_share)}
                  </VadText>
                  <VadText variant="caption" tone="tertiary">Pool share</VadText>
                </View>
                <VadIcon name="chevronRight" size={17} tone="secondary" />
              </VadCard>
            </Pressable>
          ))}
        </View>
      ) : (
        <VadCard variant="muted" style={{ gap: 4 }}>
          <VadText variant="bodyStrong">No options are available</VadText>
          <VadText variant="caption" tone="secondary">The market’s configured outcome choices could not be found.</VadText>
        </VadCard>
      )}
    </View>
  );
}

function displayOutcomeCode(code: string) {
  if (code === 'YES' || code === 'NO') return code;
  return code.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function CountdownPill({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View
      accessibilityRole="timer"
      accessibilityLabel={`${label} ${value}`}
      style={{ flexBasis: 172, flexGrow: 1, minWidth: 0, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted, paddingHorizontal: 11, paddingVertical: 7 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <VadIcon name="clock" size={16} tone="brand" />
        <VadText variant="caption" tone="secondary" numberOfLines={1}>{label}</VadText>
      </View>
      <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit style={{ fontVariant: ['tabular-nums'], fontSize: 15, letterSpacing: -0.2 }}>{value}</VadText>
    </View>
  );
}

function isPoolMarket(market: MarketCatalogItem) {
  return String(market.liquidity_mode ?? '').toUpperCase().includes('POOL');
}

function MarketSnapshot({ market, timing, outcomes }: { market: MarketCatalogItem; timing: MarketTiming; outcomes: MarketOutcomeSummaryRow[] }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const pool = isPoolMarket(market);
  const isMultiOutcome = market.market_type === 'MULTI_OUTCOME';
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const yes = probability(market.yes_price);
  const no = probability(market.no_price);
  const rawOutcome = String(timing.resolutionOutcome ?? '').toUpperCase();
  const finalOutcome = timing.resolutionOutcome && (timing.resolutionFinal || timing.stage === 'SETTLED')
    && rawOutcome !== 'VOID' && rawOutcome !== 'VOIDED'
    ? timing.resolutionOutcome
    : null;
  const outcomeTone = rawOutcome === 'YES' ? 'yes' : rawOutcome === 'NO' ? 'no' : 'neutral';
  const finalOutcomeLabel = outcomes.find((outcome) => outcome.outcome_code === rawOutcome)?.outcome_label ?? displayOutcomeCode(rawOutcome);
  const hasCurrentQuote = !isMultiOutcome && timing.stage === 'OPEN' && (market.yes_price != null || market.no_price != null);
  const scheduleRows: Array<{ label: string; value: string }> = [
    { label: 'Market opens', value: exactTime(market.opens_at) ?? '' },
    { label: 'Trading closes', value: exactTime(market.closes_at) ?? '' },
    { label: 'Resolution target', value: exactTime(market.resolves_after) ?? '' },
    { label: 'Result finalized', value: exactTime(market.resolution_finalized_at) ?? '' },
  ].filter((row) => Boolean(row.value));

  return (
    <View style={{ gap: density.compact ? 8 : 10 }}>
      <VadCard variant="surface" accessibilityRole="summary" style={{ gap: 9, padding: density.compact ? 12 : 15, borderRadius: density.phone ? 18 : 22 }}>
        {finalOutcome ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <VadText variant="caption" tone="tertiary">FINAL OUTCOME</VadText>
              <VadText variant="heading" tone={outcomeTone === 'neutral' ? 'secondary' : outcomeTone} style={{ fontSize: 20, lineHeight: 25 }}>
                {finalOutcomeLabel}
              </VadText>
            </View>
            <VadChip
              label={timing.stage === 'SETTLED' ? 'SETTLED' : 'RESULT CONFIRMED'}
              tone={outcomeTone}
            />
          </View>
        ) : null}

        {!finalOutcome && timing.stage === 'VOIDED' ? (
          <View style={{ borderRadius: 11, padding: 11, backgroundColor: theme.colors.noSoft, gap: 3 }}>
            <VadText variant="bodyStrong" tone="no">Market voided</VadText>
            <VadText variant="caption" tone="secondary">Refer to the published void and refund rules for the final handling of this market.</VadText>
          </View>
        ) : null}

        {!finalOutcome && timing.stage !== 'VOIDED' && hasCurrentQuote ? (
          <>
            <View style={{ flexDirection: 'row', gap: 7 }}>
              <View style={{ flex: 1, minWidth: 0, borderRadius: 10, backgroundColor: theme.colors.surfaceMuted, borderWidth: 1, borderColor: theme.colors.yes, paddingHorizontal: 11, paddingVertical: 10, gap: 3 }}>
                <VadText variant="caption" tone="yes">YES</VadText>
                <VadText variant="bodyStrong" tone="yes">{yes}</VadText>
              </View>
              <View style={{ flex: 1, minWidth: 0, borderRadius: 10, backgroundColor: theme.colors.surfaceMuted, borderWidth: 1, borderColor: theme.colors.no, paddingHorizontal: 11, paddingVertical: 10, gap: 3 }}>
                <VadText variant="caption" tone="no">NO</VadText>
                <VadText variant="bodyStrong" tone="no">{no}</VadText>
              </View>
            </View>
            <VadText variant="caption" tone="tertiary">{pool ? 'Pool allocation reflects participant stakes, not the final result.' : 'Current market pricing is not a guarantee of the final outcome.'}</VadText>
          </>
        ) : null}

        {!finalOutcome && timing.stage !== 'VOIDED' && !hasCurrentQuote ? (
          <View style={{ paddingVertical: 2, gap: 3 }}>
            <VadText variant="bodyStrong">
              {isMultiOutcome
                ? 'Choose from the possible outcomes'
                : timing.stage === 'OPEN' ? 'Waiting for a current quote' : timing.stage === 'SETTLED' ? 'Settlement status' : 'Current prices unavailable'}
            </VadText>
            <VadText variant="caption" tone="secondary">
              {isMultiOutcome
                ? 'Each option has a separate stake pool. The pool share is an indication of current participation, not a guarantee of the final result.'
                : timing.stage === 'OPEN'
                  ? 'A price will appear when a valid market quote is available.'
                  : 'Inactive or settled markets do not show old quotes as current conviction. Recorded history remains available in Activity.'}
            </VadText>
          </View>
        ) : null}

        {pool ? (
          <View style={{ flexDirection: 'row', gap: 7 }}>
            <View style={{ flex: 1, minWidth: 0, backgroundColor: theme.colors.surfaceMuted, borderRadius: 9, padding: 8, gap: 2 }}>
              <VadText variant="caption" tone="tertiary">Pool volume</VadText>
              <VadText variant="bodyStrong">{assetMoney(market.total_volume ?? 0, market.asset_code)}</VadText>
            </View>
            <View style={{ flex: 1, minWidth: 0, backgroundColor: theme.colors.surfaceMuted, borderRadius: 9, padding: 8, gap: 2 }}>
              <VadText variant="caption" tone="tertiary">Participants</VadText>
              <VadText variant="bodyStrong">{String(Number(market.participant_count ?? 0))}</VadText>
            </View>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <VadChip
            label={timing.statusLabel}
            tone={timing.stage === 'OPEN' ? 'yes' : timing.stage === 'VOIDED' ? 'no' : 'neutral'}
          />
          {timing.stage === 'OPEN' && timing.closeCountdown ? (
            <CountdownPill label="Closes in" value={timing.closeCountdown} />
          ) : null}
          {timing.stage === 'SCHEDULED' && timing.openCountdown ? (
            <CountdownPill label="Opens in" value={timing.openCountdown} />
          ) : null}
        </View>
      </VadCard>

      {scheduleRows.length ? (
        <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, overflow: 'hidden' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={scheduleExpanded ? 'Hide schedule and resolution details' : 'Show schedule and resolution details'}
            onPress={() => setScheduleExpanded((current) => !current)}
            style={({ pressed }) => ({ minHeight: 52, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.76 : 1 })}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <VadText variant="bodyStrong">Schedule & resolution</VadText>
              <VadText variant="caption" tone="secondary">
                {scheduleExpanded ? 'Published market timestamps' : market.closes_at ? `Trading closes ${new Date(market.closes_at).toLocaleDateString()}` : `${scheduleRows.length} timeline details`}
              </VadText>
            </View>
            <View style={{ transform: [{ rotate: scheduleExpanded ? '-90deg' : '90deg' }] }}>
              <VadIcon name="chevronRight" size={16} tone="secondary" />
            </View>
          </Pressable>
          {scheduleExpanded ? (
            <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
              {scheduleRows.map((row, index) => (
                <View key={row.label} style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingTop: 9, paddingBottom: 8, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                  <VadText variant="caption" tone="secondary" style={{ flex: 1 }}>{row.label}</VadText>
                  <VadText variant="caption" style={{ flex: 1.35, textAlign: 'right' }}>{row.value}</VadText>
                </View>
              ))}
              <VadText variant="caption" tone="tertiary" style={{ paddingTop: 4 }}>
                Published resolution criteria and finalized outcomes remain authoritative.
              </VadText>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
function Rules({ market, timing }: { market: MarketCatalogItem; timing: MarketTiming }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [detailState, setDetailState] = useState<{
    instrumentId: string;
    requestId: number;
    detail: PublishedMarketDetail | null;
    loading: boolean;
    failed: boolean;
    errorMessage: string | null;
  }>({ instrumentId: '', requestId: -1, detail: null, loading: true, failed: false, errorMessage: null });
  const [retryCount, setRetryCount] = useState(0);
  const [criteriaExpanded, setCriteriaExpanded] = useState(false);
  const [scopeExpanded, setScopeExpanded] = useState(false);
  const [verificationExpanded, setVerificationExpanded] = useState(false);
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const [outcomesExpanded, setOutcomesExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    void getPublishedMarketDetail(market.instrument_public_id)
      .then((detail) => {
        if (active) setDetailState({ instrumentId: market.instrument_public_id, requestId: retryCount, detail, loading: false, failed: false, errorMessage: null });
      })
      .catch((error: unknown) => {
        if (active) setDetailState({ instrumentId: market.instrument_public_id, requestId: retryCount, detail: null, loading: false, failed: true, errorMessage: error instanceof Error ? error.message : 'Published market details are temporarily unavailable.' });
      });
    return () => { active = false; };
  }, [market.instrument_public_id, retryCount]);

  const stateMatchesMarket = detailState.instrumentId === market.instrument_public_id && detailState.requestId === retryCount;
  const detail = stateMatchesMarket ? detailState.detail : null;
  const loading = !stateMatchesMarket || detailState.loading;
  const failed = stateMatchesMarket && detailState.failed;
  const resolutionScope = detail?.resolutionScope ?? market.market_context ?? {};
  const scope = resolutionScope && typeof resolutionScope === 'object' && !Array.isArray(resolutionScope)
    ? resolutionScope as Record<string, unknown>
    : {};
  const oracle = detail?.oracle ?? null;
  const consensus = oracle?.consensusRule ?? {};
  const sourceHierarchy = oracle?.sourceHierarchy ?? [];
  const outcomes = detail?.outcomes ?? [];
  const operator = String(scope.operator ?? '').toUpperCase();
  const operatorText: Record<string, string> = {
    GTE: 'at or above',
    GT: 'above',
    LTE: 'at or below',
    LT: 'below',
    EQ: 'equal to',
  };
  const threshold = typeof scope.threshold === 'number' || typeof scope.threshold === 'string'
    ? String(scope.threshold)
    : null;
  const thresholdFormatted = threshold !== null && Number.isFinite(Number(threshold))
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(Number(threshold))
    : threshold;
  const quote = typeof scope.quote === 'string' ? scope.quote : null;
  const asset = typeof scope.asset === 'string' ? scope.asset : null;
  const thresholdText = thresholdFormatted !== null
    ? [operatorText[operator] ?? (operator ? humanizeValue(operator) : null), thresholdFormatted, quote].filter(Boolean).join(' ')
    : null;
  const observationTime = typeof scope.observation_time === 'string' ? scope.observation_time : null;
  const resolverType = typeof scope.resolver_type === 'string' ? humanizeValue(scope.resolver_type) : null;
  const scopeRows: Array<{ label: string; value: string }> = [
    { label: 'Underlying', value: [asset, quote].filter(Boolean).join(' / ') },
    { label: 'Resolution condition', value: thresholdText ?? '' },
    { label: 'Observation time', value: observationTime ? exactTime(observationTime) ?? observationTime : '' },
    { label: 'Resolution method', value: resolverType ?? '' },
  ].filter((row) => Boolean(row.value));
  const visibleScopeRows = scopeExpanded ? scopeRows : scopeRows.slice(0, 2);
  const extraScopeCount = Math.max(0, scopeRows.length - visibleScopeRows.length);
  const requiredProviders = consensus.min_agreeing_providers;
  const finalizationMode = typeof consensus.finalization_mode === 'string' ? humanizeValue(consensus.finalization_mode) : null;
  const environment = typeof consensus.environment === 'string' ? humanizeValue(consensus.environment) : null;
  const tieBehavior = typeof consensus.tie_behavior === 'string' ? humanizeValue(consensus.tie_behavior) : null;
  const sourceRows = sourceHierarchy.map((source) => ({
    role: humanizeValue(source.role),
    provider: humanizeValue(source.provider_code),
  }));
  const scheduleRows = [
    { label: 'Market opens', value: exactTime(detail?.opensAt ?? market.opens_at) },
    { label: 'Trading closes', value: exactTime(detail?.closesAt ?? market.closes_at) },
    { label: 'Resolution observation', value: exactTime(detail?.resolvesAfter ?? market.resolves_after) },
    { label: 'Result finalized', value: exactTime(market.resolution_finalized_at) },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));
  const policyRules = [
    { label: 'Trading close', value: oracle?.closeRule },
    { label: 'Postponement', value: oracle?.postponementRule },
    { label: 'Cancellation', value: oracle?.cancellationRule },
    { label: 'Void handling', value: oracle?.voidRule },
  ].map((row) => ({ label: row.label, value: describeRule(row.value) }))
    .filter((row): row is { label: string; value: string } => Boolean(row.value));
  const disputeSeconds = oracle?.disputeWindowSeconds;
  const disputeWindow = typeof disputeSeconds === 'number' && disputeSeconds >= 0
    ? disputeSeconds < 60
      ? `${disputeSeconds} seconds`
      : disputeSeconds % 60 === 0
        ? `${disputeSeconds / 60} minute${disputeSeconds === 60 ? '' : 's'}`
        : `${Math.floor(disputeSeconds / 60)}m ${disputeSeconds % 60}s`
    : null;

  return (
    <View style={{ gap: density.compact ? 8 : 11 }}>
      <VadCard variant="surface" style={{ padding: density.compact ? 12 : 15, gap: 9, borderRadius: density.phone ? 18 : 22 }}>
        <View style={{ gap: 3 }}>
          <VadText variant="label" tone="brand">PUBLISHED RESOLUTION CRITERIA</VadText>
          <VadText variant="caption" tone="secondary">
            The event description and resolution conditions come from the published market setup.
          </VadText>
        </View>

        {loading ? (
          <VadText variant="caption" tone="secondary">Loading published market rules…</VadText>
        ) : detail?.description ? (
          <View style={{ gap: 7 }}>
            <VadText variant="body" numberOfLines={criteriaExpanded ? undefined : 4} style={{ fontSize: 15, lineHeight: 23 }}>{detail.description}</VadText>
            {detail.description.length > 180 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={criteriaExpanded ? 'Collapse resolution criteria' : 'Read the complete resolution criteria'}
                onPress={() => setCriteriaExpanded((current) => !current)}
                style={({ pressed }) => ({ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2, opacity: pressed ? 0.72 : 1 })}
              >
                <VadText variant="caption" tone="brand">{criteriaExpanded ? 'Show less' : 'Read full criteria'}</VadText>
                <View style={{ transform: [{ rotate: criteriaExpanded ? '-90deg' : '90deg' }] }}>
                  <VadIcon name="chevronRight" size={13} tone="brand" />
                </View>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 7 }}>
            <VadText variant="bodyStrong">
              {failed ? 'Full published details could not be loaded' : 'Published description unavailable'}
            </VadText>
            <VadText variant="caption" tone="secondary">
              {failed ? detailState.errorMessage ?? 'Published details are temporarily unavailable. Please retry.' : 'The market remains connected to its live status and available context. VAD has not substituted invented resolution wording.'}
            </VadText>
            {failed ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setRetryCount((current) => current + 1)}
                style={({ pressed }) => ({ alignSelf: 'flex-start', paddingVertical: 3, opacity: pressed ? 0.72 : 1 })}
              >
                <VadText variant="caption" tone="brand">Retry loading details</VadText>
              </Pressable>
            ) : null}
          </View>
        )}
      </VadCard>

      {scopeRows.length ? (
        <VadCard variant="surface" style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
          <View style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, gap: 3 }}>
            <VadText variant="bodyStrong">Resolution conditions</VadText>
            <VadText variant="caption" tone="secondary">Key parameters configured for this event.</VadText>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs, paddingHorizontal: 12, paddingBottom: 12 }}>
            {visibleScopeRows.map((row) => (
              <View
                key={row.label}
                style={{ minWidth: '42%', maxWidth: '100%', flexGrow: 1, backgroundColor: theme.colors.surfaceMuted, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 9, gap: 3 }}
              >
                <VadText variant="caption" tone="secondary" numberOfLines={2} style={{ fontSize: 13, lineHeight: 18 }}>{row.label}</VadText>
                <VadText variant="bodyStrong" numberOfLines={scopeExpanded ? undefined : 2} style={{ fontSize: 15, lineHeight: 21 }}>{row.value}</VadText>
              </View>
            ))}
          </View>
          {scopeRows.length > 2 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={scopeExpanded ? 'Show fewer resolution conditions' : `Show ${extraScopeCount} more resolution conditions`}
              onPress={() => setScopeExpanded((current) => !current)}
              style={({ pressed }) => ({ minHeight: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: theme.colors.border, opacity: pressed ? 0.72 : 1 })}
            >
              <VadText variant="caption" tone="brand">{scopeExpanded ? 'Show fewer conditions' : `+${extraScopeCount} more conditions`}</VadText>
              <View style={{ transform: [{ rotate: scopeExpanded ? '-90deg' : '90deg' }] }}>
                <VadIcon name="chevronRight" size={14} tone="brand" />
              </View>
            </Pressable>
          ) : null}
        </VadCard>
      ) : null}

      <ProgressiveMarketSection
        title="Resolution method & evidence"
        subtitle={oracle ? `${oracle.policyName} · Version ${oracle.policyVersion}` : loading ? 'Loading configured oracle policy…' : 'Published verification details unavailable'}
        expanded={verificationExpanded}
        onPress={() => setVerificationExpanded((current) => !current)}
      >
        {oracle ? (
          <View style={{ gap: 10 }}>
            {environment ? <DetailValueRow label="Environment" value={environment} /> : null}
            {sourceRows.length ? (
              <View style={{ gap: 6 }}>
                <VadText variant="caption" tone="secondary">Approved source hierarchy</VadText>
                {sourceRows.map((source, index) => (
                  <View key={`${source.role}-${source.provider}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 9, borderRadius: 9, backgroundColor: theme.colors.surfaceMuted }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.brandPrimary }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <VadText variant="bodyStrong">{source.provider}</VadText>
                    </View>
                    <VadChip label={source.role} tone="neutral" />
                  </View>
                ))}
              </View>
            ) : null}
            {typeof requiredProviders === 'number' ? (
              <DetailValueRow label="Minimum agreeing providers" value={String(requiredProviders)} />
            ) : null}
            {consensus.distinct_providers === true ? <DetailValueRow label="Consensus requirement" value="Distinct providers required" /> : null}
            {tieBehavior ? <DetailValueRow label="Tie behavior" value={tieBehavior} /> : null}
            {finalizationMode ? <DetailValueRow label="Finalization" value={finalizationMode} /> : null}
            {disputeWindow ? <DetailValueRow label="Dispute window" value={disputeWindow} /> : null}
            {policyRules.length ? (
              <View style={{ gap: 8 }}>
                <VadText variant="caption" tone="secondary">Exceptional cases</VadText>
                {policyRules.map((rule) => <DetailValueRow key={rule.label} label={rule.label} value={rule.value} />)}
              </View>
            ) : null}
          </View>
        ) : (
          <VadText variant="caption" tone="secondary">
            {failed
              ? 'The detail service did not return the configured oracle policy. Retry the published details when the connection is available.'
              : 'The configured oracle policy and source hierarchy appear here when returned by the market detail service.'}
          </VadText>
        )}
      </ProgressiveMarketSection>

      <ProgressiveMarketSection
        title="Schedule & settlement"
        subtitle={scheduleRows.length ? `${scheduleRows.length} published timestamps` : 'View the market timeline and settlement asset'}
        expanded={scheduleExpanded}
        onPress={() => setScheduleExpanded((current) => !current)}
      >
        {scheduleRows.map((row) => <DetailValueRow key={row.label} label={row.label} value={row.value} />)}
        <DetailValueRow label="Trading status" value={timing.statusLabel} />
        <DetailValueRow label="Settlement asset" value={detail?.assetCode ?? market.asset_code} />
        {detail?.settlementUnit != null ? <DetailValueRow label="Settlement unit" value={String(detail.settlementUnit)} /> : null}
        {detail?.minimumOrderNotional != null ? <DetailValueRow label="Minimum order notional" value={assetMoney(detail.minimumOrderNotional, detail.assetCode)} /> : null}
        {detail?.oracle?.closeRule ? <DetailValueRow label="Close rule" value={describeRule(detail.oracle.closeRule) ?? 'Configured'} /> : null}
      </ProgressiveMarketSection>

      <ProgressiveMarketSection
        title="Available outcomes"
        subtitle={outcomes.length ? `${outcomes.length} published outcome${outcomes.length === 1 ? '' : 's'}` : loading ? 'Loading configured outcomes…' : 'Outcome configuration unavailable'}
        expanded={outcomesExpanded}
        onPress={() => setOutcomesExpanded((current) => !current)}
      >
        {outcomes.length ? outcomes.map((outcome) => (
          <View key={outcome.code} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 10, borderRadius: 10, backgroundColor: theme.colors.surfaceMuted }}>
            <VadText variant="bodyStrong">{outcome.label}</VadText>
            <VadChip label={outcome.code} tone={outcome.code.toUpperCase() === 'YES' ? 'yes' : outcome.code.toUpperCase() === 'NO' ? 'no' : 'neutral'} />
          </View>
        )) : (
          <VadText variant="caption" tone="secondary">The market&apos;s configured outcomes will appear here when returned by the detail service.</VadText>
        )}
      </ProgressiveMarketSection>
    </View>
  );
}

function ProgressiveMarketSection({
  title,
  subtitle,
  expanded,
  onPress,
  children,
}: {
  title: string;
  subtitle: string;
  expanded: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const theme = useVadTheme();
  return (
    <VadCard variant="surface" style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? 'Hide' : 'Show'} ${title}`}
        accessibilityState={{ expanded }}
        onPress={onPress}
        style={({ pressed }) => ({ minHeight: 58, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.74 : 1 })}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <VadText variant="bodyStrong">{title}</VadText>
          <VadText variant="caption" tone="secondary" numberOfLines={2}>{subtitle}</VadText>
        </View>
        <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: theme.colors.surfaceMuted }}>
          <View style={{ transform: [{ rotate: expanded ? '-90deg' : '90deg' }] }}>
            <VadIcon name="chevronRight" size={15} tone="secondary" />
          </View>
        </View>
      </Pressable>
      {expanded ? <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 9 }}>{children}</View> : null}
    </VadCard>
  );
}

function DetailValueRow({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
      <VadText variant="body" tone="secondary" style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20 }}>{label}</VadText>
      <VadText variant="body" style={{ flex: 1.4, minWidth: 0, textAlign: 'right', fontSize: 14, lineHeight: 20 }}>{value}</VadText>
    </View>
  );
}

function humanizeValue(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function describeRule(rule: Record<string, unknown> | null | undefined) {
  if (!rule || typeof rule !== 'object') return null;
  const entries = Object.entries(rule).filter(([, value]) => value !== null && value !== undefined);
  if (!entries.length) return null;
  return entries.map(([key, value]) => `${humanizeValue(key)}: ${typeof value === 'string' ? humanizeValue(value) : String(value)}`).join(' · ');
}

function MarketContextPanel({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const [expanded, setExpanded] = useState(false);
  const profile = String(market.presentation_profile ?? 'EVENT').toUpperCase();
  const labels: Record<string, string> = {
    CRYPTO: 'Crypto market context',
    SPORTS: 'Fixture & competition',
    MUSIC: 'Artist & chart context',
    AI: 'Model & benchmark context',
    STOCKS: 'Company & financial context',
    ECONOMICS: 'Economic indicator context',
    ENTERTAINMENT: 'Entertainment context',
    PUBLIC_EVENTS: 'Event context',
    EVENT: 'Market context',
  };
  const context = market.market_context && typeof market.market_context === 'object'
    ? market.market_context
    : {};
  const nested = (key: string) => context[key] && typeof context[key] === 'object' && !Array.isArray(context[key])
    ? context[key] as Record<string, unknown>
    : {};
  const subject = nested('subject');
  const details = nested('details');
  const preferredKeys = [
    'asset', 'symbol', 'quote', 'model', 'benchmark', 'company', 'subject',
    'artist', 'song', 'album', 'event_name', 'competition', 'home_team', 'away_team',
    'team', 'achievement', 'reporting_period', 'threshold', 'operator',
  ];
  const entries = preferredKeys.flatMap((key) => {
    const value = subject[key] ?? details[key] ?? context[key];
    if (value == null || typeof value === 'object' || typeof value === 'boolean') return [];
    const text = String(value).trim();
    if (!text || text.length > 160) return [];
    return [{ key, value: text }];
  }).filter((entry, index, all) => all.findIndex((candidate) => candidate.key === entry.key) === index).slice(0, 6);
  const visibleEntries = expanded ? entries : entries.slice(0, 2);
  const hiddenCount = entries.length - visibleEntries.length;

  if (!entries.length) return null;

  return (
    <VadCard variant="surface" style={{ gap: theme.spacing.sm, padding: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <VadText variant="label" tone="brand">{labels[profile] ?? labels.EVENT}</VadText>
          <VadText variant="caption" tone="secondary" numberOfLines={expanded ? undefined : 2}>
            Details are taken from the published market setup. Official resolution criteria remain authoritative.
          </VadText>
        </View>
        {hiddenCount > 0 || expanded ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Show fewer market details' : `Show ${hiddenCount} more market details`}
            onPress={() => setExpanded((current) => !current)}
            hitSlop={8}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, paddingVertical: 8, minHeight: 40, opacity: pressed ? 0.72 : 1 })}
          >
            <VadText variant="label" tone="brand">{expanded ? 'Show fewer details' : `Show ${hiddenCount} more`}</VadText>
            <View style={{ transform: [{ rotate: expanded ? '-90deg' : '90deg' }] }}>
              <VadIcon name="chevronRight" size={14} tone="brand" />
            </View>
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        {visibleEntries.map((entry) => (
          <View
            key={entry.key}
            style={{
              minWidth: '42%',
              maxWidth: '100%',
              flexGrow: 1,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceMuted,
              borderRadius: theme.radius.md,
              padding: theme.spacing.sm,
              gap: 3,
            }}
          >
            <VadText variant="caption" tone="tertiary" numberOfLines={1}>{contextLabel(entry.key)}</VadText>
            <VadText variant="bodyStrong" numberOfLines={expanded ? undefined : 2}>{entry.value}</VadText>
          </View>
        ))}
      </View>
    </VadCard>
  );
}

function contextLabel(key: string) {
  return key.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
