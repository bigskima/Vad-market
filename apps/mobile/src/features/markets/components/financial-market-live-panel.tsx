import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { getCryptoMarketPrices, type CryptoMarketQuote } from '@/services/crypto-market-data-api';
import { getFinancialMarketData, type FinancialAssetClass, type FinancialMarketQuote } from '@/services/financial-market-data-api';
import { formatFinancialNumber } from './financial-assets-data-panel';

type Quote = {
  symbol: string;
  name: string;
  price: number;
  quoteCurrency: string;
  changePercent: number | null;
  source: string;
  sourceUpdatedAt: string | null;
  history: number[];
  marketOpen: boolean | null;
};
type Details = {
  assetClass: 'CRYPTO' | FinancialAssetClass;
  query: string;
  symbol: string;
  coinId: string | null;
  targetPrice: number | null;
  targetLabel: 'Target price' | 'Reference price';
  targetOperator: string | null;
  targetCurrency: string;
  observationAt: string | null;
};

export function hasLiveFinancialContext(market: MarketCatalogItem): boolean {
  return Boolean(readDetails(market));
}

export function FinancialMarketLivePanel({ market, now }: { market: MarketCatalogItem; now: number }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const details = useMemo(() => readDetails(market), [
    market.category_code, market.category, market.presentation_profile, market.market_context, market.title,
    market.closes_at, market.resolves_after,
  ]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [samples, setSamples] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [chartWidth, setChartWidth] = useState(300);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setQuote(null);
    setSamples([]);
    setLoading(true);
    setError(null);
    if (!details) {
      setLoading(false);
      return () => { active = false; };
    }

    let nextDelaySeconds = details.assetClass === 'CRYPTO' ? 15 : 300;
    const refresh = async () => {
      if (!active) return;
      setRefreshing(true);
      try {
        let nextQuote: Quote | null = null;
        if (details.assetClass === 'CRYPTO') {
          const result = await getCryptoMarketPrices({ page: 1, perPage: 40, query: details.coinId || details.query });
          const target = details.symbol.toUpperCase();
          const coinId = details.coinId?.toLowerCase();
          const match = result.coins.find((coin) => coin.symbol.toUpperCase() === target)
            ?? (coinId ? result.coins.find((coin) => coin.id.toLowerCase() === coinId) : undefined)
            ?? result.coins[0];
          if (match) {
            nextQuote = quoteFromCrypto(match, result.quoteCurrency, result.source);
            nextDelaySeconds = Math.max(15, Math.min(3600, result.cacheSeconds ?? 30));
          }
        } else {
          const result = await getFinancialMarketData({
            assetClass: details.assetClass,
            query: details.query,
          });
          const match = result.items.find((item) => item.symbol.toUpperCase() === details.symbol.toUpperCase())
            ?? result.items[0];
          if (match?.currentPrice !== null && match?.currentPrice !== undefined) {
            nextQuote = quoteFromFinancial(match);
          }
          nextDelaySeconds = Math.max(15, Math.min(3600, result.cacheSeconds ?? 300));
        }

        if (!active) return;
        if (nextQuote) {
          setQuote(nextQuote);
          setSamples((current) => {
            const seed = current.length ? current : nextQuote!.history.filter(Number.isFinite).slice(-30);
            return [...seed, nextQuote!.price].slice(-60);
          });
          setError(null);
        } else {
          setError('A usable live quote was not returned for ' + details.symbol + '. The market remains governed by its published rules.');
        }
      } catch (value) {
        if (active) setError(value instanceof Error ? value.message : 'Live financial market data is temporarily unavailable.');
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
          const delay = Math.max(15, nextDelaySeconds) * 1000;
          timer = setTimeout(() => { void refresh(); }, delay);
        }
      }
    };
    void refresh();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [details?.assetClass, details?.query, details?.symbol, details?.coinId, retryNonce]);

  if (!details) return null;

  const targetTime = details.observationAt ? Date.parse(details.observationAt) : null;
  const remainingMs = targetTime && Number.isFinite(targetTime) ? targetTime - now : null;
  const remainingLabel = remainingMs === null
    ? null
    : remainingMs <= 0 ? 'Observation time reached' : formatCountdown(remainingMs);
  const movement = quote?.changePercent ?? null;
  const movementText = movement === null ? null : (movement > 0 ? '+' : '') + movement.toFixed(2) + '%';
  const movementTone = movement === null || movement === 0 ? 'secondary' : movement > 0 ? 'yes' : 'no';
  const chart = buildChart(samples, chartWidth, details.targetPrice);
  const targetVisible = details.targetPrice !== null && chart.targetY !== null;

  if (loading && !quote) {
    return (
      <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
        <VadSkeleton height={24} width="56%" />
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <View style={{ flex: 1 }}><VadSkeleton height={68} radius={theme.radius.md} /></View>
          <View style={{ flex: 1 }}><VadSkeleton height={68} radius={theme.radius.md} /></View>
        </View>
        <VadSkeleton height={120} radius={theme.radius.md} />
      </VadCard>
    );
  }

  return (
    <VadCard variant="raised" style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }}>
          <VadIcon name="activity" size={19} tone="brand" />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <VadText variant="label" tone="brand">LIVE FINANCIAL PRICE</VadText>
          <VadText variant="bodyStrong">{quote?.name ?? details.symbol} {quote?.symbol ? '(' + quote.symbol + ')' : ''}</VadText>
          <VadText variant="caption" tone="secondary">{quote?.source ?? (details.assetClass === 'CRYPTO' ? 'Configured crypto market-data source' : 'Configured financial market-data source')}</VadText>
        </View>
        {refreshing ? <VadChip label="Updating" tone="neutral" /> : <VadChip label={quote ? 'Quote loaded' : 'Waiting'} tone={quote ? 'yes' : 'warning'} />}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {details.targetPrice !== null ? (
          <View style={{ flexGrow: 1, flexBasis: '45%', minWidth: 130, padding: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceMuted, gap: 4 }}>
            <VadText variant="caption" tone="secondary">{details.targetLabel}</VadText>
            <VadText variant="title" style={{ fontSize: density.phone ? 21 : 25 }}>
              {formatFinancialNumber(details.targetPrice, details.targetCurrency)}
            </VadText>
            {details.targetOperator ? <VadText variant="caption" tone="secondary">{operatorLabel(details.targetOperator)}</VadText> : null}
          </View>
        ) : null}
        <View style={{ flexGrow: 1, flexBasis: '45%', minWidth: 130, padding: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceMuted, gap: 4 }}>
          <VadText variant="caption" tone="secondary">{details.targetPrice === null ? 'Current price' : 'Current price'}</VadText>
          <VadText variant="title" style={{ fontSize: density.phone ? 21 : 25 }}>
            {quote ? formatFinancialNumber(quote.price, quote.quoteCurrency) : '—'}
          </VadText>
          {movementText ? <VadText variant="caption" tone={movementTone}>{movementText} · provider-reported change</VadText> : null}
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        {market.yes_price !== null && market.yes_price !== undefined ? (
          <View style={{ gap: 2 }}>
            <VadText variant="caption" tone="secondary">Market chance</VadText>
            <VadText variant="heading" style={{ color: theme.colors.brandPrimary }}>{formatProbability(market.yes_price)}</VadText>
          </View>
        ) : null}
        {remainingLabel ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <VadIcon name="clock" size={15} tone="secondary" />
            <VadText variant="bodyStrong">{remainingLabel}</VadText>
          </View>
        ) : null}
        {quote?.marketOpen !== null && quote?.marketOpen !== undefined ? (
          <VadChip label={quote.marketOpen ? 'Underlying market open' : 'Underlying market closed'} tone={quote.marketOpen ? 'yes' : 'neutral'} />
        ) : null}
      </View>

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <VadText variant="label">Price movement</VadText>
          <VadText variant="caption" tone="secondary">{samples.length > 1 ? 'Live quote samples + recent history' : 'Collecting quote samples'}</VadText>
        </View>
        <View
          onLayout={(event) => setChartWidth(Math.max(120, event.nativeEvent.layout.width))}
          style={{ height: 116, width: '100%', borderRadius: theme.radius.md, overflow: 'hidden', backgroundColor: theme.colors.surfaceMuted }}
        >
          {[0.25, 0.5, 0.75].map((position) => (
            <View key={position} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: position * 116, borderTopWidth: 1, borderColor: theme.colors.border, opacity: 0.45 }} />
          ))}
          {targetVisible ? (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: chart.targetY ?? 0, height: 1, borderTopWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.brandPrimary }} />
          ) : null}
          {chart.segments.map((segment, index) => (
            <View key={index} pointerEvents="none" style={{
              position: 'absolute', left: segment.left, top: segment.top, width: segment.length, height: 2,
              borderRadius: 1, backgroundColor: segment.positive ? theme.colors.yes : theme.colors.no,
              transform: [{ rotate: segment.rotation }], transformOrigin: 'left center' as never,
            }} />
          ))}
          {targetVisible ? (
            <View pointerEvents="none" style={{ position: 'absolute', right: 5, top: Math.max(2, (chart.targetY ?? 0) - 10), borderRadius: 9, backgroundColor: theme.colors.brandPrimary, paddingHorizontal: 7, paddingVertical: 3 }}>
              <VadText variant="caption" tone="inverse">Target</VadText>
            </View>
          ) : null}
        </View>
        {details.targetPrice !== null && !targetVisible ? (
          <VadText variant="caption" tone="secondary">The target is outside the current chart range; the price target above remains the authoritative market target.</VadText>
        ) : null}
      </View>

      {error ? <VadErrorState title="Live quote could not refresh" message={error} onRetry={() => setRetryNonce((value) => value + 1)} /> : null}
      <VadText variant="caption" tone="tertiary">
        {quote?.sourceUpdatedAt ? 'Underlying quote timestamp: ' + new Date(quote.sourceUpdatedAt).toLocaleString() + '. ' : ''}
        Quote freshness depends on the enabled provider and its plan. Public display quotes are context only; they do not settle this market. Final outcomes use the market’s published Oracle/resolution policy.
      </VadText>
    </VadCard>
  );
}

