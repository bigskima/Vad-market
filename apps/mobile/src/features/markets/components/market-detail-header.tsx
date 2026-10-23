import { useEffect, useState } from 'react';
import { Image, Pressable, View, useWindowDimensions } from 'react-native';

import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { marketMediaUrl } from '@/services/market-api';
import { supabase } from '@/lib/supabase';
import { listUserMarketWatchlist, removeMarketFromWatchlist, saveMarketToWatchlist } from '@/services/market-watchlist-api';

export function MarketDetailHeader({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const { width } = useWindowDimensions();
  const compactViewport = density.phone || width <= 600;
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [imageRatioState, setImageRatioState] = useState<{ url: string; ratio: number } | null>(null);
  const [titleState, setTitleState] = useState({ instrumentId: market.instrument_public_id, expanded: false });
  const [watchlistUserId, setWatchlistUserId] = useState<string | null>(null);
  const [watchlistSaved, setWatchlistSaved] = useState(false);
  const [watchlistBusy, setWatchlistBusy] = useState(false);
  const [watchlistMessage, setWatchlistMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setWatchlistSaved(false);
    setWatchlistMessage(null);
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!data.user) {
          if (active) setWatchlistUserId(null);
          return;
        }
        const rows = await listUserMarketWatchlist();
        if (!active) return;
        setWatchlistUserId(data.user.id);
        setWatchlistSaved(rows.some((row) => row.instrument_public_id === market.instrument_public_id));
      } catch {
        if (active) setWatchlistMessage('Watchlist status could not be loaded. You can still try saving this market.');
      }
    })();
    return () => { active = false; };
  }, [market.instrument_public_id]);

  const toggleWatchlist = async () => {
    if (watchlistBusy) return;
    if (!watchlistUserId) {
      setWatchlistMessage('Sign in to save markets to your watchlist.');
      return;
    }
    setWatchlistBusy(true);
    setWatchlistMessage(null);
    try {
      if (watchlistSaved) await removeMarketFromWatchlist(watchlistUserId, market.instrument_public_id);
      else await saveMarketToWatchlist(watchlistUserId, market.instrument_public_id);
      setWatchlistSaved(!watchlistSaved);
      setWatchlistMessage(watchlistSaved ? 'Removed from your watchlist.' : 'Added to your watchlist.');
    } catch (reason) {
      setWatchlistMessage(reason instanceof Error ? reason.message : 'This market could not be saved to your watchlist.');
    } finally {
      setWatchlistBusy(false);
    }
  };
  const isPool = market.liquidity_mode === 'POOL' || String(market.liquidity_mode ?? '').toUpperCase().includes('POOL');
  const imageUrl = marketMediaUrl(market.media_path);
  const imageFailed = Boolean(imageUrl && failedImageUrl === imageUrl);
  const titleExpanded = titleState.instrumentId === market.instrument_public_id && titleState.expanded;
  const titleIsLong = market.title.trim().length > 80;
  const fallbackImageAspectRatio = compactViewport ? 16 / 9 : 16 / 7;
  const imageAspectRatio = imageRatioState?.url === imageUrl
    ? imageRatioState.ratio
    : fallbackImageAspectRatio;

  return (
    <View style={{ gap: density.compact || compactViewport ? 7 : 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <VadChip
          label={friendlyEnum(market.status ?? 'MARKET')}
          tone={String(market.status ?? '').toUpperCase() === 'OPEN' ? 'yes' : 'neutral'}
        />
        <VadChip label={market.asset_code} tone="brand" />
        <VadChip
          label={isPool ? 'Peer pool' : friendlyEnum(market.liquidity_mode ?? 'ORDER_BOOK')}
          tone="neutral"
        />
      </View>

      <VadText variant="caption" tone="secondary" numberOfLines={2} style={{ fontSize: 13, lineHeight: 18 }}>
        {market.category ?? 'General'} · {market.market_type === 'BINARY' ? 'Yes / No market' : friendlyEnum(market.market_type)}
      </VadText>

      <View
        style={{
          width: '100%',
          aspectRatio: imageAspectRatio,
          borderRadius: compactViewport ? 16 : 24,
          overflow: 'hidden',
          backgroundColor: theme.colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {imageUrl && !imageFailed ? (
          <>
            <Image
              source={{ uri: imageUrl }}
              accessibilityLabel=""
              blurRadius={18}
              resizeMode="cover"
              onError={() => setFailedImageUrl(imageUrl)}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                opacity: 0.66,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                backgroundColor: 'rgba(5, 10, 22, 0.34)',
              }}
            />
            <Image
              source={{ uri: imageUrl }}
              accessibilityLabel={`${market.title} market image`}
              resizeMode="contain"
              onLoad={(event) => {
                const sourceWidth = event.nativeEvent.source?.width;
                const sourceHeight = event.nativeEvent.source?.height;
                if (sourceWidth && sourceHeight && Number.isFinite(sourceWidth) && Number.isFinite(sourceHeight)) {
                  const sourceRatio = sourceWidth / sourceHeight;
                  if (sourceRatio > 0) {
                    setImageRatioState({ url: imageUrl, ratio: Math.max(1.1, Math.min(2.4, sourceRatio)) });
                  }
                }
              }}
              onError={() => setFailedImageUrl(imageUrl)}
              style={{ width: '100%', height: '100%' }}
            />
          </>
        ) : (
          <View style={{ alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 }}>
            <VadIcon name="markets" size={30} tone="brand" />
            <VadText variant="caption" tone="secondary">
              {imageFailed ? 'Market artwork is temporarily unavailable' : 'Market overview'}
            </VadText>
          </View>
        )}
      </View>

      <View style={{ gap: 5, paddingTop: compactViewport ? 0 : 2 }}>
        <VadText
          variant={compactViewport ? 'heading' : 'title'}
          numberOfLines={titleExpanded ? undefined : 3}
          style={{
            fontSize: compactViewport ? (width <= 380 || density.narrow ? 21 : 22) : 27,
            lineHeight: compactViewport ? (width <= 380 || density.narrow ? 27 : 29) : 34,
            paddingRight: compactViewport ? 44 : 0,
            letterSpacing: -0.35,
            flexShrink: 1,
          }}
        >
          {market.title}
        </VadText>
        {titleIsLong ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={titleExpanded ? 'Show less of the market question' : 'Read the full market question'}
            onPress={() => setTitleState({ instrumentId: market.instrument_public_id, expanded: !titleExpanded })}
            style={({ pressed }) => ({ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2, opacity: pressed ? 0.72 : 1 })}
          >
            <VadText variant="caption" tone="brand">{titleExpanded ? 'Show less' : 'Read full question'}</VadText>
            <View style={{ transform: [{ rotate: titleExpanded ? '-90deg' : '90deg' }] }}>
              <VadIcon name="chevronRight" size={13} tone="brand" />
            </View>
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingTop: 2 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={watchlistSaved ? 'Remove this market from your watchlist' : 'Add this market to your watchlist'}
          accessibilityState={{ selected: watchlistSaved, disabled: watchlistBusy }}
          disabled={watchlistBusy}
          onPress={() => void toggleWatchlist()}
          style={({ pressed }) => ({
            minHeight: 36,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            borderWidth: 1,
            borderColor: watchlistSaved ? theme.colors.brandPrimary : theme.colors.border,
            borderRadius: theme.radius.pill,
            paddingHorizontal: 13,
            backgroundColor: watchlistSaved ? theme.colors.brandSoft : theme.colors.surface,
            opacity: watchlistBusy ? 0.55 : pressed ? 0.72 : 1,
          })}
        >
          <VadIcon name="bookmark" size={16} tone={watchlistSaved ? 'brand' : 'secondary'} />
          <VadText variant="caption" tone={watchlistSaved ? 'brand' : 'secondary'}>
            {watchlistBusy ? 'Saving…' : watchlistSaved ? 'Saved to watchlist' : 'Add to watchlist'}
          </VadText>
        </Pressable>
        {watchlistMessage ? <VadText variant="caption" tone="secondary">{watchlistMessage}</VadText> : null}
      </View>
    </View>
  );
}

function friendlyEnum(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
