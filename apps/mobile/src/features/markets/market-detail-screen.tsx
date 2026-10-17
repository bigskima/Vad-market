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
import { useCurrencyPreference } from '@/providers/currency-preference-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { MarketDetailHeader } from './components/market-detail-header';
import { MarketDepthPanel } from './components/market-depth-panel';
import { TradingTicket } from './components/trading-ticket';
import { MarketPriceHistoryPanel } from './components/market-price-history-panel';
import { assetMoney, probability } from './format';

type DetailTab = 'Overview' | 'Trade' | 'Chart' | 'Discussion' | 'Rules';
type MarketTiming = ReturnType<typeof getMarketTiming>;

const tabs = [
  { value: 'Overview', label: 'Overview' },
  { value: 'Trade', label: 'Trade' },
  { value: 'Chart', label: 'Chart' },
  { value: 'Discussion', label: 'Chat' },
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
  const density = useProductDensity();
  const currencyPreference = useCurrencyPreference();
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

  const marketCurrency = market.asset_code as 'NGN' | 'USDC';
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
    <View style={{ gap: density.compact ? 12 : density.sectionGap }}>
      <MarketDetailHeader market={market} />

      <View style={{ gap: 6 }}>
        <VadSegmentedControl value={tab} options={tabs} onChange={setTab} />
      </View>

      {tab === 'Overview' ? (
        <Overview market={market} timing={timing} onTrade={() => setTab('Trade')} />
      ) : null}
      {tab === 'Chart' ? <Activity market={market} /> : null}
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

    </View>
  );
}

function Overview({ market, timing, onTrade }: { market: MarketCatalogItem; timing: MarketTiming; onTrade: () => void }) {
  const density = useProductDensity();
  return (
    <View style={{ gap: density.compact ? 8 : 12 }}>
      <MarketSnapshot market={market} timing={timing} />
      <VadButton label="Trade this market" onPress={onTrade} size="small" leading={<VadIcon name="markets" size={15} tone="inverse" />} />
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
    <View style={{ gap: density.compact ? 10 : 13 }}>
      <VadCard variant="surface" accessibilityRole="summary" style={{ gap: 9, padding: density.compact ? 12 : 16, borderRadius: density.phone ? 20 : 24 }}>
        {timing.resolutionOutcome ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
            <View style={{ flex: 1, gap: 1 }}>
              <VadText variant="caption" tone="tertiary">FINAL RESULT</VadText>
              <VadText variant="bodyStrong" tone={timing.resolutionOutcome === 'YES' ? 'yes' : 'no'}>{timing.resolutionOutcome}</VadText>
            </View>
            <VadChip label="CONFIRMED" tone={timing.resolutionOutcome === 'YES' ? 'yes' : 'no'} />
          </View>
        ) : null}
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
        <VadText variant="caption" tone="tertiary">{pool ? 'Pool split, not the final result.' : 'Current conviction; published rules decide the result.'}</VadText>
        {pool ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={{ flex: 1, backgroundColor: theme.colors.surfaceMuted, borderRadius: 8, padding: 7, gap: 1 }}>
              <VadText variant="caption" tone="tertiary">Pool volume</VadText>
              <VadText variant="caption">{assetMoney(market.total_volume ?? 0, market.asset_code)}</VadText>
            </View>
            <View style={{ flex: 1, backgroundColor: theme.colors.surfaceMuted, borderRadius: 8, padding: 7, gap: 1 }}>
              <VadText variant="caption" tone="tertiary">Traders</VadText>
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

function Rules({ market, timing }: { market: MarketCatalogItem; timing: MarketTiming }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const poolMarket = isPoolMarket(market);
  const rules = [
    {
      number: '1',
      title: 'Trading window',
      body: timing.tradingOpen && timing.closeCountdown
        ? `Trading closes in ${timing.closeCountdown}. Scheduled close: ${exactTime(market.closes_at) ?? 'market rules'}.`
        : `Trading is ${timing.stage === 'SCHEDULED' ? 'not open yet' : 'closed'}; participation is limited to the configured window.`,
    },
    {
      number: '2',
      title: poolMarket ? 'Stake split is not the result' : 'Price is not the result',
      body: poolMarket
        ? 'YES/NO percentages show participant stake allocation, not the final outcome.'
        : 'YES/NO prices reflect market activity, not the final outcome.',
    },
    {
      number: '3',
      title: 'Resolution criteria',
      body: timing.resolutionOutcome
        ? `Final result: ${timing.resolutionOutcome}.`
        : 'The outcome follows the published criteria and supporting evidence, not community opinions.',
    },
    {
      number: '4',
      title: 'Settlement',
      body: `Eligible payouts use ${market.asset_code} and follow the published settlement rules.`,
    },
  ];

  return (
    <View style={{ gap: density.compact ? 8 : 12 }}>
      <VadCard variant="surface" style={{ padding: 10, gap: 0 }}>
        <VadText variant="bodyStrong" style={{ paddingBottom: 7 }}>Market rules</VadText>
        {rules.map((rule, index) => (
          <View key={rule.number} style={{ flexDirection: 'row', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
              <VadText variant="caption" tone="secondary">{rule.number}</VadText>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <VadText variant="caption" style={{ fontWeight: '700' }}>{rule.title}</VadText>
              <VadText variant="caption" tone="secondary">{rule.body}</VadText>
            </View>
          </View>
        ))}
      </VadCard>
    </View>
  );
}
