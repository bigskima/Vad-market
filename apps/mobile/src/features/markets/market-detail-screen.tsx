import { useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { SocialConvictionFeed } from '@/features/social/social-conviction-feed';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { MarketDetailHeader } from './components/market-detail-header';
import { TradingTicket } from './components/trading-ticket';

type DetailTab = 'Overview' | 'Trade' | 'Discussion' | 'Rules';
const tabs: DetailTab[] = ['Overview', 'Trade', 'Discussion', 'Rules'];

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
  const { width } = useWindowDimensions();
  const compactTabs = width < 560;
  const [tab, setTab] = useState<DetailTab>('Overview');

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <MarketDetailHeader market={market} />

      <ScrollView horizontal={compactTabs} showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth: compactTabs ? undefined : '100%', gap: theme.spacing.xs, padding: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceRaised }}>
        {tabs.map((item) => {
          const selected = item === tab;
          return (
            <Pressable
              key={item}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setTab(item)}
              style={({ pressed }) => ({
                minWidth: compactTabs ? 104 : undefined,
                flex: compactTabs ? undefined : 1,
                minHeight: 40,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.pill,
                backgroundColor: selected ? theme.colors.surface : 'transparent',
                borderWidth: selected ? 1 : 0,
                borderColor: theme.colors.border,
                opacity: pressed ? 0.68 : 1,
              })}
            >
              <VadText variant="caption" tone={selected ? 'primary' : 'secondary'} style={{ fontWeight: selected ? '700' : '500' }}>{item}</VadText>
            </Pressable>
          );
        })}
      </ScrollView>

      {tab === 'Overview' ? (
        <Overview market={market} canTrade={canTrade} tradeCapabilityLoading={tradeCapabilityLoading} onTrade={() => setTab('Trade')} onDiscuss={() => setTab('Discussion')} />
      ) : null}
      {tab === 'Trade' ? <TradingTicket market={market} canTrade={canTrade} tradeReason={tradeReason} capabilityLoading={tradeCapabilityLoading} onPlaced={onPlaced} /> : null}
      {tab === 'Discussion' ? <SocialConvictionFeed markets={markets} canCreatePost={canCreatePost} onOpenMarket={onOpenMarket} marketFilter={market} /> : null}
      {tab === 'Rules' ? <Rules market={market} /> : null}
    </View>
  );
}

function Overview({ market, canTrade, tradeCapabilityLoading, onTrade, onDiscuss }: { market: MarketCatalogItem; canTrade: boolean; tradeCapabilityLoading: boolean; onTrade: () => void; onDiscuss: () => void }) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 780;

  return (
    <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'stretch', gap: theme.spacing.md }}>
      <VadCard style={{ flex: 1.1, gap: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.xs }}>
          <VadText variant="caption" tone="brand">MARKET OVERVIEW</VadText>
          <VadText variant="heading">What happens next?</VadText>
          <VadText tone="secondary">Choose a side when you are ready, or open the discussion to inspect other participants’ reasoning first.</VadText>
        </View>

        <VadCard variant="brand" style={{ gap: 2 }}>
          <VadText variant="bodyStrong">Trading and truth are separate.</VadText>
          <VadText variant="caption" tone="secondary">YES and NO prices reflect trading. The approved resolution process decides the final outcome.</VadText>
        </VadCard>

        <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.sm }}>
          <VadButton
            label={tradeCapabilityLoading ? 'Checking availability' : canTrade ? 'Trade this market' : 'View trade availability'}
            onPress={onTrade}
            style={{ flex: 1 }}
            leading={<VadIcon name="markets" size={18} tone="inverse" />}
          />
          <VadButton label="Open discussion" variant="secondary" onPress={onDiscuss} style={{ flex: 1 }} leading={<VadIcon name="community" size={18} tone="primary" />} />
        </View>
      </VadCard>

      <VadCard variant="raised" style={{ flex: 0.9, gap: theme.spacing.sm }}>
        <VadText variant="caption" tone="tertiary">MARKET DETAILS</VadText>
        <Fact label="Category" value={market.category ?? 'General'} />
        <Fact label="Settlement asset" value={market.asset_code} />
        <Fact label="Market type" value={market.market_type} />
        <Fact label="Close time" value={market.closes_at ? new Date(market.closes_at).toLocaleString() : 'Defined by market policy'} />
        <Fact label="Last activity" value={market.last_trade_at ? new Date(market.last_trade_at).toLocaleString() : 'No completed trades yet'} />
      </VadCard>
    </View>
  );
}

function Rules({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const rules = [
    { number: '1', title: 'Trading closes before resolution', body: market.closes_at ? `Trading is scheduled to close on ${new Date(market.closes_at).toLocaleString()}.` : 'The closing time follows the approved market policy.' },
    { number: '2', title: 'Price does not decide truth', body: 'YES and NO prices represent participant conviction. The final result comes from the approved resolution process.' },
    { number: '3', title: 'Settlement follows the ledger', body: `Positions and payouts settle in ${market.asset_code} only after the market has a final outcome.` },
  ];

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="caption" tone="brand">MARKET RULES</VadText>
        <VadText variant="heading">Resolution & settlement</VadText>
        <VadText tone="secondary">The key operating boundaries to understand before taking a position.</VadText>
      </View>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.md }}>
        {rules.map((rule) => (
          <VadCard key={rule.number} variant="raised" style={{ flex: wide ? 1 : undefined, gap: theme.spacing.md }}>
            <VadChip label={rule.number} tone="brand" />
            <View style={{ gap: theme.spacing.xs }}>
              <VadText variant="bodyStrong">{rule.title}</VadText>
              <VadText variant="caption" tone="secondary">{rule.body}</VadText>
            </View>
          </VadCard>
        ))}
      </View>
      <VadCard variant="brand" style={{ gap: 2 }}>
        <VadText variant="bodyStrong">Trading → Resolution → Settlement</VadText>
        <VadText variant="caption" tone="secondary">VAD keeps these stages separate. A popular outcome does not become true merely because it has the higher market price.</VadText>
      </VadCard>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ minHeight: 48, paddingVertical: theme.spacing.xs, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <VadText variant="caption" tone="tertiary" style={{ flex: 1 }}>{label}</VadText>
      <VadText variant="bodyStrong" style={{ flex: 1.35, textAlign: 'right' }} numberOfLines={2}>{value}</VadText>
    </View>
  );
}
