import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  Pressable,
  useWindowDimensions,
  View,
  type DimensionValue,
} from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadIcon } from '@/components/ui/vad-icon';
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
    <View style={{ gap: theme.spacing.xxl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="caption" tone="brand">PORTFOLIO</VadText>
        <VadText variant="title">Your market exposure</VadText>
        <VadText variant="caption" tone="secondary">
          Filled positions and open orders stay separate so your committed exposure is easy to read.
        </VadText>
      </View>

      <VadCard variant="brand" style={{ gap: theme.spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <VadText variant="caption" tone="secondary">CAPITAL DEPLOYED</VadText>
            <VadText variant="display" numberOfLines={1} adjustsFontSizeToFit>{money(deployed)}</VadText>
          </View>
          <View style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface }}>
            <VadIcon name="portfolio" size={23} tone="brand" />
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          <SummaryTile label="Positions" value={String(positions.length)} />
          <SummaryTile label="Shares held" value={Number(totalShares).toLocaleString()} />
          <SummaryTile label="Open orders" value={String(orders.length)} />
          <SummaryTile label="Open notional" value={money(openOrderNotional)} />
        </View>
      </VadCard>

      <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, gap: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceRaised }}>
        <PortfolioTabButton label={`Positions ${positions.length}`} selected={tab === 'positions'} onPress={() => setTab('positions')} />
        <PortfolioTabButton label={`Orders ${orders.length}`} selected={tab === 'orders'} onPress={() => setTab('orders')} />
      </View>

      {tab === 'positions' ? (
        positions.length ? (
          desktopTable ? (
            <DesktopPositions positions={positions} onOpenPosition={onOpenPosition} />
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              {positions.map((position) => (
                <PositionCard
                  key={`${position.instrument_id}-${position.outcome_code}`}
                  position={position}
                  onPress={() => onOpenPosition(position)}
                />
              ))}
            </View>
          )
        ) : (
          <VadEmptyState title="No positions yet" body="When an order fills, your YES or NO holdings will appear here." />
        )
      ) : orders.length ? (
        desktopTable ? (
          <DesktopOrders orders={orders} onOpenOrder={onOpenOrder} />
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            {orders.map((order) => (
              <OrderCard key={order.order_id} order={order} onPress={() => onOpenOrder(order)} />
            ))}
          </View>
        )
      ) : (
        <VadEmptyState title="No open orders" body="Orders waiting for compatible liquidity will appear here." />
      )}
    </View>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: 120, minWidth: 0, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, padding: theme.spacing.sm, gap: 1 }}>
      <VadText variant="caption" tone="tertiary" numberOfLines={1}>{label}</VadText>
      <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{value}</VadText>
    </View>
  );
}

function PortfolioTabButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 42,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.pill,
        backgroundColor: selected ? theme.colors.surface : 'transparent',
        borderWidth: selected ? 1 : 0,
        borderColor: theme.colors.border,
        opacity: pressed ? 0.68 : 1,
      })}
    >
      <VadText variant="label" tone={selected ? 'primary' : 'secondary'}>{label}</VadText>
    </Pressable>
  );
}

function PositionCard({ position, onPress }: { position: PositionRow; onPress: () => void }) {
  const theme = useVadTheme();
  const yes = position.outcome_code === 'YES';

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.74 : 1, transform: [{ scale: pressed ? 0.992 : 1 }] })}>
      <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
          <View style={{ flex: 1, gap: 4 }}>
            <VadText variant="bodyStrong" numberOfLines={3}>{position.market_title}</VadText>
            <VadText variant="caption" tone="tertiary">{position.status}</VadText>
          </View>
          <VadChip label={position.outcome_code} tone={yes ? 'yes' : 'no'} />
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <MiniMetric label="Shares" value={Number(position.quantity).toLocaleString()} />
          <MiniMetric label="Average" value={pct(position.average_price)} />
          <MiniMetric label="Cost basis" value={money(position.total_cost_basis)} />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
          <VadText variant="caption" tone="brand">View position</VadText>
          <VadIcon name="chevronRight" size={16} tone="brand" />
        </View>
      </VadCard>
    </Pressable>
  );
}

