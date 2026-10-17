import { Image, View } from 'react-native';

import { VadChip } from '@/components/ui/vad-chip';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';

export function MarketDetailHeader({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const isPool = market.liquidity_mode === 'POOL' || String(market.liquidity_mode ?? '').toUpperCase().includes('POOL');
  const imageUrl = null;

  return (
    <View style={{ gap: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <VadChip label={(market.status ?? 'MARKET').toString().replaceAll('_', ' ').toUpperCase()} tone="neutral" />
        <VadChip label={market.asset_code} tone="brand" />
        
        
        <VadText variant="caption" tone="secondary">{market.category ?? 'General'} · {market.market_type === 'BINARY' ? 'YES / NO' : friendlyEnum(market.market_type)} · {isPool ? 'Peer Pool' : market.liquidity_mode === 'ORDER_BOOK' ? 'Order Book' : friendlyEnum(market.liquidity_mode ?? 'ORDER_BOOK')}</VadText>
      </View>

      {imageUrl ? <Image source={{ uri: imageUrl }} accessibilityLabel={`${market.title} market image`} style={{ width: '100%', aspectRatio: 16 / 7, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceMuted }} resizeMode="cover" /> : null}

      <View style={{ gap: 2 }}>
        <VadText variant={density.compact ? 'heading' : 'title'} style={{ fontSize: density.compact ? 17 : 21, lineHeight: density.compact ? 22 : 27, letterSpacing: -0.3 }}>{market.title}</VadText>
      </View>
    </View>
  );
}

function friendlyEnum(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function SignalTile({ label, value, positive, available }: { label: string; value: string; positive: boolean; available: boolean }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: theme.radius.md, backgroundColor: available ? (positive ? theme.colors.yesSoft : theme.colors.noSoft) : theme.colors.surfaceMuted, paddingHorizontal: 7, paddingVertical: 5, gap: 2 }}>
      <VadText variant="caption" tone={available ? (positive ? 'yes' : 'no') : 'tertiary'}>{label}</VadText>
      <VadText variant={density.compact ? 'bodyStrong' : 'heading'} tone={available ? (positive ? 'yes' : 'no') : 'tertiary'} numberOfLines={1} style={{ fontSize: density.compact ? 14 : 16, lineHeight: density.compact ? 17 : 19 }}>{value}</VadText>
    </View>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ minHeight: 28, flexGrow: 1, flexBasis: 96, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 7, paddingVertical: 3, gap: 1 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="caption" numberOfLines={2}>{value}</VadText>
    </View>
  );
}
