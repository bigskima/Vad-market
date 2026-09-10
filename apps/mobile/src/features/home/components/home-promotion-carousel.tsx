import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

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
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (promotions.length <= 1 || width <= 0) return;

    const timer = setInterval(() => {
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
  }, [promotions.length, width]);

  useEffect(() => {
    if (indexRef.current >= promotions.length) {
      indexRef.current = 0;
      directionRef.current = 1;
      setActiveIndex(0);
      scrollRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [promotions.length]);

  if (!promotions.length) return null;

  function onMomentumEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!width) return;
    const next = Math.max(
      0,
      Math.min(
        promotions.length - 1,
        Math.round(event.nativeEvent.contentOffset.x / (width + CARD_GAP)),
      ),
    );
    indexRef.current = next;
    setActiveIndex(next);
    if (next === promotions.length - 1) directionRef.current = -1;
    if (next === 0) directionRef.current = 1;
  }

  const bannerHeight = density.compact ? 88 : density.phone ? 98 : 118;

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ gap: 7 }}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToAlignment="start"
        snapToInterval={width ? width + CARD_GAP : undefined}
        disableIntervalMomentum
        onMomentumScrollEnd={onMomentumEnd}
        contentContainerStyle={{ gap: CARD_GAP }}
      >
        {promotions.map((promotion) => (
          <Pressable
            key={promotion.public_id}
            accessibilityRole="button"
            accessibilityLabel={promotion.title || 'Open VAD promotion'}
            onPress={() => onOpen(promotion.target_path)}
            style={({ pressed }) => ({
              width: width || Math.max(260, density.width - density.horizontalPadding * 2),
              height: bannerHeight,
              overflow: 'hidden',
              borderRadius: density.cardRadius,
              borderWidth: 1,
              borderColor:
                promotion.banner_kind === 'TEXT'
                  ? theme.colors.brandPrimary
                  : theme.colors.border,
              backgroundColor:
                promotion.banner_kind === 'TEXT'
                  ? theme.colors.brandSoft
                  : theme.colors.surfaceRaised,
              opacity: pressed ? 0.84 : 1,
            })}
          >
            {promotion.banner_kind === 'IMAGE' && promotion.image_url ? (
              <Image
                source={{ uri: promotion.image_url }}
                resizeMode="cover"
                style={{ width: '100%', height: '100%' }}
              />
            ) : (
              <View
                style={{
                  flex: 1,
                  justifyContent: 'center',
                  paddingHorizontal: density.cardPadding,
                  paddingVertical: density.compact ? 10 : 12,
                  gap: 3,
                }}
              >
                <VadText variant="caption" tone="brand">
                  VAD HIGHLIGHT
                </VadText>
                <VadText
                  variant="heading"
                  numberOfLines={2}
                  adjustsFontSizeToFit
                >
                  {promotion.title}
                </VadText>
                {promotion.body ? (
                  <VadText variant="caption" tone="secondary" numberOfLines={1}>
                    {promotion.body}
                  </VadText>
                ) : null}
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>

      {promotions.length > 1 ? (
        <View
          accessibilityLabel={`Promotion ${activeIndex + 1} of ${promotions.length}`}
          style={{
            flexDirection: 'row',
            alignSelf: 'center',
            gap: 4,
          }}
        >
          {promotions.map((promotion, index) => (
            <View
              key={`dot-${promotion.public_id}`}
              style={{
                width: index === activeIndex ? 14 : 5,
                height: 5,
                borderRadius: 3,
                backgroundColor:
                  index === activeIndex
                    ? theme.colors.brandPrimary
                    : theme.colors.borderStrong,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
