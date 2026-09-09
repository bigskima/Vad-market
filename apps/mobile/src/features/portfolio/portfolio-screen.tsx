import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadText } from '@/components/ui/vad-text';
import { money, pct } from '@/features/markets/format';
import { useVadTheme } from '@/providers/theme-provider';
import type { OrderRow, PositionRow, WalletRow } from '@/services/market-api';

export function PortfolioScreen({ positions, orders, ngn }: { positions: PositionRow[]; orders: OrderRow[]; ngn?: WalletRow }) {
  const theme = useVadTheme();
  const deployed = positions.reduce((sum, row) => sum + Number(row.total_cost_basis ?? 0), 0);
  const openOrderNotional = orders.reduce((sum, row) => sum + Number(row.limit_price ?? 0) * Number(row.remaining_quantity ?? 0), 0);

  return <View style={{ gap: theme.spacing.xl }}>
    <View style={{ gap: theme.spacing.xxs }}>
      <VadText variant="label" tone="brand">PORTFOLIO</VadText>
      <VadText variant="title">Your positions</VadText>
      <VadText tone="secondary">Cash, live exposure and unmatched commitments from the authoritative ledger.</VadText>
    </View>

    <VadCard style={{ backgroundColor: theme.colors.brandPrimary, borderColor: theme.colors.brandPrimary, borderRadius: theme.radius.xl, gap: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.xxs }}>
        <VadText variant="caption" tone="inverse">Available NGN</VadText>
        <VadText variant="display" tone="inverse">{money(ngn?.available)}</VadText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        <SummaryTile label="Reserved" value={money(ngn?.reserved)} inverse />
        <SummaryTile label="Withdrawal pending" value={money(ngn?.withdrawal_pending)} inverse />
        <SummaryTile label="Cost basis" value={money(deployed)} inverse />
        <SummaryTile label="Open orders" value={money(openOrderNotional)} inverse />
      </View>
    </VadCard>

    <View style={{ gap: theme.spacing.sm }}>
      <SectionHeader title="Positions" meta={positions.length ? `${positions.length} active` : 'No exposure'} />
      {positions.length ? positions.map((position) => <PositionCard key={`${position.instrument_id}-${position.outcome_code}`} position={position} />) : <VadEmptyState title="No positions yet" body="When an order fills, your YES or NO holdings will appear here with quantity, average price and cost basis." />}
    </View>

    <View style={{ gap: theme.spacing.sm }}>
      <SectionHeader title="Open orders" meta={orders.length ? `${orders.length} waiting` : 'Queue clear'} />
      {orders.length ? orders.map((order) => <OrderCard key={order.order_id} order={order} />) : <VadEmptyState title="No open orders" body="Orders waiting for compatible liquidity will appear here until they fill, expire or are cancelled." />}
    </View>
  </View>;
}

function SummaryTile({ label, value, inverse = false }: { label: string; value: string; inverse?: boolean }) {
  const theme = useVadTheme();
  return <View style={{ width: '48%', minWidth: 132, gap: theme.spacing.xxs, paddingTop: theme.spacing.xs, borderTopWidth: 1, borderTopColor: inverse ? theme.colors.brandAccent : theme.colors.border }}>
    <VadText variant="caption" tone={inverse ? 'inverse' : 'secondary'}>{label}</VadText>
    <VadText variant="bodyStrong" tone={inverse ? 'inverse' : 'primary'}>{value}</VadText>
  </View>;
}

function Metric({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return <View style={{ flex: 1, minWidth: 86, gap: theme.spacing.xxs }}>
    <VadText variant="caption" tone="secondary">{label}</VadText>
    <VadText variant="bodyStrong">{value}</VadText>
  </View>;
}

function SectionHeader({ title, meta }: { title: string; meta: string }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
    <VadText variant="heading">{title}</VadText>
    <VadText variant="caption" tone="secondary">{meta}</VadText>
  </View>;
}

function PositionCard({ position }: { position: PositionRow }) {
  const theme = useVadTheme();
  const isYes = position.outcome_code === 'YES';
  const tone = isYes ? 'yes' : 'no';
  const background = isYes ? theme.colors.yesSoft : theme.colors.noSoft;
  const accent = isYes ? theme.colors.yes : theme.colors.no;

  return <VadCard style={{ gap: theme.spacing.md, borderLeftWidth: 3, borderLeftColor: accent, borderRadius: theme.radius.xl }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <VadText variant="bodyStrong" numberOfLines={2}>{position.market_title}</VadText>
        <VadText variant="caption" tone="secondary">{position.status}</VadText>
      </View>
      <View style={{ borderRadius: theme.radius.pill, backgroundColor: background, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }}>
        <VadText variant="label" tone={tone}>{position.outcome_code}</VadText>
      </View>
    </View>

    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
      <Metric label="Shares" value={Number(position.quantity).toLocaleString()} />
      <Metric label="Avg price" value={pct(position.average_price)} />
      <Metric label="Cost basis" value={money(position.total_cost_basis)} />
    </View>
  </VadCard>;
}

function OrderCard({ order }: { order: OrderRow }) {
  const theme = useVadTheme();
  const fillPct = Number(order.quantity) > 0 ? Number(order.filled_quantity) / Number(order.quantity) : 0;
  const progress = Math.max(2, Math.min(100, fillPct * 100));

  return <VadCard variant="outlined" style={{ gap: theme.spacing.md, borderRadius: theme.radius.xl }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
      <View style={{ gap: theme.spacing.xxs }}>
        <VadText variant="bodyStrong">{order.side} order</VadText>
        <VadText variant="caption" tone="secondary">{new Date(order.created_at).toLocaleDateString()}</VadText>
      </View>
      <View style={{ borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceMuted, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }}>
        <VadText variant="caption" tone="secondary">{order.status}</VadText>
      </View>
    </View>

    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
      <Metric label="Limit" value={money(order.limit_price)} />
      <Metric label="Remaining" value={Number(order.remaining_quantity).toLocaleString()} />
      <Metric label="Filled" value={pct(fillPct)} />
    </View>

    <View style={{ gap: theme.spacing.xxs }}>
      <View style={{ height: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden' }}>
        <View style={{ width: `${progress}%`, height: '100%', backgroundColor: theme.colors.brandPrimary }} />
      </View>
      <VadText variant="caption" tone="tertiary">{Number(order.filled_quantity).toLocaleString()} of {Number(order.quantity).toLocaleString()} matched</VadText>
    </View>
  </VadCard>;
}
