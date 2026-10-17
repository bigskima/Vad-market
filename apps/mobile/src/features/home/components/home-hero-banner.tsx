import { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { supabase, supabaseConfiguration } from '@/lib/supabase';

export function HomeHeroBanner({ onExplore }: { onExplore: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!supabaseConfiguration.ready) return;
    void supabase.functions.invoke('home-hero-image-runtime', { body: {} }).then(({ data, error }) => {
      if (!cancelled && !error && typeof data?.imageUrl === 'string') setHeroImageUrl(data.imageUrl);
    }).catch(() => { /* Keep the designed gradient fallback if AI artwork is unavailable. */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <View
      accessibilityLabel="Discover VAD markets"
      style={{
        width: '100%',
        minHeight: density.phone ? 154 : density.desktop ? 176 : 164,
        overflow: 'hidden',
        borderRadius: density.phone ? 22 : 26,
        borderWidth: 1,
        borderColor: theme.colors.brandPrimary,
        backgroundColor: theme.colors.brandStrong,
        justifyContent: 'flex-end',
        alignItems: 'flex-start',
        paddingHorizontal: density.phone ? 19 : 24,
        paddingVertical: density.phone ? 19 : 23,
        gap: 12,
      }}
    >
      {heroImageUrl ? (
        <Image
          source={{ uri: heroImageUrl }}
          resizeMode="cover"
          accessibilityLabel="AI-generated VAD discovery artwork"
          style={{ position: 'absolute', width: '100%', height: '100%', left: 0, top: 0, opacity: 0.72 }}
        />
      ) : null}
      <View style={{ gap: 3, maxWidth: 540 }}>
        <VadText
          variant={density.phone ? 'title' : 'heading'}
          tone="inverse"
          numberOfLines={2}
          style={{
            fontSize: density.phone ? 23 : 28,
            lineHeight: density.phone ? 28 : 34,
            letterSpacing: -0.35,
          }}
        >
          Discover what happens next.
        </VadText>
        <VadText
          variant="caption"
          tone="inverse"
          numberOfLines={2}
          style={{ opacity: 0.82, lineHeight: 16 }}
        >
          Explore market questions and follow the outcomes.
        </VadText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Explore markets"
        onPress={onExplore}
        style={({ pressed }) => ({
          minHeight: 38,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          paddingHorizontal: 15,
          borderRadius: 12,
          backgroundColor: theme.colors.surface,
          opacity: pressed ? 0.82 : 1,
        })}
      >
        <VadText variant="caption" style={{ color: theme.colors.brandPrimary, fontWeight: '700' }}>
          Explore markets
        </VadText>
        <VadIcon name="chevronRight" size={13} tone="brand" />
      </Pressable>
    </View>
  );
}
