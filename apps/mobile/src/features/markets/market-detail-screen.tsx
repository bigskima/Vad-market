import { useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadProgressiveSection } from '@/components/ui/vad-progressive-section';
import { VadSegmentedControl } from '@/components/ui/vad-segmented-control';
import { VadText } from '@/components/ui/vad-text';
import { SocialConvictionFeed } from '@/features/social/social-conviction-feed';
import { useLiveNow } from '@/hooks/use-live-now';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { MarketDetailHeader } from './components/market-detail-header';
import { MarketTimeStatus } from './components/market-time-status';
import { TradingTicket } from './components/trading-ticket';
import { describeMarketTiming, formatRelativeTimestamp, marketStatusMeta } from './market-state';

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
  const marketState = marketStatusMeta(market.status);
  const [tab, setTab] = useState<DetailTab>('Overview');

  return (
    <View style={{ gap: density.sectionGap }}>
      <MarketDetailHeader market={market} />

      <View
        style={{
          gap: theme.spacing.xs,
          padding: density.compact ? theme.spacing.xs : theme.spacing.sm,
          borderRadius: theme.radius.xl,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}
      >
        <VadSegmentedControl value={tab} options={tabs} onChange={setTab} />
        <VadText variant="caption" tone="tertiary" style={{ paddingHorizontal: 4 }}>
          {tab === 'Overview'
            ? 'Read the live state, timing and lifecycle before going deeper.'
            : tab === 'Trade'
              ? marketState.tradeOpen ? 'Build or reduce a position while the market remains open.' : 'Trading controls stay visible with a clear explanation of the current market state.'
              : tab === 'Discussion'
                ? 'Use community conviction as context, not as the resolution rule.'
                : 'Read the timing and resolution rules before taking a position.'}
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
            label={tradeCapabilityLoading ? 'Checking trade availability' : marketState.tradeOpen && canTrade ? 'Trade this market' : 'View trading status'}
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
  const now = useLiveNow();
  const marketState = marketStatusMeta(market.status);
  const timing = describeMarketTiming(market.closes_at, market.status, now);
  const lastTrade = formatRelativeTimestamp(market.last_trade_at, now);

  return (
    <View style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
      <VadCard variant="brand" style={{ gap: theme.spacing.md, overflow: 'hidden' }}>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 150,
            height: 150,
            borderRadius: 75,
            right: -58,
            top: -72,
            backgroundColor: theme.colors.surface,
            opacity: theme.mode === 'dark' ? 0.06 : 0.42,
          }}
        />
        <View style={{ gap: 3, maxWidth: 620 }}>
          <VadText variant="caption" tone="brand">DECISION SNAPSHOT</VadText>
          <VadText variant="heading">Know the clock. Read conviction. Then decide.</VadText>
          <VadText variant="caption" tone="secondary">
            Market price shows how participants are positioned; the live clock shows how much decision time remains; published evidence still determines the result.
          </VadText>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
          <StatePill label="State" value={marketState.label} tone={marketState.tradeOpen ? 'yes' : 'brand'} />
          <StatePill label="Time" value={timing.compact} tone={timing.tone === 'warning' || timing.tone === 'danger' ? 'warning' : 'brand'} />
          <StatePill label="Currency" value={market.asset_code} tone="brand" />
        </View>

        {!density.phone ? (
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <VadButton
              label={tradeCapabilityLoading ? 'Checking availability' : marketState.tradeOpen && canTrade ? 'Trade this market' : 'View trading status'}
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

      <VadProgressiveSection
        title="Market facts"
        eyebrow="DETAILS"
        description="The exact close time, activity, currency and market structure."
        icon="markets"
        summary={<VadText variant="caption" tone="tertiary">{market.category ?? 'General'} · {market.asset_code} · {timing.compact}</VadText>}
      >
        <MarketTimeStatus market={market} showAbsolute />
        <Fact label="Category" value={market.category ?? 'General'} />
        <Fact label="Currency" value={market.asset_code} />
        <Fact label="Type" value={friendlyEnum(market.market_type)} />
        <Fact label="Last trade" value={lastTrade ? `Traded ${lastTrade}` : 'No trades yet'} />
      </VadProgressiveSection>

      <VadProgressiveSection
        title="Live market timeline"
        eyebrow="MARKET LIFECYCLE"
        description="Follow the market from open trading through official result and payout."
        icon="activity"
        defaultExpanded
      >
        <Lifecycle market={market} />
      </VadProgressiveSection>

      <VadProgressiveSection
        title="How to read the price"
        eyebrow="PRICE EDUCATION"
        description="A high YES or NO price represents market conviction, not a guaranteed result."
        icon="portfolio"
        variant="brand"
      >
        <VadText variant="bodyStrong">A market price is not the final result.</VadText>
        <VadText variant="caption" tone="secondary">
          For example, a 90% YES price means traders strongly favour YES. The final result can still be NO if the published rules and evidence support NO.
        </VadText>
      </VadProgressiveSection>
    </View>
  );
}

function Lifecycle({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const now = useLiveNow();
  const status = market.status.toUpperCase();
  const timing = describeMarketTiming(market.closes_at, market.status, now);
  const tradeDone = ['CLOSED', 'AWAITING_ORACLE', 'RESOLVING', 'RESOLVED', 'FINALIZED', 'SETTLEMENT_PENDING', 'SETTLED', 'VOID', 'VOIDED', 'CANCELLED'].includes(status);
  const resolutionDone = ['RESOLVED', 'FINALIZED', 'SETTLEMENT_PENDING', 'SETTLED', 'VOID', 'VOIDED'].includes(status);
  const settlementDone = status === 'SETTLED' || status === 'VOID' || status === 'VOIDED';
  const resolutionActive = ['CLOSED', 'AWAITING_ORACLE', 'RESOLVING'].includes(status);
  const settlementActive = ['RESOLVED', 'FINALIZED', 'SETTLEMENT_PENDING'].includes(status);

  const tradingBody = tradeDone
    ? timing.detail
    : status === 'SUSPENDED'
      ? `${timing.compact}. Trading is paused until the market is reopened or closed.`
      : `${timing.headline}. Orders remain subject to the authoritative market state.`;
  const resultBody = resolutionDone
    ? status === 'VOID' || status === 'VOIDED'
      ? 'The market has been voided under its resolution policy.'
      : 'The official result is final. The market can now move through settlement.'
    : resolutionActive
      ? 'Trading is closed. VAD is checking the published criteria and eligible evidence for the official result.'
      : `Result review follows the trading close. ${timing.isPastClose ? 'The close has been reached.' : `The result stage begins after ${timing.compact.toLowerCase()}.`}`;
  const payoutBody = settlementDone
    ? status === 'SETTLED'
      ? `Settlement is complete in ${market.asset_code}.`
      : 'This market was voided; settlement follows the applicable void policy.'
    : settlementActive
      ? `The result is final. Eligible positions are being prepared for payout in ${market.asset_code}.`
      : `Eligible winning positions are paid in ${market.asset_code} after the result becomes final.`;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <MarketTimeStatus market={market} showAbsolute />
      <View style={{ flexDirection: density.width >= 620 ? 'row' : 'column', gap: theme.spacing.xs }}>
        <LifecycleStep
          number="1"
          title="Trading"
          body={tradingBody}
          state={tradeDone ? 'complete' : 'active'}
        />
        <LifecycleStep
          number="2"
          title="Official result"
          body={resultBody}
          state={resolutionDone ? 'complete' : resolutionActive ? 'active' : 'waiting'}
        />
        <LifecycleStep
          number="3"
          title="Payout"
          body={payoutBody}
          state={settlementDone ? 'complete' : settlementActive ? 'active' : 'waiting'}
        />
      </View>
    </View>
  );
}

function LifecycleStep({ number, title, body, state }: { number: string; title: string; body: string; state: 'active' | 'complete' | 'waiting' }) {
  const theme = useVadTheme();
  const active = state === 'active';
  const complete = state === 'complete';
  const tone = complete ? 'yes' : active ? 'brand' : 'tertiary';
  return (
    <View style={{ flex: 1, minWidth: 0, minHeight: 118, borderRadius: theme.radius.lg, backgroundColor: active ? theme.colors.brandSoft : complete ? theme.colors.yesSoft : theme.colors.surfaceMuted, borderWidth: 1, borderColor: active ? theme.colors.brandPrimary : complete ? theme.colors.yes : theme.colors.border, padding: theme.spacing.sm, gap: 5 }}>
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
  const rules = [
    {
      number: '1',
      title: 'The trading clock is live',
      body: 'Orders can only be accepted while the market is in an authoritative open state. The countdown is a live UX guide; final acceptance is still checked by VAD when the order is submitted.',
    },
    {
      number: '2',
      title: 'Price does not decide the outcome',
      body: 'YES and NO prices show what traders currently think. They do not decide the final result.',
    },
    {
      number: '3',
      title: 'Resolution follows evidence',
      body: 'After trading closes, the result follows the market’s published criteria and eligible evidence. Community posts and creator opinions do not decide the outcome.',
    },
    {
      number: '4',
      title: 'Payout follows finality',
      body: `Eligible winning positions are paid in ${market.asset_code} only after the result becomes final. Values from another currency are not mixed into this market.`,
    },
  ];

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 2 }}>
        <VadText variant="caption" tone="brand">MARKET RULES</VadText>
        <VadText variant="heading">Understand timing and resolution before you trade</VadText>
        <VadText variant="caption" tone="secondary">The live market clock stays separate from the evidence that decides the final outcome.</VadText>
      </View>

      <MarketTimeStatus market={market} showAbsolute />

      {rules.map((rule, index) => (
        <VadProgressiveSection
          key={rule.number}
          title={rule.title}
          eyebrow={`RULE ${rule.number}`}
          description={index === 0 ? 'Start here before taking a position.' : undefined}
          defaultExpanded={index === 0}
          variant={index === 0 ? 'brand' : 'surface'}
        >
          <VadText variant="body" tone="secondary">{rule.body}</VadText>
        </VadProgressiveSection>
      ))}

      <VadCard variant="raised" style={{ gap: 3 }}>
        <VadText variant="caption" tone="brand">LIFECYCLE</VadText>
        <VadText variant="bodyStrong">Live trading → Evidence review → Final result → Payout</VadText>
        <VadText variant="caption" tone="secondary">Market conviction can inform your decision, but only the published resolution criteria determine the result.</VadText>
      </VadCard>
    </View>
  );
}

function friendlyEnum(value: string) {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatePill({ label, value, tone = 'secondary' }: { label: string; value: string; tone?: 'secondary' | 'yes' | 'brand' | 'warning' }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: 120, minHeight: 52, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: theme.spacing.sm, paddingVertical: 7, gap: 1 }}>
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
