import { Image, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';

export function MarketThumbnail({ market, size = 66 }: { market: MarketCatalogItem; size?: number }) {
  const theme = useVadTheme();
  const mediaUrl = market.thumbnail_url ?? market.image_url ?? market.media_url ?? null;
  const category = market.category?.trim() || 'Market';

  if (mediaUrl) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(12, size * 0.22),
          overflow: 'hidden',
          backgroundColor: theme.colors.surfaceMuted,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <Image
          source={{ uri: mediaUrl }}
          resizeMode="cover"
          style={{ width: '100%', height: '100%' }}
        />
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={`${category} market`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(12, size * 0.22),
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        backgroundColor: theme.colors.brandSoft,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <VadIcon name="markets" size={Math.max(18, size * 0.3)} tone="brand" />
      {size >= 58 ? (
        <VadText variant="caption" tone="brand" numberOfLines={1} style={{ maxWidth: size - 12 }}>
          {category.slice(0, 9)}
        </VadText>
      ) : null}
    </View>
  );
}
