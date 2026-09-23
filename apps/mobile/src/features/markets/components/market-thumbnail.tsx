import { Image, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { marketMediaPublicUrl } from '@/services/market-media-api';

export function MarketThumbnail({ market, size = 66 }: { market: MarketCatalogItem; size?: number }) {
  return (
    <MarketMediaThumbnail
      mediaPath={market.media_path}
      legacyUrl={null}
      title={market.title}
      category={market.category}
      size={size}
    />
  );
}

export function MarketMediaThumbnail({
  mediaPath,
  legacyUrl,
  title,
  category,
  size = 66,
}: {
  mediaPath?: string | null;
  legacyUrl?: string | null;
  title: string;
  category?: string | null;
  size?: number;
}) {
  const theme = useVadTheme();
  const mediaUrl = marketMediaPublicUrl(mediaPath) ?? legacyUrl ?? null;
  const categoryLabel = category?.trim() || 'Market';

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
          accessibilityLabel={`${title} market image`}
          style={{ width: '100%', height: '100%' }}
        />
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={`${categoryLabel} market`}
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
          {categoryLabel.slice(0, 9)}
        </VadText>
      ) : null}
    </View>
  );
}
