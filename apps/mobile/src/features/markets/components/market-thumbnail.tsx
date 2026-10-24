import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { marketMediaPublicUrl } from '@/services/market-media-api';
import { requestMarketImageGeneration, type MarketImageResult } from '@/services/market-image-generation';

export function MarketThumbnail({ market, size = 66 }: { market: MarketCatalogItem; size?: number }) {
  const [imageResult, setImageResult] = useState<MarketImageResult | null>(null);
  const existingMediaPath = market.media_path?.trim() || null;
  const sourceImageApplies = imageResult?.source === 'publisher'
    && (imageResult.basedOnMediaPath === existingMediaPath
      || (!imageResult.basedOnMediaPath && !existingMediaPath));

  useEffect(() => {
    let active = true;
    void requestMarketImageGeneration(market.instrument_public_id).then((result) => {
      if (active) setImageResult(result);
    });
    return () => { active = false; };
  }, [market.instrument_public_id, existingMediaPath]);

  return (
    <MarketMediaThumbnail
      mediaPath={sourceImageApplies ? imageResult.mediaUrl : existingMediaPath ?? imageResult?.mediaUrl ?? null}
      legacyUrl={null}
      title={market.title}
      category={market.category}
      sourceCredit={sourceImageApplies ? imageResult.sourceName ?? null : null}
      sourceTitle={sourceImageApplies ? imageResult.articleTitle ?? null : null}
      size={size}
    />
  );
}

export function MarketMediaThumbnail({
  mediaPath,
  legacyUrl,
  title,
  category,
  sourceCredit,
  sourceTitle,
  size = 66,
}: {
  mediaPath?: string | null;
  legacyUrl?: string | null;
  title: string;
  category?: string | null;
  sourceCredit?: string | null;
  sourceTitle?: string | null;
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
          accessibilityLabel={`${title} market image${sourceCredit ? ', image source ' + sourceCredit : ''}${sourceTitle ? ', related report ' + sourceTitle : ''}`}
          style={{ width: '100%', height: '100%' }}
        />
        {sourceCredit && size >= 64 ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.66)', paddingHorizontal: 4, paddingVertical: 2 }}>
            <VadText variant="caption" numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 8, lineHeight: 10 }}>{sourceCredit}</VadText>
          </View>
        ) : null}
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
