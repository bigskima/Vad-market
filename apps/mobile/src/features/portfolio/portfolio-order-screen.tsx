import { useState } from 'react';
import { View, type DimensionValue } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { money, pct } from '@/features/markets/format';
import { useProductDensity } from '@/hooks/use-product-density';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { cancelOrder } from '@/services/market-api';

export function PortfolioOrderScreen({ orderId, onCancelled }: { orderId: string; onCancelled?: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const wide = density.width >= 840;
  const data = useProductDataContext();
  const [cancelling, setCancelling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const order = data.orders.find((row) => String(row.order_id) === orderId);

  if (data.loading) {
    return (
      <View style={{ gap: theme.spacing.sm }}>
        <VadSkeleton height={density.compact ? 104 : 124} radius={density.cardRadius} />
        <VadSkeleton height={92} radius={density.cardRadius} />
        <VadSkeleton height={118} radius={density.cardRadius} />
      </View>
    );
  }

  if (!order && data.sectionErrors.orders) return <VadErrorState title="Order could not be loaded" message={data.sectionErrors.orders} onRetry={() => void data.load()} />;
  if (!order) return <VadEmptyState title="Order unavailable" body="This order is no longer in your current open-order list. It may have filled, been cancelled or otherwise left the open queue." />;

  const currentOrder = order;
  const quantity = Number(currentOrder.quantity);
  const filled = Number(currentOrder.filled_quantity);
  const remaining = Number(currentOrder.remaining_quantity);
  const limitPrice = Number(currentOrder.limit_price);
  const fillPercent = quantity > 0 ? Math.max(0, Math.min(1, filled / quantity)) : 0;
  const progressWidth = `${Math.round(fillPercent * 100)}%` as DimensionValue;
  const originalNotional = limitPrice * quantity;
  const remainingNotional = limitPrice * remaining;

  async function cancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelOrder(String(currentOrder.order_id));
      setConfirmOpen(false);
      await data.load();
      onCancelled?.();
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <View style={{ gap: density.sectionGap }}>
      <View style={{ gap: theme.spacing.xs }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'center', flexWrap: 'wrap' }}>
          <VadChip label={`${currentOrder.side} order`} tone="brand" />
          <VadChip label={currentOrder.status.replaceAll('_', ' ')} />
        </View>
        <VadText variant="heading">Open order</VadText>
        <VadText variant="caption" tone="secondary">Created {new Date(currentOrder.created_at).toLocaleString()}. Cancelling only affects quantity that is still open.</VadText>
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.md }}>
        <VadCard style={{ flex: 1.1, borderColor: theme.colors.brandPrimary, gap: theme.spacing.sm }}>
          <VadText variant="caption" tone="brand">LIMIT PRICE</VadText>
          <VadText variant="display" numberOfLines={1} adjustsFontSizeToFit>{money(limitPrice)}</VadText>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Snapshot label="Original shares" value={quantity.toLocaleString()} />
            <Snapshot label="Original notional" value={money(originalNotional)} />
          </View>
        </VadCard>

        <VadCard variant="raised" style={{ flex: 0.9, gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: 1 }}>
              <VadText variant="caption" tone="secondary">FILL PROGRESS</VadText>
              <VadText variant="heading">{pct(fillPercent)}</VadText>
            </View>
            <VadText variant="caption" tone="tertiary">{remaining.toLocaleString()} open</VadText>
          </View>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(fillPercent * 100) }} style={{ height: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden' }}>
            <View style={{ width: progressWidth, height: '100%', backgroundColor: theme.colors.brandPrimary }} />
          </View>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Snapshot label="Filled" value={filled.toLocaleString()} />
            <Snapshot label="Remaining" value={remaining.toLocaleString()} />
          </View>
        </VadCard>
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'flex-start', gap: theme.spacing.md }}>
        <VadCard style={{ flex: 1.1, width: '100%', gap: theme.spacing.xs }}>
          <VadText variant="bodyStrong">Order details</VadText>
          <Detail label="Reference" value={String(currentOrder.order_id)} selectable />
          <Detail label="Side" value={currentOrder.side} />
          <Detail label="Limit price" value={money(limitPrice)} />
          <Detail label="Quantity" value={quantity.toLocaleString()} />
          <Detail label="Filled" value={filled.toLocaleString()} />
          <Detail label="Remaining" value={remaining.toLocaleString()} />
          <Detail label="Open notional" value={money(remainingNotional)} />
          <Detail label="Status" value={currentOrder.status.replaceAll('_', ' ')} />
        </VadCard>

        <VadCard variant="raised" style={{ flex: 0.9, width: '100%', gap: theme.spacing.sm }}>
          <VadText variant="bodyStrong">Remaining exposure</VadText>
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
            <ContextFact label="Open shares" value={remaining.toLocaleString()} />
            <ContextFact label="Open notional" value={money(remainingNotional)} />
          </View>
          <VadText variant="caption" tone="secondary">Existing fills are never reversed when you cancel the still-open part of an order.</VadText>
          <VadButton label="Cancel remaining" variant="danger" loading={cancelling} disabled={remaining <= 0} onPress={() => { setCancelError(null); setConfirmOpen(true); }} />
        </VadCard>
      </View>

      <VadBottomSheet visible={confirmOpen} title="Cancel remaining order?" onClose={() => { if (!cancelling) setConfirmOpen(false); }}>
        <View style={{ gap: theme.spacing.md }}>
          <VadText variant="bodyStrong">{remaining.toLocaleString()} shares are still open.</VadText>
          <VadText variant="caption" tone="secondary">Filled quantity stays filled. Only the remaining open quantity will be removed from the order book.</VadText>
          {cancelError ? <VadCard style={{ borderColor: theme.colors.danger, backgroundColor: theme.colors.noSoft }}><VadText variant="caption" tone="danger">{cancelError}</VadText></VadCard> : null}
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
            <ContextFact label="Remaining" value={remaining.toLocaleString()} />
            <ContextFact label="Notional" value={money(remainingNotional)} />
          </View>
          <VadButton label="Cancel remaining" variant="danger" loading={cancelling} onPress={() => void cancel()} />
          <VadButton label="Keep order" variant="secondary" disabled={cancelling} onPress={() => setConfirmOpen(false)} />
        </View>
      </VadBottomSheet>
    </View>
  );
}

function Snapshot({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{value}</VadText>
    </View>
  );
}

function ContextFact({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.sm, gap: 1 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{value}</VadText>
    </View>
  );
}

function Detail({ label, value, selectable = false }: { label: string; value: string; selectable?: boolean }) {
  const theme = useVadTheme();
  return (
    <View style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <VadText variant="caption" tone="tertiary" style={{ flex: 1 }}>{label}</VadText>
      <VadText variant="bodyStrong" style={{ flex: 1.35, textAlign: 'right' }} selectable={selectable} numberOfLines={selectable ? undefined : 2}>{value}</VadText>
    </View>
  );
}
