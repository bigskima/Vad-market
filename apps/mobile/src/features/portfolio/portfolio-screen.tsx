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

  return <View style={{ gap: theme.spacing.lg }}>
    <View style={{ gap: theme.spacing.xxs }}><VadText variant="title">Portfolio</VadText><VadText tone="secondary">Your live ledger view across cash, positions and open commitments.</VadText></View>
    <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
      <View><VadText variant="caption" tone="secondary">Available NGN</VadText><VadText variant="display">{money(ngn?.available)}</VadText></View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}><Metric label="Reserved" value={money(ngn?.reserved)} /><Metric label="In positions" value={money(deployed)} /><Metric label="Open order value" value={money(openOrderNotional)} /></View>
    </VadCard>

    <View style={{ gap: theme.spacing.sm }}><SectionHeader title="Positions" meta={`${positions.length} active`} />{positions.length ? positions.map((position) => <PositionCard key={`${position.instrument_id}-${position.outcome_code}`} position={position} />) : <VadEmptyState title="No positions yet" body="When an order fills, your YES or NO holdings will appear here with quantity, average price and cost basis." />}</View>

    <View style={{ gap: theme.spacing.sm }}><SectionHeader title="Open orders" meta={`${orders.length} waiting`} />{orders.length ? orders.map((order) => <OrderCard key={order.order_id} order={order} />) : <VadEmptyState title="No open orders" body="Orders waiting for compatible liquidity will appear here until they fill, expire or are cancelled." />}</View>
  </View>;
}

function Metric({ label, value }: { label: string; value: string }) { const theme = useVadTheme(); return <View style={{ flex: 1, gap: theme.spacing.xxs }}><VadText variant="caption" tone="secondary">{label}</VadText><VadText variant="bodyStrong">{value}</VadText></View>; }
function SectionHeader({ title, meta }: { title: string; meta: string }) { return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><VadText variant="heading">{title}</VadText><VadText variant="caption" tone="secondary">{meta}</VadText></View>; }
function PositionCard({ position }: { position: PositionRow }) { const theme = useVadTheme(); const isYes = position.outcome_code === 'YES'; const tone = isYes ? 'yes' : 'no'; const background = isYes ? theme.colors.yesSoft : theme.colors.noSoft; return <VadCard style={{ gap: theme.spacing.sm }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}><View style={{ flex: 1, gap: theme.spacing.xxs }}><VadText variant="bodyStrong">{position.market_title}</VadText><VadText variant="caption" tone="secondary">{position.status}</VadText></View><View style={{ borderRadius: 999, backgroundColor: background, paddingHorizontal: 10, paddingVertical: 6 }}><VadText variant="label" tone={tone}>{position.outcome_code}</VadText></View></View><View style={{ flexDirection: 'row', gap: theme.spacing.xs }}><Metric label="Shares" value={Number(position.quantity).toLocaleString()} /><Metric label="Avg price" value={pct(position.average_price)} /><Metric label="Cost basis" value={money(position.total_cost_basis)} /></View></VadCard>; }
function OrderCard({ order }: { order: OrderRow }) { const theme = useVadTheme(); const fillPct = Number(order.quantity) > 0 ? Number(order.filled_quantity) / Number(order.quantity) : 0; return <VadCard variant="outlined" style={{ gap: theme.spacing.sm }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}><VadText variant="bodyStrong">{order.side} order</VadText><VadText variant="caption" tone="secondary">{order.status}</VadText></View><View style={{ flexDirection: 'row', gap: theme.spacing.xs }}><Metric label="Limit" value={money(order.limit_price)} /><Metric label="Remaining" value={Number(order.remaining_quantity).toLocaleString()} /><Metric label="Filled" value={pct(fillPct)} /></View><View style={{ height: 5, borderRadius: 999, backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden' }}><View style={{ width: `${Math.max(2, Math.min(100, fillPct * 100))}%`, height: '100%', backgroundColor: theme.colors.brandPrimary }} /></View></VadCard>; }
