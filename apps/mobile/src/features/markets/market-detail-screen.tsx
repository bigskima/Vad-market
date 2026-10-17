import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadSegmentedControl } from '@/components/ui/vad-segmented-control';
import { VadText } from '@/components/ui/vad-text';
import { AssistantEntry } from '@/features/assistant/assistant-entry';
import { SocialConvictionFeed } from '@/features/social/social-conviction-feed';
import { useLiveNow } from '@/hooks/use-live-now';
import { useProductDensity } from '@/hooks/use-product-density';
import { exactTime, getMarketTiming } from '@/lib/market-timing';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { MarketDetailHeader } from './components/market-detail-header';
import { MarketDepthPanel } from './components/market-depth-panel';
import { TradingTicket } from './components/trading-ticket';
import { MarketPriceHistoryPanel } from './components/market-price-history-panel';
import { assetMoney, probability } from './format';

type DetailTab = 'Overview' | 'Trade' | 'Discussion' | 'Rules';
type MarketTiming = ReturnType<typeof getMarketTiming>;

const tabs = [
  { value: 'Overview', label: 'Overview' },
  { value: 'Trade', label: 'Trade' },
  { value: 'Discussion', label: 'Discuss' },
  { value: 'Rules', label: 'Rules' },
] as const;

export function MarketDetailScreen({
  market,
  markets,
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
  canTrade: boolean;
  tradeReason?: string;
  tradeCapabilityLoading?: boolean;
  canCreatePost: boolean;
  onPlaced: () => Promise<void>;
  onOpenMarket: (market: MarketCatalogItem) => void;
  onRefreshMarket?: () => Promise<void>;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const now = useLiveNow();
  const timing = getMarketTiming(market, now);
  const [tab, setTab] = useState<DetailTab>('Overview');
  const closeRefreshDone = useRef(false);
  const resolveRefreshDone = useRef(false);

  useEffect(() => {
    closeRefreshDone.current = false;
    resolveRefreshDone.current = false;
  }, [market.instrument_public_id]);

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

  const effectiveCanTrade = canTrade && timing.tradingOpen;
  const effectiveTradeReason = timing.tradingOpen
    ? tradeReason
    : timing.stage === 'SCHEDULED'
      ? 'MARKET_NOT_OPEN'
      : 'MARKET_CLOSED';
  const poolMarket = isPoolMarket(market);

  return (
    <View style={{ gap: density.compact ? 9 : density.sectionGap }}>
      <MarketDetailHeader market={market} />

      <View style={{ gap: 4 }}>
        <VadSegmentedControl value={tab} options={tabs} onChange={setTab} />
      </View>

      {tab === 'Overview' ? (
        <Overview
          market={market}
          timing={timing}
          canTrade={effectiveCanTrade}
          tradeCapabilityLoading={tradeCapabilityLoading}
          onTrade={() => setTab('Trade')}
          onDiscuss={() => setTab('Discussion')}
          onRules={() => setTab('Rules')}
        />
      ) : null}
      {tab === 'Trade' ? (
        <TradingTicket
          market={market}
          canTrade={effectiveCanTrade}
          tradeReason={effectiveTradeReason}
          capabilityLoading={tradeCapabilityLoading}
          onPlaced={onPlaced}
        />
      ) : null}
      {tab === 'Discussion' ? (
        <SocialConvictionFeed markets={markets} canCreatePost={canCreatePost} onOpenMarket={onOpenMarket} marketFilter={market} />
      ) : null}
      {tab === 'Rules' ? <Rules market={market} timing={timing} /> : null}

      <AssistantEntry
        label="Ask VAD AI"
        detail={market.liquidity_mode === 'POOL'
          ? 'Odds, fees and settlement.'
          : 'Price action, order book and settlement.'}
        prompt="Explain this market using its current data, published resolution criteria, trading model, prices, fees and settlement rules."
        marketId={market.instrument_public_id}
        sourceRoute="/markets"
        compact={density.compact}
      />

      {density.phone && tab !== 'Trade' ? (
        <View style={{ paddingTop: theme.spacing.xs }}>
          <VadButton
            label={tradeCapabilityLoading ? 'Checking trade availability' : effectiveCanTrade ? (poolMarket ? 'Make a prediction' : 'Trade this market') : timing.primaryTiming}
            size="small"
            onPress={() => setTab('Trade')}
            leading={<VadIcon name="markets" size={16} tone="inverse" />}
          />
        </View>
      ) : null}
    </View>
  );
}

function Overview({
  market,
  timing,
  canTrade,
  tradeCapabilityLoading,
  onTrade,
  onDiscuss,
  onRules,
}: {
  market: MarketCatalogItem;
  timing: MarketTiming;
  canTrade: boolean;
  tradeCapabilityLoading: boolean;
  onTrade: () => void;
  onDiscuss: () => void;
  onRules: () => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const wide = density.width >= 780;
  const tradeDone = !timing.tradingOpen && timing.stage !== 'SCHEDULED';
  const poolMarket = isPoolMarket(market);

  return (
    <View style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
      <MarketSnapshot market={market} timing={timing} />
      <MarketPriceHistoryPanel instrumentId={market.instrument_public_id} liquidityMode={market.liquidity_mode} />
      <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'stretch', gap: theme.spacing.md }}>
        <VadCard style={{ flex: 1.1, gap: theme.spacing.sm }}>
          <View style={{ gap: 2 }}>
            <VadText variant="heading">{poolMarket ? 'Participant stakes show conviction.' : 'Prices show trader conviction.'}</VadText>
            <VadText variant="caption" tone="secondary">Published market rules decide the result.</VadText>
          </View>

          {poolMarket ? (
            <VadCard variant="brand" style={{ gap: 3 }}>
              <VadChip label="PEER FUNDED" tone="brand" />
              <VadText variant="bodyStrong">Participants fund the market pool</VadText>
              <VadText variant="caption" tone="secondary">
                Stakes move into protected market collateral. Winning payouts are redistributed from that participant pool after fees; VAD does not supply the opposing stake.
              </VadText>
            </VadCard>
          ) : null}

          {!density.phone ? (
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <VadButton
                label={tradeCapabilityLoading ? 'Checking availability' : canTrade ? (poolMarket ? 'Make a prediction' : 'Trade this market') : tradeDone ? 'Trading closed' : 'View trade availability'}
                onPress={onTrade}
                style={{ flex: 1 }}
                leading={<VadIcon name="markets" size={17} tone="inverse" />}
              />
              <VadButton label="Discussion" variant="secondary" onPress={onDiscuss} style={{ flex: 1 }} leading={<VadIcon name="community" size={17} tone="primary" />} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
              <VadButton label="Discussion" variant="secondary" size="small" onPress={onDiscuss} style={{ flex: 1 }} />
              <VadButton label="Rules" variant="secondary" size="small" onPress={onRules} style={{ flex: 1 }} />
            </View>
          )}
        </VadCard>

      </View>

      {!poolMarket ? <MarketDepthPanel instrumentId={market.instrument_public_id} /> : null}

      <Lifecycle market={market} timing={timing} />

    </View>
  );
}

