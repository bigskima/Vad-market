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
import { money, pct } from '@/features/markets/format';
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
  const wide = width >= 860;

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

  const spotlight = featured[0];
  const trending = featured.slice(1);

  return (
    <View style={{ gap: theme.spacing.xxxl }}>
      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.lg,
          alignItems: 'stretch',
        }}
      >
        <View
          style={{
            flex: 1.15,
            justifyContent: 'center',
            gap: theme.spacing.md,
            paddingVertical: wide ? theme.spacing.md : 0,
          }}
        >
          <View style={{ gap: theme.spacing.xs }}>
            <VadText variant="label" tone="brand">MARKET PULSE</VadText>
            <VadText variant="title">What is the crowd pricing now?</VadText>
            <VadText tone="secondary">
              Scan active questions, compare conviction and open the market only
              when you want the full rules, discussion or trade flow.
            </VadText>
          </View>

          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.xl,
              flexWrap: 'wrap',
            }}
          >
            <Metric label="Live" value={String(active.length)} />
            <Metric label="Categories" value={String(categories.length)} />
            <Metric
              label="Recently traded"
              value={String(markets.filter((market) => market.last_trade_at).length)}
            />
          </View>

          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.sm,
              flexWrap: 'wrap',
            }}
          >
            <QuickLink label="Browse markets" onPress={onExploreMarkets} />
            <QuickLink label="Community" onPress={onOpenCommunity} />
            <QuickLink label="Wallet" onPress={onOpenWallet} />
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onOpenWallet}
          style={({ pressed }) => ({
            flex: 0.85,
            borderRadius: theme.radius.xl,
            backgroundColor: theme.colors.surfaceRaised,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: theme.spacing.lg,
            gap: theme.spacing.lg,
            opacity: pressed ? 0.78 : 1,
          })}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: theme.spacing.md,
              alignItems: 'flex-start',
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <VadText variant="caption" tone="secondary">
                AVAILABLE TO USE
              </VadText>
              <VadText variant="title">{money(ngn?.available)}</VadText>
            </View>
            <VadText variant="label" tone="brand">Wallet →</VadText>
          </View>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              paddingTop: theme.spacing.md,
              flexDirection: 'row',
              gap: theme.spacing.xl,
              flexWrap: 'wrap',
            }}
          >
            <Metric label="Reserved" value={money(ngn?.reserved)} />
            <Metric
              label="Withdrawal pending"
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
            style={({ pressed }) => ({
              minHeight: 36,
              justifyContent: 'center',
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.brandSoft,
              paddingHorizontal: theme.spacing.md,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <VadText variant="caption" tone="brand">All markets</VadText>
          </Pressable>

          {categories.map((category) => (
            <Pressable
              key={category}
              onPress={onExploreMarkets}
              style={({ pressed }) => ({
                minHeight: 36,
                justifyContent: 'center',
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: theme.colors.border,
                paddingHorizontal: theme.spacing.md,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <VadText variant="caption" tone="secondary">{category}</VadText>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={{ gap: theme.spacing.lg }}>
        <VadSectionHeader
          title="Trending now"
          subtitle="The most recently active market signals."
          actionLabel="See all"
          onAction={onExploreMarkets}
        />

        {spotlight ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenMarket(spotlight)}
            style={({ pressed }) => ({
              borderRadius: theme.radius.xl,
              backgroundColor: theme.colors.brandPrimary,
              padding: wide ? theme.spacing.xl : theme.spacing.lg,
              gap: theme.spacing.lg,
              opacity: pressed ? 0.82 : 1,
            })}
          >
            <View
              style={{
                flexDirection: wide ? 'row' : 'column',
                gap: theme.spacing.xl,
                alignItems: wide ? 'flex-end' : 'stretch',
              }}
            >
              <View style={{ flex: 1, gap: theme.spacing.sm }}>
                <View
                  style={{
                    flexDirection: 'row',
                    gap: theme.spacing.xs,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <VadText variant="caption" tone="inverse">
                    {(spotlight.category ?? 'General').toUpperCase()}
                  </VadText>
                  <VadText variant="caption" tone="inverse">·</VadText>
                  <VadText variant="caption" tone="inverse">
                    {spotlight.status}
                  </VadText>
                </View>
                <VadText variant="title" tone="inverse">
                  {spotlight.title}
                </VadText>
              </View>

              <View
                style={{
                  minWidth: wide ? 220 : undefined,
                  flexDirection: 'row',
                  gap: theme.spacing.sm,
                }}
              >
                <Signal
                  label="YES"
                  value={pct(spotlight.yes_price)}
                  positive
                />
                <Signal
                  label="NO"
                  value={pct(spotlight.no_price)}
                  positive={false}
                />
              </View>
            </View>

            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: 'rgba(255,255,255,0.28)',
                paddingTop: theme.spacing.md,
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: theme.spacing.md,
              }}
            >
              <VadText variant="caption" tone="inverse">
                {spotlight.last_trade_at ? 'Recently traded' : 'Price forming'}
              </VadText>
              <VadText variant="label" tone="inverse">Open market →</VadText>
            </View>
          </Pressable>
        ) : (
          <VadEmptyState
            title="No live markets yet"
            body="Approved markets will appear here once governance activates them."
          />
        )}

        {trending.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: theme.spacing.md }}
          >
            {trending.map((market) => (
              <View
                key={market.instrument_public_id}
                style={{ width: wide ? 340 : 300 }}
              >
                <MarketCard
                  market={market}
                  onPress={() => onOpenMarket(market)}
                />
              </View>
            ))}
          </ScrollView>
        ) : null}
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

function QuickLink({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 38,
        justifyContent: 'center',
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: theme.spacing.md,
        opacity: pressed ? 0.68 : 1,
      })}
    >
      <VadText variant="caption">{label}</VadText>
    </Pressable>
  );
}

function Signal({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        flex: 1,
        minWidth: 96,
        borderRadius: theme.radius.lg,
        backgroundColor: 'rgba(255,255,255,0.12)',
        padding: theme.spacing.md,
        gap: 2,
      }}
    >
      <VadText variant="caption" tone="inverse">{label}</VadText>
      <VadText variant="heading" tone="inverse">{value}</VadText>
      <VadText variant="caption" tone="inverse">
        {positive ? 'Crowd yes' : 'Crowd no'}
      </VadText>
    </View>
  );
}
