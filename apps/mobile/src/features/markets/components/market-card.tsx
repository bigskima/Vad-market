import { Pressable, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useLiveNow } from '@/hooks/use-live-now';
import { useProductDensity } from '@/hooks/use-product-density';
import { getMarketTiming } from '@/lib/market-timing';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { probability } from '../format';
import { MarketThumbnail } from './market-thumbnail';

export function MarketCard({
  market,
  onPress,
  compact = false,
  onSelectOutcome,
}: {
  market: MarketCatalogItem;
  onPress: () => void;
  compact?: boolean;
  onSelectOutcome?: (outcome: 'YES' | 'NO') => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const now = useLiveNow();
  const timing = getMarketTiming(market, now);
  const tight = compact || density.compact;
  const isOpen = timing.tradingOpen;
  const yes = probability(market.yes_price);
  const no = probability(market.no_price);
  const volume = Number(market.total_volume ?? 0);
  const hasVolume = market.total_volume != null && Number.isFinite(volume) && volume >= 0;

  return (
    <View
      style={{
        width: '100%',
        minHeight: tight ? 72 : 88,
        flexDirection: 'row',
        alignItems: 'center',
        gap: tight ? 9 : 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: density.phone ? 17 : 19,
        backgroundColor: theme.colors.surface,
        padding: tight ? 9 : 12,
        ...theme.shadows.subtle,
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Open market: ${market.title}`}
        accessibilityHint="Opens this exact market's details."
        style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: tight ? 9 : 12, opacity: pressed ? 0.72 : 1 })}
      >
        <MarketThumbnail market={market} size={tight ? 54 : 68} />
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <VadText variant="bodyStrong" numberOfLines={2} ellipsizeMode="tail" style={{ fontSize: tight ? 14 : 15, lineHeight: tight ? 18 : 20, letterSpacing: -0.2, fontWeight: '700' }}>
            {market.title}
          </VadText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <VadIcon name="activity" size={13} tone="tertiary" />
            <VadText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 11 }}>
              {hasVolume ? `${formatVolume(volume)} ${market.asset_code} total volume` : 'Volume unavailable'}
            </VadText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: isOpen ? theme.colors.yes : theme.colors.textTertiary }} />
            <VadText variant="caption" tone={isOpen ? 'yes' : 'tertiary'} numberOfLines={1} style={{ fontSize: 10 }}>
              {isOpen ? 'Live' : timing.statusLabel}
            </VadText>
          </View>
        </View>
      </Pressable>
      <View style={{ width: tight ? 122 : 146, flexDirection: 'row', gap: 5 }}>
        <OutcomeTile label="Yes" value={yes} positive compact={tight} onPress={onSelectOutcome ? () => onSelectOutcome('YES') : undefined} />
        <OutcomeTile label="No" value={no} positive={false} compact={tight} onPress={onSelectOutcome ? () => onSelectOutcome('NO') : undefined} />
      </View>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${market.title}`} hitSlop={6} style={({ pressed }) => ({ padding: 2, opacity: pressed ? 0.65 : 1 })}>
        <VadIcon name="chevronRight" size={19} tone="secondary" />
      </Pressable>
    </View>
  );
}

function formatVolume(value: number) {
  return new Intl.NumberFormat('en', {
    notation: value >= 100_000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 100_000 ? 1 : 2,
  }).format(value);
}

function OutcomeTile({ label, value, positive, compact, onPress }: { label: string; value: string; positive: boolean; compact: boolean; onPress?: () => void }) {
  const theme = useVadTheme();
  const foreground = positive ? theme.colors.yes : theme.colors.no;
  const background = positive ? theme.colors.yesSoft : theme.colors.noSoft;
  return (
    <Pressable disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={onPress ? `Trade ${label} on this market at ${value}` : undefined} onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: compact ? 47 : 54, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 3, gap: 0, backgroundColor: background, borderWidth: 1, borderColor: positive ? theme.colors.yes : theme.colors.no, opacity: pressed ? 0.72 : 1 })}>
      <VadText variant="caption" style={{ color: foreground, fontSize: 10, lineHeight: 12 }}>{label}</VadText>
      <VadText variant="bodyStrong" style={{ color: foreground, fontSize: compact ? 13 : 15, lineHeight: 18, fontWeight: '700' }}>{value}</VadText>
    </Pressable>
  );
}
