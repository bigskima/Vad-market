import { type ReactNode, useMemo, useState } from 'react';
import { Pressable, View, type DimensionValue } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadProgressiveSection } from '@/components/ui/vad-progressive-section';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadSegmentedControl } from '@/components/ui/vad-segmented-control';
import { VadText } from '@/components/ui/vad-text';
import { TngnDemoModeCard } from '@/features/wallet/tngn-demo-mode-card';
import { assetMoney, pct } from '@/features/markets/format';
import { TourTarget } from '@/features/tour/tour-provider';
import { useProductDensity } from '@/hooks/use-product-density';
import { useProgressiveList } from '@/hooks/use-progressive-list';
import { useVadTheme } from '@/providers/theme-provider';
import { useCurrencyPreference, type VADCurrency } from '@/providers/currency-preference-provider';
import type { MarketHistoryRow, OrderRow, PositionRow, SettlementReceiptRow } from '@/services/market-api';

type PortfolioTab = 'positions' | 'orders' | 'payouts';

type AssetExposure = {
  assetCode: string;
  deployed: number;
  openNotional: number;
  positions: number;
  orders: number;
};

export function PortfolioScreen({
  positions: allPositions,
  orders: allOrders,
  settlements: allSettlements,
  marketHistory: allMarketHistory,
  onOpenPosition,
  onOpenOrder,
}: {
  positions: PositionRow[];
  orders: OrderRow[];
  settlements: SettlementReceiptRow[];
  marketHistory: MarketHistoryRow[];
  onOpenPosition: (position: PositionRow) => void;
  onOpenOrder: (order: OrderRow) => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const { enabledCurrencies } = useCurrencyPreference();
  const positions = allPositions.filter((row) => row.asset_code !== 'TNGN' && enabledCurrencies.includes(row.asset_code as VADCurrency));
  const orders = allOrders.filter((row) => row.asset_code !== 'TNGN' && enabledCurrencies.includes(row.asset_code as VADCurrency));
  const settlements = allSettlements.filter((row) => row.asset_code !== 'TNGN' && enabledCurrencies.includes(row.asset_code as VADCurrency));
  const marketHistory = allMarketHistory.filter((row) => row.asset_code !== 'TNGN' && enabledCurrencies.includes(row.asset_code as VADCurrency));
  const realizedByAsset = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of marketHistory) totals.set(row.asset_code, (totals.get(row.asset_code) ?? 0) + Number(row.realized_pnl ?? 0));
    return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [marketHistory]);
  const [tab, setTab] = useState<PortfolioTab>('positions');

  const totalShares = positions.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
  const exposure = useMemo(() => buildAssetExposure(positions, orders), [positions, orders]);
  const grid = density.wide;
  const pageSize = grid ? 8 : 5;
  const visiblePositions = useProgressiveList({
    items: positions,
    initialCount: pageSize,
    step: pageSize,
    resetKey: `positions|${positions.length}|${grid}`,
  });
  const visibleOrders = useProgressiveList({
    items: orders,
    initialCount: pageSize,
    step: pageSize,
    resetKey: `orders|${orders.length}|${grid}`,
  });
  const visiblePayouts = useProgressiveList({
    items: settlements,
    initialCount: pageSize,
    step: pageSize,
    resetKey: `payouts|${settlements.length}|${grid}`,
  });
  const activeList = tab === 'positions' ? visiblePositions : tab === 'orders' ? visibleOrders : visiblePayouts;

  return (
    <View style={{ gap: density.phone ? 14 : density.sectionGap }}>
      <View style={{ gap: 3 }}>
        <VadText variant="title">Portfolio</VadText>
        <VadText variant="caption" tone="secondary">Your positions, orders and settled markets.</VadText>
      </View>
      <TourTarget id="portfolio-summary">
        <VadCard variant="brand" style={{ padding: density.phone ? 14 : theme.spacing.lg, gap: theme.spacing.sm, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <View style={{ gap: 4 }}>
              <VadText variant="caption" tone="secondary">YOUR PORTFOLIO</VadText>
              <VadText variant="heading">{positions.length} {positions.length === 1 ? 'holding' : 'holdings'}</VadText>
            </View>
            <View style={{ width: 46, height: 46, borderRadius: 17, backgroundColor: theme.colors.brandSoft, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <VadIcon name="wallet" size={21} tone="brand" />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 0, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
            <View style={{ flex: 1, gap: 3, paddingRight: 8 }}>
              <VadText variant="caption" tone="secondary">Shares held</VadText>
              <VadText variant="heading">{Number(totalShares).toLocaleString()}</VadText>
            </View>
            <View style={{ flex: 1, gap: 3, paddingHorizontal: 8, borderLeftWidth: 1, borderLeftColor: theme.colors.border }}>
              <VadText variant="caption" tone="secondary">Open orders</VadText>
              <VadText variant="heading">{orders.filter((order) => Number(order.remaining_quantity ?? 0) > 0).length}</VadText>
            </View>
            <View style={{ flex: 1, gap: 3, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: theme.colors.border }}>
              <VadText variant="caption" tone="secondary">Payouts</VadText>
              <VadText variant="heading">{settlements.length}</VadText>
            </View>
          </View>
        </VadCard>
      </TourTarget>
      <TngnDemoModeCard />

      {realizedByAsset.length ? (
        <VadCard variant="surface" style={{ padding: density.phone ? 12 : 16, gap: theme.spacing.sm, borderRadius: 18 }}>
          <VadSectionHeader title="Realized performance" subtitle="Settled market P&L from your recorded results. Each currency is kept separate." />
          {realizedByAsset.map(([assetCode, value]) => (
            <View key={assetCode} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm, paddingVertical: 5, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
              <View style={{ flex: 1, gap: 1 }}><VadText variant="bodyStrong">{assetCode}</VadText><VadText variant="caption" tone="tertiary">Realized P&L</VadText></View>
              <VadText variant="bodyStrong" tone={value >= 0 ? 'yes' : 'no'}>{signedMoney(value, assetCode)}</VadText>
            </View>
          ))}
        </VadCard>
      ) : null}

      {exposure.length ? (
        <VadProgressiveSection
          title="Capital at work"
          icon="wallet"
          summary={<VadText variant="caption" tone="tertiary">{exposure.map((item) => item.assetCode).join(' · ')}</VadText>}
        >
          <View style={{ flexDirection: density.width >= 720 ? 'row' : 'column', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {exposure.map((item) => <AssetExposureCard key={item.assetCode} exposure={item} />)}
          </View>
        </VadProgressiveSection>
      ) : null}

      <TourTarget id="portfolio-switcher">
        <View style={{ gap: theme.spacing.xs }}>
          <VadSegmentedControl
            value={tab}
            options={[
              { value: 'positions', label: `Positions ${positions.length}` },
              { value: 'orders', label: `Orders ${orders.length}` },
              { value: 'payouts', label: `Payouts ${settlements.length}` },
            ] as const}
            onChange={setTab}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <VadText variant="caption" tone="tertiary">
              {activeList.visibleCount} of {activeList.totalCount} shown
            </VadText>
            <VadText variant="caption" tone="secondary">Tap an item for details</VadText>
          </View>
        </View>
      </TourTarget>

      {tab === 'positions' ? (
        positions.length ? (
          <ProgressiveGrid
            grid={grid}
            remaining={visiblePositions.remainingCount}
            next={visiblePositions.nextCount}
            noun="positions"
            onMore={visiblePositions.showMore}
          >
            {visiblePositions.visibleItems.map((position) => (
              <View key={`${position.instrument_id}-${position.outcome_code}`} style={{ width: grid ? '48.9%' : '100%' }}>
                <PositionCard position={position} onPress={() => onOpenPosition(position)} />
              </View>
            ))}
          </ProgressiveGrid>
        ) : (
          <VadEmptyState title="No matched positions" body="Peer-pool stakes appear in Predictions." />
        )
      ) : null}

      {tab === 'orders' ? (
        orders.length ? (
          <ProgressiveGrid
            grid={grid}
            remaining={visibleOrders.remainingCount}
            next={visibleOrders.nextCount}
            noun="orders"
            onMore={visibleOrders.showMore}
          >
            {visibleOrders.visibleItems.map((order) => (
              <View key={order.order_id} style={{ width: grid ? '48.9%' : '100%' }}>
                <OrderCard order={order} onPress={() => onOpenOrder(order)} />
              </View>
            ))}
          </ProgressiveGrid>
        ) : (
          <VadEmptyState title="No open orders" body="Filled orders move to Positions." />
        )
      ) : null}

      {tab === 'payouts' ? (
        settlements.length ? (
          <ProgressiveGrid
            grid={grid}
            remaining={visiblePayouts.remainingCount}
            next={visiblePayouts.nextCount}
            noun="payouts"
            onMore={visiblePayouts.showMore}
          >
            {visiblePayouts.visibleItems.map((receipt) => (
              <View key={`${receipt.settlement_id}-${receipt.market_id}-${receipt.outcome_code}`} style={{ width: grid ? '48.9%' : '100%' }}>
                <SettlementCard receipt={receipt} />
              </View>
            ))}
          </ProgressiveGrid>
        ) : (
          <VadEmptyState title="No payouts yet" body="Settled winning payouts appear here with fees and net credit." />
        )
      ) : null}
    </View>
  );
}

function ProgressiveGrid({
  grid,
  remaining,
  next,
  noun,
  onMore,
  children,
}: {
  grid: boolean;
  remaining: number;
  next: number;
  noun: string;
  onMore: () => void;
  children: ReactNode;
}) {
  const theme = useVadTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      <CardGrid grid={grid}>{children}</CardGrid>
      {remaining > 0 ? (
        <View style={{ alignItems: 'center' }}>
          <VadButton
            label={`Show next ${next}`}
            accessibilityLabel={`Show next ${next} ${noun}`}
            variant="secondary"
            size="small"
            fullWidth={false}
            onPress={onMore}
          />
        </View>
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
      <VadCard variant="raised" style={{ padding: theme.spacing.sm, gap: theme.spacing.xs, borderRadius: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <VadText variant="bodyStrong" numberOfLines={2}>{position.market_title}</VadText>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
              <VadChip label={position.outcome_code} tone={yes ? 'yes' : 'no'} />
              <VadText variant="caption" tone="tertiary">{position.asset_code} · {positionStatusLabel(position.status)}</VadText>
            </View>
          </View>
          <VadIcon name="chevronRight" size={18} tone="tertiary" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm }}>
          <View style={{ flex: 1, gap: 2 }}>
            <VadText variant="caption" tone="tertiary">Shares</VadText>
            <VadText variant="bodyStrong">{Number(position.quantity).toLocaleString()}</VadText>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <VadText variant="caption" tone="tertiary">Avg. entry</VadText>
            <VadText variant="bodyStrong">{pct(position.average_price)}</VadText>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end', gap: 2 }}>
            <VadText variant="caption" tone="tertiary">Invested</VadText>
            <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{assetMoney(position.total_cost_basis, position.asset_code)}</VadText>
          </View>
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
      <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
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
    <VadCard variant="brand" style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <VadText variant="caption" tone="yes">PAYOUT</VadText>
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
        <VadText variant="bodyStrong" tone="yes">{assetMoney(receipt.net_amount, receipt.asset_code)}</VadText>
      </View>
      <VadText variant="caption" tone="tertiary" selectable>{receipt.settlement_id}</VadText>
    </VadCard>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: 96, minWidth: 0, borderRadius: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 10, paddingVertical: 9, gap: 2 }}>
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

function signedMoney(value: number | string, assetCode: string) {
  const amount = Number(value ?? 0);
  const formatted = assetMoney(amount, assetCode);
  return amount > 0 ? `+${formatted}` : formatted;
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
