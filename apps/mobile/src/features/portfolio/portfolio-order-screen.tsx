import { useState } from 'react';
import {
  Alert,
  useWindowDimensions,
  View,
  type DimensionValue,
} from 'react-native';

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

  const fillRatio =
    Number(order.quantity) > 0
      ? Number(order.filled_quantity) / Number(order.quantity)
      : 0;

  const fillPercent = Math.max(0, Math.min(1, fillRatio));
  const remainingNotional =
    Number(order.limit_price) * Number(order.remaining_quantity);

  async function cancel() {
    setCancelling(true);

    try {
      await cancelOrder(String(order.order_id));
      await data.load();
      Alert.alert(
        'Order cancelled',
        'The remaining open quantity has been removed from the order book.',
      );
      onCancelled?.();
    } catch (error) {
      Alert.alert(
        'Order not cancelled',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setCancelling(false);
    }
  }

  function requestCancel() {
    Alert.alert(
      'Cancel this order?',
      'Any quantity already filled stays filled. Only the remaining open quantity will be cancelled.',
      [
        { text: 'Keep order', style: 'cancel' },
        {
          text: 'Cancel order',
          style: 'destructive',
          onPress: () => void cancel(),
        },
      ],
    );
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
            {order.status}
          </VadText>
        </View>

        <VadText variant="title">{order.side} order</VadText>
        <VadText tone="secondary">
          Created {new Date(order.created_at).toLocaleString()}
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
          <VadText variant="display">{money(order.limit_price)}</VadText>
          <VadText variant="caption" tone="secondary">
            {Number(order.remaining_quantity).toLocaleString()} shares remain
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
              value={Number(order.filled_quantity).toLocaleString()}
            />
            <Snapshot
              label="Remaining"
              value={Number(order.remaining_quantity).toLocaleString()}
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
            value={String(order.order_id)}
            selectable
          />
          <Detail
            label="Quantity"
            value={Number(order.quantity).toLocaleString()}
          />
          <Detail
            label="Filled"
            value={Number(order.filled_quantity).toLocaleString()}
          />
          <Detail
            label="Remaining"
            value={Number(order.remaining_quantity).toLocaleString()}
          />
          <Detail
            label="Remaining notional"
            value={money(remainingNotional)}
          />
          <Detail
            label="Fill progress"
            value={pct(fillPercent)}
          />
          <Detail label="Status" value={order.status} />
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
