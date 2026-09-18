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
import { TradingTicket } from './components/trading-ticket';

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
  const poolMarket = market.liquidity_mode === 'POOL';

  return (
    <View style={{ gap: density.sectionGap }}>
      <MarketDetailHeader market={market} />

      <AssistantEntry
        label="Ask AI about this market"
        detail={market.liquidity_mode === 'POOL'
          ? 'Understand the question, peer pool, current split, fees, result rules and settlement.'
          : 'Understand the question, order book, prices, matching, fees, result rules and settlement.'}
        prompt="Explain this market to me clearly. Tell me what the question asks, whether it is Yes/No or another format, whether it uses Peer Pool or Order Book, how I participate, what the current market signal means, how fees and payouts work, how the result is verified, and what happens at settlement. Use this market’s actual current data."
        marketId={market.instrument_public_id}
        sourceRoute="/markets"
        compact={density.compact}
      />

      <View style={{ gap: theme.spacing.xs }}>
        <VadSegmentedControl value={tab} options={tabs} onChange={setTab} />
        <VadText variant="caption" tone="tertiary">
          {tab === 'Overview'
            ? 'Market details, timing and current stage.'
            : tab === 'Trade'
              ? timing.tradingOpen
                ? poolMarket ? 'Choose an outcome and commit a peer-funded stake.' : 'Build or reduce your matched position.'
                : timing.primaryTiming
              : tab === 'Discussion'
                ? 'See what the community thinks about this market.'
                : 'See how the result is decided and how payouts work.'}
        </VadText>
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
  const poolMarket = market.liquidity_mode === 'POOL';

  return (
    <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
      <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'stretch', gap: theme.spacing.md }}>
        <VadCard style={{ flex: 1.1, gap: theme.spacing.sm }}>
          <View style={{ gap: 2 }}>
            <VadText variant="caption" tone="brand">MARKET OVERVIEW</VadText>
            <VadText variant="heading">{poolMarket ? 'The pool shows participant conviction. The rules decide the result.' : 'Prices show what traders think. The rules decide the result.'}</VadText>
            <VadText variant="caption" tone="secondary">
              {poolMarket
                ? 'YES and NO percentages show how participant stakes are distributed. The final result follows the published rules and evidence, not whichever side has more money.'
                : 'YES and NO prices show how people are trading. The final result follows the published market rules and the evidence used to verify what happened, not whichever side has the higher price.'}
            </VadText>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            <StatePill label="Trading" value={timing.tradingOpen ? 'Open' : timing.stage === 'SCHEDULED' ? 'Not open yet' : 'Closed'} tone={timing.tradingOpen ? 'yes' : 'secondary'} />
            <StatePill label="Stage" value={timing.statusLabel} tone={timing.stage === 'SETTLED' ? 'yes' : timing.stage === 'SETTLEMENT_PENDING' ? 'brand' : 'secondary'} />
            {timing.resolutionOutcome ? <StatePill label="Result" value={timing.resolutionOutcome} tone={timing.resolutionOutcome === 'YES' ? 'yes' : 'secondary'} /> : null}
            <StatePill label="Currency" value={market.asset_code} tone="brand" />
          </View>

          <VadCard variant={timing.stage === 'SETTLED' ? 'raised' : 'brand'} style={{ gap: 3 }}>
            <VadText variant="caption" tone={timing.stage === 'SETTLED' ? 'yes' : 'brand'}>{timing.primaryTiming.toUpperCase()}</VadText>
            <VadText variant="bodyStrong">
              {timing.stage === 'OPEN' ? 'Trading is live'
                : timing.stage === 'CLOSED' ? 'Trading has closed'
                  : timing.stage === 'RESOLVING' ? 'VAD is verifying the result'
                    : timing.stage === 'SETTLEMENT_PENDING' ? 'Result final — payout processing'
                      : timing.stage === 'SETTLED' ? 'Market completed'
                        : timing.statusLabel}
            </VadText>
            <VadText variant="caption" tone="secondary">
              {timing.stage === 'OPEN' && timing.closeCountdown ? `${poolMarket ? 'New predictions' : 'New orders'} stop in ${timing.closeCountdown}.`
                : timing.stage === 'CLOSED' && timing.resolutionCountdown ? `Result check begins in ${timing.resolutionCountdown}.`
                  : timing.stage === 'RESOLVING' ? 'The market stays closed while oracle evidence and finalization complete.'
                    : timing.stage === 'SETTLEMENT_PENDING' ? `Eligible ${market.asset_code} payouts are being settled automatically.`
                      : timing.stage === 'SETTLED' ? `Final result${timing.resolutionOutcome ? `: ${timing.resolutionOutcome}` : ''}. Settlement is complete.`
                        : 'Lifecycle timing updates automatically.'}
            </VadText>
          </VadCard>

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

        <VadCard variant="raised" style={{ flex: 0.9, gap: theme.spacing.xs }}>
          <VadText variant="bodyStrong">Market timing</VadText>
          {market.opens_at ? <Fact label="Opens" value={timing.openCountdown ? `In ${timing.openCountdown}` : 'Opened'} /> : null}
          <Fact label="Trading" value={timing.stage === 'OPEN' && timing.closeCountdown ? `Closes in ${timing.closeCountdown}` : timing.tradingOpen ? 'Open' : 'Closed'} />
          <Fact label="Result" value={timing.resolutionOutcome ? `Final · ${timing.resolutionOutcome}` : timing.resolutionCountdown ? `Check in ${timing.resolutionCountdown}` : timing.stage === 'RESOLVING' ? 'Processing' : timing.stage === 'SETTLEMENT_PENDING' ? 'Finalized' : timing.stage === 'SETTLED' ? 'Finalized' : 'Pending'} />
          {poolMarket ? <Fact label="Participant pool" value={`${Number(market.total_volume ?? 0).toLocaleString()} ${market.asset_code}`} /> : null}
          {poolMarket ? <Fact label="Participants" value={String(Number(market.participant_count ?? 0))} /> : null}
          <Fact label="Currency" value={market.asset_code} />
          <Fact label="Market format" value={market.market_type === 'BINARY' ? 'Yes / No' : friendlyEnum(market.market_type)} />
          <Fact label="Trading method" value={poolMarket ? 'Peer Pool' : market.liquidity_mode === 'ORDER_BOOK' ? 'Order Book' : friendlyEnum(market.liquidity_mode ?? 'ORDER_BOOK')} />
          <Fact label={poolMarket ? 'Last stake' : 'Last trade'} value={market.last_trade_at ? new Date(market.last_trade_at).toLocaleString() : poolMarket ? 'No stakes yet' : 'No trades yet'} />
        </VadCard>
      </View>

      <Lifecycle market={market} timing={timing} />

      <VadCard variant="brand" style={{ gap: theme.spacing.xs }}>
        <VadText variant="caption" tone="brand">HOW TO READ THE MARKET</VadText>
        <VadText variant="bodyStrong">{poolMarket ? 'The stake split is not the final result.' : 'A market price is not the final result.'}</VadText>
        <VadText variant="caption" tone="secondary">
          {poolMarket
            ? 'For example, 90% of the pool backing YES means participant money strongly favours YES. The confirmed result can still be NO if the published rules and evidence support NO.'
            : 'For example, a 90% YES price means traders strongly favour YES. The final result can still be NO if the published rules and evidence support NO.'}
        </VadText>
      </VadCard>
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
    <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
      <View style={{ gap: 2 }}>
        <VadText variant="bodyStrong">Market lifecycle</VadText>
        <VadText variant="caption" tone="secondary">The countdown changes stages automatically; realtime backend events then confirm each transition.</VadText>
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
        <VadText variant="caption" tone="secondary">What to understand before committing funds.</VadText>
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

      <VadCard variant="brand" style={{ gap: 2 }}>
        <VadText variant="bodyStrong">Trading → Result → Payout</VadText>
        <VadText variant="caption" tone="secondary">Market popularity and community discussion can inform your view, but the published market rules determine the final result.</VadText>
      </VadCard>
    </View>
  );
}

function friendlyEnum(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatePill({ label, value, tone = 'secondary' }: { label: string; value: string; tone?: 'secondary' | 'yes' | 'brand' }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: 120, minHeight: 52, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: theme.spacing.sm, paddingVertical: 7, gap: 1 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="caption" tone={tone} numberOfLines={1}>{value}</VadText>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <VadText variant="caption" tone="tertiary" style={{ flex: 1 }}>{label}</VadText>
      <VadText variant="bodyStrong" style={{ flex: 1.35, textAlign: 'right' }} numberOfLines={2}>{value}</VadText>
    </View>
  );
}
