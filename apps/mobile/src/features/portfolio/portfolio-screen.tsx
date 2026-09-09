import { useState } from 'react';
import {
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadText } from '@/components/ui/vad-text';
import { money, pct } from '@/features/markets/format';
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
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const [tab, setTab] = useState<PortfolioTab>('positions');

  const deployed = positions.reduce(
    (sum, row) => sum + Number(row.total_cost_basis ?? 0),
    0,
  );

  const openOrderNotional = orders.reduce(
    (sum, row) =>
      sum +
      Number(row.limit_price ?? 0) *
        Number(row.remaining_quantity ?? 0),
    0,
  );

  return (
    <View style={{ gap: theme.spacing.xxxl }}>
      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          alignItems: wide ? 'flex-end' : 'stretch',
          gap: theme.spacing.xl,
        }}
      >
        <View
          style={{
            flex: 1,
            gap: theme.spacing.xs,
          }}
        >
          <VadText variant="label" tone="brand">PORTFOLIO</VadText>
          <VadText variant="title">Your market exposure.</VadText>
          <VadText tone="secondary">
            Positions show filled exposure. Orders show capital still waiting
            for compatible liquidity.
          </VadText>
        </View>

        <View
          style={{
            minWidth: wide ? 280 : undefined,
            gap: 2,
            alignItems: wide ? 'flex-end' : 'flex-start',
          }}
        >
          <VadText variant="caption" tone="secondary">CAPITAL DEPLOYED</VadText>
          <VadText variant="display">{money(deployed)}</VadText>
        </View>
      </View>

      <View
        style={{
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
          paddingVertical: theme.spacing.md,
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing.xl,
        }}
      >
        <Metric label="Positions" value={String(positions.length)} />
        <Metric label="Open orders" value={String(orders.length)} />
        <Metric
          label="Open order notional"
          value={money(openOrderNotional)}
        />
      </View>

      <View
        style={{
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <PortfolioTabButton
          label={'Positions ' + positions.length}
          selected={tab === 'positions'}
          onPress={() => setTab('positions')}
        />
        <PortfolioTabButton
          label={'Orders ' + orders.length}
          selected={tab === 'orders'}
          onPress={() => setTab('orders')}
        />
      </View>

      {tab === 'positions' ? (
        <View
          style={{
            borderTopWidth: positions.length ? 1 : 0,
            borderTopColor: theme.colors.border,
          }}
        >
          {positions.length ? (
            positions.map((position) => (
              <PositionRowView
                key={
                  position.instrument_id + '-' + position.outcome_code
                }
                position={position}
                onPress={() => onOpenPosition(position)}
              />
            ))
          ) : (
            <VadEmptyState
              title="No positions yet"
              body="When an order fills, your YES or NO holdings will appear here."
            />
          )}
        </View>
      ) : (
        <View
          style={{
            borderTopWidth: orders.length ? 1 : 0,
            borderTopColor: theme.colors.border,
          }}
        >
          {orders.length ? (
            orders.map((order) => (
              <OrderRowView
                key={order.order_id}
                order={order}
                onPress={() => onOpenOrder(order)}
              />
            ))
          ) : (
            <VadEmptyState
              title="No open orders"
              body="Orders waiting for compatible liquidity will appear here."
            />
          )}
        </View>
      )}
    </View>
  );
}

function PortfolioTabButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 46,
        alignItems: 'center',
        justifyContent: 'center',
        borderBottomWidth: 2,
        borderBottomColor: selected
          ? theme.colors.brandPrimary
          : 'transparent',
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <VadText
        variant="label"
        tone={selected ? 'brand' : 'secondary'}
      >
        {label}
      </VadText>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 100, flexGrow: 1, flexBasis: 130, gap: 2 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="bodyStrong">{value}</VadText>
    </View>
  );
}

function PositionRowView({
  position,
  onPress,
}: {
  position: PositionRow;
  onPress: () => void;
}) {
  const theme = useVadTheme();
  const yes = position.outcome_code === 'YES';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 96,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.sm,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <VadText variant="bodyStrong" numberOfLines={2}>
            {position.market_title}
          </VadText>
          <VadText variant="caption" tone="tertiary">
            {position.status}
          </VadText>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <VadText variant="label" tone={yes ? 'yes' : 'no'}>
            {position.outcome_code}
          </VadText>
          <VadText variant="caption" tone="tertiary">›</VadText>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: theme.spacing.xl,
          flexWrap: 'wrap',
        }}
      >
        <Metric
          label="Shares"
          value={Number(position.quantity).toLocaleString()}
        />
        <Metric label="Average" value={pct(position.average_price)} />
        <Metric
          label="Cost basis"
          value={money(position.total_cost_basis)}
        />
      </View>
    </Pressable>
  );
}

function OrderRowView({
  order,
  onPress,
}: {
  order: OrderRow;
  onPress: () => void;
}) {
  const theme = useVadTheme();
  const fillRatio =
    Number(order.quantity) > 0
      ? Number(order.filled_quantity) / Number(order.quantity)
      : 0;
  const fillPercent = Math.max(0, Math.min(1, fillRatio));

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 110,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.sm,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        }}
      >
        <View style={{ gap: 2 }}>
          <VadText variant="bodyStrong">{order.side} order</VadText>
          <VadText variant="caption" tone="tertiary">
            {new Date(order.created_at).toLocaleDateString()}
          </VadText>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <VadText variant="caption" tone="secondary">
            {order.status}
          </VadText>
          <VadText variant="caption" tone="tertiary">›</VadText>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: theme.spacing.xl,
          flexWrap: 'wrap',
        }}
      >
        <Metric label="Limit" value={money(order.limit_price)} />
        <Metric
          label="Remaining"
          value={Number(order.remaining_quantity).toLocaleString()}
        />
        <Metric label="Filled" value={pct(fillPercent)} />
      </View>

      <View
        style={{
          height: 5,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.surfaceMuted,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${Math.round(fillPercent * 100)}%` as `${number}%`,
            height: '100%',
            backgroundColor: theme.colors.brandPrimary,
          }}
        />
      </View>
    </Pressable>
  );
}
