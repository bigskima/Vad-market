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
        borderRadius: density.phone ? 12 : 14,
        backgroundColor: theme.colors.surface,
        padding: tight ? 9 : 11,
        gap: 9,
        opacity: pressed ? 0.92 : 1,
        ...theme.shadows.subtle,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <MarketThumbnail market={market} size={tight ? 34 : 38} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <VadText variant="caption" tone="tertiary" numberOfLines={1} style={{ fontSize: 10, lineHeight: 13, flexShrink: 1 }}>
              {(market.category ?? 'General').toUpperCase()}
            </VadText>
            <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: theme.colors.borderStrong }} />
            <VadText variant="caption" tone="tertiary" numberOfLines={1} style={{ fontSize: 10, lineHeight: 13 }}>
              {market.asset_code}
            </VadText>
          </View>
          <VadText
            variant="bodyStrong"
            numberOfLines={2}
            ellipsizeMode="tail"
            style={{ fontSize: 13, lineHeight: 16, letterSpacing: -0.15, fontWeight: '600' }}
          >
            {market.title}
          </VadText>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3, maxWidth: density.phone ? 74 : 100 }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 999,
            backgroundColor: isOpen ? theme.colors.yesSoft : theme.colors.surfaceRaised,
          }}>
            <View style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              backgroundColor: isOpen ? theme.colors.yes : theme.colors.textTertiary,
            }} />
            <VadText variant="caption" tone={isOpen ? 'yes' : 'tertiary'} numberOfLines={1} style={{ fontSize: 10, lineHeight: 13 }}>
              {isOpen ? 'Live' : timing.statusLabel}
            </VadText>
          </View>
          <VadText variant="caption" tone="tertiary" numberOfLines={1} style={{ textAlign: 'right', fontSize: 10, lineHeight: 13 }}>
            {timing.primaryTiming}
          </VadText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 6 }}>
        <PriceTile label="YES" value={yes} positive compact={tight} />
        <PriceTile label="NO" value={no} positive={false} compact={tight} />
      </View>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          paddingTop: 7,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <VadIcon name="activity" size={12} tone="tertiary" />
          <VadText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 10, lineHeight: 13 }}>
            {hasVolume ? `${formatVolume(volume)} ${market.asset_code}` : 'No volume'}
          </VadText>
        </View>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
          <VadIcon name="community" size={12} tone="tertiary" />
          <VadText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 10, lineHeight: 13 }}>
            {hasParticipants ? `${participants.toLocaleString()} traders` : 'No traders'}
          </VadText>
        </View>
        <VadIcon name="chevronRight" size={12} tone="tertiary" />
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
  const foreground = positive ? theme.colors.info : theme.colors.no;
  const background = positive ? theme.colors.infoSoft : theme.colors.noSoft;
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: compact ? 29 : 32,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 5,
        borderRadius: 7,
        paddingHorizontal: compact ? 8 : 10,
        paddingVertical: 4,
        backgroundColor: background,
        borderWidth: 1,
        borderColor: positive ? 'rgba(77,163,255,0.12)' : 'rgba(240,91,106,0.12)',
      }}
    >
      <VadText variant="caption" style={{ color: foreground, fontSize: 10, lineHeight: 13, fontWeight: '700' }}>{label}</VadText>
      <VadText variant="bodyStrong" style={{ color: foreground, fontSize: compact ? 12 : 13, lineHeight: 16, fontWeight: '700' }}>
        {value}
      </VadText>
    </View>
  );
}
