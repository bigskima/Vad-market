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
    }).catch(() => {
      // Keep the designed brand surface when optional artwork is unavailable.
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <View
      accessibilityLabel="Discover VAD markets"
      style={{
        width: '100%',
        minHeight: density.phone ? 136 : 148,
        overflow: 'hidden',
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.brandStrong,
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingHorizontal: density.phone ? theme.spacing.md : theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.sm,
      }}
    >
      {heroImageUrl ? (
        <Image
          source={{ uri: heroImageUrl }}
          resizeMode="cover"
          accessibilityLabel="VAD discovery artwork"
          style={{ position: 'absolute', width: '100%', height: '100%', left: 0, top: 0, opacity: 0.62 }}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: theme.colors.brandStrong,
          opacity: heroImageUrl ? 0.26 : 1,
        }}
      />
      <View style={{ gap: theme.spacing.xxs, maxWidth: 540 }}>
        <VadText variant="title" tone="inverse" numberOfLines={2}>
          Discover what happens next.
        </VadText>
        <VadText variant="caption" tone="inverse" numberOfLines={2} style={{ opacity: 0.84 }}>
          Explore market questions and follow the outcomes.
        </VadText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Explore markets"
        onPress={onExplore}
        style={({ pressed }) => ({
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.xxs,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surface,
          opacity: pressed ? 0.84 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        })}
      >
        <VadText variant="label" tone="brand">
          Explore markets
        </VadText>
        <VadIcon name="chevronRight" size={16} tone="brand" />
      </Pressable>
    </View>
  );
}
