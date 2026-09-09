import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { pct } from '@/features/markets/format';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';

export function HomeMarketPulse({ markets, onOpenMarket }: { markets: MarketCatalogItem[]; onOpenMarket: (market: MarketCatalogItem) => void }) {
  const theme = useVadTheme();
  const items = [...markets].filter((market) => market.status === 'OPEN' || market.status === 'ACTIVE').sort((a, b) => Number(Boolean(b.last_trade_at)) - Number(Boolean(a.last_trade_at))).slice(0, 3);
  if (!items.length) return null;
  return <View style={{ gap: theme.spacing.sm }}><View><VadText variant="heading">Market pulse</VadText><VadText variant="caption" tone="secondary">A fast read of where conviction is clustering right now.</VadText></View><View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>{items.map((market) => <Pressable key={market.instrument_public_id} onPress={() => onOpenMarket(market)} style={{ flex: 1 }}><VadCard variant="raised" style={{ minHeight: 138, gap: theme.spacing.xs, padding: theme.spacing.sm }}><VadText variant="caption" tone="secondary" numberOfLines={1}>{market.category ?? 'Market'}</VadText><VadText variant="bodyStrong" numberOfLines={3}>{market.title}</VadText><View style={{ marginTop: 'auto', gap: 4 }}><VadText variant="label" tone="yes">YES {pct(market.yes_price)}</VadText><View style={{ height: 5, borderRadius: 99, backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden' }}><View style={{ width: `${Math.max(4, Math.min(100, Number(market.yes_price ?? 0.5) * 100))}%`, height: '100%', backgroundColor: theme.colors.yes }} /></View></View></VadCard></Pressable>)}</View></View>;
}
