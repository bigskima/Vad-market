import { useWindowDimensions, View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { pct } from '../format';
import { MarketProbabilityBar } from './market-probability-bar';

export function MarketDetailHeader({
  market,
}: {
  market: MarketCatalogItem;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const yes = Number(market.yes_price ?? 0);
  const no = Number(
    market.no_price ?? Math.max(0, 1 - yes),
  );

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
          flexWrap: 'wrap',
        }}
      >
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
        <VadText variant="caption" tone="tertiary">
          {market.status}
        </VadText>
        <VadText variant="caption" tone="tertiary">·</VadText>
        <VadText variant="caption" tone="tertiary">
          {market.asset_code}
        </VadText>
      </View>

      <VadText variant="title">{market.title}</VadText>

      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.lg,
          alignItems: 'stretch',
        }}
      >
        <View
          style={{
            flex: 1.2,
            borderRadius: theme.radius.xl,
            backgroundColor: theme.colors.surfaceRaised,
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: theme.spacing.lg,
            }}
          >
            <View style={{ gap: 2 }}>
              <VadText variant="caption" tone="secondary">
                MARKET PROBABILITY
              </VadText>
              <VadText variant="display" tone="yes">
                {pct(yes)}
              </VadText>
              <VadText variant="caption" tone="yes">YES</VadText>
            </View>

            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <VadText variant="caption" tone="secondary">NO</VadText>
              <VadText variant="heading" tone="no">
                {pct(no)}
              </VadText>
            </View>
          </View>

          <MarketProbabilityBar yes={yes} no={no} />

          <VadText variant="caption" tone="tertiary">
            Live trading signal. It does not determine final resolution.
          </VadText>
        </View>

        <View
          style={{
            flex: 0.8,
            borderRadius: theme.radius.xl,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            padding: theme.spacing.lg,
            gap: theme.spacing.lg,
            justifyContent: 'center',
          }}
        >
          <Meta
            label="Closes"
            value={
              market.closes_at
                ? new Date(market.closes_at).toLocaleString()
                : 'By market policy'
            }
          />
          <Meta label="Type" value={market.market_type} />
          <Meta
            label="Last trade"
            value={
              market.last_trade_at
                ? new Date(market.last_trade_at).toLocaleString()
                : 'No fills yet'
            }
          />
        </View>
      </View>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="bodyStrong">{value}</VadText>
    </View>
  );
}
