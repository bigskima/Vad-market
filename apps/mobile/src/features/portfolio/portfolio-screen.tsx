import { type ReactNode, useMemo, useState } from 'react';
import { Pressable, View, type DimensionValue } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadMetricTile } from '@/components/ui/vad-metric-tile';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadSegmentedControl } from '@/components/ui/vad-segmented-control';
import { VadText } from '@/components/ui/vad-text';
import { assetMoney, pct } from '@/features/markets/format';
import { TourTarget } from '@/features/tour/tour-provider';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { OrderRow, PositionRow, SettlementReceiptRow } from '@/services/market-api';

type PortfolioTab = 'positions' | 'orders' | 'payouts';

type AssetExposure = {
  assetCode: string;
  deployed: number;
  openNotional: number;
  positions: number;
  orders: number;
};

export function PortfolioScreen({
  positions,
  orders,
  settlements,
  onOpenPosition,
  onOpenOrder,
}: {
  positions: PositionRow[];
  orders: OrderRow[];
  settlements: SettlementReceiptRow[];
  onOpenPosition: (position: PositionRow) => void;
  onOpenOrder: (order: OrderRow) => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [tab, setTab] = useState<PortfolioTab>('positions');

  const totalShares = positions.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
  const totalPayouts = settlements.reduce((sum, row) => sum + Number(row.net_amount ?? 0), 0);
  const exposure = useMemo(() => buildAssetExposure(positions, orders), [positions, orders]);
  const grid = density.wide;

  return (
    <View style={{ gap: density.sectionGap }}>
      <VadSectionHeader
        title="Exchange positions"
        subtitle="Matched order-book positions, open matching orders and completed payouts stay separated from peer-pool predictions."
      />

      <TourTarget id="portfolio-summary">
        <VadCard
          variant="brand"
          style={{ gap: density.phone ? theme.spacing.md : theme.spacing.lg, padding: density.phone ? theme.spacing.lg : theme.spacing.xl }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.md }}>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <VadText variant="caption" tone="brand">ORDER-BOOK ACTIVITY</VadText>
              <VadText variant={density.phone ? 'title' : 'display'} numberOfLines={1} adjustsFontSizeToFit>
                {positions.length} matched {positions.length === 1 ? 'position' : 'positions'}
              </VadText>
              <VadText variant="caption" tone="secondary">
                Only real matched orders become positions here. Peer-pool predictions are shown in the Predictions section above.
              </VadText>
            </View>
            <View style={{ width: density.phone ? 48 : 56, height: density.phone ? 48 : 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
              <VadIcon name="portfolio" size={density.phone ? 22 : 26} tone="brand" />
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <VadMetricTile label="Positions" value={String(positions.length)} detail="Matched holdings" tone="brand" />
            <VadMetricTile label="Shares held" value={Number(totalShares).toLocaleString()} detail="Across outcomes" />
            <VadMetricTile label="Open orders" value={String(orders.length)} detail="Waiting to fill" />
            <VadMetricTile label="Payouts" value={String(settlements.length)} detail={settlements.length ? `${Number(totalPayouts).toLocaleString()} total net` : 'No settled wins yet'} />
          </View>
        </VadCard>
      </TourTarget>

      {exposure.length ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadSectionHeader title="Exposure by currency" subtitle="No currency values are mixed together." />
          <View style={{ flexDirection: density.width >= 720 ? 'row' : 'column', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {exposure.map((item) => <AssetExposureCard key={item.assetCode} exposure={item} />)}
          </View>
        </View>
      ) : null}

      <TourTarget id="portfolio-switcher">
        <VadSegmentedControl
          value={tab}
          options={[
            { value: 'positions', label: `Positions ${positions.length}` },
            { value: 'orders', label: `Orders ${orders.length}` },
            { value: 'payouts', label: `Payouts ${settlements.length}` },
          ] as const}
          onChange={setTab}
        />
      </TourTarget>

      {tab === 'positions' ? (
        positions.length ? (
          <CardGrid grid={grid}>
            {positions.map((position) => (
              <View key={`${position.instrument_id}-${position.outcome_code}`} style={{ width: grid ? '48.9%' : '100%' }}>
                <PositionCard position={position} onPress={() => onOpenPosition(position)} />
              </View>
            ))}
          </CardGrid>
        ) : (
          <VadEmptyState title="No matched positions" body="When an order-book order matches another participant, your YES or NO holding appears here. Peer-pool stakes are tracked in Predictions above." />
        )
      ) : null}

      {tab === 'orders' ? (
        orders.length ? (
          <CardGrid grid={grid}>
            {orders.map((order) => (
              <View key={order.order_id} style={{ width: grid ? '48.9%' : '100%' }}>
                <OrderCard order={order} onPress={() => onOpenOrder(order)} />
              </View>
            ))}
          </CardGrid>
        ) : (
          <VadEmptyState title="No open orders" body="Only orders still waiting to fill appear here. Filled orders move into Positions instead of lingering as matching requests." />
        )
      ) : null}

      {tab === 'payouts' ? (
        settlements.length ? (
          <CardGrid grid={grid}>
            {settlements.map((receipt) => (
              <View key={`${receipt.settlement_id}-${receipt.market_id}-${receipt.outcome_code}`} style={{ width: grid ? '48.9%' : '100%' }}>
                <SettlementCard receipt={receipt} />
              </View>
            ))}
          </CardGrid>
        ) : (
          <VadEmptyState title="No payouts yet" body="After a market is finalized and an eligible winning position settles, its receipt appears here with gross payout, fee and net credit." />
        )
      ) : null}
    </View>
  );
}

function CardGrid({ grid, children }: { grid: boolean; children: ReactNode }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexDirection: grid ? 'row' : 'column', flexWrap: grid ? 'wrap' : 'nowrap', gap: theme.spacing.md, alignItems: 'stretch' }}>
      {children}
    </View>
  );
}

