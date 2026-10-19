import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { FeaturedMarketRow } from '@/services/home-content-api';
import type { MarketCatalogItem } from '@/services/market-api';
import { probability } from './format';
import { MarketThumbnail } from './components/market-thumbnail';

export function FeaturedMarketsCarousel({
  markets,
  featured,
  onOpenMarket,
}: {
  markets: MarketCatalogItem[];
  featured: FeaturedMarketRow[];
  onOpenMarket: (market: MarketCatalogItem) => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const liveMarkets = featured
    .filter((entry) => entry.instrument_public_id)
    .map((entry) => ({ entry, market: markets.find((item) => item.instrument_public_id === entry.instrument_public_id) }))
    .filter((row): row is { entry: FeaturedMarketRow; market: MarketCatalogItem } => Boolean(row.market))
    .filter(({ market }) => market.status === 'OPEN' && market.resolution_status !== 'RESOLVED')
    .slice(0, 8);

  useEffect(() => {
    if (activeIndex >= liveMarkets.length) setActiveIndex(0);
  }, [activeIndex, liveMarkets.length]);

  if (!liveMarkets.length) return (
    <View style={{ minHeight: 64, justifyContent: 'center', gap: 4, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, paddingHorizontal: 14, paddingVertical: 10 }}>
      <VadText variant="bodyStrong">No featured markets right now</VadText>
      <VadText variant="caption" tone="secondary">Featured markets will appear here when the live ranking service publishes eligible markets.</VadText>
    </View>
  );

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    setActiveIndex(Math.max(0, Math.min(liveMarkets.length - 1, Math.round(event.nativeEvent.contentOffset.x / (width + 8)))));
  };

  return (
    <View style={{ gap: 8 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <VadText variant="bodyStrong" style={{ fontSize: 16 }}>Featured markets</VadText>
        <VadText variant="caption" tone="secondary">Based on live market rankings</VadText>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToAlignment="start"
        snapToInterval={width ? width + 8 : undefined}
        disableIntervalMomentum
        onMomentumScrollEnd={onMomentumEnd}
        contentContainerStyle={{ gap: 8 }}
      >
        {liveMarkets.map(({ entry, market }) => (
          <Pressable
            key={market.instrument_public_id}
            accessibilityRole="button"
            accessibilityLabel={`Featured market: ${market.title}`}
            onPress={() => onOpenMarket(market)}
            style={({ pressed }) => ({
              width: width || Math.max(280, density.width - density.horizontalPadding * 2),
              minHeight: density.compact ? 138 : 158,
              borderRadius: density.phone ? 16 : 19,
              borderWidth: 1,
              borderColor: theme.colors.brandPrimary,
              backgroundColor: theme.colors.surface,
              padding: density.compact ? 12 : 15,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              opacity: pressed ? 0.86 : 1,
              overflow: 'hidden',
            })}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
              <View style={{ alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: theme.colors.brandSoft }}>
                <VadText variant="caption" tone="brand">Featured · #{entry.rank}</VadText>
              </View>
              <VadText variant="bodyStrong" numberOfLines={3} style={{ fontSize: density.compact ? 16 : 18, lineHeight: density.compact ? 21 : 24 }}>{market.title}</VadText>
              <VadText variant="caption" tone="secondary" numberOfLines={2}>{market.category || 'Market'} · {market.asset_code} · {market.status === 'OPEN' ? 'Trading open' : market.status}</VadText>
              <View style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, backgroundColor: theme.colors.brandPrimary }}>
                <VadText variant="caption" style={{ color: '#FFFFFF', fontWeight: '700' }}>Explore market ›</VadText>
              </View>
            </View>
            <View style={{ alignItems: 'center', gap: 7 }}>
              <MarketThumbnail market={market} size={density.compact ? 70 : 84} />
              <View style={{ flexDirection: 'row', gap: 5 }}>
                <View style={{ borderRadius: 9, paddingHorizontal: 7, paddingVertical: 5, backgroundColor: theme.colors.yesSoft }}>
                  <VadText variant="caption" tone="yes">Yes {probability(market.yes_price)}</VadText>
                </View>
                <View style={{ borderRadius: 9, paddingHorizontal: 7, paddingVertical: 5, backgroundColor: theme.colors.noSoft }}>
                  <VadText variant="caption" tone="no">No {probability(market.no_price)}</VadText>
                </View>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      {liveMarkets.length > 1 ? (
        <View accessibilityLabel={`Featured market ${activeIndex + 1} of ${liveMarkets.length}`} style={{ flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
          {liveMarkets.map((item, index) => <View key={item.market.instrument_public_id} style={{ width: index === activeIndex ? 15 : 5, height: 5, borderRadius: 3, backgroundColor: index === activeIndex ? theme.colors.brandPrimary : theme.colors.borderStrong }} />)}
        </View>
      ) : null}
    </View>
  );
}
