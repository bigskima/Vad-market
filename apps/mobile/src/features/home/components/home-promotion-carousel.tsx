import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { VadChip } from '@/components/ui/vad-chip';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { HomePromotion } from '@/services/home-content-api';

const AUTO_SCROLL_MS = 4500;
const CARD_GAP = 8;

export function HomePromotionCarousel({
  promotions,
  onOpen,
}: {
  promotions: HomePromotion[];
  onOpen: (targetPath: string) => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const scrollRef = useRef<ScrollView>(null);
  const directionRef = useRef<1 | -1>(1);
  const indexRef = useRef(0);
  const draggingRef = useRef(false);
  const signatureRef = useRef('');
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const signature = promotions.map((promotion) => promotion.public_id).join('|');

  useEffect(() => {
    if (!width) return;
    if (signatureRef.current !== signature) {
      signatureRef.current = signature;
      indexRef.current = 0;
      directionRef.current = 1;
      setActiveIndex(0);
      scrollRef.current?.scrollTo({ x: 0, animated: false });
      return;
    }
    const next = Math.min(indexRef.current, Math.max(0, promotions.length - 1));
    indexRef.current = next;
    scrollRef.current?.scrollTo({ x: next * (width + CARD_GAP), animated: false });
  }, [signature, width, promotions.length]);

  useEffect(() => {
    if (promotions.length <= 1 || width <= 0) return;
    const timer = setInterval(() => {
      if (draggingRef.current) return;
      let next = indexRef.current + directionRef.current;
      if (next >= promotions.length) {
        directionRef.current = -1;
        next = Math.max(0, promotions.length - 2);
      } else if (next < 0) {
        directionRef.current = 1;
        next = Math.min(promotions.length - 1, 1);
      }
      indexRef.current = next;
      setActiveIndex(next);
      scrollRef.current?.scrollTo({
        x: next * (width + CARD_GAP),
        animated: true,
      });
    }, AUTO_SCROLL_MS);
    return () => clearInterval(timer);
  }, [promotions.length, signature, width]);

  if (!promotions.length) return null;

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    draggingRef.current = false;
    const next = Math.max(
      0,
      Math.min(
        promotions.length - 1,
        Math.round(event.nativeEvent.contentOffset.x / (width + CARD_GAP)),
      ),
    );
    const previous = indexRef.current;
    indexRef.current = next;
    setActiveIndex(next);
    if (next > previous) directionRef.current = 1;
    if (next < previous) directionRef.current = -1;
    if (next === promotions.length - 1) directionRef.current = -1;
    if (next === 0) directionRef.current = 1;
  };

  const bannerHeight = density.compact ? 116 : density.phone ? 128 : density.desktop ? 176 : 148;

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ gap: 7 }}>
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
        {promotions.map((promotion) => (
          <Pressable
            key={promotion.public_id}
            accessibilityRole="button"
            accessibilityLabel={promotion.title || 'Open VAD campaign'}
            onPress={() => onOpen(promotion.target_path)}
            style={({ pressed }) => ({
              width: width || Math.max(260, density.width - density.horizontalPadding * 2),
              height: bannerHeight,
              overflow: 'hidden',
              borderRadius: density.phone ? 14 : 18,
              borderWidth: 1,
              borderColor: promotion.banner_kind === 'TEXT' ? theme.colors.brandPrimary : theme.colors.border,
              backgroundColor: promotion.banner_kind === 'TEXT' ? theme.colors.brandSoft : theme.colors.surfaceRaised,
              opacity: pressed ? 0.84 : 1,
            })}
          >
            {promotion.banner_kind === 'IMAGE' && promotion.image_url ? (
              <>
                <Image
                  source={{ uri: promotion.image_url }}
                  resizeMode="cover"
                  accessibilityLabel={promotion.title ? `${promotion.title} campaign artwork` : 'VAD campaign artwork'}
                  style={{ position: 'absolute', width: '100%', height: '100%' }}
                />
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    backgroundColor: 'rgba(5, 9, 28, 0.40)',
                  }}
                />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'flex-start', paddingHorizontal: density.cardPadding, paddingVertical: density.compact ? 8 : 10, paddingRight: density.cardPadding + 18, gap: 5 }}>
                  {promotion.tag ? <VadChip label={promotion.tag} tone="brand" /> : null}
                  {promotion.title ? (
                    <VadText variant="heading" numberOfLines={2} adjustsFontSizeToFit style={{ color: '#FFFFFF', fontSize: density.compact ? 15 : 18, lineHeight: density.compact ? 19 : 22 }}>
                      {promotion.title}
                    </VadText>
                  ) : null}
                  {promotion.body ? (
                    <VadText variant="caption" numberOfLines={2} style={{ color: 'rgba(255,255,255,0.90)', fontSize: density.compact ? 11 : 12, lineHeight: density.compact ? 14 : 16 }}>
                      {promotion.body}
                    </VadText>
                  ) : null}
                  <View style={{ marginTop: 2, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18, backgroundColor: '#FFFFFF' }}>
                    <VadText variant="caption" style={{ color: theme.colors.brandPrimary, fontWeight: '700' }}>Explore ›</VadText>
                  </View>
                </View>
              </>
            ) : (
              <View
                style={{
                  flex: 1,
                  justifyContent: 'center',
                  alignItems: 'flex-start',
                  paddingHorizontal: density.cardPadding,
                  paddingVertical: density.compact ? 8 : 10,
                  paddingRight: density.cardPadding + 18,
                  gap: 5,
                }}
              >
                {promotion.tag ? <VadChip label={promotion.tag} tone="brand" /> : null}
                {promotion.title ? (
                  <VadText
                    variant="heading"
                    style={{ fontSize: density.compact ? 15 : 18, lineHeight: density.compact ? 19 : 22 }}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                  >
                    {promotion.title}
                  </VadText>
                ) : null}
                {promotion.body ? (
                  <VadText
                    variant="caption"
                    tone="secondary"
                    style={{ fontSize: density.compact ? 11 : 12, lineHeight: density.compact ? 14 : 16 }}
                    numberOfLines={2}
                  >
                    {promotion.body}
                  </VadText>
                ) : null}
                <View style={{ marginTop: 2, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18, backgroundColor: theme.colors.background }}>
                  <VadText variant="caption" tone="brand" style={{ fontWeight: '700' }}>Explore markets ›</VadText>
                </View>
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>

      {promotions.length > 1 ? (
        <View
          accessibilityLabel={`Campaign ${activeIndex + 1} of ${promotions.length}`}
          style={{ flexDirection: 'row', alignSelf: 'center', gap: 4 }}
        >
          {promotions.map((promotion, index) => (
            <Pressable
              key={`dot-${promotion.public_id}`}
              accessibilityRole="button"
              accessibilityLabel={`Show campaign ${index + 1}`}
              accessibilityState={{ selected: index === activeIndex }}
              onPress={() => {
                const previous = indexRef.current;
                indexRef.current = index;
                directionRef.current = index >= previous ? 1 : -1;
                if (index === promotions.length - 1) directionRef.current = -1;
                if (index === 0) directionRef.current = 1;
                setActiveIndex(index);
                scrollRef.current?.scrollTo({ x: index * (width + CARD_GAP), animated: true });
              }}
              hitSlop={6}
              style={{
                width: index === activeIndex ? 14 : 5,
                height: 5,
                borderRadius: 3,
                backgroundColor: index === activeIndex ? theme.colors.brandPrimary : theme.colors.borderStrong,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
