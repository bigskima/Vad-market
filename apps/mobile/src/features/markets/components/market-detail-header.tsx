import { View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { pct } from '../format';

export function MarketDetailHeader({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const yes = Number(market.yes_price ?? 0);
  const no = Number(market.no_price ?? Math.max(0, 1 - yes));
  const yesWidth = Math.max(4, Math.min(96, yes * 100));

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
        <View
          style={{
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.brandSoft,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.xxs,
          }}
        >
          <VadText variant="caption" tone="brand">
            {(market.category ?? 'General').toUpperCase()}
          </VadText>
        </View>
        <VadText variant="caption" tone="tertiary">{market.status}</VadText>
        <VadText variant="caption" tone="tertiary">·</VadText>
        <VadText variant="caption" tone="tertiary">{market.asset_code}</VadText>
      </View>

      <VadText variant="title">{market.title}</VadText>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: theme.spacing.lg }}>
        <View style={{ gap: 2 }}>
          <VadText variant="caption" tone="secondary">Market probability</VadText>
          <VadText variant="display" tone="yes">{pct(yes)}</VadText>
          <VadText variant="caption" tone="secondary">YES</VadText>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <VadText variant="caption" tone="secondary">NO</VadText>
          <VadText variant="heading" tone="no">{pct(no)}</VadText>
        </View>
      </View>

      <View
        style={{
          height: 10,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.noSoft,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: yesWidth + '%',
            height: '100%',
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.yes,
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.xl, flexWrap: 'wrap' }}>
        <Meta
          label="Closes"
          value={market.closes_at ? new Date(market.closes_at).toLocaleString() : 'By market policy'}
        />
        <Meta label="Type" value={market.market_type} />
        <Meta
          label="Last trade"
          value={market.last_trade_at ? new Date(market.last_trade_at).toLocaleString() : 'No fills yet'}
        />
      </View>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 112, gap: 2 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="bodyStrong">{value}</VadText>
    </View>
  );
}
