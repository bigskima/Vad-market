import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, useWindowDimensions, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { userFacingErrorMessage } from '@/lib/user-facing-error';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getCryptoMarketPrices,
  type CryptoMarketQuote,
} from '@/services/crypto-market-data-api';

export function CryptoMarketPricesPanel({
  search,
  onSelectCoin,
  showHeader = true,
}: {
  search: string;
  onSelectCoin?: (coin: CryptoMarketQuote) => void;
  showHeader?: boolean;
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
    let refreshInFlight = false;

    const refresh = async (showLoading: boolean) => {
      if (refreshInFlight) return;
      refreshInFlight = true;
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
        setError(userFacingErrorMessage(reason, 'general', 'Crypto prices are unavailable. Try again.'));
      } finally {
        if (active) setLoading(false);
        refreshInFlight = false;
      }
    };

    const initial = setTimeout(() => void refresh(true), 0);
    // Poll at the backend's 15-second crypto quote cache interval while mounted.
    const refreshInterval = setInterval(() => void refresh(false), 15_000);
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
      setError(userFacingErrorMessage(reason, 'general', 'Could not load more crypto prices. Try again.'));
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
      {showHeader ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <VadText variant="label" tone="brand">CRYPTO MARKET DATA</VadText>
            <VadText variant="heading" style={{ fontSize: density.phone ? 18 : 21 }}>
              {search.trim() ? 'Matching crypto assets' : 'Crypto prices'}
            </VadText>
            <VadText variant="caption" tone="secondary">
              Browse crypto assets.
            </VadText>
          </View>
          <VadIcon name="markets" size={22} tone="brand" />
        </View>
      ) : null}

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
          title="Can't load crypto prices"
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
              .catch((reason: unknown) => setError(userFacingErrorMessage(reason, 'general', 'Crypto prices are unavailable. Try again.')))
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
          body="Try another coin or symbol."
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
        {fetchedAt ? `Updated ${new Date(fetchedAt).toLocaleTimeString()}${staleSnapshot ? ' · Cached' : ''}. ` : ''}Public prices are references, not VAD market odds.
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
  const [resolvedQuery, setResolvedQuery] = useState('');
  const [quoteCurrency, setQuoteCurrency] = useState('USD');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [staleSnapshot, setStaleSnapshot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sparklineWidth, setSparklineWidth] = useState(180);
  const normalizedQuery = normalizeAssetQuery(assetQuery);
  const displayedCoin = resolvedQuery === normalizedQuery ? coin : null;
  const sparkline = displayedCoin?.sparkline7d ?? [];
  const minPrice = sparkline.length ? Math.min(...sparkline) : 0;
  const maxPrice = sparkline.length ? Math.max(...sparkline) : 1;
  const priceRange = maxPrice - minPrice || 1;
  const points = sparkline.map((price, index) => ({
    x: 2 + (index / Math.max(1, sparkline.length - 1)) * Math.max(1, sparklineWidth - 4),
    y: 34 - ((price - minPrice) / priceRange) * 29,
  }));

  useEffect(() => {
    const query = assetQuery.trim();
    if (!query) return;
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
        setResolvedQuery(needle);
        setQuoteCurrency(result.quoteCurrency);
        setUpdatedAt(result.fetchedAt);
        setStaleSnapshot(result.stale === true);
        setError(exact ? null : `No exact public price match was returned for ${query}.`);
      } catch (reason) {
        if (active) {
          setCoin(null);
          setResolvedQuery(normalizeAssetQuery(query));
          setError(userFacingErrorMessage(reason, 'general', 'Public crypto price is unavailable. Try again.'));
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [assetQuery]);

  if (!assetQuery.trim()) return null;

  return (
    <VadCard variant="surface" style={{ gap: theme.spacing.sm }}>
      <View style={{ gap: 2 }}>
        <VadText variant="label" tone="brand">UNDERLYING CRYPTO ASSET</VadText>
        <VadText variant="caption" tone="secondary">
          Public reference price · separate from market odds.
        </VadText>
      </View>
      {(loading || resolvedQuery !== normalizedQuery) && !displayedCoin ? (
        <VadSkeleton height={70} radius={theme.radius.md} />
      ) : displayedCoin ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          {displayedCoin.imageUrl ? <Image source={{ uri: displayedCoin.imageUrl }} accessibilityLabel="" style={{ width: 38, height: 38, borderRadius: 19 }} /> : null}
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <VadText variant="bodyStrong">{displayedCoin.name} ({displayedCoin.symbol})</VadText>
            <VadText variant="title">{formatCoinPrice(displayedCoin.currentPrice, quoteCurrency)}</VadText>
            <VadText variant="caption" tone={displayedCoin.change24hPercent == null ? 'secondary' : displayedCoin.change24hPercent >= 0 ? 'yes' : 'no'}>
              {displayedCoin.change24hPercent == null ? '24h change unavailable' : `${displayedCoin.change24hPercent > 0 ? '+' : ''}${displayedCoin.change24hPercent.toFixed(2)}% · 24h`}
            </VadText>
          </View>
          {displayedCoin.marketCapRank ? (
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <VadText variant="caption" tone="secondary">Market cap rank</VadText>
              <VadText variant="bodyStrong">#{displayedCoin.marketCapRank}</VadText>
            </View>
          ) : null}
        </View>
      ) : (
        <VadText variant="caption" tone={error ? 'warning' : 'secondary'}>{error ? 'Price unavailable. Try again.' : 'No public price available for this asset.'}</VadText>
      )}
      {displayedCoin && points.length > 1 ? (
        <View
          accessibilityLabel={`Seven-day ${displayedCoin.name} public spot price trend`}
          onLayout={(event) => setSparklineWidth(Math.max(80, event.nativeEvent.layout.width))}
          style={{ height: 38, width: '100%', overflow: 'hidden' }}
        >
          {points.slice(0, -1).map((point, index) => {
            const next = points[index + 1];
            const dx = next.x - point.x;
            const dy = next.y - point.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const lineColor = displayedCoin.change24hPercent == null
              ? theme.colors.textTertiary
              : displayedCoin.change24hPercent >= 0 ? theme.colors.yes : theme.colors.no;
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
      {displayedCoin && updatedAt ? <VadText variant="caption" tone={staleSnapshot ? 'warning' : 'tertiary'}>{staleSnapshot ? 'Last update may be old' : 'Reference price · updates every 30 seconds'}: {new Date(updatedAt).toLocaleTimeString()} · CoinGecko</VadText> : null}
    </VadCard>
  );
}

function normalizeAssetQuery(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
