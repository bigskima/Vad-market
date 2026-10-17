import { Pressable, View } from 'react-native';

import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useLiveNow } from '@/hooks/use-live-now';
import { useProductDensity } from '@/hooks/use-product-density';
import { getMarketTiming } from '@/lib/market-timing';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { probability } from '../format';
import { MarketProbabilityBar } from './market-probability-bar';
import { MarketThumbnail } from './market-thumbnail';

export function MarketCard({
  market,
  onPress,
  compact = false,
}: {
  market: MarketCatalogItem;
  onPress: () => void;
  compact?: boolean;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const now = useLiveNow();
  const timing = getMarketTiming(market, now);
  const tight = compact || density.compact;
  const isOpen = timing.tradingOpen;
  const yes = probability(market.yes_price);
  const no = probability(market.no_price);
  const statusTone =
    isOpen
      ? 'yes'
      : timing.stage === 'SETTLED'
        ? 'yes'
        : timing.stage === 'SETTLEMENT_PENDING'
          ? 'brand'
          : 'neutral';
  const volume = Number(market.total_volume ?? 0);
  const hasVolume = Number.isFinite(volume) && volume > 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${market.title}. YES ${yes}, NO ${no}. Currency ${market.asset_code}. ${timing.statusLabel}. ${timing.primaryTiming}.`}
      accessibilityHint="Opens the market timeline, trading, discussion and resolution rules."
      style={({ pressed }) => ({
        minHeight: compact ? 112 : density.compact ? 124 : density.phone ? 136 : 148,
        borderWidth: 1,
        borderLeftWidth: 3,
        borderColor: pressed ? theme.colors.brandPrimary : theme.colors.border,
        borderLeftColor: isOpen ? theme.colors.yes : theme.colors.borderStrong,
        borderRadius: compact ? theme.radius.lg : theme.radius.xl,
        backgroundColor: theme.colors.surface,
        padding: compact ? 12 : density.compact ? 14 : 16,
        gap: compact ? 10 : theme.spacing.md,
        justifyContent: 'space-between',
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <View style={{ gap: compact ? 8 : theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            <VadChip label={timing.statusLabel.toUpperCase()} tone={statusTone} />
            <VadText variant="caption" tone="tertiary" numberOfLines={1}>
              {market.category ?? 'General'}
            </VadText>
            <VadText variant="caption" tone="tertiary">· {market.asset_code}</VadText>
          </View>
          <VadText
            variant="caption"
            tone={isOpen ? 'yes' : 'tertiary'}
            numberOfLines={1}
            style={{ maxWidth: compact ? 76 : 108, textAlign: 'right' }}
          >
            {timing.primaryTiming}
          </VadText>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <MarketThumbnail market={market} size={tight ? 42 : 52} />
          <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
            <VadText variant={tight ? 'bodyStrong' : 'heading'} numberOfLines={3}>
              {market.title}
            </VadText>
          </View>
        </View>

        <MarketProbabilityBar yes={market.yes_price} no={market.no_price} />
      </View>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          paddingTop: 9,
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {hasVolume ? (
            <VadText variant="caption" tone="secondary" numberOfLines={1}>
              Vol. {formatVolume(volume)} {market.asset_code}
            </VadText>
          ) : null}
          <VadText variant="caption" tone="tertiary" numberOfLines={1}>
            {market.last_trade_at
              ? relativeTradeLabel(market.last_trade_at, now)
              : hasVolume
                ? ''
                : 'No trades yet'}
          </VadText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <VadText variant="caption" tone="brand">{isOpen ? 'Trade' : 'Details'}</VadText>
          <VadIcon name="chevronRight" size={14} tone="brand" />
        </View>
      </View>
    </Pressable>
  );
}

function relativeTradeLabel(value: string, now: number) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Recently traded';
  const elapsed = Math.max(0, now - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Traded just now';
  if (minutes < 60) return `Traded ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Traded ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Traded ${days}d ago`;
}

function formatVolume(value: number) {
  return new Intl.NumberFormat('en', {
    notation: value >= 100_000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 100_000 ? 1 : 2,
  }).format(value);
}

