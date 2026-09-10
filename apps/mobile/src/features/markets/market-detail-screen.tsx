import { useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadSegmentedControl } from '@/components/ui/vad-segmented-control';
import { VadText } from '@/components/ui/vad-text';
import { SocialConvictionFeed } from '@/features/social/social-conviction-feed';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { MarketDetailHeader } from './components/market-detail-header';
import { TradingTicket } from './components/trading-ticket';

type DetailTab = 'Overview' | 'Trade' | 'Discussion' | 'Rules';
const tabs = [
  { value: 'Overview', label: 'Overview' },
  { value: 'Trade', label: 'Trade' },
  { value: 'Discussion', label: 'Discuss' },
  { value: 'Rules', label: 'Rules' },
] as const;

export function MarketDetailScreen({
  market,
  markets,
  canTrade,
  tradeReason,
  tradeCapabilityLoading = false,
  canCreatePost,
  onPlaced,
  onOpenMarket,
}: {
  market: MarketCatalogItem;
  markets: MarketCatalogItem[];
  canTrade: boolean;
  tradeReason?: string;
  tradeCapabilityLoading?: boolean;
  canCreatePost: boolean;
  onPlaced: () => Promise<void>;
  onOpenMarket: (market: MarketCatalogItem) => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [tab, setTab] = useState<DetailTab>('Overview');

  return (
    <View style={{ gap: density.sectionGap }}>
      <MarketDetailHeader market={market} />
      <VadSegmentedControl value={tab} options={tabs} onChange={setTab} />

      {tab === 'Overview' ? (
        <Overview market={market} canTrade={canTrade} tradeCapabilityLoading={tradeCapabilityLoading} onTrade={() => setTab('Trade')} onDiscuss={() => setTab('Discussion')} />
      ) : null}
      {tab === 'Trade' ? <TradingTicket market={market} canTrade={canTrade} tradeReason={tradeReason} capabilityLoading={tradeCapabilityLoading} onPlaced={onPlaced} /> : null}
      {tab === 'Discussion' ? <SocialConvictionFeed markets={markets} canCreatePost={canCreatePost} onOpenMarket={onOpenMarket} marketFilter={market} /> : null}
      {tab === 'Rules' ? <Rules market={market} /> : null}

      {density.phone && tab !== 'Trade' ? (
        <VadButton
          label={tradeCapabilityLoading ? 'Checking trade availability' : canTrade ? 'Trade this market' : 'View trade availability'}
          size="small"
          onPress={() => setTab('Trade')}
          leading={<VadIcon name="markets" size={16} tone="inverse" />}
        />
      ) : null}
    </View>
  );
}

function Overview({ market, canTrade, tradeCapabilityLoading, onTrade, onDiscuss }: { market: MarketCatalogItem; canTrade: boolean; tradeCapabilityLoading: boolean; onTrade: () => void; onDiscuss: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const wide = density.width >= 780;

  return (
    <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'stretch', gap: theme.spacing.md }}>
      <VadCard style={{ flex: 1.1, gap: theme.spacing.sm }}>
        <View style={{ gap: 2 }}>
          <VadText variant="caption" tone="brand">MARKET OVERVIEW</VadText>
          <VadText variant="heading">Take a position or inspect the reasoning</VadText>
          <VadText variant="caption" tone="secondary">Trading prices reflect conviction. Resolution still decides the final truth independently.</VadText>
        </View>

        <VadCard variant="brand" style={{ gap: 2 }}>
          <VadText variant="bodyStrong">Trading ≠ resolution</VadText>
          <VadText variant="caption" tone="secondary">A higher YES or NO price does not determine the final outcome.</VadText>
        </VadCard>

        {!density.phone ? (
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <VadButton label={tradeCapabilityLoading ? 'Checking availability' : canTrade ? 'Trade this market' : 'View trade availability'} onPress={onTrade} style={{ flex: 1 }} leading={<VadIcon name="markets" size={17} tone="inverse" />} />
            <VadButton label="Discussion" variant="secondary" onPress={onDiscuss} style={{ flex: 1 }} leading={<VadIcon name="community" size={17} tone="primary" />} />
          </View>
        ) : (
          <VadButton label="Open discussion" variant="secondary" size="small" onPress={onDiscuss} leading={<VadIcon name="community" size={16} tone="primary" />} />
        )}
      </VadCard>

      <VadCard variant="raised" style={{ flex: 0.9, gap: theme.spacing.xs }}>
        <VadText variant="bodyStrong">Market details</VadText>
        <Fact label="Category" value={market.category ?? 'General'} />
        <Fact label="Settlement" value={market.asset_code} />
        <Fact label="Type" value={market.market_type} />
        <Fact label="Closes" value={market.closes_at ? new Date(market.closes_at).toLocaleString() : 'By market policy'} />
        <Fact label="Last activity" value={market.last_trade_at ? new Date(market.last_trade_at).toLocaleString() : 'No fills yet'} />
      </VadCard>
    </View>
  );
}

function Rules({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const wide = density.width >= 820;
  const rules = [
    { number: '1', title: 'Trading closes before resolution', body: market.closes_at ? `Trading is scheduled to close on ${new Date(market.closes_at).toLocaleString()}.` : 'The closing time follows the approved market policy.' },
    { number: '2', title: 'Price does not decide truth', body: 'YES and NO prices represent participant conviction. The final result comes from the approved resolution process.' },
    { number: '3', title: 'Settlement follows the ledger', body: `Positions and payouts settle in ${market.asset_code} only after a final outcome.` },
  ];

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 2 }}>
        <VadText variant="caption" tone="brand">MARKET RULES</VadText>
        <VadText variant="heading">Resolution & settlement</VadText>
        <VadText variant="caption" tone="secondary">The operating boundaries to understand before taking a position.</VadText>
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.sm }}>
        {rules.map((rule) => (
          <VadCard key={rule.number} variant="raised" style={{ flex: wide ? 1 : undefined, gap: theme.spacing.xs }}>
            <VadChip label={rule.number} tone="brand" />
            <VadText variant="bodyStrong">{rule.title}</VadText>
            <VadText variant="caption" tone="secondary">{rule.body}</VadText>
          </VadCard>
        ))}
      </View>

      <VadCard variant="brand" style={{ gap: 2 }}>
        <VadText variant="bodyStrong">Trading → Resolution → Settlement</VadText>
        <VadText variant="caption" tone="secondary">VAD keeps these stages separate. Market popularity alone never makes an outcome true.</VadText>
      </VadCard>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <VadText variant="caption" tone="tertiary" style={{ flex: 1 }}>{label}</VadText>
      <VadText variant="bodyStrong" style={{ flex: 1.35, textAlign: 'right' }} numberOfLines={2}>{value}</VadText>
    </View>
  );
}
