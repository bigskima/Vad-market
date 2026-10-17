import { useEffect, useState } from 'react';
import { ImageBackground, Pressable, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { getHomeHeroImage } from '@/services/home-hero-api';

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function HomeHeroBanner({ onExplore }: { onExplore: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageVersion, setImageVersion] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    const refresh = async () => {
      try {
        const result = await getHomeHeroImage();
        if (!mounted) return;
        setImageUrl(result.imageUrl);
        setImageVersion(result.generatedAt);
        setImageFailed(false);
      } catch {
        // Keep bundled artwork visible when generation or connectivity fails.
      }
    };

    void refresh();
    timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  const source = imageUrl && !imageFailed
    ? { uri: `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(imageVersion ?? '')}` }
    : require('../../../../assets/images/vad-welcome-world.jpg');

  return (
    <ImageBackground
      source={source}
      resizeMode="cover"
      onError={() => setImageFailed(true)}
      imageStyle={{ borderRadius: density.phone ? 12 : 14 }}
      style={{
        width: '100%',
        height: density.phone ? 126 : density.desktop ? 170 : 146,
        overflow: 'hidden',
        borderRadius: density.phone ? 12 : 14,
        backgroundColor: theme.colors.brandStrong,
        justifyContent: 'flex-end',
        padding: density.phone ? 10 : 14,
      }}
      accessibilityRole="image"
      accessibilityLabel="VAD global markets hero artwork"
    >
      {/* Generated artwork is background-only. Copy and CTA are native UI overlays. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: 'rgba(10, 8, 50, 0.24)',
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '78%',
          backgroundColor: 'rgba(12, 9, 54, 0.46)',
        }}
      />
      <View style={{ alignItems: 'flex-start', gap: density.phone ? 3 : 4, maxWidth: 520 }}>
        <VadText variant="caption" tone="inverse" style={{ letterSpacing: 0.7, fontWeight: '700', fontSize: 9, lineHeight: 11 }} numberOfLines={1}>
          THE WORLD, IN PROBABILITIES
        </VadText>
        <VadText variant={density.phone ? 'title' : 'heading'} tone="inverse" numberOfLines={2} style={{ fontSize: density.phone ? 16 : 18, lineHeight: density.phone ? 19 : 22, letterSpacing: -0.2, maxWidth: 460 }}>
          Discover what happens next.
        </VadText>
        <VadText variant="caption" tone="inverse" numberOfLines={2} style={{ opacity: 0.9, fontSize: 10, lineHeight: 13, maxWidth: 440 }}>
          Explore real-world outcomes and trade your view.
        </VadText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Explore markets"
          onPress={onExplore}
          style={({ pressed }) => ({
            marginTop: 1,
            minHeight: 26,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            paddingHorizontal: 9,
            borderRadius: 999,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.82)',
            opacity: pressed ? 0.82 : 1,
          })}
        >
          <VadText variant="caption" style={{ color: theme.colors.brandStrong, fontWeight: '700' }}>Explore markets</VadText>
          <VadIcon name="chevronRight" size={12} tone="brand" />
        </Pressable>
      </View>
    </ImageBackground>
  );
}
