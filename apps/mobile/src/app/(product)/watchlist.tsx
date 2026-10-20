import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadText } from '@/components/ui/vad-text';
import { MarketsScreen } from '@/features/markets/markets-screen';
import { ProductRoute } from '@/features/navigation/product-route';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { listUserMarketWatchlist } from '@/services/market-watchlist-api';
import type { MarketCatalogItem } from '@/services/market-api';

export default function WatchlistRoute() {
  const data = useProductDataContext();
  const theme = useVadTheme();
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listUserMarketWatchlist()
      .then((rows) => { if (active) { setIds(rows.map((row) => row.instrument_public_id)); setError(null); } })
      .catch(() => { if (active) setError('Your watchlist could not be loaded. Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const savedMarkets = data.markets.filter((market) => ids.includes(market.instrument_public_id));
  const openMarket = (market: MarketCatalogItem) => router.push({ pathname: '/market/[marketId]', params: { marketId: market.instrument_public_id } });

  return (
    <ProductRoute active="Markets">
      <View style={{ gap: theme.spacing.md }}>
        <VadText variant="heading">Your watchlist</VadText>
        {error ? <VadErrorState title="Watchlist unavailable" message={error} onRetry={() => {
          setLoading(true);
          void listUserMarketWatchlist().then((rows) => { setIds(rows.map((row) => row.instrument_public_id)); setError(null); }).catch(() => setError('Your watchlist could not be loaded. Please try again.')).finally(() => setLoading(false));
        }} /> : loading ? (
          <VadText variant="body" tone="secondary">Loading saved markets…</VadText>
        ) : savedMarkets.length ? (
          <MarketsScreen markets={savedMarkets} onOpenMarket={openMarket} />
        ) : (
          <View style={{ padding: 18, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, gap: 6 }}>
            <VadText variant="bodyStrong">Your watchlist is empty</VadText>
            <VadText variant="caption" tone="secondary">Save markets from Home to find them here.</VadText>
          </View>
        )}
      </View>
    </ProductRoute>
  );
}
