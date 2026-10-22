import { Image, View } from 'react-native';

import { VadChip } from '@/components/ui/vad-chip';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { supabase } from '@/lib/supabase';

export function MarketDetailHeader({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const isPool = market.liquidity_mode === 'POOL' || String(market.liquidity_mode ?? '').toUpperCase().includes('POOL');
  const imageUrl = market.media_path ? supabase.storage.from('market-media').getPublicUrl(market.media_path).data.publicUrl : null;

  return (
    <View style={{ gap: density.compact ? 7 : density.phone ? 8 : 11 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <VadChip label={(market.status ?? 'MARKET').toString().replaceAll('_', ' ').toUpperCase()} tone="neutral" />
        <VadChip label={market.asset_code} tone="brand" />
        
        
        <VadText variant="caption" tone="secondary">{market.category ?? 'General'} · {market.market_type === 'BINARY' ? 'YES / NO' : friendlyEnum(market.market_type)} · {isPool ? 'Peer Pool' : market.liquidity_mode === 'ORDER_BOOK' ? 'Order Book' : friendlyEnum(market.liquidity_mode ?? 'ORDER_BOOK')}</VadText>
      </View>

      {imageUrl ? (
        <View style={{ width: '100%', aspectRatio: density.phone ? 16 / 9 : 16 / 7, borderRadius: density.phone ? 18 : 24, overflow: 'hidden', backgroundColor: theme.colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
          <Image
            source={{ uri: imageUrl }}
            accessibilityLabel={`${market.title} market image`}
            style={{ width: '100%', height: '100%' }}
            resizeMode="contain"
          />
        </View>
      ) : null}

      <View style={{ gap: 2, paddingTop: density.phone ? 1 : 3 }}>
        <VadText
          variant={density.phone ? 'heading' : 'title'}
          style={{
            fontSize: density.phone ? (density.narrow ? 20 : 22) : 25,
            lineHeight: density.phone ? (density.narrow ? 25 : 28) : 31,
            letterSpacing: -0.35,
            flexShrink: 1,
          }}
        >
          {market.title}
        </VadText>
      </View>
    </View>
  );
}

function friendlyEnum(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
