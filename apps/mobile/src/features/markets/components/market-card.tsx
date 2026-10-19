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
      accessibilityHint="Opens this exact market's detail and trading screen."
      style={({ pressed }) => ({
        width: '100%',
        minHeight: tight ? 88 : 98,
        flexDirection: 'row',
        alignItems: 'center',
        gap: tight ? 9 : 12,
        borderWidth: 1,
        borderColor: pressed ? theme.colors.brandPrimary : theme.colors.border,
        borderRadius: density.phone ? 17 : 19,
        backgroundColor: theme.colors.surface,
        padding: tight ? 9 : 12,
        opacity: pressed ? 0.9 : 1,
        ...theme.shadows.subtle,
      })}
    >
      <MarketThumbnail market={market} size={tight ? 66 : 76} />
      <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
        <VadText variant="bodyStrong" numberOfLines={2} ellipsizeMode="tail" style={{ fontSize: tight ? 14 : 15, lineHeight: tight ? 18 : 20, letterSpacing: -0.2, fontWeight: '700' }}>
          {market.title}
        </VadText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <VadIcon name="activity" size={13} tone="tertiary" />
          <VadText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 11 }}>
            {hasVolume ? `${formatVolume(volume)} ${market.asset_code} volume` : 'Volume unavailable'}
          </VadText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: isOpen ? theme.colors.yes : theme.colors.textTertiary }} />
          <VadText variant="caption" tone={isOpen ? 'yes' : 'tertiary'} numberOfLines={1} style={{ fontSize: 10 }}>
            {isOpen ? 'Live' : timing.statusLabel}
          </VadText>
        </View>
      </View>
      <View style={{ width: tight ? 62 : 74, gap: 5 }}>
        <OutcomeTile label="Yes" value={yes} positive compact={tight} />
        <OutcomeTile label="No" value={no} positive={false} compact={tight} />
      </View>
      <VadIcon name="chevronRight" size={19} tone="secondary" />
    </Pressable>
  );
}

function formatVolume(value: number) {
  return new Intl.NumberFormat('en', {
    notation: value >= 100_000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 100_000 ? 1 : 2,
  }).format(value);
}

function OutcomeTile({ label, value, positive, compact }: { label: string; value: string; positive: boolean; compact: boolean }) {
  const theme = useVadTheme();
  const foreground = positive ? theme.colors.yes : theme.colors.no;
  const background = positive ? theme.colors.yesSoft : theme.colors.noSoft;
  return (
    <View style={{ minHeight: compact ? 31 : 35, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 3, gap: 0, backgroundColor: background, borderWidth: 1, borderColor: positive ? theme.colors.yes : theme.colors.no }}>
      <VadText variant="caption" style={{ color: foreground, fontSize: 10, lineHeight: 12 }}>{label}</VadText>
      <VadText variant="bodyStrong" style={{ color: foreground, fontSize: compact ? 13 : 14, lineHeight: 17, fontWeight: '700' }}>{value}</VadText>
    </View>
  );
}
