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
  const compact = width < 380;
  const yes = Number(market.yes_price ?? 0);
  const no = Number(
    market.no_price ?? Math.max(0, 1 - yes),
  );

  return (
    <View style={{ gap: compact ? theme.spacing.lg : theme.spacing.xl }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
          flexWrap: 'wrap',
        }}
      >
        <VadText variant="label" tone="brand">
          {(market.category ?? 'General').toUpperCase()}
        </VadText>
        <VadText variant="caption" tone="tertiary">·</VadText>
        <VadText
          variant="caption"
          tone={
            market.status === 'OPEN' || market.status === 'ACTIVE'
              ? 'yes'
              : 'secondary'
          }
        >
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
          gap: wide ? theme.spacing.xl : theme.spacing.lg,
          alignItems: 'stretch',
        }}
      >
        <View
          style={{
            flex: 1.2,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: theme.colors.border,
            paddingVertical: theme.spacing.lg,
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
            <View style={{ flex: 1, gap: 2 }}>
              <VadText variant="caption" tone="secondary">
                CURRENT YES SIGNAL
              </VadText>
              <VadText
                variant="display"
                tone="yes"
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {pct(yes)}
              </VadText>
            </View>

            <View style={{ minWidth: 84, alignItems: 'flex-end', gap: 2 }}>
              <VadText variant="caption" tone="secondary">NO</VadText>
              <VadText variant="heading" tone="no">
                {pct(no)}
              </VadText>
            </View>
          </View>

          <MarketProbabilityBar yes={yes} no={no} />

          <VadText variant="caption" tone="tertiary">
            Current trading signal only. Final resolution remains independent.
          </VadText>
        </View>

        <View
          style={{
            flex: 0.8,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: theme.colors.border,
            paddingVertical: theme.spacing.lg,
            gap: theme.spacing.md,
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
  const theme = useVadTheme();

  return (
    <View
      style={{
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <VadText variant="caption" tone="tertiary" style={{ flex: 1 }}>
        {label}
      </VadText>
      <VadText
        variant="bodyStrong"
        style={{ flex: 1.55, textAlign: 'right' }}
        numberOfLines={2}
      >
        {value}
      </VadText>
    </View>
  );
}
