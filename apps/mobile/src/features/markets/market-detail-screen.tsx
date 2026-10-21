import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

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
import type { MarketCatalogItem } from '@/services/market-api';
import { MarketDetailHeader } from './components/market-detail-header';
import { MarketDepthPanel } from './components/market-depth-panel';
import { TradingTicket } from './components/trading-ticket';
import { MarketPriceHistoryPanel } from './components/market-price-history-panel';
import { CryptoMarketSpotSummary } from './components/crypto-market-prices-panel';
import { assetMoney, probability } from './format';

type DetailTab = 'Overview' | 'Live price' | 'Trade' | 'Chart' | 'Discussion' | 'Rules';
type MarketTiming = ReturnType<typeof getMarketTiming>;

const tabs: { value: DetailTab; label: string }[] = [
  { value: 'Overview', label: 'Overview' },
  { value: 'Live price', label: 'Live price' },
  { value: 'Trade', label: 'Trade' },
  { value: 'Chart', label: 'Activity' },
  { value: 'Discussion', label: 'Chat' },
  { value: 'Rules', label: 'Rules' },
];

export function MarketDetailScreen({
  market,
  markets,
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
  initialOutcome?: 'YES' | 'NO';
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
  const isCryptoMarket = String(market.presentation_profile ?? '').toUpperCase() === 'CRYPTO'
    || String(market.category_code ?? '').toUpperCase() === 'CRYPTO_WEB3'
    || String(market.category ?? '').toUpperCase() === 'CRYPTO';
  const [tab, setTab] = useState<DetailTab>(initialOutcome ? 'Trade' : 'Overview');
  const closeRefreshDone = useRef(false);
  const resolveRefreshDone = useRef(false);

  useEffect(() => {
    closeRefreshDone.current = false;
    resolveRefreshDone.current = false;
    setTab(initialOutcome ? 'Trade' : 'Overview');
  }, [market.instrument_public_id, initialOutcome]);

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
    <View style={{ gap: density.compact ? 12 : density.sectionGap }}>
      <MarketDetailHeader market={market} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 2 }}>
        {tabs.filter((item) => isCryptoMarket || item.value !== 'Live price').map((item) => (
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
        <Overview market={market} timing={timing} onTrade={() => setTab('Trade')} />
      ) : null}
      {tab === 'Live price' && isCryptoMarket ? <CryptoMarketSpotSummary assetQuery={marketCryptoAssetQuery(market)} /> : null}
      {tab === 'Chart' ? <Activity market={market} /> : null}
      {tab === 'Trade' ? (
        <TradingTicket
          key={`${market.instrument_public_id}:${initialOutcome ?? 'default'}`}
          market={market}
          initialOutcome={initialOutcome}
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
      <MarketContextPanel market={market} />
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

function MarketContextPanel({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
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

  if (!entries.length) return null;

  return (
    <VadCard variant="surface" style={{ gap: theme.spacing.sm }}>
      <View style={{ gap: 3 }}>
        <VadText variant="label" tone="brand">{labels[profile] ?? labels.EVENT}</VadText>
        <VadText variant="caption" tone="secondary">
          Details come from the published market setup. The official resolution criteria remain authoritative.
        </VadText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        {entries.map((entry) => (
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
              gap: 2,
            }}
          >
            <VadText variant="caption" tone="tertiary">{contextLabel(entry.key)}</VadText>
            <VadText variant="bodyStrong">{entry.value}</VadText>
          </View>
        ))}
      </View>
    </VadCard>
  );
}

function contextLabel(key: string) {
  return key.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function marketCryptoAssetQuery(market: MarketCatalogItem) {
  const context = market.market_context && typeof market.market_context === 'object'
    ? market.market_context
    : {};
  const subject = context.subject && typeof context.subject === 'object' && !Array.isArray(context.subject)
    ? context.subject as Record<string, unknown>
    : {};
  const candidates = [
    subject.asset,
    subject.symbol,
    subject.coin,
    subject.token,
    context.asset,
    context.symbol,
    context.coin,
    context.token,
  ];
  const source = candidates.find((value) => typeof value === 'string' && value.trim());
  if (typeof source === 'string') return source.split('/')[0].trim();

  // Some legacy crypto markets do not carry structured subject metadata. Recover
  // an explicit ticker from the title before falling back to no spot-price panel.
  // This only selects the display quote; it does not affect the Oracle resolver.
  const title = market.title ?? '';
  const pair = title.match(/\b([A-Z0-9]{2,12})\s*\/\s*(?:USD|USDT|USDC)\b/i);
  if (pair?.[1]) return pair[1].toUpperCase();
  const parenthesizedSymbol = title.match(/\(([A-Z0-9]{2,12})\)/);
  if (parenthesizedSymbol?.[1]) return parenthesizedSymbol[1].toUpperCase();
  const leadingSymbol = title.match(/^Will\s+([A-Z0-9]{2,12})\s+(?:be|reach|close|trade|finish)\b/i);
  if (leadingSymbol?.[1]) return leadingSymbol[1].toUpperCase();
  const leadingName = title.match(/^Will\s+(Bitcoin|Ethereum|Solana|BNB|XRP|Dogecoin|Cardano)\b/i);
  if (leadingName?.[1]) return leadingName[1];
  return '';
}
