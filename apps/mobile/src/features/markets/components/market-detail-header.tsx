import { useState } from 'react';
import { Image, Pressable, View, useWindowDimensions } from 'react-native';

import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { marketMediaUrl } from '@/services/market-api';

export function MarketDetailHeader({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const { width } = useWindowDimensions();
  const compactViewport = density.phone || width <= 600;
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [titleState, setTitleState] = useState({ instrumentId: market.instrument_public_id, expanded: false });
  const isPool = market.liquidity_mode === 'POOL' || String(market.liquidity_mode ?? '').toUpperCase().includes('POOL');
  const imageUrl = marketMediaUrl(market.media_path);
  const imageFailed = Boolean(imageUrl && failedImageUrl === imageUrl);
  const titleExpanded = titleState.instrumentId === market.instrument_public_id && titleState.expanded;
  const titleIsLong = market.title.trim().length > 80;
  const imageAspectRatio = compactViewport ? 16 / 9 : 16 / 7;

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

      <VadText variant="caption" tone="secondary" numberOfLines={1}>
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
            fontSize: compactViewport ? (width <= 380 || density.narrow ? 19 : 21) : 25,
            lineHeight: compactViewport ? (width <= 380 || density.narrow ? 24 : 27) : 31,
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
    </View>
  );
}

function friendlyEnum(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
