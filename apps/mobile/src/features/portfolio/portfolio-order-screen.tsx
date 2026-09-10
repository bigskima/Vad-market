import { useState } from 'react';
import {
  useWindowDimensions,
  View,
  type DimensionValue,
} from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { money, pct } from '@/features/markets/format';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { cancelOrder } from '@/services/market-api';

export function PortfolioOrderScreen({
  orderId,
  onCancelled,
}: {
  orderId: string;
  onCancelled?: () => void;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 840;
  const compact = width < 380;
  const data = useProductDataContext();
  const [cancelling, setCancelling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const order = data.orders.find(
    (row) => String(row.order_id) === orderId,
  );

  if (data.loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="46%" height={30} />
        <VadSkeleton height={160} radius={theme.radius.xl} />
        <VadSkeleton height={62} />
        <VadSkeleton height={62} />
      </View>
    );
  }

  if (!order && data.sectionErrors.orders) {
    return (
      <VadErrorState
        title="Order could not be loaded"
        message={data.sectionErrors.orders}
        onRetry={() => void data.load()}
      />
    );
  }

  if (!order) {
    return (
      <VadEmptyState
        title="Order unavailable"
        body="This order is no longer in your current open-order list. It may have filled, been cancelled or otherwise left the open queue."
      />
    );
  }

  const currentOrder = order;
  const quantity = Number(currentOrder.quantity);
  const filled = Number(currentOrder.filled_quantity);
  const remaining = Number(currentOrder.remaining_quantity);
  const limitPrice = Number(currentOrder.limit_price);
  const fillRatio = quantity > 0 ? filled / quantity : 0;
  const fillPercent = Math.max(0, Math.min(1, fillRatio));
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
      setCancelError(
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setCancelling(false);
    }
  }

  function requestCancel() {
    setCancelError(null);
    setConfirmOpen(true);
  }

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <View
          style={{
            flexDirection: 'row',
            gap: theme.spacing.xs,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <VadText variant="label" tone="brand">OPEN ORDER</VadText>
          <VadText variant="caption" tone="tertiary">·</VadText>
          <VadText variant="caption" tone="secondary">
            {currentOrder.status.replaceAll('_', ' ')}
          </VadText>
        </View>

        <VadText variant="title">
          {currentOrder.side === 'BUY' ? 'Buy' : currentOrder.side === 'SELL' ? 'Sell' : currentOrder.side} order
        </VadText>
        <VadText tone="secondary">
          Created {new Date(currentOrder.created_at).toLocaleString()}. Only the
          quantity still open can be cancelled from this screen.
        </VadText>
      </View>

      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.xl,
          alignItems: 'stretch',
        }}
      >
        <View
          style={{
            flex: 1.1,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: theme.colors.brandPrimary,
            paddingVertical: compact ? theme.spacing.md : theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <VadText variant="caption" tone="brand">LIMIT PRICE</VadText>
          <VadText variant="display" numberOfLines={1} adjustsFontSizeToFit>
            {money(limitPrice)}
          </VadText>
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              paddingTop: theme.spacing.md,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: theme.spacing.xl,
            }}
          >
            <Snapshot label="Original shares" value={quantity.toLocaleString()} />
            <Snapshot label="Original notional" value={money(originalNotional)} />
          </View>
        </View>

        <View
          style={{
            flex: 0.9,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: theme.colors.border,
            paddingVertical: compact ? theme.spacing.md : theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              gap: theme.spacing.md,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <VadText variant="caption" tone="secondary">FILL PROGRESS</VadText>
              <VadText variant="heading">{pct(fillPercent)}</VadText>
            </View>
            <VadText variant="caption" tone="tertiary">
              {remaining.toLocaleString()} shares open
            </VadText>
          </View>

          <View
            accessibilityRole="progressbar"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: Math.round(fillPercent * 100),
            }}
            style={{
              height: 8,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.surfaceMuted,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: progressWidth,
                height: '100%',
                backgroundColor: theme.colors.brandPrimary,
              }}
            />
          </View>

          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.xl,
              flexWrap: 'wrap',
            }}
          >
            <Snapshot label="Filled" value={filled.toLocaleString()} />
            <Snapshot label="Remaining" value={remaining.toLocaleString()} />
          </View>
        </View>
      </View>

      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          alignItems: 'flex-start',
          gap: theme.spacing.xxl,
        }}
      >
        <View style={{ flex: 1.1, width: '100%', gap: theme.spacing.sm }}>
          <View style={{ gap: 2 }}>
            <VadText variant="heading">Order details</VadText>
            <VadText variant="caption" tone="secondary">
              Current order-book state returned by the backend.
            </VadText>
          </View>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
            }}
          >
            <Detail
              label="Order reference"
              value={String(currentOrder.order_id)}
              selectable
            />
            <Detail label="Side" value={currentOrder.side} />
            <Detail label="Limit price" value={money(limitPrice)} />
            <Detail label="Quantity" value={quantity.toLocaleString()} />
            <Detail label="Filled" value={filled.toLocaleString()} />
            <Detail label="Remaining" value={remaining.toLocaleString()} />
            <Detail label="Remaining notional" value={money(remainingNotional)} />
            <Detail label="Status" value={currentOrder.status.replaceAll('_', ' ')} />
          </View>
        </View>

        <View style={{ flex: 0.8, width: '100%', gap: theme.spacing.lg }}>
          <View
            style={{
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: theme.colors.border,
              paddingVertical: theme.spacing.md,
              gap: theme.spacing.md,
            }}
          >
            <View style={{ gap: 2 }}>
              <VadText variant="heading">Remaining exposure</VadText>
              <VadText variant="caption" tone="secondary">
                The still-open part of this limit order.
              </VadText>
            </View>
            <Snapshot label="Open shares" value={remaining.toLocaleString()} />
            <Snapshot label="Open notional" value={money(remainingNotional)} />
          </View>

          <View
            style={{
              borderTopWidth: 1,
              borderColor: theme.colors.border,
              paddingTop: theme.spacing.md,
              gap: theme.spacing.sm,
            }}
          >
            <VadText variant="bodyStrong">Order controls</VadText>
            <VadText variant="caption" tone="secondary">
              Cancelling removes only the quantity still open. Existing fills
              are not reversed.
            </VadText>
            <VadButton
              label="Cancel remaining order"
              variant="danger"
              loading={cancelling}
              disabled={remaining <= 0}
              onPress={requestCancel}
            />
          </View>
        </View>
      </View>

      <VadBottomSheet
        visible={confirmOpen}
        title="Cancel remaining order?"
        onClose={() => {
          if (!cancelling) setConfirmOpen(false);
        }}
      >
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: theme.spacing.xs }}>
            <VadText variant="bodyStrong">
              {remaining.toLocaleString()} shares are still open.
            </VadText>
            <VadText variant="caption" tone="secondary">
              Any quantity already filled stays filled. Cancelling removes only
              the remaining open quantity from the order book.
            </VadText>
          </View>

          {cancelError ? (
            <View
              accessibilityRole="alert"
              style={{
                borderLeftWidth: 3,
                borderLeftColor: theme.colors.danger,
                backgroundColor: theme.colors.noSoft,
                padding: theme.spacing.md,
              }}
            >
              <VadText variant="caption" tone="danger">
                {cancelError}
              </VadText>
            </View>
          ) : null}

          <View
            style={{
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Detail label="Remaining" value={remaining.toLocaleString()} />
            <Detail label="Remaining notional" value={money(remainingNotional)} />
          </View>

          <VadButton
            label="Cancel remaining order"
            variant="danger"
            loading={cancelling}
            onPress={() => void cancel()}
          />
          <VadButton
            label="Keep order"
            variant="secondary"
            disabled={cancelling}
            onPress={() => setConfirmOpen(false)}
          />
        </View>
      </VadBottomSheet>
    </View>
  );
}

function Snapshot({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 104, flex: 1, gap: 2 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="bodyStrong" numberOfLines={1}>{value}</VadText>
    </View>
  );
}

function Detail({
  label,
  value,
  selectable = false,
}: {
  label: string;
  value: string;
  selectable?: boolean;
}) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        minHeight: 58,
        paddingVertical: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <VadText variant="caption" tone="tertiary" style={{ flex: 1 }}>
        {label}
      </VadText>
      <VadText
        variant="bodyStrong"
        style={{ flex: 1.4, textAlign: 'right' }}
        selectable={selectable}
        numberOfLines={selectable ? undefined : 2}
      >
        {value}
      </VadText>
    </View>
  );
}
