import { Pressable, View } from 'react-native';

import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { probability } from '../format';
import { marketStatusMeta } from '../market-state';
import { MarketProbabilityBar } from './market-probability-bar';
import { MarketRelativeTime, MarketTimeStatus } from './market-time-status';
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
  const tight = compact || density.compact;
  const status = marketStatusMeta(market.status);
  const yes = probability(market.yes_price);
  const no = probability(market.no_price);
  const thumbnailSize = compact ? 58 : density.compact ? 62 : 70;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${market.title}. YES ${yes}, NO ${no}. Currency ${market.asset_code}. ${status.label}.`}
      accessibilityHint="Opens the market timeline, trading, discussion and resolution rules."
      style={({ pressed }) => ({
        minHeight: compact ? 144 : density.compact ? 178 : density.phone ? 190 : 206,
        borderWidth: 1,
        borderColor: pressed ? theme.colors.borderStrong : theme.colors.border,
        borderRadius: compact ? theme.radius.lg : density.cardRadius,
        backgroundColor: theme.colors.surface,
        padding: compact ? 12 : density.cardPadding,
        gap: compact ? 8 : density.compact ? theme.spacing.sm : theme.spacing.md,
        justifyContent: 'space-between',
        opacity: pressed ? 0.82 : 1,
        transform: [{ scale: pressed ? 0.992 : 1 }],
      })}
    >
      <View style={{ gap: compact ? 8 : density.compact ? theme.spacing.sm : theme.spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6, alignItems: 'flex-start' }}>
          <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
            <VadChip label={status.label} tone={status.tone} />
            <VadChip label={market.asset_code} tone="brand" />
            {!tight ? <VadText variant="caption" tone="secondary" numberOfLines={1}>{market.category ?? 'General'}</VadText> : null}
          </View>
          <MarketTimeStatus market={market} compact />
        </View>

        {!compact && density.compact ? <VadText variant="caption" tone="secondary" numberOfLines={1}>{market.category ?? 'General'}</VadText> : null}

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: compact ? 9 : theme.spacing.sm }}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <VadText variant={compact ? 'bodyStrong' : 'heading'} numberOfLines={compact ? 3 : 3}>{market.title}</VadText>
            {!tight ? (
              <VadText variant="caption" tone="tertiary" numberOfLines={1}>
                {market.category ?? 'General'} market
              </VadText>
            ) : null}
          </View>
          <MarketThumbnail market={market} size={thumbnailSize} />
        </View>

        <View style={{ gap: compact ? 5 : density.compact ? 6 : theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: compact ? 5 : density.compact ? 6 : theme.spacing.sm }}>
            <PriceTile label="YES" value={yes} positive compact={compact} />
            <PriceTile label="NO" value={no} positive={false} compact={compact} />
          </View>
          {!compact ? <MarketProbabilityBar yes={market.yes_price} no={market.no_price} /> : null}
        </View>
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: compact ? 6 : density.compact ? 7 : theme.spacing.sm, flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
        <MarketRelativeTime value={market.last_trade_at} prefix="Traded" fallback="No trades yet" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <VadText variant="caption" tone="brand">{status.tradeOpen ? 'Trade' : 'Details'}</VadText>
          <VadIcon name="chevronRight" size={14} tone="brand" />
        </View>
      </View>
    </Pressable>
  );
}

function PriceTile({ label, value, positive, compact }: { label: string; value: string; positive: boolean; compact: boolean }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: theme.radius.md, paddingHorizontal: compact ? 8 : density.compact ? 9 : 12, paddingVertical: compact ? 5 : density.compact ? 7 : 9, backgroundColor: positive ? theme.colors.yesSoft : theme.colors.noSoft, gap: 0 }}>
      <VadText variant="caption" tone={positive ? 'yes' : 'no'}>{label}</VadText>
      <VadText variant={compact || density.compact ? 'bodyStrong' : 'heading'} tone={positive ? 'yes' : 'no'}>{value}</VadText>
    </View>
  );
}
