import { Image, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadText } from '@/components/ui/vad-text';
import { useLiveNow } from '@/hooks/use-live-now';
import { exactTime, getMarketTiming } from '@/lib/market-timing';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { assetMoney, probability } from '../format';
import { MarketProbabilityBar } from './market-probability-bar';\nimport { supabase } from '@/lib/supabase';

export function MarketDetailHeader({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const now = useLiveNow();
  const timing = getMarketTiming(market, now);
  const live = timing.tradingOpen;
  const isPool = market.liquidity_mode === 'POOL';
  const yes = probability(market.yes_price);
  const no = probability(market.no_price);
  const hasSignal = market.yes_price != null || market.no_price != null;\n  const imageUrl = market.media_path ? supabase.storage.from('market-media').getPublicUrl(market.media_path).data.publicUrl : null;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
        <VadChip label={timing.statusLabel.toUpperCase()} tone={live ? 'yes' : timing.stage === 'SETTLED' ? 'yes' : timing.stage === 'SETTLEMENT_PENDING' ? 'brand' : 'neutral'} />
        <VadChip label={market.asset_code} tone="brand" />
        <VadChip label={market.market_type === 'BINARY' ? 'YES / NO' : friendlyEnum(market.market_type)} tone="brand" />
        <VadChip label={isPool ? 'PEER POOL' : market.liquidity_mode === 'ORDER_BOOK' ? 'ORDER BOOK' : friendlyEnum(market.liquidity_mode ?? 'ORDER_BOOK')} tone={isPool ? 'brand' : 'warning'} />
        <VadText variant="caption" tone="secondary">{market.category ?? 'General'}</VadText>
      </View>

      {imageUrl ? <Image source={{ uri: imageUrl }} accessibilityLabel={`${market.title} market image`} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceMuted }} resizeMode="cover" /> : null}\n\n      <View style={{ gap: 3 }}>
        <VadText variant="caption" tone="tertiary">MARKET</VadText>
        <VadText variant={density.compact ? 'heading' : 'title'}>{market.title}</VadText>
      </View>

      {timing.resolutionOutcome ? (
        <VadCard variant="brand" accessibilityRole="summary" style={{ gap: theme.spacing.sm, paddingVertical: theme.spacing.lg }}>
          <VadText variant="caption" tone="brand">FINAL RESULT</VadText>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
            <VadText variant="display" tone={timing.resolutionOutcome === 'YES' ? 'yes' : 'no'}>{timing.resolutionOutcome}</VadText>
            <VadChip label="CONFIRMED" tone={timing.resolutionOutcome === 'YES' ? 'yes' : 'no'} />
          </View>
          <VadText variant="bodyStrong">This is the confirmed outcome used for settlement.</VadText>
          <VadText variant="caption" tone="secondary">
            Trading is closed. Payouts and losses are determined from this result, not from the earlier YES/NO market split.
          </VadText>
        </VadCard>
      ) : null}

      <VadCard accessibilityRole="summary" variant="raised" style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
          <SignalTile label="YES" value={yes} positive available={market.yes_price != null} />
          <SignalTile label="NO" value={no} positive={false} available={market.no_price != null} />
        </View>
        <MarketProbabilityBar yes={market.yes_price} no={market.no_price} />
        <VadText variant="caption" tone="tertiary">
          {isPool
            ? hasSignal
              ? 'This split reflects how participant stakes are distributed across YES and NO. It is not the final result.'
              : 'The YES/NO split will reflect participant stakes after the first prediction is committed.'
            : hasSignal
              ? 'These prices show current trader conviction. The published market rules still determine the final YES or NO.'
              : 'No trade price is available yet. Conviction signals appear after trading begins.'}
        </VadText>
        {isPool ? (
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
            <MetaChip label="Participant pool" value={assetMoney(market.total_volume ?? 0, market.asset_code)} />
            <MetaChip label="Participants" value={String(Number(market.participant_count ?? 0))} />
          </View>
        ) : null}
      </VadCard>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        <MetaChip label="Currency" value={market.asset_code} />
        <MetaChip label="Lifecycle" value={timing.primaryTiming} />
        {timing.stage === 'SCHEDULED' && market.opens_at ? <MetaChip label="Opens" value={`In ${timing.openCountdown ?? '—'}`} /> : null}
        {timing.stage === 'OPEN' ? <MetaChip label="Trading closes" value={timing.closeCountdown ? `In ${timing.closeCountdown}` : 'Closing time unavailable'} /> : null}
        {(timing.stage === 'CLOSED' || timing.stage === 'RESOLVING') ? <MetaChip label="Result" value={timing.resolutionCountdown ? `Check in ${timing.resolutionCountdown}` : timing.resolutionOutcome ? `Final · ${timing.resolutionOutcome}` : 'Processing'} /> : null}
        <MetaChip label="Market format" value={market.market_type === 'BINARY' ? 'Yes / No' : friendlyEnum(market.market_type)} />
        <MetaChip label="Trading method" value={isPool ? 'Peer Pool' : market.liquidity_mode === 'ORDER_BOOK' ? 'Order Book' : friendlyEnum(market.liquidity_mode ?? 'ORDER_BOOK')} />
      </View>

      {(market.opens_at || market.closes_at || market.resolves_after) ? (
        <VadText variant="caption" tone="tertiary">
          {[
            market.opens_at ? `Opens ${exactTime(market.opens_at)}` : null,
            market.closes_at ? `Closes ${exactTime(market.closes_at)}` : null,
            market.resolves_after ? `Result check ${exactTime(market.resolves_after)}` : null,
          ].filter(Boolean).join(' · ')}
        </VadText>
      ) : null}
    </View>
  );
}

function friendlyEnum(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function SignalTile({ label, value, positive, available }: { label: string; value: string; positive: boolean; available: boolean }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: theme.radius.md, backgroundColor: available ? (positive ? theme.colors.yesSoft : theme.colors.noSoft) : theme.colors.surfaceMuted, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, gap: 1 }}>
      <VadText variant="caption" tone={available ? (positive ? 'yes' : 'no') : 'tertiary'}>{label}</VadText>
      <VadText variant={density.compact ? 'bodyStrong' : 'heading'} tone={available ? (positive ? 'yes' : 'no') : 'tertiary'} numberOfLines={1}>{value}</VadText>
    </View>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ minHeight: 48, flexGrow: 1, flexBasis: 145, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: theme.spacing.sm, paddingVertical: 7, gap: 1 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="caption" numberOfLines={2}>{value}</VadText>
    </View>
  );
}
