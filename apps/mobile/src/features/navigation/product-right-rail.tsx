import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { PublicNotice } from '@/services/home-content-api';
import type { MarketCatalogItem } from '@/services/market-api';

export function ProductRightRail({
  markets,
  notice,
  onOpenMarkets,
  onOpenWallet,
  onOpenCommunity,
}: {
  markets: MarketCatalogItem[];
  notice?: PublicNotice | null;
  onOpenMarkets: () => void;
  onOpenWallet: () => void;
  onOpenCommunity: () => void;
}) {
  const theme = useVadTheme();
  const live = markets.filter((market) => market.status === 'OPEN' || market.status === 'ACTIVE').length;
  const traded = markets.filter((market) => Boolean(market.last_trade_at)).length;
  const categories = new Set(markets.map((market) => market.category).filter(Boolean)).size;

  return (
    <View style={{ width: 292, minWidth: 292, gap: theme.spacing.md, paddingVertical: theme.spacing.lg, paddingRight: theme.spacing.lg }}>
      <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
          <View style={{ gap: 2 }}>
            <VadText variant="bodyStrong">Market pulse</VadText>
            <VadText variant="caption" tone="tertiary">What&apos;s happening now</VadText>
          </View>
          <VadIcon name="activity" size={20} tone="brand" />
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
          <Metric value={live} label="Live" tone="yes" />
          <Metric value={traded} label="Traded" />
          <Metric value={categories} label="Topics" />
        </View>

        <RailLink label="Browse all markets" icon="markets" onPress={onOpenMarkets} />
      </VadCard>

      {notice ? (
        <VadCard variant="brand" style={{ gap: theme.spacing.xs }}>
          <VadText variant="caption" tone="brand">VAD UPDATE</VadText>
          <VadText variant="bodyStrong">{notice.tone === 'WARNING' ? 'Service notice' : 'Latest update'}</VadText>
          <VadText variant="caption" tone="secondary">{notice.message}</VadText>
        </VadCard>
      ) : null}

      <VadCard style={{ gap: theme.spacing.xs }}>
        <VadText variant="bodyStrong">Quick access</VadText>
        <VadText variant="caption" tone="tertiary">Go straight to what you need.</VadText>
        <View style={{ marginTop: theme.spacing.xs, gap: theme.spacing.xxs }}>
          <RailLink label="Wallet" icon="wallet" onPress={onOpenWallet} />
          <RailLink label="Community" icon="community" onPress={onOpenCommunity} />
        </View>
      </VadCard>

      <VadText variant="caption" tone="tertiary" style={{ paddingHorizontal: theme.spacing.xs }}>
        Prices show what traders currently think. Each market is decided by its published rules.
      </VadText>
    </View>
  );
}

function Metric({ value, label, tone = 'primary' }: { value: number; label: string; tone?: 'primary' | 'yes' }) {
  const theme = useVadTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, padding: theme.spacing.xs, gap: 1 }}>
      <VadText variant="heading" tone={tone}>{value}</VadText>
      <VadText variant="caption" tone="tertiary" numberOfLines={1}>{label}</VadText>
    </View>
  );
}

function RailLink({ label, icon, onPress }: { label: string; icon: 'markets' | 'wallet' | 'community'; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: pressed ? theme.colors.surfaceRaised : 'transparent',
      })}
    >
      <VadIcon name={icon} size={17} tone="secondary" />
      <VadText variant="label" style={{ flex: 1 }}>{label}</VadText>
      <VadIcon name="chevronRight" size={14} tone="tertiary" />
    </Pressable>
  );
}
