import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { getFinancialMarketData, type FinancialAssetClass, type FinancialMarketQuote } from '@/services/financial-market-data-api';

export function FinancialAssetsDataPanel({ assetClass, search, showHeader = true }: {
  assetClass: FinancialAssetClass;
  search: string;
  showHeader?: boolean;
}) {
  const theme = useVadTheme();
  const [items, setItems] = useState<FinancialMarketQuote[]>([]);
  const [source, setSource] = useState('');
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const term = search.trim();

    const refresh = async () => {
      if (!active) return;
      if (term.length === 1) {
        setItems([]);
        setSource('');
        setFetchedAt(null);
        setStale(false);
        setError(null);
        setNotice(null);
        setLoading(false);
        return;
      }

      setError(null);
      setNotice(null);
      setLoading(true);
      try {
        const page = await getFinancialMarketData({ assetClass, query: term });
        if (!active) return;
        setItems(page.items);
        setSource(page.source ?? '');
        setFetchedAt(page.fetchedAt ?? null);
        setStale(page.stale === true);
        setNotice(page.message ?? null);
        refreshTimer = setTimeout(() => { void refresh(); }, Math.max(15, Math.min(3600, page.cacheSeconds ?? 300)) * 1000);
      } catch (value) {
        if (!active) return;
        setError(value instanceof Error ? value.message : 'The selected financial data feed is unavailable.');
        // Retry infrequently when a provider or key is not ready.
        refreshTimer = setTimeout(() => { void refresh(); }, 60_000);
      } finally {
        if (active) setLoading(false);
      }
    };

    debounceTimer = setTimeout(() => { void refresh(); }, 250);
    return () => {
      active = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [assetClass, search]);

  const title = assetClass === 'STOCKS' ? 'Stocks & Equities'
    : assetClass === 'COMMODITIES' ? 'Commodities & Energy'
      : assetClass === 'FOREX' ? 'Foreign exchange'
        : 'Economic indicators';
  const help = assetClass === 'STOCKS'
    ? 'Search listed companies and ETFs by ticker or company name.'
    : assetClass === 'COMMODITIES'
      ? 'Search configured commodity and energy benchmarks by symbol or name.'
      : assetClass === 'FOREX'
        ? 'Search currency pairs by symbol, such as EUR/USD.'
        : 'Search published economic series by name or series identifier. Reported observations may be delayed or revised.';

  return (
    <View style={{ gap: theme.spacing.md }}>
      {showHeader ? (
        <View style={{ gap: 4 }}>
          <VadText variant="label" tone="brand">FINANCIAL MARKET DATA</VadText>
          <VadText variant="heading">{title}</VadText>
          <VadText variant="caption" tone="secondary">{help}</VadText>
        </View>
      ) : null}
      {loading && !items.length ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadSkeleton height={142} radius={theme.radius.lg} />
          <VadSkeleton height={142} radius={theme.radius.lg} />
        </View>
      ) : error && !items.length ? (
        <VadErrorState
          title={title + ' data unavailable'}
          message={error}
          onRetry={() => {
            setLoading(true);
            void getFinancialMarketData({ assetClass, query: search.trim() })
              .then((page) => {
                setItems(page.items);
                setSource(page.source ?? '');
                setFetchedAt(page.fetchedAt ?? null);
                setStale(page.stale === true);
                setNotice(page.message ?? null);
                setError(null);
              })
              .catch((value: unknown) => setError(value instanceof Error ? value.message : 'The selected financial data feed is unavailable.'))
              .finally(() => setLoading(false));
          }}
        />
      ) : items.length ? (
        <View style={{ gap: theme.spacing.sm }}>
          {items.map((item) => (
            <FinancialAssetCard key={item.id} item={item} />
          ))}
        </View>
      ) : (
        <VadEmptyState title="No matching assets" body="Try a ticker, a shorter company name, or a different symbol. Results depend on the enabled provider's coverage." />
      )}
      {notice ? <VadText variant="caption" tone="secondary">{notice}</VadText> : null}
      {error && items.length ? <VadText variant="caption" tone="warning">{error}</VadText> : null}
      {items.length ? (
        <VadText variant="caption" tone="tertiary">
          {source ? source + ' · ' : ''}{fetchedAt ? 'Updated ' + new Date(fetchedAt).toLocaleString() : 'Provider timestamp unavailable'}{stale ? ' · Showing cached data because the provider could not refresh' : ''}. Display-only data; it does not determine VAD market outcomes.
        </VadText>
      ) : null}
    </View>
  );
}

