import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  Pressable,
  useWindowDimensions,
  View,
  type DimensionValue,
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
  const desktopTable = width >= 980;
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

  const totalShares = positions.reduce(
    (sum, row) => sum + Number(row.quantity ?? 0),
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
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="label" tone="brand">PORTFOLIO</VadText>
          <VadText variant="title">Your market exposure.</VadText>
          <VadText tone="secondary">
            Filled positions and waiting orders stay separate so you can tell
            what is already exposed from what is still trying to execute.
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
        <Metric
          label="Shares held"
          value={Number(totalShares).toLocaleString()}
        />
        <Metric label="Open orders" value={String(orders.length)} />
        <Metric
          label="Open order notional"
          value={money(openOrderNotional)}
        />
      </View>

      <View
        accessibilityRole="tablist"
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
        positions.length ? (
          desktopTable ? (
            <DesktopPositions
              positions={positions}
              onOpenPosition={onOpenPosition}
            />
          ) : (
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
              }}
            >
              {positions.map((position) => (
                <PositionRowView
                  key={
                    position.instrument_id + '-' + position.outcome_code
                  }
                  position={position}
                  onPress={() => onOpenPosition(position)}
                />
              ))}
            </View>
          )
        ) : (
          <VadEmptyState
            title="No positions yet"
            body="When an order fills, your YES or NO holdings will appear here."
          />
        )
      ) : orders.length ? (
        desktopTable ? (
          <DesktopOrders
            orders={orders}
            onOpenOrder={onOpenOrder}
          />
        ) : (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
            }}
          >
            {orders.map((order) => (
              <OrderRowView
                key={order.order_id}
                order={order}
                onPress={() => onOpenOrder(order)}
              />
            ))}
          </View>
        )
      ) : (
        <VadEmptyState
          title="No open orders"
          body="Orders waiting for compatible liquidity will appear here."
        />
      )}
    </View>
  );
}

function DesktopPositions({
  positions,
  onOpenPosition,
}: {
  positions: PositionRow[];
  onOpenPosition: (position: PositionRow) => void;
}) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <TableHeader
        cells={[
          ['Market', 2.4],
          ['Outcome', 0.7],
          ['Shares', 0.8],
          ['Average', 0.8],
          ['Cost basis', 1],
          ['Status', 0.8],
        ]}
      />

      {positions.map((position) => {
        const yes = position.outcome_code === 'YES';

        return (
          <Pressable
            key={position.instrument_id + '-' + position.outcome_code}
            accessibilityRole="button"
            onPress={() => onOpenPosition(position)}
            style={({ pressed }) => ({
              minHeight: 64,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <Cell flex={2.4}>
              <VadText variant="bodyStrong" numberOfLines={2}>
                {position.market_title}
              </VadText>
            </Cell>
            <Cell flex={0.7}>
              <VadText variant="label" tone={yes ? 'yes' : 'no'}>
                {position.outcome_code}
              </VadText>
            </Cell>
            <Cell flex={0.8}>
              <VadText variant="bodyStrong">
                {Number(position.quantity).toLocaleString()}
              </VadText>
            </Cell>
            <Cell flex={0.8}>
              <VadText variant="bodyStrong">
                {pct(position.average_price)}
              </VadText>
            </Cell>
            <Cell flex={1}>
              <VadText variant="bodyStrong">
                {money(position.total_cost_basis)}
              </VadText>
            </Cell>
            <Cell flex={0.8}>
              <VadText variant="caption" tone="secondary">
                {position.status}
              </VadText>
            </Cell>
          </Pressable>
        );
      })}
    </View>
  );
}

function DesktopOrders({
  orders,
  onOpenOrder,
}: {
  orders: OrderRow[];
  onOpenOrder: (order: OrderRow) => void;
}) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <TableHeader
        cells={[
          ['Order', 1.2],
          ['Limit', 0.8],
          ['Quantity', 0.8],
          ['Remaining', 0.9],
          ['Filled', 1.2],
          ['Status', 0.8],
          ['Created', 1],
        ]}
      />

      {orders.map((order) => {
        const fillRatio =
          Number(order.quantity) > 0
            ? Number(order.filled_quantity) / Number(order.quantity)
            : 0;
        const fillPercent = Math.max(0, Math.min(1, fillRatio));

        return (
          <Pressable
            key={order.order_id}
            accessibilityRole="button"
            onPress={() => onOpenOrder(order)}
            style={({ pressed }) => ({
              minHeight: 68,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <Cell flex={1.2}>
              <VadText variant="bodyStrong">{order.side}</VadText>
              <VadText variant="caption" tone="tertiary">
                #{String(order.order_id).slice(0, 8)}
              </VadText>
            </Cell>
            <Cell flex={0.8}>
              <VadText variant="bodyStrong">{money(order.limit_price)}</VadText>
            </Cell>
            <Cell flex={0.8}>
              <VadText variant="bodyStrong">
                {Number(order.quantity).toLocaleString()}
              </VadText>
            </Cell>
            <Cell flex={0.9}>
              <VadText variant="bodyStrong">
                {Number(order.remaining_quantity).toLocaleString()}
              </VadText>
            </Cell>
            <Cell flex={1.2}>
              <View style={{ gap: theme.spacing.xs }}>
                <VadText variant="caption" tone="secondary">
                  {pct(fillPercent)}
                </VadText>
                <View
                  style={{
                    height: 4,
                    borderRadius: theme.radius.pill,
                    backgroundColor: theme.colors.surfaceMuted,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      width: (Math.round(fillPercent * 100) + '%') as DimensionValue,
                      height: '100%',
                      backgroundColor: theme.colors.brandPrimary,
                    }}
                  />
                </View>
              </View>
            </Cell>
            <Cell flex={0.8}>
              <VadText variant="caption" tone="secondary">
                {order.status}
              </VadText>
            </Cell>
            <Cell flex={1}>
              <VadText variant="caption" tone="secondary">
                {new Date(order.created_at).toLocaleDateString()}
              </VadText>
            </Cell>
          </Pressable>
        );
      })}
    </View>
  );
}

function TableHeader({
  cells,
}: {
  cells: [string, number][];
}) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        minHeight: 42,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
      }}
    >
      {cells.map(([label, flex]) => (
        <Cell key={label} flex={flex}>
          <VadText variant="caption" tone="tertiary">
            {label.toUpperCase()}
          </VadText>
        </Cell>
      ))}
    </View>
  );
}

function Cell({
  flex,
  children,
}: {
  flex: number;
  children: ReactNode;
}) {
  return (
    <View style={{ flex, minWidth: 0 }}>
      {children}
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
            width: (Math.round(fillPercent * 100) + '%') as DimensionValue,
            height: '100%',
            backgroundColor: theme.colors.brandPrimary,
          }}
        />
      </View>
    </Pressable>
  );
}
