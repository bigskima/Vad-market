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
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const query = search.trim();

    const refresh = async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      setError(null);
      try {
        const result = await getCryptoMarketPrices({ page: 1, perPage: 24, query });
        if (!active) return;
        setCoins(result.coins);
        setPage(1);
        setHasMore(result.hasMore);
        setFetchedAt(result.fetchedAt);
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
        perPage: 24,
        query: search.trim(),
      });
      setCoins((current) => {
        const seen = new Set(current.map((coin) => coin.id));
        return [...current, ...result.coins.filter((coin) => !seen.has(coin.id))];
      });
      setPage(nextPage);
      setHasMore(result.hasMore);
      setFetchedAt(result.fetchedAt);
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
        <VadIcon name="chart-no-axes-combined" size={22} tone="brand" />
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
            void getCryptoMarketPrices({ page: 1, perPage: 24, query: search.trim() })
              .then((result) => {
                setCoins(result.coins);
                setPage(1);
                setHasMore(result.hasMore);
                setFetchedAt(result.fetchedAt);
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
              <CryptoCoinCard coin={coin} onPress={onSelectCoin ? () => onSelectCoin(coin) : undefined} />
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
        {fetchedAt ? `Public market-data snapshot · updated ${new Date(fetchedAt).toLocaleTimeString()}. ` : ''}
        Prices and 24-hour changes are display data only. VAD's market odds and final outcomes remain separate.
      </VadText>
    </View>
  );
}

function CryptoCoinCard({
  coin,
  onPress,
}: {
  coin: CryptoMarketQuote;
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
      accessibilityLabel={onPress ? `Show VAD markets related to ${coin.name} (${coin.symbol})` : `${coin.name}, ${formatCoinPrice(coin.currentPrice)}`}
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
            <VadIcon name="coins" size={15} tone="secondary" />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <VadText variant="bodyStrong" numberOfLines={1}>{coin.name}</VadText>
          <VadText variant="caption" tone="secondary">{coin.symbol}{coin.marketCapRank ? ` · #${coin.marketCapRank}` : ''}</VadText>
        </View>
        {onPress ? <VadIcon name="arrow-up-right" size={16} tone="secondary" /> : null}
      </View>

      <View style={{ gap: 2 }}>
        <VadText variant="heading" numberOfLines={1}>{formatCoinPrice(coin.currentPrice)}</VadText>
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

function formatCoinPrice(value: number) {
  const maximumFractionDigits = value >= 100 ? 2 : value >= 1 ? 4 : 8;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: maximumFractionDigits,
  }).format(value);
}