function FinancialAssetCard({ item }: { item: FinancialMarketQuote }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const hasChange = item.change24hPercent !== null && Number.isFinite(item.change24hPercent);
  const positive = hasChange && (item.change24hPercent ?? 0) > 0;
  const negative = hasChange && (item.change24hPercent ?? 0) < 0;
  const changeColor = positive ? theme.colors.yes : negative ? theme.colors.no : theme.colors.textSecondary;
  const priceText = item.currentPrice === null
    ? 'Quote unavailable'
    : formatFinancialNumber(item.currentPrice, item.quoteCurrency);
  const changeText = hasChange ? ((item.change24hPercent ?? 0) > 0 ? '+' : '') + (item.change24hPercent ?? 0).toFixed(2) + '%' : null;

  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.sm, padding: density.compact ? theme.spacing.md : theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <FinancialAssetVisual item={item} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <VadText variant="bodyStrong">{item.name}</VadText>
          <VadText variant="caption" tone="secondary">{item.symbol}{item.exchange ? ' · ' + item.exchange : ''}</VadText>
        </View>
        {item.marketOpen !== null ? (
          <VadText variant="caption" tone={item.marketOpen ? 'yes' : 'secondary'}>{item.marketOpen ? 'Market open' : 'Market closed'}</VadText>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <View style={{ gap: 3, flex: 1, minWidth: 130 }}>
          <VadText variant="caption" tone="secondary">{item.assetClass === 'ECONOMICS' ? 'Latest published value' : 'Current / latest price'}</VadText>
          <VadText variant="title" style={{ fontSize: density.phone ? 23 : 27 }}>{priceText}</VadText>
        </View>
        {changeText ? (
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <VadText variant="caption" tone="secondary">Provider-reported change</VadText>
            <VadText variant="bodyStrong" style={{ color: changeColor }}>{changeText}</VadText>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
        {item.high !== null ? <Stat label="High" value={formatFinancialNumber(item.high, item.quoteCurrency)} /> : null}
        {item.low !== null ? <Stat label="Low" value={formatFinancialNumber(item.low, item.quoteCurrency)} /> : null}
        {item.open !== null ? <Stat label="Open" value={formatFinancialNumber(item.open, item.quoteCurrency)} /> : null}
        {item.volume !== null ? <Stat label="Volume" value={Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(item.volume)} /> : null}
      </View>
      <View style={{ gap: 3 }}>
        {item.sourceUrl ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={'Open data source ' + item.source}
            onPress={() => { void Linking.openURL(item.sourceUrl!).catch(() => undefined); }}
            style={({ pressed }) => ({ alignSelf: 'flex-start', opacity: pressed ? 0.7 : 1 })}
          >
            <VadText variant="caption" tone="secondary" style={{ textDecorationLine: 'underline' }}>{item.source} ↗</VadText>
          </Pressable>
        ) : (
          <VadText variant="caption" tone="tertiary">{item.source}</VadText>
        )}
        {item.sourceUpdatedAt ? <VadText variant="caption" tone="tertiary">Source timestamp {new Date(item.sourceUpdatedAt).toLocaleString()}</VadText> : null}
      </View>
    </VadCard>
  );
}

function FinancialAssetVisual({ item }: { item: FinancialMarketQuote }) {
  const theme = useVadTheme();
  const [imageFailed, setImageFailed] = useState(false);
  const [secondaryFailed, setSecondaryFailed] = useState(false);
  const visualStyle = {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  };
  if (item.visualKind === 'flag-pair' && item.imageUrl && item.secondaryImageUrl) {
    return (
      <View style={[visualStyle, { flexDirection: 'row', overflow: 'hidden', gap: 1 }]}>
        {!imageFailed ? (
          <Image source={{ uri: item.imageUrl }} accessibilityLabel="Base currency flag" onError={() => setImageFailed(true)} resizeMode="cover" style={{ width: 22, height: 46 }} />
        ) : <View style={{ width: 22, height: 46, backgroundColor: theme.colors.surfaceRaised }} />}
        {!secondaryFailed ? (
          <Image source={{ uri: item.secondaryImageUrl }} accessibilityLabel="Quote currency flag" onError={() => setSecondaryFailed(true)} resizeMode="cover" style={{ width: 22, height: 46 }} />
        ) : <View style={{ width: 22, height: 46, backgroundColor: theme.colors.surfaceRaised }} />}
      </View>
    );
  }
  if (item.imageUrl && !imageFailed) {
    return (
      <View style={visualStyle}>
        <Image source={{ uri: item.imageUrl }} accessibilityLabel={item.name + ' logo or data visual'} onError={() => setImageFailed(true)} resizeMode={item.visualKind === 'series-chart' ? 'cover' : 'contain'} style={{ width: '100%', height: '100%' }} />
      </View>
    );
  }
  const icon = item.assetClass === 'ECONOMICS' ? 'activity'
    : item.assetClass === 'FOREX' ? 'globe'
      : item.assetClass === 'COMMODITIES' ? 'activity'
        : 'globe';
  return (
    <View style={visualStyle}>
      <VadIcon name={icon} size={20} tone="brand" />
      <VadText variant="caption" tone="brand" numberOfLines={1}>{item.symbol.slice(0, 4).toUpperCase()}</VadText>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 70, gap: 2 }}>
      <VadText variant="caption" tone="secondary">{label}</VadText>
      <VadText variant="caption">{value}</VadText>
    </View>
  );
}

export function formatFinancialNumber(value: number, currency: string) {
  if (currency.toLowerCase() === 'index') return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: /^[A-Z]{3}$/.test(currency.toUpperCase()) ? currency.toUpperCase() : 'USD',
    maximumFractionDigits: Math.abs(value) >= 1000 ? 2 : Math.abs(value) >= 1 ? 4 : 8,
  }).format(value);
}
