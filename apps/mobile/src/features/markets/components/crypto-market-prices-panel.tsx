import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, useWindowDimensions, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getCryptoMarketPrices,
  type CryptoMarketQuote,
} from '@/services/crypto-market-data-api';

export function CryptoMarketPricesPanel({
  search,
  onSelectCoin,
}: {
  search: string;
  onSelectCoin?: (coin: CryptoMarketQuote) => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const { width } = useWindowDimensions();
  const columns = width >= 1080 ? 3 : width >= 650 ? 2 : 1;
  const [coins, setCoins] = useState<CryptoMarketQuote[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [staleSnapshot, setStaleSnapshot] = useState(false);
  const [quoteCurrency, setQuoteCurrency] = useState('USD');

  useEffect(() => {
    let active = true;
    const query = search.trim();

    const refresh = async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      setError(null);
      try {
        const result = await getCryptoMarketPrices({ page: 1, query });
        if (!active) return;
        setCoins(result.coins);
        setQuoteCurrency(result.quoteCurrency);
        setPage(1);
        setPageSize(result.perPage);
        setHasMore(result.hasMore);
        setFetchedAt(result.fetchedAt);
        setStaleSnapshot(result.stale === true);
        setError(null);
      } catch (reason) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'Crypto market prices are temporarily unavailable.');
      } finally {
        if (active) setLoading(false);
      }
    };

    const initial = setTimeout(() => void refresh(true), 0);
    const refreshInterval = setInterval(() => void refresh(false), 60_000);
    return () => {
      active = false;
      clearTimeout(initial);
      clearInterval(refreshInterval);
    };
  }, [search]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const nextPage = page + 1;
      const result = await getCryptoMarketPrices({
        page: nextPage,
        perPage: pageSize,
        query: search.trim(),
      });
      setQuoteCurrency(result.quoteCurrency);
      setCoins((current) => {
        const seen = new Set(current.map((coin) => coin.id));
        return [...current, ...result.coins.filter((coin) => !seen.has(coin.id))];
      });
      setPage(nextPage);
      setPageSize(result.perPage);
      setHasMore(result.hasMore);
      setFetchedAt(result.fetchedAt);
      setStaleSnapshot(result.stale === true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'More crypto prices could not be loaded.');
    } finally {
      setLoadingMore(false);
    }
  }

  const gridStyle = useMemo(() => ({
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing.sm,
  }), [theme.spacing.sm]);

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <VadText variant="label" tone="brand">CRYPTO MARKET DATA</VadText>
          <VadText variant="heading" style={{ fontSize: density.phone ? 18 : 21 }}>
            {search.trim() ? 'Matching crypto assets' : 'Crypto prices'}
          </VadText>
          <VadText variant="caption" tone="secondary">
            Browse assets returned by the configured public API—not a fixed Bitcoin/Ethereum list.
          </VadText>
        </View>
        <VadIcon name="markets" size={22} tone="brand" />
      </View>

      {loading && !coins.length ? (
        <View style={gridStyle}>
          {[0, 1, 2].slice(0, columns).map((item) => (
            <View key={item} style={{ width: columns === 1 ? '100%' : '48%', gap: 6 }}>
              <VadSkeleton height={108} radius={theme.radius.lg} />
            </View>
          ))}
        </View>
      ) : error && !coins.length ? (
        <VadErrorState
          title="Crypto prices unavailable"
          message={error}
          onRetry={() => {
            setLoading(true);
            void getCryptoMarketPrices({ page: 1, query: search.trim() })
              .then((result) => {
                setCoins(result.coins);
                setQuoteCurrency(result.quoteCurrency);
                setPage(1);
                setPageSize(result.perPage);
                setHasMore(result.hasMore);
                setFetchedAt(result.fetchedAt);
                setStaleSnapshot(result.stale === true);
                setError(null);
              })
              .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Crypto market prices are unavailable.'))
              .finally(() => setLoading(false));
          }}
        />
      ) : coins.length ? (
        <View style={gridStyle}>
          {coins.map((coin) => (
            <View key={coin.id} style={{ width: columns === 1 ? '100%' : '48%', flexGrow: columns === 1 ? 0 : 1, minWidth: 0 }}>
              <CryptoCoinCard coin={coin} currency={quoteCurrency} onPress={onSelectCoin ? () => onSelectCoin(coin) : undefined} />
            </View>
          ))}
        </View>
      ) : (
        <VadEmptyState
          title="No crypto assets matched"
          body="Try another coin name or symbol. Search results come from the configured public market-data API."
        />
      )}

      {error && coins.length ? (
        <VadText variant="caption" tone="warning">{error}</VadText>
      ) : null}

      {hasMore ? (
        <VadButton
          label={loadingMore ? 'Loading more assets…' : 'Load more crypto assets'}
          variant="secondary"
          size="small"
          loading={loadingMore}
          disabled={loadingMore}
          onPress={() => void loadMore()}
        />
      ) : null}

      <VadText variant="caption" tone="tertiary">
        {fetchedAt ? `Public market-data snapshot · updated ${new Date(fetchedAt).toLocaleTimeString()}${staleSnapshot ? ' · STALE CACHED DATA — public source temporarily unavailable' : ''}. ` : ''}
        Prices and 24-hour changes are display data only. VAD's market odds and final outcomes remain separate.
      </VadText>
    </View>
  );
}

