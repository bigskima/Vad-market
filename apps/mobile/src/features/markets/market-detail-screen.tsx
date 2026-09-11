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

      <View style={{ gap: theme.spacing.xs }}>
        <VadSegmentedControl value={tab} options={tabs} onChange={setTab} />
        <VadText variant="caption" tone="tertiary">
          {tab === 'Overview'
            ? 'Market context and lifecycle.'
            : tab === 'Trade'
              ? 'Build or reduce a position using a server-quoted order.'
              : tab === 'Discussion'
                ? 'Public reasoning is social context, never oracle authority.'
                : 'Resolution and settlement boundaries for this market.'}
        </VadText>
      </View>

      {tab === 'Overview' ? (
        <Overview
          market={market}
          canTrade={canTrade}
          tradeCapabilityLoading={tradeCapabilityLoading}
          onTrade={() => setTab('Trade')}
          onDiscuss={() => setTab('Discussion')}
          onRules={() => setTab('Rules')}
        />
      ) : null}
      {tab === 'Trade' ? (
        <TradingTicket
          market={market}
          canTrade={canTrade}
          tradeReason={tradeReason}
          capabilityLoading={tradeCapabilityLoading}
          onPlaced={onPlaced}
        />
      ) : null}
      {tab === 'Discussion' ? (
        <SocialConvictionFeed
          markets={markets}
          canCreatePost={canCreatePost}
          onOpenMarket={onOpenMarket}
          marketFilter={market}
        />
      ) : null}
      {tab === 'Rules' ? <Rules market={market} /> : null}

      {density.phone && tab !== 'Trade' ? (
        <View style={{ paddingTop: theme.spacing.xs }}>
          <VadButton
            label={tradeCapabilityLoading ? 'Checking trade availability' : canTrade ? 'Trade this market' : 'View trade availability'}
            size="small"
            onPress={() => setTab('Trade')}
            leading={<VadIcon name="markets" size={16} tone="inverse" />}
          />
        </View>
      ) : null}
    </View>
  );
}

function Overview({
  market,
  canTrade,
  tradeCapabilityLoading,
  onTrade,
  onDiscuss,
  onRules,
}: {
  market: MarketCatalogItem;
  canTrade: boolean;
  tradeCapabilityLoading: boolean;
  onTrade: () => void;
  onDiscuss: () => void;
  onRules: () => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const wide = density.width >= 780;
  const open = market.status === 'OPEN' || market.status === 'ACTIVE';
  const closed = ['CLOSED', 'RESOLVING', 'RESOLVED', 'SETTLED', 'VOID'].includes(market.status);

  return (
    <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
      <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'stretch', gap: theme.spacing.md }}>
        <VadCard style={{ flex: 1.1, gap: theme.spacing.sm }}>
          <View style={{ gap: 2 }}>
            <VadText variant="caption" tone="brand">MARKET OVERVIEW</VadText>
            <VadText variant="heading">Price conviction. Resolve independently.</VadText>
            <VadText variant="caption" tone="secondary">
              Participants price YES and NO through orders. The final outcome still comes from the approved resolution process, not from whichever side traded higher.
            </VadText>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            <StatePill label="Trading" value={open ? 'Open' : closed ? 'Closed' : market.status.replaceAll('_', ' ')} tone={open ? 'yes' : 'secondary'} />
            <StatePill label="Settlement" value={market.asset_code} tone="brand" />
            <StatePill label="Market type" value={market.market_type.replaceAll('_', ' ')} />
          </View>

          {!density.phone ? (
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <VadButton
                label={tradeCapabilityLoading ? 'Checking availability' : canTrade ? 'Trade this market' : 'View trade availability'}
                onPress={onTrade}
                style={{ flex: 1 }}
                leading={<VadIcon name="markets" size={17} tone="inverse" />}
              />
              <VadButton
                label="Discussion"
                variant="secondary"
                onPress={onDiscuss}
                style={{ flex: 1 }}
                leading={<VadIcon name="community" size={17} tone="primary" />}
              />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
              <VadButton label="Discussion" variant="secondary" size="small" onPress={onDiscuss} style={{ flex: 1 }} />
              <VadButton label="Rules" variant="secondary" size="small" onPress={onRules} style={{ flex: 1 }} />
            </View>
          )}
        </VadCard>

        <VadCard variant="raised" style={{ flex: 0.9, gap: theme.spacing.xs }}>
          <VadText variant="bodyStrong">Market details</VadText>
          <Fact label="Category" value={market.category ?? 'General'} />
          <Fact label="Settlement" value={market.asset_code} />
          <Fact label="Type" value={market.market_type.replaceAll('_', ' ')} />
          <Fact label="Closes" value={market.closes_at ? new Date(market.closes_at).toLocaleString() : 'By market policy'} />
          <Fact label="Last trade" value={market.last_trade_at ? new Date(market.last_trade_at).toLocaleString() : 'No fills yet'} />
        </VadCard>
      </View>

      <Lifecycle market={market} />

      <VadCard variant="brand" style={{ gap: theme.spacing.xs }}>
        <VadText variant="caption" tone="brand">IMPORTANT BOUNDARY</VadText>
        <VadText variant="bodyStrong">Trading signal ≠ oracle truth</VadText>
        <VadText variant="caption" tone="secondary">
          A 90% YES price means participants are strongly pricing YES. It does not grant YES any authority over the evidence used to resolve the event.
        </VadText>
      </VadCard>
    </View>
  );
}