function AssetExposureCard({ exposure }: { exposure: AssetExposure }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  return (
    <VadCard variant="raised" style={{ flexGrow: 1, flexBasis: density.width >= 720 ? 280 : undefined, minWidth: 0, gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <VadText variant="heading">{exposure.assetCode}</VadText>
        <VadChip label={`${exposure.positions} positions · ${exposure.orders} open`} tone="brand" />
      </View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <MiniMetric label="Amount invested" value={assetMoney(exposure.deployed, exposure.assetCode)} />
        <MiniMetric label="Open order value" value={assetMoney(exposure.openNotional, exposure.assetCode)} />
      </View>
    </VadCard>
  );
}

function PositionCard({ position, onPress }: { position: PositionRow; onPress: () => void }) {
  const theme = useVadTheme();
  const yes = position.outcome_code === 'YES';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${position.market_title} ${position.outcome_code} position`} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.74 : 1, transform: [{ scale: pressed ? 0.992 : 1 }] })}>
      <VadCard variant="raised" style={{ gap: theme.spacing.md, minHeight: 218 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <VadText variant="caption" tone="brand">MATCHED POSITION</VadText>
            <VadText variant="bodyStrong" numberOfLines={3}>{position.market_title}</VadText>
            <VadText variant="caption" tone="tertiary">{position.asset_code} · {positionStatusLabel(position.status)}</VadText>
          </View>
          <VadChip label={position.outcome_code} tone={yes ? 'yes' : 'no'} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
          <MiniMetric label="Shares" value={Number(position.quantity).toLocaleString()} />
          <MiniMetric label="Avg. entry" value={pct(position.average_price)} />
          <MiniMetric label="Invested" value={assetMoney(position.total_cost_basis, position.asset_code)} />
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
  const fillRatio = Number(order.quantity) > 0 ? Number(order.filled_quantity) / Number(order.quantity) : 0;
  const fillPercent = Math.max(0, Math.min(1, fillRatio));
  const outcomeYes = order.outcome_code === 'YES';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${order.market_title} ${order.outcome_code} ${order.side.toLowerCase()} order`} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.74 : 1, transform: [{ scale: pressed ? 0.992 : 1 }] })}>
      <VadCard variant="raised" style={{ gap: theme.spacing.md, minHeight: 218 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.md }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <VadText variant="caption" tone="brand">MATCHING</VadText>
            <VadText variant="bodyStrong" numberOfLines={2}>{order.market_title}</VadText>
            <VadText variant="caption" tone="tertiary">{order.side} · {order.asset_code} · {new Date(order.created_at).toLocaleDateString()}</VadText>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <VadChip label={order.outcome_code} tone={outcomeYes ? 'yes' : 'no'} />
            <VadChip label={orderStatusLabel(order.status)} tone="brand" />
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
          <MiniMetric label="Price/share" value={assetMoney(order.limit_price, order.asset_code)} />
          <MiniMetric label="Remaining" value={Number(order.remaining_quantity).toLocaleString()} />
          <MiniMetric label="Filled" value={pct(fillPercent)} />
        </View>
        <View style={{ gap: theme.spacing.xs }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <VadText variant="caption" tone="secondary">Order progress</VadText>
            <VadText variant="caption" tone="brand">{pct(fillPercent)}</VadText>
          </View>
          <View style={{ height: 7, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(fillPercent * 100)}%` as DimensionValue, height: '100%', backgroundColor: theme.colors.brandPrimary }} />
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

function SettlementCard({ receipt }: { receipt: SettlementReceiptRow }) {
  const theme = useVadTheme();
  const yes = receipt.outcome_code === 'YES';
  return (
    <VadCard variant="brand" style={{ gap: theme.spacing.md, minHeight: 218 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <VadText variant="caption" tone="yes">PAYOUT COMPLETE</VadText>
          <VadText variant="bodyStrong" numberOfLines={3}>{receipt.market_title}</VadText>
          <VadText variant="caption" tone="secondary">{new Date(receipt.settled_at).toLocaleString()}</VadText>
        </View>
        <VadChip label={receipt.outcome_code} tone={yes ? 'yes' : 'no'} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        <MiniMetric label="Shares settled" value={Number(receipt.quantity).toLocaleString()} />
        <MiniMetric label="Gross" value={assetMoney(receipt.gross_amount, receipt.asset_code)} />
        <MiniMetric label="Fee" value={assetMoney(receipt.fee_amount, receipt.asset_code)} />
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm, flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <VadText variant="bodyStrong">Net credited</VadText>
        <VadText variant="heading" tone="yes">{assetMoney(receipt.net_amount, receipt.asset_code)}</VadText>
      </View>
      <VadText variant="caption" tone="tertiary" selectable>{receipt.settlement_id}</VadText>
    </VadCard>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: 96, minWidth: 0, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 10, paddingVertical: 9, gap: 1 }}>
      <VadText variant="caption" tone="tertiary" numberOfLines={1}>{label}</VadText>
      <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{value}</VadText>
    </View>
  );
}

function orderStatusLabel(status: string) {
  const normalized = status.toUpperCase();
  if (normalized.includes('OPEN') || normalized.includes('PARTIAL')) return normalized.includes('PARTIAL') ? 'PARTIALLY FILLED' : 'OPEN';
  if (normalized.includes('FILLED') || normalized.includes('COMPLETE')) return 'FILLED';
  if (normalized.includes('CANCEL')) return 'CANCELLED';
  if (normalized.includes('REJECT') || normalized.includes('FAIL')) return 'NEEDS ATTENTION';
  return 'IN PROGRESS';
}

function positionStatusLabel(status: string) {
  const normalized = status.toUpperCase();
  if (normalized.includes('OPEN') || normalized.includes('ACTIVE')) return 'ACTIVE';
  if (normalized.includes('SETTLEMENT_PENDING')) return 'PAYOUT PENDING';
  if (normalized.includes('SETTLE') || normalized.includes('CLOSE') || normalized.includes('RESOLVE')) return 'COMPLETED';
  if (normalized.includes('VOID') || normalized.includes('CANCEL')) return 'CLOSED';
  return 'ACTIVE';
}

function buildAssetExposure(positions: PositionRow[], orders: OrderRow[]) {
  const map = new Map<string, AssetExposure>();
  function ensure(assetCode: string) {
    const code = assetCode || 'UNKNOWN';
    const existing = map.get(code);
    if (existing) return existing;
    const created: AssetExposure = { assetCode: code, deployed: 0, openNotional: 0, positions: 0, orders: 0 };
    map.set(code, created);
    return created;
  }
  positions.forEach((position) => {
    const row = ensure(position.asset_code);
    row.deployed += Number(position.total_cost_basis ?? 0);
    row.positions += 1;
  });
  orders.forEach((order) => {
    const row = ensure(order.asset_code);
    row.openNotional += Number(order.limit_price ?? 0) * Number(order.remaining_quantity ?? 0);
    row.orders += 1;
  });
  return [...map.values()].sort((a, b) => a.assetCode.localeCompare(b.assetCode));
}