function CryptoCoinCard({
  coin,
  currency = 'USD',
  onPress,
}: {
  coin: CryptoMarketQuote;
  currency?: string;
  onPress?: () => void;
}) {
  const theme = useVadTheme();
  const [chartWidth, setChartWidth] = useState(92);
  const sparkline = coin.sparkline7d.filter((price) => Number.isFinite(price)).slice(-28);
  const minimum = sparkline.length ? Math.min(...sparkline) : 0;
  const maximum = sparkline.length ? Math.max(...sparkline) : 1;
  const range = maximum - minimum || 1;
  const points = sparkline.map((price, index) => ({
    x: 2 + (index / Math.max(1, sparkline.length - 1)) * Math.max(1, chartWidth - 4),
    y: 24 - ((price - minimum) / range) * 19,
  }));
  const positive = coin.change24hPercent == null || coin.change24hPercent === 0
    ? null
    : coin.change24hPercent > 0;
  const lineColor = positive === null ? theme.colors.textTertiary : positive ? theme.colors.yes : theme.colors.no;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `Show VAD markets related to ${coin.name} (${coin.symbol})` : `${coin.name}, ${formatCoinPrice(coin.currentPrice, currency)}`}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.78 : 1,
        minHeight: 130,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.md,
        gap: 9,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {coin.imageUrl ? (
          <Image source={{ uri: coin.imageUrl }} accessibilityLabel="" style={{ width: 28, height: 28, borderRadius: 14 }} />
        ) : (
          <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: theme.colors.surfaceMuted }}>
            <VadIcon name="activity" size={15} tone="secondary" />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <VadText variant="bodyStrong" numberOfLines={1}>{coin.name}</VadText>
          <VadText variant="caption" tone="secondary">{coin.symbol}{coin.marketCapRank ? ` · #${coin.marketCapRank}` : ''}</VadText>
        </View>
        {onPress ? <VadIcon name="chevronRight" size={16} tone="secondary" /> : null}
      </View>

      <View style={{ gap: 2 }}>
        <VadText variant="heading" numberOfLines={1}>{formatCoinPrice(coin.currentPrice, currency)}</VadText>
        <VadText variant="caption" tone={positive === null ? 'secondary' : positive ? 'yes' : 'no'}>
          {coin.change24hPercent == null ? '24h change unavailable' : `${coin.change24hPercent > 0 ? '+' : ''}${coin.change24hPercent.toFixed(2)}% · 24h`}
        </VadText>
      </View>

      {points.length > 1 ? (
        <View
          accessibilityLabel={`Seven-day ${coin.name} price trend`}
          onLayout={(event) => setChartWidth(Math.max(32, event.nativeEvent.layout.width))}
          style={{ height: 28, width: '100%', overflow: 'hidden' }}
        >
          {points.slice(0, -1).map((point, index) => {
            const next = points[index + 1];
            const dx = next.x - point.x;
            const dy = next.y - point.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            return (
              <View
                key={index}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: (point.x + next.x) / 2 - length / 2,
                  top: (point.y + next.y) / 2,
                  width: length,
                  height: 1.7,
                  borderRadius: 1,
                  backgroundColor: lineColor,
                  transform: [{ rotate: `${angle}deg` }],
                }}
              />
            );
          })}
        </View>
      ) : null}
    </Pressable>
  );
}

function formatCoinPrice(value: number, currency = 'USD') {
  const maximumFractionDigits = value >= 100 ? 2 : value >= 1 ? 4 : 8;
  const currencyCode = /^[A-Z]{3,8}$/.test(currency.toUpperCase()) ? currency.toUpperCase() : 'USD';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits,
    }).format(value);
  } catch {
    return `${value.toLocaleString('en-US', { maximumFractionDigits })} ${currencyCode}`;
  }
}

