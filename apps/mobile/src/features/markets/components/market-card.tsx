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
        minHeight: compact ? 176 : density.compact ? 188 : density.phone ? 204 : 214,
        width: '100%',
        borderWidth: 1,
        borderColor: pressed ? theme.colors.brandPrimary : theme.colors.border,
        borderRadius: density.phone ? 20 : 24,
        backgroundColor: theme.colors.surface,
        padding: tight ? 12 : density.phone ? 14 : 18,
        gap: tight ? 10 : 12,
        justifyContent: 'space-between',
        opacity: pressed ? 0.92 : 1,
        ...theme.shadows.subtle,
      })}
    >
      <View style={{ gap: tight ? 9 : 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
          <MarketThumbnail market={market} size={tight ? 42 : 50} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <VadText variant="caption" tone="tertiary" numberOfLines={1}>
              {(market.category ?? 'General').toUpperCase()}  ·  {market.asset_code}
            </VadText>
            <VadText variant="heading" numberOfLines={2} style={{ lineHeight: tight ? 21 : 23 }}>
              {market.title}
            </VadText>
          </View>
          <View style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 5, maxWidth: density.phone ? 88 : 116 }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 7,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: isOpen ? theme.colors.yesSoft : theme.colors.surfaceRaised,
            }}>
              <View style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: isOpen ? theme.colors.yes : theme.colors.textTertiary,
              }} />
              <VadText variant="caption" tone={isOpen ? 'yes' : 'tertiary'} numberOfLines={1}>
                {isOpen ? 'Live' : timing.statusLabel}
              </VadText>
            </View>
            <VadText variant="caption" tone={isOpen ? 'no' : 'tertiary'} numberOfLines={1} style={{ textAlign: 'right' }}>
              {timing.primaryTiming}
            </VadText>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <PriceTile label="YES" value={yes} positive compact={tight} />
          <PriceTile label="NO" value={no} positive={false} compact={tight} />
        </View>
      </View>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          paddingTop: tight ? 8 : 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <VadIcon name="activity" size={15} tone="tertiary" />
          <VadText variant="caption" tone="secondary" numberOfLines={1}>
            {hasVolume ? `${formatVolume(volume)} ${market.asset_code}` : 'No volume yet'}
          </VadText>
        </View>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <VadIcon name="community" size={15} tone="tertiary" />
          <VadText variant="caption" tone="secondary" numberOfLines={1}>
            {hasParticipants ? `${participants.toLocaleString()} traders` : 'No traders yet'}
          </VadText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <VadIcon name="chevronRight" size={15} tone="brand" />
        </View>
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
        minHeight: compact ? 42 : 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        borderRadius: 9,
        paddingHorizontal: compact ? 8 : 12,
        paddingVertical: compact ? 7 : 9,
        backgroundColor: background,
        borderWidth: 1,
        borderColor: positive ? 'rgba(77,163,255,0.12)' : 'rgba(240,91,106,0.12)',
      }}
    >
      <VadText variant="label" style={{ color: foreground }}>{label}</VadText>
      <VadText variant="bodyStrong" style={{ color: foreground, fontSize: compact ? 14 : 16 }}>
        {value}
      </VadText>
    </View>
  );
}