function readDetails(market: MarketCatalogItem): Details | null {
  const profile = String(market.presentation_profile ?? '').toUpperCase();
  const category = String(market.category_code ?? market.category ?? '').toUpperCase();
  let assetClass: Details['assetClass'] | null = null;
  if (profile === 'CRYPTO' || category === 'CRYPTO_WEB3' || category.includes('CRYPTO')) assetClass = 'CRYPTO';
  else if (profile === 'STOCKS' || category === 'STOCKS_EQUITIES' || category.includes('STOCK')) assetClass = 'STOCKS';
  else if (category === 'COMMODITIES_ENERGY' || category.includes('COMMODIT')) assetClass = 'COMMODITIES';
  else if (category.includes('FOREX') || category.includes('CURRENCY_PAIR')) assetClass = 'FOREX';
  else if (profile === 'ECONOMICS' || category.includes('ECONOM')) assetClass = 'ECONOMICS';
  if (!assetClass) return null;

  const context = isRecord(market.market_context) ? market.market_context : {};
  const subject = isRecord(context.subject) ? context.subject : {};
  const nestedDetails = isRecord(context.details) ? context.details : {};
  const instrument = isRecord(context.financial_asset) ? context.financial_asset : isRecord(context.asset_data) ? context.asset_data : {};
  const values: unknown[] = [
    instrument.symbol, instrument.ticker, instrument.asset_symbol, instrument.company_ticker, instrument.benchmark, instrument.currency_pair,
    subject.asset, subject.symbol, subject.ticker, subject.asset_symbol, subject.coin, subject.token, subject.stock_symbol, subject.company_ticker, subject.series_id, subject.indicator, subject.benchmark, subject.currency_pair, subject.pair,
    context.asset, context.symbol, context.ticker, context.asset_symbol, context.crypto_asset_symbol, context.series_id, context.indicator, context.benchmark, context.currency_pair, context.pair,
    nestedDetails.symbol, nestedDetails.ticker, nestedDetails.asset_symbol, nestedDetails.stock_symbol, nestedDetails.company_ticker, nestedDetails.series_id, nestedDetails.indicator, nestedDetails.benchmark, nestedDetails.currency_pair, nestedDetails.pair,
  ];
  const candidate = values.find((value) => typeof value === 'string' && value.trim());
  const query = typeof candidate === 'string' ? candidate.split('/')[0].split('.').pop()?.trim() ?? '' : '';
  const coinIdCandidate = [
    instrument.coinGeckoId, instrument.coingecko_id, instrument.coin_id,
    subject.coin_id, subject.coinId, subject.coingecko_id, subject.coin_gecko_id,
    context.coin_id, context.coingecko_id, context.coin_gecko_id,
  ].find((value) => typeof value === 'string' && value.trim());
  const companyCandidate = [
    instrument.company, subject.company, context.company, nestedDetails.company,
  ].find((value) => typeof value === 'string' && value.trim());
  // A company name alone is not an instrument identifier. For listed-company,
  // IPO and earnings event markets, only show this price module when a ticker or
  // explicit asset symbol was supplied in the approved market context.
  const isListedCompany = assetClass === 'STOCKS';
  const effectiveQuery = query || (!isListedCompany && typeof companyCandidate === 'string' ? companyCandidate.trim() : '');
  if (!effectiveQuery) return null;
  const rawTarget = [
    instrument.targetPrice, instrument.priceTarget, instrument.referencePrice, instrument.threshold, instrument.target_price, instrument.price_target,
    context.target_price, context.price_target, context.reference_price, context.start_price, context.baseline_price,
    context.threshold, subject.target_price, subject.price_target, subject.reference_price, subject.threshold,
    nestedDetails.target_price, nestedDetails.price_target, nestedDetails.reference_price, nestedDetails.threshold,
  ].find((value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)));
  const targetPrice = rawTarget === undefined ? null : Number(rawTarget);
  const thresholdValues = [instrument.threshold, context.threshold, subject.threshold, nestedDetails.threshold];
  const isThreshold = thresholdValues.some((value) => value !== null && value !== undefined && value !== '');
  const targetOperator = [instrument.operator, context.operator, context.threshold_operator, subject.operator, nestedDetails.operator]
    .find((value) => typeof value === 'string' && value.trim());
  const quote = [instrument.quoteCurrency, instrument.quote, context.quote, context.quote_currency, subject.quote, nestedDetails.quote]
    .find((value) => typeof value === 'string' && value.trim());
  const observation = [context.observation_time, context.observationAt, instrument.observationTime, market.resolves_after, market.closes_at]
    .find((value) => typeof value === 'string' && value.trim());
  const currency = typeof quote === 'string' ? quote.toUpperCase() : assetClass === 'ECONOMICS' ? 'index' : 'USD';
  const symbol = effectiveQuery;
  return {
    assetClass, query: effectiveQuery, symbol,
    coinId: typeof coinIdCandidate === 'string' ? coinIdCandidate.trim().toLowerCase() : null,
    targetPrice: targetPrice !== null && targetPrice > 0 ? targetPrice : null,
    targetLabel: isThreshold ? 'Target price' : 'Reference price',
    targetOperator: typeof targetOperator === 'string' ? targetOperator.trim().toUpperCase() : null,
    targetCurrency: currency,
    observationAt: typeof observation === 'string' ? observation : null,
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function quoteFromCrypto(coin: CryptoMarketQuote, currency: string, source: string): Quote {
  return {
    symbol: coin.symbol, name: coin.name, price: coin.currentPrice, quoteCurrency: currency,
    changePercent: coin.change24hPercent, source, sourceUpdatedAt: coin.sourceUpdatedAt,
    history: coin.sparkline7d, marketOpen: null,
  };
}
function quoteFromFinancial(item: FinancialMarketQuote): Quote {
  return {
    symbol: item.symbol, name: item.name, price: item.currentPrice ?? 0, quoteCurrency: item.quoteCurrency,
    changePercent: item.change24hPercent, source: item.source, sourceUpdatedAt: item.sourceUpdatedAt,
    history: [], marketOpen: item.marketOpen,
  };
}
function operatorLabel(value: string) {
  return ({ GT: 'Above', GTE: 'At or above', LT: 'Below', LTE: 'At or below', ABOVE: 'Above', BELOW: 'Below' } as Record<string, string>)[value] ?? value;
}
function formatProbability(value: number | string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const percent = Math.round((Math.abs(number) <= 1 ? number : number / 100) * 100);
  return percent + '% chance';
}
function formatCountdown(value: number) {
  const total = Math.floor(value / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days) return days + 'd ' + hours + 'h left';
  if (hours) return hours + 'h ' + minutes + 'm left';
  return minutes + ':' + String(seconds).padStart(2, '0') + ' remaining';
}
function buildChart(samples: number[], width: number, target: number | null) {
  const plotHeight = 108;
  const values = samples.slice(-42).filter(Number.isFinite);
  if (!values.length) return { segments: [] as { left:number;top:number;length:number;rotation:string;positive:boolean }[], targetY: null as number | null };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.max(Math.abs(max) * 0.0001, 0.0000001);
  const padding = 7;
  const points = values.map((value, index) => ({
    x: padding + (index / Math.max(1, values.length - 1)) * Math.max(1, width - padding * 2),
    y: plotHeight - padding - ((value - min) / range) * (plotHeight - padding * 2),
    value,
  }));
  const segments = points.slice(1).map((point, index) => {
    const previous = points[index];
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    return {
      left: previous.x, top: previous.y, length: Math.sqrt(dx * dx + dy * dy),
      rotation: Math.atan2(dy, dx) + 'rad', positive: point.value >= previous.value,
    };
  });
  const targetY = target !== null && target >= min && target <= max
    ? plotHeight - padding - ((target - min) / range) * (plotHeight - padding * 2)
    : null;
  return { segments, targetY };
}
