import { Image, Pressable, View } from 'react-native';

import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useLiveNow } from '@/hooks/use-live-now';
import { useProductDensity } from '@/hooks/use-product-density';
import { getMarketTiming } from '@/lib/market-timing';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { probability } from '../format';
import { supabase } from '@/lib/supabase';
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
  const statusTone = isOpen ? 'yes' : timing.stage === 'SETTLED' ? 'yes' : timing.stage === 'SETTLEMENT_PENDING' ? 'brand' : 'neutral';
  const isPool = market.liquidity_mode === 'POOL';
  const tradingMethod = isPool ? 'PEER POOL' : market.liquidity_mode === 'ORDER_BOOK' ? 'ORDER BOOK' : friendlyEnum(market.liquidity_mode ?? 'ORDER_BOOK');
  const marketFormat = market.market_type === 'BINARY' ? 'YES / NO' : friendlyEnum(market.market_type);\n  const imageUrl = market.media_path ? supabase.storage.from('market-media').getPublicUrl(market.media_path).data.publicUrl : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${market.title}. ${marketFormat} market using ${tradingMethod}. YES ${yes}, NO ${no}. Currency ${market.asset_code}. ${timing.statusLabel}. ${timing.primaryTiming}.`}
      accessibilityHint="Opens the market timeline, trading, discussion and resolution rules."
      style={({ pressed }) => ({
        minHeight: compact ? 144 : density.compact ? 178 : density.phone ? 190 : 206,
        borderWidth: 1,
        borderColor: pressed ? theme.colors.brandPrimary : theme.colors.border,
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
            <VadChip label={timing.statusLabel.toUpperCase()} tone={statusTone} />
            <VadChip label={market.asset_code} tone="brand" />
            <VadChip label={marketFormat} tone="brand" />
            <VadChip label={tradingMethod} tone={isPool ? 'brand' : 'warning'} />
            {timing.resolutionOutcome ? <VadChip label={`RESULT ${timing.resolutionOutcome}`} tone={timing.resolutionOutcome === 'YES' ? 'yes' : 'no'} /> : null}
          </View>
          <VadText variant="caption" tone={isOpen ? 'yes' : 'tertiary'} numberOfLines={2} style={{ maxWidth: compact ? 92 : 118, textAlign: 'right' }}>
            {timing.primaryTiming}
          </VadText>
        </View>

        <View style={{ gap: 4 }}>
          <VadText variant={compact ? 'bodyStrong' : 'heading'} numberOfLines={3}>{market.title}</VadText>
          {!tight ? <VadText variant="caption" tone="tertiary" numberOfLines={1}>{market.category ?? 'General'} market</VadText> : null}
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
        <VadText variant="caption" tone="tertiary" numberOfLines={1} style={{ flex: 1 }}>
          {market.last_trade_at ? relativeTradeLabel(market.last_trade_at, now, isPool) : isPool ? 'No stakes yet' : 'No trades yet'}
        </VadText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <VadText variant="caption" tone="brand">{isOpen ? 'Trade' : 'Details'}</VadText>
          <VadIcon name="chevronRight" size={14} tone="brand" />
        </View>
      </View>
    </Pressable>
  );
}

function relativeTradeLabel(value: string, now: number, pool = false) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Recently traded';
  const elapsed = Math.max(0, now - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  const verb = pool ? 'Staked' : 'Traded';
  if (minutes < 1) return `${verb} just now`;
  if (minutes < 60) return `${verb} ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${verb} ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${verb} ${days}d ago`;
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

function friendlyEnum(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