function isPoolMarket(market: MarketCatalogItem) {
  return String(market.liquidity_mode ?? '').toUpperCase().includes('POOL');
}

function MarketSnapshot({ market, timing }: { market: MarketCatalogItem; timing: MarketTiming }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const pool = isPoolMarket(market);
  const yes = probability(market.yes_price);
  const no = probability(market.no_price);
  const hasSignal = market.yes_price != null || market.no_price != null;
  const schedule = [
    market.opens_at ? `Opens ${exactTime(market.opens_at)}` : null,
    market.closes_at ? `Closes ${exactTime(market.closes_at)}` : null,
    market.resolves_after ? `Result check ${exactTime(market.resolves_after)}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <View style={{ gap: density.compact ? 7 : 9 }}>
      {timing.resolutionOutcome ? (
        <VadCard variant="brand" accessibilityRole="summary" style={{ gap: 5, padding: density.compact ? 10 : 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <VadText variant="caption" tone="brand">FINAL RESULT</VadText>
            <VadChip label="CONFIRMED" tone={timing.resolutionOutcome === 'YES' ? 'yes' : 'no'} />
          </View>
          <VadText variant="heading" tone={timing.resolutionOutcome === 'YES' ? 'yes' : 'no'}>{timing.resolutionOutcome}</VadText>
          <VadText variant="caption" tone="secondary">Confirmed settlement outcome. The earlier YES/NO split does not determine payouts.</VadText>
        </VadCard>
      ) : null}
      <VadCard variant="surface" accessibilityRole="summary" style={{ gap: 6, padding: density.compact ? 8 : 10 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={{ flex: 1, minWidth: 0, borderRadius: 9, backgroundColor: theme.colors.yesSoft, paddingHorizontal: 8, paddingVertical: 5, gap: 1 }}>
            <VadText variant="caption" tone="yes">YES</VadText>
            <VadText variant="bodyStrong" tone={hasSignal ? 'yes' : 'tertiary'}>{yes}</VadText>
          </View>
          <View style={{ flex: 1, minWidth: 0, borderRadius: 9, backgroundColor: theme.colors.noSoft, paddingHorizontal: 8, paddingVertical: 5, gap: 1 }}>
            <VadText variant="caption" tone="no">NO</VadText>
            <VadText variant="bodyStrong" tone={hasSignal ? 'no' : 'tertiary'}>{no}</VadText>
          </View>
        </View>
        <VadText variant="caption" tone="tertiary">{pool ? 'Participant stake split only; not the final result.' : 'Current conviction; published rules decide the result.'}</VadText>
        {pool ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={{ flex: 1, backgroundColor: theme.colors.surfaceMuted, borderRadius: 8, padding: 7, gap: 1 }}>
              <VadText variant="caption" tone="tertiary">Participant pool</VadText>
              <VadText variant="caption">{assetMoney(market.total_volume ?? 0, market.asset_code)}</VadText>
            </View>
            <View style={{ flex: 1, backgroundColor: theme.colors.surfaceMuted, borderRadius: 8, padding: 7, gap: 1 }}>
              <VadText variant="caption" tone="tertiary">Participants</VadText>
              <VadText variant="caption">{String(Number(market.participant_count ?? 0))}</VadText>
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <VadChip label={timing.primaryTiming} tone="neutral" />
          {timing.stage === 'OPEN' && timing.closeCountdown ? <VadText variant="caption" tone="tertiary">Closes in {timing.closeCountdown}</VadText> : null}
          {timing.stage === 'SCHEDULED' && timing.openCountdown ? <VadText variant="caption" tone="tertiary">Opens in {timing.openCountdown}</VadText> : null}
        </View>
      </VadCard>
      {schedule ? <VadText variant="caption" tone="tertiary">{schedule}</VadText> : null}
    </View>
  );
}

function Lifecycle({ market, timing }: { market: MarketCatalogItem; timing: MarketTiming }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const tradeDone = ['CLOSED', 'RESOLVING', 'SETTLEMENT_PENDING', 'SETTLED', 'VOIDED'].includes(timing.stage);
  const resolutionDone = ['SETTLEMENT_PENDING', 'SETTLED', 'VOIDED'].includes(timing.stage);
  const settlementDone = timing.stage === 'SETTLED' || timing.stage === 'VOIDED';
  const resolutionActive = timing.stage === 'RESOLVING' || timing.stage === 'CLOSED';
  const settlementActive = timing.stage === 'SETTLEMENT_PENDING';

  return (
    <VadCard variant="surface" style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 3 }}>
        <VadText variant="bodyStrong">Market lifecycle</VadText>
              </View>
      <View style={{ flexDirection: density.width >= 620 ? 'row' : 'column', gap: theme.spacing.xs }}>
        <LifecycleStep
          number="1"
          title="Trading"
          body={tradeDone ? 'Trading has closed.' : timing.stage === 'SCHEDULED' ? `Opens in ${timing.openCountdown ?? '—'}.` : timing.closeCountdown ? `Closes in ${timing.closeCountdown}.` : 'Trading is open.'}
          state={tradeDone ? 'complete' : timing.stage === 'SCHEDULED' ? 'waiting' : 'active'}
        />
        <LifecycleStep
          number="2"
          title="Result"
          body={resolutionDone ? `Final result${timing.resolutionOutcome ? `: ${timing.resolutionOutcome}` : ''}.` : timing.resolutionCountdown ? `Result check in ${timing.resolutionCountdown}.` : resolutionActive ? 'Result verification is in progress.' : 'Result verification starts after trading closes.'}
          state={resolutionDone ? 'complete' : resolutionActive ? 'active' : 'waiting'}
        />
        <LifecycleStep
          number="3"
          title="Payout"
          body={settlementDone ? `Settlement is complete in ${market.asset_code}.` : settlementActive ? `Eligible ${market.asset_code} payouts are being processed automatically.` : `Eligible winning positions are paid in ${market.asset_code} after the result is final.`}
          state={settlementDone ? 'complete' : settlementActive ? 'active' : 'waiting'}
        />
      </View>
    </VadCard>
  );
}

function LifecycleStep({ number, title, body, state }: { number: string; title: string; body: string; state: 'active' | 'complete' | 'waiting' }) {
  const theme = useVadTheme();
  const active = state === 'active';
  const complete = state === 'complete';
  const tone = complete ? 'yes' : active ? 'brand' : 'tertiary';
  return (
    <View style={{ flex: 1, minWidth: 0, minHeight: 112, borderRadius: theme.radius.lg, backgroundColor: active ? theme.colors.brandSoft : complete ? theme.colors.yesSoft : theme.colors.surfaceMuted, borderWidth: 1, borderColor: active ? theme.colors.brandPrimary : complete ? theme.colors.yes : theme.colors.border, padding: theme.spacing.sm, gap: 5 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.xs }}>
        <VadText variant="caption" tone={tone}>{number}</VadText>
        <VadText variant="caption" tone={tone}>{complete ? 'COMPLETE' : active ? 'CURRENT' : 'NEXT'}</VadText>
      </View>
      <VadText variant="bodyStrong">{title}</VadText>
      <VadText variant="caption" tone="secondary">{body}</VadText>
    </View>
  );
}

function Rules({ market, timing }: { market: MarketCatalogItem; timing: MarketTiming }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const wide = density.width >= 820;
  const poolMarket = market.liquidity_mode === 'POOL';
  const rules = [
    {
      number: '1',
      title: 'Trading closes automatically',
      body: timing.tradingOpen && timing.closeCountdown
        ? `New ${poolMarket ? 'predictions' : 'orders'} stop in ${timing.closeCountdown}. The configured close is ${exactTime(market.closes_at) ?? 'set by the market'}.`
        : `Trading is ${timing.stage === 'SCHEDULED' ? 'not open yet' : 'closed'}. ${poolMarket ? 'Stakes' : 'Orders'} are accepted only inside the configured trading window.`,
    },
    {
      number: '2',
      title: poolMarket ? 'Pool share does not decide the outcome' : 'Price does not decide the outcome',
      body: poolMarket
        ? 'YES and NO percentages show where participant stakes are allocated. They do not decide the final result.'
        : 'YES and NO prices show what traders currently think. They do not decide the final result.',
    },
    {
      number: '3',
      title: 'The result follows the rules',
      body: timing.resolutionOutcome ? `This market finalized ${timing.resolutionOutcome}.` : 'The final result comes from the market’s published criteria and supporting evidence. Community posts and creator opinions do not decide the outcome.',
    },
    {
      number: '4',
      title: 'Payouts use this market’s currency',
      body: poolMarket
        ? `Eligible winners share the protected participant pool in ${market.asset_code}, proportionally to their winning stakes after configured fees. VAD does not inject company funds into the payout.`
        : `Eligible winning positions are paid in ${market.asset_code}. Values from another currency are not mixed into this market.`,
    },
  ];

  return (
    <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
      <View style={{ gap: 2 }}>
        <VadText variant="caption" tone="brand">MARKET RULES</VadText>
        <VadText variant="heading">How this market works</VadText>
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', flexWrap: wide ? 'wrap' : 'nowrap', gap: theme.spacing.sm }}>
        {rules.map((rule) => (
          <VadCard key={rule.number} variant="raised" style={{ width: wide ? '48.9%' : '100%', minHeight: wide ? 150 : undefined, gap: theme.spacing.xs }}>
            <VadChip label={rule.number} tone="brand" />
            <VadText variant="bodyStrong">{rule.title}</VadText>
            <VadText variant="caption" tone="secondary">{rule.body}</VadText>
          </VadCard>
        ))}
      </View>

    </View>
  );
}

