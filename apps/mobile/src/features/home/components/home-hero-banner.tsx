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

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    const refresh = async () => {
      try {
        const result = await getHomeHeroImage();
        if (!mounted) return;
        setImageUrl(result.imageUrl);
        setImageVersion(result.generatedAt);
      } catch {
        // Keep the bundled artwork visible if AI generation or connectivity
        // is temporarily unavailable. The next refresh retries the same cache.
      }
    };

    void refresh();
    timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);

    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  const source = imageUrl
    ? { uri: `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(imageVersion ?? '')}` }
    : require('../../../../assets/images/vad-welcome-world.jpg');

  return (
    <ImageBackground
      source={source}
      resizeMode="cover"
      imageStyle={{ borderRadius: density.phone ? 22 : 28 }}
      style={{
        width: '100%',
        height: density.phone ? 190 : density.desktop ? 270 : 224,
        overflow: 'hidden',
        borderRadius: density.phone ? 22 : 28,
        backgroundColor: theme.colors.brandStrong,
        justifyContent: 'flex-end',
        alignItems: 'flex-start',
        padding: density.phone ? theme.spacing.md : theme.spacing.xl,
      }}
      accessibilityRole="image"
      accessibilityLabel="VAD global markets hero artwork"
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: density.phone ? 82 : 104,
          backgroundColor: 'rgba(20, 15, 85, 0.20)',
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Explore markets"
        onPress={onExplore}
        style={({ pressed }) => ({
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: 18,
          borderRadius: 999,
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.82)',
          opacity: pressed ? 0.82 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        <VadText variant="label" style={{ color: theme.colors.brandStrong }}>Explore markets</VadText>
        <VadIcon name="chevronRight" size={16} tone="brand" />
      </Pressable>
    </ImageBackground>
  );
}