function OrderCard({ order, onPress }: { order: OrderRow; onPress: () => void }) {
  const theme = useVadTheme();
  const fillRatio = Number(order.quantity) > 0 ? Number(order.filled_quantity) / Number(order.quantity) : 0;
  const fillPercent = Math.max(0, Math.min(1, fillRatio));

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.74 : 1, transform: [{ scale: pressed ? 0.992 : 1 }] })}>
      <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.md }}>
          <View style={{ gap: 2 }}>
            <VadText variant="bodyStrong">{order.side} order</VadText>
            <VadText variant="caption" tone="tertiary">{new Date(order.created_at).toLocaleDateString()}</VadText>
          </View>
          <VadChip label={order.status.replaceAll('_', ' ')} />
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <MiniMetric label="Limit" value={money(order.limit_price)} />
          <MiniMetric label="Remaining" value={Number(order.remaining_quantity).toLocaleString()} />
          <MiniMetric label="Filled" value={pct(fillPercent)} />
        </View>

        <View style={{ height: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(fillPercent * 100)}%` as DimensionValue, height: '100%', backgroundColor: theme.colors.brandPrimary }} />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
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
    <View style={{ flex: 1, minWidth: 0, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, padding: theme.spacing.sm, gap: 1 }}>
      <VadText variant="caption" tone="tertiary" numberOfLines={1}>{label}</VadText>
      <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{value}</VadText>
    </View>
  );
}

function DesktopPositions({ positions, onOpenPosition }: { positions: PositionRow[]; onOpenPosition: (position: PositionRow) => void }) {
  const theme = useVadTheme();
  return (
    <VadCard variant="raised" style={{ padding: 0, overflow: 'hidden' }}>
      <TableHeader cells={[["Market", 2.4], ["Outcome", 0.7], ["Shares", 0.8], ["Average", 0.8], ["Cost basis", 1], ["Status", 0.8]]} />
      {positions.map((position) => {
        const yes = position.outcome_code === 'YES';
        return (
          <Pressable key={`${position.instrument_id}-${position.outcome_code}`} accessibilityRole="button" onPress={() => onOpenPosition(position)} style={({ pressed }) => ({ minHeight: 66, paddingHorizontal: theme.spacing.lg, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.border, opacity: pressed ? 0.65 : 1 })}>
            <Cell flex={2.4}><VadText variant="bodyStrong" numberOfLines={2}>{position.market_title}</VadText></Cell>
            <Cell flex={0.7}><VadText variant="label" tone={yes ? 'yes' : 'no'}>{position.outcome_code}</VadText></Cell>
            <Cell flex={0.8}><VadText variant="bodyStrong">{Number(position.quantity).toLocaleString()}</VadText></Cell>
            <Cell flex={0.8}><VadText variant="bodyStrong">{pct(position.average_price)}</VadText></Cell>
            <Cell flex={1}><VadText variant="bodyStrong">{money(position.total_cost_basis)}</VadText></Cell>
            <Cell flex={0.8}><VadText variant="caption" tone="secondary">{position.status}</VadText></Cell>
          </Pressable>
        );
      })}
    </VadCard>
  );
}

function DesktopOrders({ orders, onOpenOrder }: { orders: OrderRow[]; onOpenOrder: (order: OrderRow) => void }) {
  const theme = useVadTheme();
  return (
    <VadCard variant="raised" style={{ padding: 0, overflow: 'hidden' }}>
      <TableHeader cells={[["Order", 1.2], ["Limit", 0.8], ["Quantity", 0.8], ["Remaining", 0.9], ["Filled", 1.2], ["Status", 0.8], ["Created", 1]]} />
      {orders.map((order) => {
        const fillRatio = Number(order.quantity) > 0 ? Number(order.filled_quantity) / Number(order.quantity) : 0;
        const fillPercent = Math.max(0, Math.min(1, fillRatio));
        return (
          <Pressable key={order.order_id} accessibilityRole="button" onPress={() => onOpenOrder(order)} style={({ pressed }) => ({ minHeight: 70, paddingHorizontal: theme.spacing.lg, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.border, opacity: pressed ? 0.65 : 1 })}>
            <Cell flex={1.2}><VadText variant="bodyStrong">{order.side}</VadText><VadText variant="caption" tone="tertiary">#{String(order.order_id).slice(0, 8)}</VadText></Cell>
            <Cell flex={0.8}><VadText variant="bodyStrong">{money(order.limit_price)}</VadText></Cell>
            <Cell flex={0.8}><VadText variant="bodyStrong">{Number(order.quantity).toLocaleString()}</VadText></Cell>
            <Cell flex={0.9}><VadText variant="bodyStrong">{Number(order.remaining_quantity).toLocaleString()}</VadText></Cell>
            <Cell flex={1.2}>
              <View style={{ gap: theme.spacing.xs }}>
                <VadText variant="caption" tone="secondary">{pct(fillPercent)}</VadText>
                <View style={{ height: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.round(fillPercent * 100)}%` as DimensionValue, height: '100%', backgroundColor: theme.colors.brandPrimary }} />
                </View>
              </View>
            </Cell>
            <Cell flex={0.8}><VadText variant="caption" tone="secondary">{order.status}</VadText></Cell>
            <Cell flex={1}><VadText variant="caption" tone="secondary">{new Date(order.created_at).toLocaleDateString()}</VadText></Cell>
          </Pressable>
        );
      })}
    </VadCard>
  );
}

function TableHeader({ cells }: { cells: [string, number][] }) {
  const theme = useVadTheme();
  return (
    <View style={{ minHeight: 44, paddingHorizontal: theme.spacing.lg, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      {cells.map(([label, flex]) => <Cell key={label} flex={flex}><VadText variant="caption" tone="tertiary">{label.toUpperCase()}</VadText></Cell>)}
    </View>
  );
}

function Cell({ flex, children }: { flex: number; children: ReactNode }) {
  return <View style={{ flex, minWidth: 0 }}>{children}</View>;
}
