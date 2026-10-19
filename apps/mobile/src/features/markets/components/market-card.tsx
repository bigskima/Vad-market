import { useEffect, useRef, useState } from 'react';
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
import { MarketProbabilityBar } from './market-probability-bar';

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
  const volume = Number(market.total_volume ?? 0);
  const participants = Number(market.participant_count ?? 0);
  const hasVolume = Number.isFinite(volume) && volume > 0;
  const hasParticipants = Number.isFinite(participants) && participants > 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${market.title}. YES ${yes}, NO ${no}. Currency ${market.asset_code}. ${timing.statusLabel}. ${timing.primaryTiming}.`}
      accessibilityHint="Opens the market timeline, trading, discussion and resolution rules."
      style={({ pressed }) => ({
        width: '100%',
        minHeight: 0,
        borderWidth: 1,
        borderColor: pressed ? theme.colors.brandPrimary : theme.colors.border,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        padding: tight ? theme.spacing.sm : theme.spacing.md,
        gap: theme.spacing.sm,
        opacity: pressed ? 0.92 : 1,
        ...theme.shadows.subtle,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <MarketThumbnail market={market} size={tight ? 38 : 42} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <VadText variant="caption" tone="tertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
              {(market.category ?? 'General').toUpperCase()}
            </VadText>
            <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: theme.colors.borderStrong }} />
            <VadText variant="caption" tone="tertiary" numberOfLines={1} >
              {market.asset_code}
            </VadText>
          </View>
          <VadText
            variant="bodyStrong"
            numberOfLines={2}
            ellipsizeMode="tail"
            style={{ letterSpacing: -0.2 }}
          >
            {market.title}
          </VadText>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2, maxWidth: density.phone ? 82 : 100 }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: theme.spacing.xs,
            paddingVertical: theme.spacing.xxs,
            borderRadius: theme.radius.pill,
            backgroundColor: isOpen ? theme.colors.yesSoft : theme.colors.surfaceRaised,
          }}>
            <View style={{
              width: 4,
              height: 4,
              borderRadius: 3,
              backgroundColor: isOpen ? theme.colors.yes : theme.colors.textTertiary,
            }} />
            <VadText variant="caption" tone={isOpen ? 'yes' : 'tertiary'} numberOfLines={1} >
              {isOpen ? 'Live' : timing.statusLabel}
            </VadText>
          </View>
          <VadText variant="caption" tone="tertiary" numberOfLines={1} style={{ textAlign: 'right' }}>
            {timing.primaryTiming}
          </VadText>
        </View>
      </View>

      <View style={{ gap: 7 }}>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          <PriceTile label="YES" value={yes} rawValue={market.yes_price} positive compact={tight} />
          <PriceTile label="NO" value={no} rawValue={market.no_price} positive={false} compact={tight} />
        </View>
        <MarketProbabilityBar yes={market.yes_price} no={market.no_price} />
      </View>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          paddingTop: theme.spacing.xxs,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <VadIcon name="activity" size={16} tone="tertiary" />
          <VadText variant="caption" tone="secondary" numberOfLines={1} >
            {hasVolume ? `${formatVolume(volume)} ${market.asset_code}` : 'No volume'}
          </VadText>
        </View>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
          <VadIcon name="community" size={10} tone="tertiary" />
          <VadText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 9, lineHeight: 11 }}>
            {hasParticipants ? `${participants.toLocaleString()} traders` : 'No traders'}
          </VadText>
        </View>
        <VadIcon name="chevronRight" size={10} tone="tertiary" />
      </View>
    </Pressable>
  );
}

function formatVolume(value: number) {
  return new Intl.NumberFormat('en', {
    notation: value >= 100_000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 100_000 ? 1 : 2,
  }).format(value);
}

function PriceTile({
  label,
  value,
  rawValue,
  positive,
  compact,
}: {
  label: string;
  value: string;
  rawValue?: number | string | null;
  positive: boolean;
  compact: boolean;
}) {
  const theme = useVadTheme();
  const numericValue = rawValue == null ? Number.NaN : Number(rawValue);
  const previousValue = useRef(Number.isFinite(numericValue) ? numericValue : null);
  const [movement, setMovement] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    const previous = previousValue.current;
    if (!Number.isFinite(numericValue)) return;
    previousValue.current = numericValue;
    if (previous === null || previous === numericValue) return;

    setMovement(numericValue > previous ? 'up' : 'down');
    const timeout = setTimeout(() => setMovement(null), theme.motion.slow);
    return () => clearTimeout(timeout);
  }, [numericValue, theme.motion.slow]);

  const foreground = positive ? theme.colors.info : theme.colors.no;
  const baseBackground = positive ? theme.colors.infoSoft : theme.colors.noSoft;
  const background = movement === 'up'
    ? theme.colors.yesSoft
    : movement === 'down'
      ? theme.colors.noSoft
      : baseBackground;
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: compact ? 44 : 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.xxs,
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: background,
        borderWidth: 1,
        borderColor: movement === 'up' ? theme.colors.yes : movement === 'down' ? theme.colors.no : (positive ? theme.colors.info : theme.colors.no),
      }}
    >
      <VadText variant="caption" style={{ color: foreground }}>{label}</VadText>
      <VadText variant="bodyStrong" style={{ color: foreground, fontVariant: ['tabular-nums'] }}>
        {value}
      </VadText>
    </View>
  );
}
