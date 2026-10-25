import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { MarketThumbnail } from '@/features/markets/components/market-thumbnail';
import { TourTarget } from '@/features/tour/tour-provider';
import { ProductRoute } from '@/features/navigation/product-route';
import { useProductDensity } from '@/hooks/use-product-density';
import { useAuth } from '@/providers/auth-provider';
import { useCurrencyPreference, type VADCurrency } from '@/providers/currency-preference-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { removeMarketFromWatchlist, listUserMarketWatchlist } from '@/services/market-watchlist-api';
import type { MarketCatalogItem } from '@/services/market-api';

export default function WatchlistRoute() {
  const data = useProductDataContext();
  const { session } = useAuth();
  const theme = useVadTheme();
  const density = useProductDensity();
  const { enabledCurrencies } = useCurrencyPreference();
  const userId = session?.user.id ?? null;
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const refreshWatchlist = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listUserMarketWatchlist();
      setIds(rows.map((row) => row.instrument_public_id));
    } catch {
      setError('Your watchlist could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void listUserMarketWatchlist()
      .then((rows) => {
        if (!active) return;
        setIds(rows.map((row) => row.instrument_public_id));
        setError(null);
      })
      .catch(() => {
        if (active) setError('Your watchlist could not be loaded. Please try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const savedMarkets = useMemo(() => ids
    .map((id) => data.markets.find((market) => market.instrument_public_id === id))
    .filter((market): market is MarketCatalogItem => Boolean(market))
    .filter((market) => enabledCurrencies.includes(market.asset_code as VADCurrency)),
  [ids, data.markets, enabledCurrencies]);

  const openMarket = (market: MarketCatalogItem) => {
    router.push({ pathname: '/market/[marketId]', params: { marketId: market.instrument_public_id } });
  };

  const removeSavedMarket = async (instrumentPublicId: string) => {
    if (!userId || removingId) return;
    setRemovingId(instrumentPublicId);
    setRemoveError(null);
    try {
      await removeMarketFromWatchlist(userId, instrumentPublicId);
      setIds((current) => current.filter((id) => id !== instrumentPublicId));
    } catch (reason) {
      setRemoveError(reason instanceof Error ? reason.message : 'This market could not be removed. Please try again.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <ProductRoute active="Markets">
      <TourTarget id="watchlist-list">
      <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
        <View style={{ gap: 3 }}>
          <VadText variant="title">Watchlist</VadText>
          <VadText variant="caption" tone="secondary">Your saved markets, together in one place.</VadText>
        </View>

        {removeError ? (
          <VadCard variant="muted" style={{ padding: 10, gap: 3, borderColor: theme.colors.no }}>
            <VadText variant="caption" tone="no">{removeError}</VadText>
          </VadCard>
        ) : null}

        {error ? (
          <VadErrorState title="Watchlist unavailable" message={error} onRetry={() => void refreshWatchlist()} />
        ) : loading ? (
          <VadText variant="body" tone="secondary">Loading saved markets…</VadText>
        ) : savedMarkets.length ? (
          <View style={{ gap: 8 }}>
            {savedMarkets.map((market) => (
              <View
                key={market.instrument_public_id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  padding: density.phone ? 9 : 11,
                  borderRadius: 15,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${market.title}`}
                  onPress={() => openMarket(market)}
                  style={({ pressed }) => ({
                    flex: 1,
                    minWidth: 0,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <MarketThumbnail market={market} size={density.phone ? 46 : 52} />
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <VadText variant="bodyStrong" numberOfLines={2} style={{ fontSize: density.phone ? 13 : 14, lineHeight: density.phone ? 17 : 19 }}>
                      {market.title}
                    </VadText>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <VadText variant="caption" tone="secondary" numberOfLines={1}>
                        {market.category?.trim() || 'Market'}
                      </VadText>
                      <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: theme.colors.textTertiary }} />
                      <VadText variant="caption" tone={market.market_type === 'MULTI_OUTCOME' ? 'brand' : 'yes'} style={{ fontWeight: '700' }}>
                        {market.market_type === 'MULTI_OUTCOME' ? 'Multiple outcomes' : `YES · ${formatProbability(market.yes_price)}`}
                      </VadText>
                    </View>
                  </View>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${market.title} from watchlist`}
                  accessibilityHint="Removes this market from your saved list"
                  disabled={!userId || removingId !== null}
                  onPress={() => void removeSavedMarket(market.instrument_public_id)}
                  hitSlop={5}
                  style={({ pressed }) => ({
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.surfaceRaised,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    opacity: pressed || removingId !== null ? 0.58 : 1,
                  })}
                >
                  <VadIcon name="close" size={13} tone="secondary" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : ids.length ? (
          <VadCard variant="muted" style={{ padding: 15, gap: 5 }}>
            <VadText variant="bodyStrong">No saved markets in your enabled currencies</VadText>
            <VadText variant="caption" tone="secondary">Your saved markets remain on your account. Change your currency availability or browse markets that are enabled for your account.</VadText>
          </VadCard>
        ) : (
          <VadCard variant="muted" style={{ padding: 16, gap: 6 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 2 }}>
              <VadIcon name="bookmark" size={19} tone="brand" />
            </View>
            <VadText variant="bodyStrong">Your watchlist is empty</VadText>
            <VadText variant="caption" tone="secondary">Bookmark a market to keep it close and follow its price moves here.</VadText>
          </VadCard>
        )}
      </View>
      </TourTarget>
    </ProductRoute>
  );
}

function formatProbability(value: number | string | null | undefined) {
  const probability = Number(value);
  return Number.isFinite(probability) ? `${(probability * 100).toFixed(1)}%` : '—';
}
