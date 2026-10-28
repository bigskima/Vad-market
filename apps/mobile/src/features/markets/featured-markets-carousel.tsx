import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useLiveNow } from '@/hooks/use-live-now';
import { getMarketTiming } from '@/lib/market-timing';
import { useVadTheme } from '@/providers/theme-provider';
import type { FeaturedMarketRow, VadMarketRow } from '@/services/home-content-api';
import type { MarketCatalogItem } from '@/services/market-api';
import { probability } from './format';
import { MarketThumbnail } from './components/market-thumbnail';

const AUTO_SCROLL_MS = 4500;
const CARD_GAP = 8;

export function FeaturedMarketsCarousel({
  markets,
  featured,
  curated = [],
  category = 'All',
  onOpenMarket,
}: {
  markets: MarketCatalogItem[];
  featured: FeaturedMarketRow[];
  curated?: VadMarketRow[];
  category?: string;
  onOpenMarket: (market: MarketCatalogItem) => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const now = useLiveNow();
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);
  const directionRef = useRef<1 | -1>(-1);
  const draggingRef = useRef(false);
  const signatureRef = useRef('');
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const curatedIds = new Set(curated.map((entry) => entry.instrument_public_id));
  const liveMarkets = [
    ...curated
      .map((entry) => ({ entry, market: markets.find((item) => item.instrument_public_id === entry.instrument_public_id), source: 'curated' as const }))
      .filter((row): row is { entry: VadMarketRow; market: MarketCatalogItem; source: 'curated' } => Boolean(row.market)),
    ...featured
      .filter((entry) => !curatedIds.has(entry.instrument_public_id))
      .map((entry) => ({ entry, market: markets.find((item) => item.instrument_public_id === entry.instrument_public_id), source: 'ranked' as const }))
      .filter((row): row is { entry: FeaturedMarketRow; market: MarketCatalogItem; source: 'ranked' } => Boolean(row.market)),
  ]
    .filter(({ market }) => market.status === 'OPEN' && market.resolution_status !== 'RESOLVED' && getMarketTiming(market, now).tradingOpen)
    .filter(({ market }) => category === 'All' || market.category === category || market.category_code === category)
    .slice(0, 8);

  const marketSignature = liveMarkets.map(({ market }) => market.instrument_public_id).join('|');

  // Start from the last featured card, so this rail initially moves in the
  // opposite visual direction to the Home campaign carousel.
  useEffect(() => {
    if (!width || !liveMarkets.length) return;
    if (signatureRef.current !== marketSignature) {
      signatureRef.current = marketSignature;
      const startIndex = liveMarkets.length > 1 ? liveMarkets.length - 1 : 0;
      indexRef.current = startIndex;
      directionRef.current = -1;
      draggingRef.current = false;
      setActiveIndex(startIndex);
      scrollRef.current?.scrollTo({ x: startIndex * (width + CARD_GAP), animated: false });
      return;
    }
    const next = Math.min(indexRef.current, liveMarkets.length - 1);
    indexRef.current = next;
    scrollRef.current?.scrollTo({ x: next * (width + CARD_GAP), animated: false });
  }, [marketSignature, width, liveMarkets.length]);

  useEffect(() => {
    if (!width || liveMarkets.length <= 1) return;
    const timer = setInterval(() => {
      if (draggingRef.current) return;
      let next = indexRef.current + directionRef.current;
      if (next >= liveMarkets.length) {
        directionRef.current = -1;
        next = Math.max(0, liveMarkets.length - 2);
      } else if (next < 0) {
        directionRef.current = 1;
        next = Math.min(liveMarkets.length - 1, 1);
      }
      indexRef.current = next;
      setActiveIndex(next);
      scrollRef.current?.scrollTo({ x: next * (width + CARD_GAP), animated: true });
    }, AUTO_SCROLL_MS);
    return () => clearInterval(timer);
  }, [marketSignature, width, liveMarkets.length]);

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    draggingRef.current = false;
    const next = Math.max(0, Math.min(
      liveMarkets.length - 1,
      Math.round(event.nativeEvent.contentOffset.x / (width + CARD_GAP)),
    ));
    const previous = indexRef.current;
    indexRef.current = next;
    setActiveIndex(next);
    if (next > previous) directionRef.current = 1;
    if (next < previous) directionRef.current = -1;
    if (next === liveMarkets.length - 1) directionRef.current = -1;
    if (next === 0) directionRef.current = 1;
  };

  if (!liveMarkets.length) return (
    <View style={{ minHeight: 64, justifyContent: 'center', gap: 4, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, paddingHorizontal: 14, paddingVertical: 10 }}>
      <VadText variant="bodyStrong">{category === 'All' ? 'No featured markets' : `No featured ${category.toLowerCase()} markets`}</VadText>
      <VadText variant="caption" tone="secondary">Check back for more highlights.</VadText>
    </View>
  );

  const displayedIndex = Math.min(activeIndex, Math.max(0, liveMarkets.length - 1));

  return (
    <View style={{ gap: 8 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <VadText variant="bodyStrong" style={{ fontSize: 16 }}>Featured markets</VadText>
        
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToAlignment="start"
        snapToInterval={width ? width + CARD_GAP : undefined}
        disableIntervalMomentum
        onScrollBeginDrag={() => { draggingRef.current = true; }}
        onScrollEndDrag={() => { draggingRef.current = false; }}
        onMomentumScrollEnd={onMomentumEnd}
        contentContainerStyle={{ gap: CARD_GAP }}
      >
        {liveMarkets.map(({ market, source }) => (
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
                <VadText variant="caption" tone="brand">{source === 'curated' ? 'Featured' : 'Popular'}</VadText>
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
        <View accessibilityLabel={`Featured market ${displayedIndex + 1} of ${liveMarkets.length}`} style={{ flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
          {liveMarkets.map((item, index) => (
            <Pressable
              key={item.market.instrument_public_id}
              accessibilityRole="button"
              accessibilityLabel={`Show featured market ${index + 1}`}
              accessibilityState={{ selected: index === displayedIndex }}
              onPress={() => {
                const previous = indexRef.current;
                indexRef.current = index;
                directionRef.current = index >= previous ? 1 : -1;
                if (index === liveMarkets.length - 1) directionRef.current = -1;
                if (index === 0) directionRef.current = 1;
                setActiveIndex(index);
                scrollRef.current?.scrollTo({ x: index * (width + CARD_GAP), animated: true });
              }}
              hitSlop={6}
              style={{ width: index === displayedIndex ? 15 : 5, height: 5, borderRadius: 3, backgroundColor: index === displayedIndex ? theme.colors.brandPrimary : theme.colors.borderStrong }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
