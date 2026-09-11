import { useState } from 'react';
import { Pressable, View, type DimensionValue } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadMetricTile } from '@/components/ui/vad-metric-tile';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadSegmentedControl } from '@/components/ui/vad-segmented-control';
import { VadText } from '@/components/ui/vad-text';
import { money, pct } from '@/features/markets/format';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { OrderRow, PositionRow } from '@/services/market-api';

type PortfolioTab = 'positions' | 'orders';

export function PortfolioScreen({
  positions,
  orders,
  onOpenPosition,
  onOpenOrder,
}: {
  positions: PositionRow[];
  orders: OrderRow[];
  onOpenPosition: (position: PositionRow) => void;
  onOpenOrder: (order: OrderRow) => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [tab, setTab] = useState<PortfolioTab>('positions');

  const deployed = positions.reduce((sum, row) => sum + Number(row.total_cost_basis ?? 0), 0);
  const openOrderNotional = orders.reduce(
    (sum, row) => sum + Number(row.limit_price ?? 0) * Number(row.remaining_quantity ?? 0),
    0,
  );
  const totalShares = positions.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
  const grid = density.wide;

  return (
    <View style={{ gap: density.sectionGap }}>
      <VadSectionHeader
        title="Portfolio"
        subtitle="See filled positions and pending orders without mixing committed exposure with completed holdings."
      />

      <VadCard
        variant="brand"
        style={{
          gap: density.phone ? theme.spacing.md : theme.spacing.lg,
          padding: density.phone ? theme.spacing.lg : theme.spacing.xl,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.md }}>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <VadText variant="caption" tone="brand">CAPITAL DEPLOYED</VadText>
            <VadText variant={density.phone ? 'title' : 'display'} numberOfLines={1} adjustsFontSizeToFit>
              {money(deployed)}
            </VadText>
            <VadText variant="caption" tone="secondary">Cost basis across your filled positions</VadText>
          </View>
          <View
            style={{
              width: density.phone ? 48 : 56,
              height: density.phone ? 48 : 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <VadIcon name="portfolio" size={density.phone ? 22 : 26} tone="brand" />
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          <VadMetricTile label="Positions" value={String(positions.length)} detail="Filled holdings" tone="brand" />
          <VadMetricTile label="Shares held" value={Number(totalShares).toLocaleString()} detail="Across outcomes" />
          <VadMetricTile label="Open orders" value={String(orders.length)} detail="Awaiting liquidity" />
          <VadMetricTile label="Open notional" value={money(openOrderNotional)} detail="Still committed" />
        </View>
      </VadCard>

      <VadSegmentedControl
        value={tab}
        options={[
          { value: 'positions', label: `Positions ${positions.length}` },
          { value: 'orders', label: `Open orders ${orders.length}` },
        ] as const}
        onChange={setTab}
      />

      {tab === 'positions' ? (
        positions.length ? (
          <View
            style={{
              flexDirection: grid ? 'row' : 'column',
              flexWrap: grid ? 'wrap' : 'nowrap',
              gap: theme.spacing.md,
              alignItems: 'stretch',
            }}
          >
            {positions.map((position) => (
              <View key={`${position.instrument_id}-${position.outcome_code}`} style={{ width: grid ? '48.9%' : '100%' }}>
                <PositionCard position={position} onPress={() => onOpenPosition(position)} />
              </View>
            ))}
          </View>
        ) : (
          <VadEmptyState
            title="No positions yet"
            body="When an order fills, your YES or NO holdings will appear here with cost basis and average entry price."
          />
        )
      ) : orders.length ? (
        <View
          style={{
            flexDirection: grid ? 'row' : 'column',
            flexWrap: grid ? 'wrap' : 'nowrap',
            gap: theme.spacing.md,
            alignItems: 'stretch',
          }}
        >
          {orders.map((order) => (
            <View key={order.order_id} style={{ width: grid ? '48.9%' : '100%' }}>
              <OrderCard order={order} onPress={() => onOpenOrder(order)} />
            </View>
          ))}
        </View>
      ) : (
        <VadEmptyState
          title="No open orders"
          body="Orders waiting for compatible liquidity will appear here with their live fill progress."
        />
      )}
    </View>
  );
}

function PositionCard({ position, onPress }: { position: PositionRow; onPress: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const yes = position.outcome_code === 'YES';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${position.market_title} position`}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.74 : 1,
        transform: [{ scale: pressed ? 0.992 : 1 }],
      })}
    >
      <VadCard variant="raised" style={{ gap: theme.spacing.md, minHeight: density.wide ? 236 : undefined }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <VadText variant="bodyStrong" numberOfLines={3}>{position.market_title}</VadText>
            <VadText variant="caption" tone="tertiary">{position.status.replaceAll('_', ' ')}</VadText>
          </View>
          <VadChip label={position.outcome_code} tone={yes ? 'yes' : 'no'} />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
          <MiniMetric label="Shares" value={Number(position.quantity).toLocaleString()} />
          <MiniMetric label="Average" value={pct(position.average_price)} />
          <MiniMetric label="Cost basis" value={money(position.total_cost_basis)} />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 'auto' }}>
          <VadText variant="caption" tone="brand">View position</VadText>
          <VadIcon name="chevronRight" size={16} tone="brand" />
        </View>
      </VadCard>
    </Pressable>
  );
}

function OrderCard({ order, onPress }: { order: OrderRow; onPress: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const fillRatio = Number(order.quantity) > 0 ? Number(order.filled_quantity) / Number(order.quantity) : 0;
  const fillPercent = Math.max(0, Math.min(1, fillRatio));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${order.side.toLowerCase()} order`}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.74 : 1,
        transform: [{ scale: pressed ? 0.992 : 1 }],
      })}
    >
      <VadCard variant="raised" style={{ gap: theme.spacing.md, minHeight: density.wide ? 236 : undefined }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.md }}>
          <View style={{ gap: 2 }}>
            <VadText variant="bodyStrong">{order.side} order</VadText>
            <VadText variant="caption" tone="tertiary">{new Date(order.created_at).toLocaleString()}</VadText>
          </View>
          <VadChip label={order.status.replaceAll('_', ' ')} tone="brand" />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
          <MiniMetric label="Limit" value={money(order.limit_price)} />
          <MiniMetric label="Remaining" value={Number(order.remaining_quantity).toLocaleString()} />
          <MiniMetric label="Filled" value={pct(fillPercent)} />
        </View>

        <View style={{ gap: theme.spacing.xs }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <VadText variant="caption" tone="secondary">Fill progress</VadText>
            <VadText variant="caption" tone="brand">{pct(fillPercent)}</VadText>
          </View>
          <View style={{ height: 7, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden' }}>
            <View
              style={{
                width: `${Math.round(fillPercent * 100)}%` as DimensionValue,
                height: '100%',
                backgroundColor: theme.colors.brandPrimary,
              }}
            />
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 'auto' }}>
          <VadText variant="caption" tone="brand">View order</VadText>
          <VadIcon name="chevronRight" size={16} tone="brand" />
        </View>
      </VadCard>
    </Pressable>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: 96,
        minWidth: 0,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        paddingHorizontal: 10,
        paddingVertical: 9,
        gap: 1,
      }}
    >
      <VadText variant="caption" tone="tertiary" numberOfLines={1}>{label}</VadText>
      <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{value}</VadText>
    </View>
  );
}
