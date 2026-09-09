import { View } from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadText } from '@/components/ui/vad-text';
import { money, pct } from '@/features/markets/format';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

export function PortfolioOrderScreen({ orderId }: { orderId: string }) {
  const theme = useVadTheme();
  const data = useProductDataContext();
  const order = data.orders.find((row) => String(row.order_id) === orderId);

  if (!order) {
    return (
      <VadEmptyState
        title="Order unavailable"
        body="This order is no longer in your current open-order list."
      />
    );
  }

  const fillPct =
    Number(order.quantity) > 0
      ? Number(order.filled_quantity) / Number(order.quantity)
      : 0;

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">OPEN ORDER</VadText>
        <VadText variant="title">{order.side} order</VadText>
        <VadText tone="secondary">
          Created {new Date(order.created_at).toLocaleString()}
        </VadText>
      </View>

      <View
        style={{
          borderRadius: theme.radius.xl,
          backgroundColor: theme.colors.surfaceRaised,
          padding: theme.spacing.xl,
          gap: theme.spacing.xs,
        }}
      >
        <VadText variant="caption" tone="secondary">Limit price</VadText>
        <VadText variant="display">{money(order.limit_price)}</VadText>
        <VadText variant="caption" tone="secondary">{order.status}</VadText>
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
        <Detail label="Quantity" value={Number(order.quantity).toLocaleString()} />
        <Detail label="Filled" value={Number(order.filled_quantity).toLocaleString()} />
        <Detail label="Remaining" value={Number(order.remaining_quantity).toLocaleString()} />
        <Detail label="Fill progress" value={pct(fillPct)} />
        <Detail label="Status" value={order.status} />
      </View>
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
      <VadText variant="caption" tone="tertiary" style={{ flex: 1 }}>{label}</VadText>
      <VadText variant="bodyStrong" style={{ flex: 1, textAlign: 'right' }}>{value}</VadText>
    </View>
  );
}
