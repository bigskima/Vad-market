import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { MarketCard } from './components/market-card';
import { MarketDetailHeader } from './components/market-detail-header';
import { MarketDiscoveryControls } from './components/market-discovery-controls';
import { TradingTicket } from './components/trading-ticket';

export function MarketsScreen({ markets, initialMarket, canTrade, onSelectedChange, onReload }: { markets: MarketCatalogItem[]; initialMarket: MarketCatalogItem | null; canTrade: boolean; onSelectedChange: (market: MarketCatalogItem | null) => void; onReload: () => Promise<void> }) {
  const theme = useVadTheme();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const selected = initialMarket;
  const categories = useMemo(() => [...new Set(markets.map((market) => market.category).filter((value): value is string => Boolean(value)))].sort(), [markets]);
  const orderedMarkets = useMemo(() => [...markets]
    .filter((market) => category === 'All' || market.category === category)
    .filter((market) => {
      const needle = query.trim().toLowerCase();
      if (!needle) return true;
      return [market.title, market.category, market.asset_code, market.status].some((value) => String(value ?? '').toLowerCase().includes(needle));
    })
    .sort((a, b) => Number(Boolean(b.last_trade_at)) - Number(Boolean(a.last_trade_at))), [markets, category, query]);

  if (!selected) return <View style={{ gap: theme.spacing.lg }}>
    <View style={{ gap: theme.spacing.xs }}><VadText variant="label" tone="brand">DISCOVER</VadText><VadText variant="title">Markets</VadText><VadText tone="secondary">Search live questions, compare conviction and open a market only when you understand its resolution path.</VadText></View>
    <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}><Summary label="Live" value={String(markets.length)} /><Summary label="Settlement asset" value="NGN" /><Summary label="Activity" value={markets.some((m) => m.last_trade_at) ? 'Trading' : 'Forming'} /></View>
    <MarketDiscoveryControls query={query} onQueryChange={setQuery} categories={categories} activeCategory={category} onCategoryChange={setCategory} />
    <View style={{ gap: theme.spacing.sm }}>{orderedMarkets.map((market) => <MarketCard key={market.instrument_public_id} market={market} onPress={() => onSelectedChange(market)} />)}</View>
    {!markets.length ? <VadEmptyState title="No live markets yet" body="Approved canonical markets will appear here automatically once governance and oracle requirements are satisfied." /> : orderedMarkets.length === 0 ? <VadEmptyState title="No matching markets" body="Try another search or category. Market discovery never changes the canonical market itself." /> : null}
  </View>;

  return <View style={{ gap: theme.spacing.lg }}>
    <Pressable onPress={() => onSelectedChange(null)} style={{ alignSelf: 'flex-start', borderRadius: 999, backgroundColor: theme.colors.surfaceMuted, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }}><VadText variant="label" tone="brand">← Markets</VadText></Pressable>
    <MarketDetailHeader market={selected} />
    <TradingTicket market={selected} canTrade={canTrade} onPlaced={async () => { onSelectedChange(null); await onReload(); }} />
  </View>;
}

function Summary({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return <VadCard variant="muted" style={{ flex: 1, gap: theme.spacing.xxs, padding: theme.spacing.sm }}><VadText variant="caption" tone="secondary">{label}</VadText><VadText variant="bodyStrong">{value}</VadText></VadCard>;
}
