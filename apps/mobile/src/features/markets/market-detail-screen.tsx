import { useState } from 'react';
import { Pressable, View } from 'react-native';

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
  canCreatePost,
  onPlaced,
  onOpenMarket,
}: {
  market: MarketCatalogItem;
  markets: MarketCatalogItem[];
  canTrade: boolean;
  canCreatePost: boolean;
  onPlaced: () => Promise<void>;
  onOpenMarket: (market: MarketCatalogItem) => void;
}) {
  const theme = useVadTheme();
  const [tab, setTab] = useState<DetailTab>('Overview');

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <MarketDetailHeader market={market} />

      <View
        style={{
          flexDirection: 'row',
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
              style={{
                flex: 1,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderBottomWidth: 2,
                borderBottomColor: selected ? theme.colors.brandPrimary : 'transparent',
              }}
            >
              <VadText variant="caption" tone={selected ? 'brand' : 'secondary'}>
                {item}
              </VadText>
            </Pressable>
          );
        })}
      </View>

      {tab === 'Overview' ? <Overview market={market} /> : null}

      {tab === 'Trade' ? (
        <TradingTicket market={market} canTrade={canTrade} onPlaced={onPlaced} />
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

function Overview({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="heading">What this market asks</VadText>
        <VadText tone="secondary">{market.title}</VadText>
      </View>

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

      <View
        style={{
          borderRadius: theme.radius.xl,
          backgroundColor: theme.colors.surfaceRaised,
          padding: theme.spacing.lg,
          gap: theme.spacing.xs,
        }}
      >
        <VadText variant="bodyStrong">
          Probability is a market signal, not the final outcome.
        </VadText>
        <VadText variant="caption" tone="secondary">
          The displayed YES and NO prices reflect current trading. Resolution is determined separately under the approved market policy.
        </VadText>
      </View>
    </View>
  );
}

function Rules({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="heading">Resolution & trading rules</VadText>
        <VadText tone="secondary">
          These safeguards keep price discovery separate from the final market outcome.
        </VadText>
      </View>

      <Rule
        number="1"
        title="Market closes before resolution"
        body={
          market.closes_at
            ? 'Trading is scheduled to close on ' +
              new Date(market.closes_at).toLocaleString() +
              '.'
            : 'The closing time follows the approved market policy.'
        }
      />
      <Rule
        number="2"
        title="The market price does not decide the answer"
        body="YES and NO prices represent participant conviction. The final result comes from the approved resolution process."
      />
      <Rule
        number="3"
        title="Settlement follows the authoritative ledger"
        body={
          'Positions and payouts settle in ' +
          market.asset_code +
          ' only after the market has a final outcome.'
        }
      />

      <View
        style={{
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.brandSoft,
          padding: theme.spacing.md,
        }}
      >
        <VadText variant="caption" tone="brand">
          VAD keeps trading, resolution and settlement as separate governed steps.
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
        style={{ flex: 1, textAlign: 'right' }}
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
}: {
  number: string;
  title: string;
  body: string;
}) {
  const theme = useVadTheme();

  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
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
      <View style={{ flex: 1, gap: 3 }}>
        <VadText variant="bodyStrong">{title}</VadText>
        <VadText variant="caption" tone="secondary">{body}</VadText>
      </View>
    </View>
  );
}