function Lifecycle({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const status = market.status.toUpperCase();
  const tradeDone = ['CLOSED', 'RESOLVING', 'RESOLVED', 'SETTLED', 'VOID'].includes(status);
  const resolutionDone = ['RESOLVED', 'SETTLED', 'VOID'].includes(status);
  const settlementDone = status === 'SETTLED';
  const resolutionActive = status === 'RESOLVING';

  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
      <View style={{ gap: 2 }}>
        <VadText variant="bodyStrong">Market lifecycle</VadText>
        <VadText variant="caption" tone="secondary">The stages remain separate so trading activity cannot become settlement authority.</VadText>
      </View>
      <View style={{ flexDirection: density.width >= 620 ? 'row' : 'column', gap: theme.spacing.xs }}>
        <LifecycleStep
          number="1"
          title="Trading"
          body={market.closes_at ? `Orders are scheduled to close ${new Date(market.closes_at).toLocaleString()}.` : 'Trading closes according to the approved market policy.'}
          state={tradeDone ? 'complete' : 'active'}
        />
        <LifecycleStep
          number="2"
          title="Resolution"
          body="Approved evidence and oracle policy determine the outcome."
          state={resolutionDone ? 'complete' : resolutionActive ? 'active' : 'waiting'}
        />
        <LifecycleStep
          number="3"
          title="Settlement"
          body={`Eligible positions settle in ${market.asset_code} only after the resolution becomes final.`}
          state={settlementDone ? 'complete' : 'waiting'}
        />
      </View>
    </VadCard>
  );
}

function LifecycleStep({ number, title, body, state }: { number: string; title: string; body: string; state: 'active' | 'complete' | 'waiting' }) {
  const theme = useVadTheme();
  const active = state === 'active';
  const complete = state === 'complete';
  const tone = complete ? 'yes' : active ? 'brand' : 'tertiary';
  return (
    <View style={{ flex: 1, minWidth: 0, minHeight: 112, borderRadius: theme.radius.lg, backgroundColor: active ? theme.colors.brandSoft : complete ? theme.colors.yesSoft : theme.colors.surfaceMuted, borderWidth: 1, borderColor: active ? theme.colors.brandPrimary : complete ? theme.colors.yes : theme.colors.border, padding: theme.spacing.sm, gap: 5 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.xs }}>
        <VadText variant="caption" tone={tone}>{number}</VadText>
        <VadText variant="caption" tone={tone}>{complete ? 'COMPLETE' : active ? 'CURRENT' : 'NEXT'}</VadText>
      </View>
      <VadText variant="bodyStrong">{title}</VadText>
      <VadText variant="caption" tone="secondary">{body}</VadText>
    </View>
  );
}

function Rules({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const wide = density.width >= 820;
  const rules = [
    {
      number: '1',
      title: 'Trading has a boundary',
      body: market.closes_at
        ? `Trading is scheduled to close on ${new Date(market.closes_at).toLocaleString()}. Orders after the live trading window are governed by backend policy.`
        : 'The closing time and order eligibility follow the approved market policy.',
    },
    {
      number: '2',
      title: 'Price does not decide truth',
      body: 'YES and NO prices represent participant conviction. They do not vote an outcome into existence.',
    },
    {
      number: '3',
      title: 'Resolution uses approved evidence',
      body: 'The final result comes from the market’s approved oracle and resolution process. Social posts and creator reputation remain descriptive only.',
    },
    {
      number: '4',
      title: 'Settlement follows the ledger',
      body: `Eligible positions and payouts settle in ${market.asset_code}. VAD does not mix this market’s settlement value with another asset.`,
    },
  ];

  return (
    <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
      <View style={{ gap: 2 }}>
        <VadText variant="caption" tone="brand">MARKET RULES</VadText>
        <VadText variant="heading">Resolution & settlement</VadText>
        <VadText variant="caption" tone="secondary">The core operating boundaries to understand before taking a position.</VadText>
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', flexWrap: wide ? 'wrap' : 'nowrap', gap: theme.spacing.sm }}>
        {rules.map((rule) => (
          <VadCard key={rule.number} variant="raised" style={{ width: wide ? '48.9%' : '100%', minHeight: wide ? 150 : undefined, gap: theme.spacing.xs }}>
            <VadChip label={rule.number} tone="brand" />
            <VadText variant="bodyStrong">{rule.title}</VadText>
            <VadText variant="caption" tone="secondary">{rule.body}</VadText>
          </VadCard>
        ))}
      </View>

      <VadCard variant="brand" style={{ gap: 2 }}>
        <VadText variant="bodyStrong">Trading → Resolution → Settlement</VadText>
        <VadText variant="caption" tone="secondary">These stages are deliberately separated. Market popularity, creator reputation and discussion activity never replace the approved resolution path.</VadText>
      </VadCard>
    </View>
  );
}

function StatePill({ label, value, tone = 'secondary' }: { label: string; value: string; tone?: 'secondary' | 'yes' | 'brand' }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: 120, minHeight: 52, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: theme.spacing.sm, paddingVertical: 7, gap: 1 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="caption" tone={tone} numberOfLines={1}>{value}</VadText>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <VadText variant="caption" tone="tertiary" style={{ flex: 1 }}>{label}</VadText>
      <VadText variant="bodyStrong" style={{ flex: 1.35, textAlign: 'right' }} numberOfLines={2}>{value}</VadText>
    </View>
  );
}
