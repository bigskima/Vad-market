import { Pressable, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';

export function HomeHeroBanner({ onExplore }: { onExplore: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();

  return (
    <View
      accessibilityLabel="Discover VAD markets"
      style={{
        width: '100%',
        minHeight: density.phone ? 124 : density.desktop ? 150 : 136,
        overflow: 'hidden',
        borderRadius: density.phone ? 13 : 16,
        borderWidth: 1,
        borderColor: theme.colors.brandPrimary,
        backgroundColor: theme.colors.brandStrong,
        justifyContent: 'flex-end',
        alignItems: 'flex-start',
        paddingHorizontal: density.phone ? 14 : 18,
        paddingVertical: density.phone ? 13 : 16,
        gap: 7,
      }}
    >
      <View style={{ gap: 3, maxWidth: 540 }}>
        <VadText
          variant={density.phone ? 'title' : 'heading'}
          tone="inverse"
          numberOfLines={2}
          style={{
            fontSize: density.phone ? 17 : 20,
            lineHeight: density.phone ? 21 : 25,
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
          Explore live questions and follow the outcomes.
        </VadText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Explore markets"
        onPress={onExplore}
        style={({ pressed }) => ({
          minHeight: 30,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          paddingHorizontal: 11,
          borderRadius: 9,
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
