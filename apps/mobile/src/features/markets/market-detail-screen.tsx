import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
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

      <ScrollView
        horizontal={compactTabs}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          minWidth: compactTabs ? undefined : '100%',
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
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
                minHeight: 46,
                alignItems: 'center',
                justifyContent: 'center',
                borderBottomWidth: 2,
                borderBottomColor: selected
                  ? theme.colors.brandPrimary
                  : 'transparent',
                opacity: pressed ? 0.68 : 1,
              })}
            >
              <VadText
                variant="caption"
                tone={selected ? 'brand' : 'secondary'}
              >
                {item}
              </VadText>
            </Pressable>
          );
        })}
      </ScrollView>

      {tab === 'Overview' ? (
        <Overview
          market={market}
          canTrade={canTrade}
          tradeCapabilityLoading={tradeCapabilityLoading}
          onTrade={() => setTab('Trade')}
          onDiscuss={() => setTab('Discussion')}
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
    </View>
  );
}

function Overview({
  market,
  canTrade,
  tradeCapabilityLoading,
  onTrade,
  onDiscuss,
}: {
  market: MarketCatalogItem;
  canTrade: boolean;
  tradeCapabilityLoading: boolean;
  onTrade: () => void;
  onDiscuss: () => void;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 780;

  return (
    <View
      style={{
        flexDirection: wide ? 'row' : 'column',
        alignItems: 'flex-start',
        gap: wide ? theme.spacing.xxl : theme.spacing.lg,
      }}
    >
      <View style={{ flex: 1.1, width: '100%', gap: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.xs }}>
          <VadText variant="label" tone="brand">MARKET OVERVIEW</VadText>
          <VadText variant="heading">What this market asks</VadText>
          <VadText tone="secondary">{market.title}</VadText>
        </View>

        <View
          style={{
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.brandPrimary,
            backgroundColor: theme.colors.brandSoft,
            padding: theme.spacing.md,
            gap: 2,
          }}
        >
          <VadText variant="bodyStrong">
            Price discovery and resolution are separate.
          </VadText>
          <VadText variant="caption" tone="secondary">
            YES and NO prices reflect current trading. The final outcome is
            determined independently under the approved market policy.
          </VadText>
        </View>

        <View
          style={{
            flexDirection: wide ? 'row' : 'column',
            gap: theme.spacing.sm,
          }}
        >
          <VadButton
            label={
              tradeCapabilityLoading
                ? 'Checking trade availability'
                : canTrade
                  ? 'Trade this market'
                  : 'View trade availability'
            }
            onPress={onTrade}
            style={{ flex: 1 }}
          />
          <VadButton
            label="Open discussion"
            variant="secondary"
            onPress={onDiscuss}
            style={{ flex: 1 }}
          />
        </View>
      </View>

      <View style={{ flex: 0.9, width: '100%' }}>
        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          <Fact label="Category" value={market.category ?? 'General'} />
          <Fact label="Settlement asset" value={market.asset_code} />
          <Fact label="Market type" value={market.market_type} />
          <Fact
            label="Close time"
            value={
              market.closes_at
                ? new Date(market.closes_at).toLocaleString()
                : 'Defined by market policy'
            }
          />
          <Fact
            label="Last activity"
            value={
              market.last_trade_at
                ? new Date(market.last_trade_at).toLocaleString()
                : 'No completed trades yet'
            }
          />
        </View>
      </View>
    </View>
  );
}

function Rules({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 820;

  const rules = [
    {
      number: '1',
      title: 'Trading closes before resolution',
      body: market.closes_at
        ? 'Trading is scheduled to close on ' +
          new Date(market.closes_at).toLocaleString() +
          '.'
        : 'The closing time follows the approved market policy.',
    },
    {
      number: '2',
      title: 'The market price does not decide the answer',
      body: 'YES and NO prices represent participant conviction. The final result comes from the approved resolution process.',
    },
    {
      number: '3',
      title: 'Settlement follows the authoritative ledger',
      body:
        'Positions and payouts settle in ' +
        market.asset_code +
        ' only after the market has a final outcome.',
    },
  ];

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">MARKET RULES</VadText>
        <VadText variant="heading">Resolution & settlement.</VadText>
        <VadText tone="secondary">
          These are the operating boundaries users should understand before
          taking a position.
        </VadText>
      </View>

      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.md,
          alignItems: 'stretch',
        }}
      >
        {rules.map((rule) => (
          <Rule
            key={rule.number}
            number={rule.number}
            title={rule.title}
            body={rule.body}
            wide={wide}
          />
        ))}
      </View>

      <View
        style={{
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
          paddingVertical: theme.spacing.md,
          gap: 2,
        }}
      >
        <VadText variant="bodyStrong">
          Trading → Resolution → Settlement
        </VadText>
        <VadText variant="caption" tone="secondary">
          VAD keeps these as separate governed stages. A popular market outcome
          does not become true merely because it has the higher price.
        </VadText>
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        minHeight: 58,
        paddingVertical: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <VadText variant="caption" tone="tertiary" style={{ flex: 1 }}>
        {label}
      </VadText>
      <VadText
        variant="bodyStrong"
        style={{ flex: 1.25, textAlign: 'right' }}
      >
        {value}
      </VadText>
    </View>
  );
}

function Rule({
  number,
  title,
  body,
  wide,
}: {
  number: string;
  title: string;
  body: string;
  wide: boolean;
}) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        flex: wide ? 1 : undefined,
        minHeight: wide ? 170 : undefined,
        borderTopWidth: 1,
        borderColor: theme.colors.border,
        paddingTop: theme.spacing.md,
        gap: theme.spacing.md,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: theme.colors.brandSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <VadText variant="label" tone="brand">{number}</VadText>
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="bodyStrong">{title}</VadText>
        <VadText variant="caption" tone="secondary">{body}</VadText>
      </View>
    </View>
  );
}
