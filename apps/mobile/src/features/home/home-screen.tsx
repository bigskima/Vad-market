import {
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadText } from '@/components/ui/vad-text';
import { MarketCard } from '@/features/markets/components/market-card';
import { money } from '@/features/markets/format';
import { SocialConvictionFeed } from '@/features/social/social-conviction-feed';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem, WalletRow } from '@/services/market-api';

export function HomeScreen({
  markets,
  ngn,
  onOpenMarket,
  onExploreMarkets,
  onOpenWallet,
  onOpenCommunity,
}: {
  markets: MarketCatalogItem[];
  ngn?: WalletRow;
  onOpenMarket: (market: MarketCatalogItem) => void;
  onExploreMarkets: () => void;
  onOpenWallet: () => void;
  onOpenCommunity: () => void;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const active = markets.filter(
    (market) => market.status === 'OPEN' || market.status === 'ACTIVE',
  );
  const categories = [
    ...new Set(markets.map((market) => market.category).filter(Boolean)),
  ].slice(0, 8) as string[];
  const featured = [...markets]
    .sort(
      (a, b) =>
        Number(Boolean(b.last_trade_at)) -
          Number(Boolean(a.last_trade_at)) ||
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
    .slice(0, 5);

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.lg,
          alignItems: 'stretch',
        }}
      >
        <View
          style={{
            flex: 1.2,
            justifyContent: 'center',
            gap: theme.spacing.xs,
            paddingVertical: wide ? theme.spacing.lg : 0,
          }}
        >
          <VadText variant="label" tone="brand">MARKET PULSE</VadText>
          <VadText variant="title">Find the questions moving now.</VadText>
          <VadText tone="secondary">
            Follow live probability, inspect the market, and take a position
            when your conviction is stronger than the crowd.
          </VadText>

          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.xl,
              marginTop: theme.spacing.sm,
            }}
          >
            <Metric label="Live markets" value={String(active.length)} />
            <Metric label="Categories" value={String(categories.length)} />
          </View>
        </View>

        <Pressable
          onPress={onOpenWallet}
          style={({ pressed }) => ({
            flex: 0.8,
            borderRadius: theme.radius.xl,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceRaised,
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
            opacity: pressed ? 0.82 : 1,
          })}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: theme.spacing.md,
              alignItems: 'flex-end',
            }}
          >
            <View style={{ flex: 1, gap: theme.spacing.xxs }}>
              <VadText variant="caption" tone="secondary">
                Available balance
              </VadText>
              <VadText variant="title">{money(ngn?.available)}</VadText>
            </View>
            <VadText variant="label" tone="brand">Wallet →</VadText>
          </View>

          <View style={{ flexDirection: 'row', gap: theme.spacing.xl }}>
            <Metric label="Reserved" value={money(ngn?.reserved)} />
            <Metric
              label="Pending"
              value={money(ngn?.withdrawal_pending)}
            />
          </View>
        </Pressable>
      </View>

      {categories.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: theme.spacing.xs }}
        >
          <Pressable
            onPress={onExploreMarkets}
            style={{
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.brandSoft,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.xs,
            }}
          >
            <VadText variant="caption" tone="brand">All markets</VadText>
          </Pressable>

          {categories.map((category) => (
            <Pressable
              key={category}
              onPress={onExploreMarkets}
              style={{
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: theme.colors.border,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.xs,
              }}
            >
              <VadText variant="caption" tone="secondary">{category}</VadText>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={{ gap: theme.spacing.md }}>
        <VadSectionHeader
          title="Trending now"
          subtitle="Recently active markets"
          actionLabel="See all"
          onAction={onExploreMarkets}
        />

        {featured.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: theme.spacing.md }}
          >
            {featured.map((market) => (
              <View
                key={market.instrument_public_id}
                style={{ width: wide ? 350 : 310 }}
              >
                <MarketCard
                  market={market}
                  onPress={() => onOpenMarket(market)}
                />
              </View>
            ))}
          </ScrollView>
        ) : (
          <VadEmptyState
            title="No live markets yet"
            body="Approved markets will appear here once governance activates them."
          />
        )}
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <VadSectionHeader
          title="Community"
          subtitle="Recent reasoning from people watching the markets."
          actionLabel="Open feed"
          onAction={onOpenCommunity}
        />
        <SocialConvictionFeed
          markets={markets}
          canCreatePost={false}
          showComposer={false}
          maxPosts={3}
          onOpenMarket={onOpenMarket}
        />
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 92, gap: 2 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="bodyStrong">{value}</VadText>
    </View>
  );
}
