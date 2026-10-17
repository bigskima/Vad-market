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
        borderRadius: density.phone ? 10 : 12,
        backgroundColor: theme.colors.surface,
        padding: tight ? 7 : 8,
        gap: 7,
        opacity: pressed ? 0.92 : 1,
        ...theme.shadows.subtle,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
        <MarketThumbnail market={market} size={tight ? 30 : 34} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <VadText variant="caption" tone="tertiary" numberOfLines={1} style={{ fontSize: 9, lineHeight: 11, flexShrink: 1 }}>
              {(market.category ?? 'General').toUpperCase()}
            </VadText>
            <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: theme.colors.borderStrong }} />
            <VadText variant="caption" tone="tertiary" numberOfLines={1} style={{ fontSize: 9, lineHeight: 11 }}>
              {market.asset_code}
            </VadText>
          </View>
          <VadText
            variant="bodyStrong"
            numberOfLines={2}
            ellipsizeMode="tail"
            style={{ fontSize: 12, lineHeight: 15, letterSpacing: -0.12, fontWeight: '600' }}
          >
            {market.title}
          </VadText>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2, maxWidth: density.phone ? 68 : 88 }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 5,
            paddingVertical: 1,
            borderRadius: 999,
            backgroundColor: isOpen ? theme.colors.yesSoft : theme.colors.surfaceRaised,
          }}>
            <View style={{
              width: 4,
              height: 4,
              borderRadius: 3,
              backgroundColor: isOpen ? theme.colors.yes : theme.colors.textTertiary,
            }} />
            <VadText variant="caption" tone={isOpen ? 'yes' : 'tertiary'} numberOfLines={1} style={{ fontSize: 9, lineHeight: 11 }}>
              {isOpen ? 'Live' : timing.statusLabel}
            </VadText>
          </View>
          <VadText variant="caption" tone="tertiary" numberOfLines={1} style={{ textAlign: 'right', fontSize: 9, lineHeight: 11 }}>
            {timing.primaryTiming}
          </VadText>
        </View>
      </View>

      <View style={{ gap: 5 }}>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          <PriceTile label="YES" value={yes} positive compact={tight} />
          <PriceTile label="NO" value={no} positive={false} compact={tight} />
        </View>
        <MarketProbabilityBar yes={market.yes_price} no={market.no_price} />
      </View>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          paddingTop: 4,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <VadIcon name="activity" size={10} tone="tertiary" />
          <VadText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 9, lineHeight: 11 }}>
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
  positive,
  compact,
}: {
  label: string;
  value: string;
  positive: boolean;
  compact: boolean;
}) {
  const theme = useVadTheme();
  const foreground = positive ? theme.colors.yes : theme.colors.no;
  const background = positive ? theme.colors.yesSoft : theme.colors.noSoft;
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: compact ? 26 : 29,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 4,
        borderRadius: 7,
        paddingHorizontal: compact ? 7 : 8,
        paddingVertical: 2,
        backgroundColor: background,
        borderWidth: 1,
        borderColor: positive ? theme.colors.yes : theme.colors.no,
      }}
    >
      <VadText variant="caption" style={{ color: foreground, fontSize: 9, lineHeight: 11, fontWeight: '700' }}>{label}</VadText>
      <VadText variant="bodyStrong" style={{ color: foreground, fontSize: compact ? 12 : 13, lineHeight: 15, fontWeight: '700' }}>
        {value}
      </VadText>
    </View>
  );
}
