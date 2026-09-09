import { View } from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadText } from '@/components/ui/vad-text';
import { money, pct } from '@/features/markets/format';
import { useVadTheme } from '@/providers/theme-provider';
import type { OrderRow, PositionRow } from '@/services/market-api';

export function PortfolioScreen({ positions, orders }: { positions: PositionRow[]; orders: OrderRow[] }) {
  const theme = useVadTheme();
  const deployed = positions.reduce((sum, row) => sum + Number(row.total_cost_basis ?? 0), 0);
  const openOrderNotional = orders.reduce((sum, row) => sum + Number(row.limit_price ?? 0) * Number(row.remaining_quantity ?? 0), 0);

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">PORTFOLIO</VadText>
        <VadText variant="title">Your market exposure.</VadText>
        <VadText tone="secondary">Track positions and open orders here. Cash and money movement now live separately in Wallet.</VadText>
      </View>

      <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.xl, backgroundColor: theme.colors.surfaceRaised, padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <VadText variant="caption" tone="secondary">Capital deployed</VadText>
          <VadText variant="title">{money(deployed)}</VadText>
        </View>
        <View style={{ flexDirection: 'row', gap: theme.spacing.xl, flexWrap: 'wrap' }}>
          <Metric label="Active positions" value={String(positions.length)} />
          <Metric label="Open orders" value={String(orders.length)} />
          <Metric label="Order notional" value={money(openOrderNotional)} />
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader title="Positions" meta={positions.length ? String(positions.length) + ' active' : 'No exposure'} />
        {positions.length ? positions.map((position) => <PositionRowView key={position.instrument_id + '-' + position.outcome_code} position={position} />) : <VadEmptyState title="No positions yet" body="When an order fills, your YES or NO holdings will appear here." />}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader title="Open orders" meta={orders.length ? String(orders.length) + ' waiting' : 'Queue clear'} />
        {orders.length ? orders.map((order) => <OrderRowView key={order.order_id} order={order} />) : <VadEmptyState title="No open orders" body="Orders waiting for compatible liquidity will appear here." />}
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={{ minWidth: 92, gap: 2 }}><VadText variant="caption" tone="tertiary">{label}</VadText><VadText variant="bodyStrong">{value}</VadText></View>;
}

function SectionHeader({ title, meta }: { title: string; meta: string }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><VadText variant="heading">{title}</VadText><VadText variant="caption" tone="secondary">{meta}</VadText></View>;
}

function PositionRowView({ position }: { position: PositionRow }) {
  const theme = useVadTheme();
  const yes = position.outcome_code === 'YES';

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: theme.spacing.md, gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}><VadText variant="bodyStrong" numberOfLines={2}>{position.market_title}</VadText><VadText variant="caption" tone="tertiary">{position.status}</VadText></View>
        <VadText variant="label" tone={yes ? 'yes' : 'no'}>{position.outcome_code}</VadText>
      </View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.xl, flexWrap: 'wrap' }}>
        <Metric label="Shares" value={Number(position.quantity).toLocaleString()} />
        <Metric label="Average" value={pct(position.average_price)} />
        <Metric label="Cost basis" value={money(position.total_cost_basis)} />
      </View>
    </View>
  );
}

function OrderRowView({ order }: { order: OrderRow }) {
  const theme = useVadTheme();
  const fillPct = Number(order.quantity) > 0 ? Number(order.filled_quantity) / Number(order.quantity) : 0;

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: theme.spacing.md, gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <View><VadText variant="bodyStrong">{order.side} order</VadText><VadText variant="caption" tone="tertiary">{new Date(order.created_at).toLocaleDateString()}</VadText></View>
        <VadText variant="caption" tone="secondary">{order.status}</VadText>
      </View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.xl, flexWrap: 'wrap' }}>
        <Metric label="Limit" value={money(order.limit_price)} />
        <Metric label="Remaining" value={Number(order.remaining_quantity).toLocaleString()} />
        <Metric label="Filled" value={pct(fillPct)} />
      </View>
    </View>
  );
}
