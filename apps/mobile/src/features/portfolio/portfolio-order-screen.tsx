import { useWindowDimensions, View } from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadText } from '@/components/ui/vad-text';
import { money, pct } from '@/features/markets/format';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

export function PortfolioOrderScreen({ orderId }: { orderId: string }) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const data = useProductDataContext();

  const order = data.orders.find(
    (row) => String(row.order_id) === orderId,
  );

  if (!order) {
    return (
      <VadEmptyState
        title="Order unavailable"
        body="This order is no longer in your current open-order list."
      />
    );
  }

  const fillRatio =
    Number(order.quantity) > 0
      ? Number(order.filled_quantity) / Number(order.quantity)
      : 0;

  const fillPercent = Math.max(0, Math.min(1, fillRatio));

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
          gap: theme.spacing.md,
          alignItems: 'stretch',
        }}
      >
        <View
          style={{
            flex: 1.1,
            borderRadius: theme.radius.xl,
            backgroundColor: theme.colors.surfaceRaised,
            padding: theme.spacing.xl,
            gap: theme.spacing.sm,
          }}
        >
          <VadText variant="caption" tone="secondary">
            LIMIT PRICE
          </VadText>
          <VadText variant="display">{money(order.limit_price)}</VadText>
          <VadText variant="caption" tone="secondary">
            {Number(order.remaining_quantity).toLocaleString()} shares remain open.
          </VadText>
        </View>

        <View
          style={{
            flex: 0.9,
            borderRadius: theme.radius.xl,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            padding: theme.spacing.lg,
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
                width: Math.round(fillPercent * 100) + '%',
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
            label="Fill progress"
            value={pct(fillPercent)}
          />
          <Detail label="Status" value={order.status} />
        </View>
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

function Detail({ label, value }: { label: string; value: string }) {
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
        style={{ flex: 1, textAlign: 'right' }}
      >
        {value}
      </VadText>
    </View>
  );
}
