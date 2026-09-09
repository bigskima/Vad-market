import { useState } from 'react';
import {
  useWindowDimensions,
  View,
  type DimensionValue,
} from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
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
  const wide = width >= 760;
  const data = useProductDataContext();
  const [cancelling, setCancelling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const order = data.orders.find(
    (row) => String(row.order_id) === orderId,
  );

  if (!order) {
    return (
      <VadEmptyState
        title="Order unavailable"
        body="This order is no longer in your current open-order list. It may have filled, been cancelled or otherwise left the open queue."
      />
    );
  }

  const currentOrder = order;

  const fillRatio =
    Number(currentOrder.quantity) > 0
      ? Number(currentOrder.filled_quantity) / Number(currentOrder.quantity)
      : 0;

  const fillPercent = Math.max(0, Math.min(1, fillRatio));
  const remainingNotional =
    Number(currentOrder.limit_price) * Number(currentOrder.remaining_quantity);

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
    <View style={{ gap: theme.spacing.xl }}>
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
            {currentOrder.status}
          </VadText>
        </View>

        <VadText variant="title">{currentOrder.side} order</VadText>
        <VadText tone="secondary">
          Created {new Date(currentOrder.created_at).toLocaleString()}
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
            borderColor: theme.colors.border,
            paddingVertical: theme.spacing.lg,
            gap: theme.spacing.sm,
          }}
        >
          <VadText variant="caption" tone="secondary">
            LIMIT PRICE
          </VadText>
          <VadText variant="display">{money(currentOrder.limit_price)}</VadText>
          <VadText variant="caption" tone="secondary">
            {Number(currentOrder.remaining_quantity).toLocaleString()} shares remain
            open · {money(remainingNotional)} remaining notional.
          </VadText>
        </View>

        <View
          style={{
            flex: 0.9,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: theme.colors.border,
            paddingVertical: theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: theme.spacing.md,
            }}
          >
            <VadText variant="caption" tone="secondary">
              Fill progress
            </VadText>
            <VadText variant="bodyStrong">{pct(fillPercent)}</VadText>
          </View>

          <View
            style={{
              height: 8,
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

          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.xl,
              flexWrap: 'wrap',
            }}
          >
            <Snapshot
              label="Filled"
              value={Number(currentOrder.filled_quantity).toLocaleString()}
            />
            <Snapshot
              label="Remaining"
              value={Number(currentOrder.remaining_quantity).toLocaleString()}
            />
          </View>
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <VadText variant="heading">Order details</VadText>
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
          <Detail
            label="Quantity"
            value={Number(currentOrder.quantity).toLocaleString()}
          />
          <Detail
            label="Filled"
            value={Number(currentOrder.filled_quantity).toLocaleString()}
          />
          <Detail
            label="Remaining"
            value={Number(currentOrder.remaining_quantity).toLocaleString()}
          />
          <Detail
            label="Remaining notional"
            value={money(remainingNotional)}
          />
          <Detail
            label="Fill progress"
            value={pct(fillPercent)}
          />
          <Detail label="Status" value={currentOrder.status} />
        </View>
      </View>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          paddingTop: theme.spacing.lg,
          gap: theme.spacing.sm,
        }}
      >
        <VadText variant="bodyStrong">Order controls</VadText>
        <VadText variant="caption" tone="secondary">
          Cancelling affects only the quantity still open. Completed fills are
          not reversed.
        </VadText>

        <VadButton
          label="Cancel remaining order"
          variant="danger"
          loading={cancelling}
          onPress={requestCancel}
        />
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
              {Number(currentOrder.remaining_quantity).toLocaleString()} shares are
              still open.
            </VadText>
            <VadText variant="caption" tone="secondary">
              Any quantity already filled stays filled. Cancelling removes only
              the remaining open quantity from the order book.
            </VadText>
          </View>

          {cancelError ? (
            <View
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
            <Detail
              label="Remaining"
              value={Number(currentOrder.remaining_quantity).toLocaleString()}
            />
            <Detail
              label="Remaining notional"
              value={money(remainingNotional)}
            />
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
    <View style={{ minWidth: 92, gap: 2 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="bodyStrong">{value}</VadText>
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
      <VadText
        variant="caption"
        tone="tertiary"
        style={{ flex: 1 }}
      >
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