export function CryptoMarketSpotSummary({ assetQuery }: { assetQuery: string }) {
  const theme = useVadTheme();
  const [coin, setCoin] = useState<CryptoMarketQuote | null>(null);
  const [quoteCurrency, setQuoteCurrency] = useState('USD');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [staleSnapshot, setStaleSnapshot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sparklineWidth, setSparklineWidth] = useState(180);
  const sparkline = coin?.sparkline7d ?? [];
  const minPrice = sparkline.length ? Math.min(...sparkline) : 0;
  const maxPrice = sparkline.length ? Math.max(...sparkline) : 1;
  const priceRange = maxPrice - minPrice || 1;
  const points = sparkline.map((price, index) => ({
    x: 2 + (index / Math.max(1, sparkline.length - 1)) * Math.max(1, sparklineWidth - 4),
    y: 34 - ((price - minPrice) / priceRange) * 29,
  }));

  useEffect(() => {
    const query = assetQuery.trim();
    if (!query) {
      setCoin(null);
      setLoading(false);
      return;
    }
    let active = true;
    const refresh = async () => {
      try {
        const result = await getCryptoMarketPrices({ query, page: 1, perPage: 10 });
        if (!active) return;
        const needle = normalizeAssetQuery(query);
        const exact = result.coins.find((item) =>
          normalizeAssetQuery(item.symbol) === needle
          || normalizeAssetQuery(item.id) === needle
          || normalizeAssetQuery(item.name) === needle
        );
        setCoin(exact ?? null);
        setQuoteCurrency(result.quoteCurrency);
        setUpdatedAt(result.fetchedAt);
        setStaleSnapshot(result.stale === true);
        setError(exact ? null : `No exact public price match was returned for ${query}.`);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Public crypto price is temporarily unavailable.');
      } finally {
        if (active) setLoading(false);
      }
    };
    setLoading(true);
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    return () => { active = false; clearInterval(timer); };
  }, [assetQuery]);

  if (!assetQuery.trim()) return null;

  return (
    <VadCard variant="surface" style={{ gap: theme.spacing.sm }}>
      <View style={{ gap: 2 }}>
        <VadText variant="label" tone="brand">UNDERLYING CRYPTO ASSET</VadText>
        <VadText variant="caption" tone="secondary">
          Public spot-market reference. This is separate from VAD's YES/NO price and never determines the outcome.
        </VadText>
      </View>
      {loading && !coin ? (
        <VadSkeleton height={70} radius={theme.radius.md} />
      ) : coin ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          {coin.imageUrl ? <Image source={{ uri: coin.imageUrl }} accessibilityLabel="" style={{ width: 38, height: 38, borderRadius: 19 }} /> : null}
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <VadText variant="bodyStrong">{coin.name} ({coin.symbol})</VadText>
            <VadText variant="title">{formatCoinPrice(coin.currentPrice, quoteCurrency)}</VadText>
            <VadText variant="caption" tone={coin.change24hPercent == null ? 'secondary' : coin.change24hPercent >= 0 ? 'yes' : 'no'}>
              {coin.change24hPercent == null ? '24h change unavailable' : `${coin.change24hPercent > 0 ? '+' : ''}${coin.change24hPercent.toFixed(2)}% · 24h`}
            </VadText>
          </View>
          {coin.marketCapRank ? (
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <VadText variant="caption" tone="secondary">Market cap rank</VadText>
              <VadText variant="bodyStrong">#{coin.marketCapRank}</VadText>
            </View>
          ) : null}
        </View>
      ) : (
        <VadText variant="caption" tone={error ? 'warning' : 'secondary'}>{error ?? 'No public price available for this asset.'}</VadText>
      )}
      {coin && points.length > 1 ? (
        <View
          accessibilityLabel={`Seven-day ${coin.name} public spot price trend`}
          onLayout={(event) => setSparklineWidth(Math.max(80, event.nativeEvent.layout.width))}
          style={{ height: 38, width: '100%', overflow: 'hidden' }}
        >
          {points.slice(0, -1).map((point, index) => {
            const next = points[index + 1];
            const dx = next.x - point.x;
            const dy = next.y - point.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const lineColor = coin.change24hPercent == null
              ? theme.colors.textTertiary
              : coin.change24hPercent >= 0 ? theme.colors.yes : theme.colors.no;
            return (
              <View
                key={index}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: (point.x + next.x) / 2 - length / 2,
                  top: (point.y + next.y) / 2,
                  width: length,
                  height: 1.7,
                  borderRadius: 1,
                  backgroundColor: lineColor,
                  transform: [{ rotate: `${angle}deg` }],
                }}
              />
            );
          })}
        </View>
      ) : null}
      {coin && updatedAt ? <VadText variant="caption" tone={staleSnapshot ? 'warning' : 'tertiary'}>{staleSnapshot ? 'Stale cached snapshot' : 'Source snapshot'}: {new Date(updatedAt).toLocaleTimeString()} · CoinGecko</VadText> : null}
    </VadCard>
  );
}

function normalizeAssetQuery(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
