import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { PaymentRow } from '@/features/wallet/wallet-screen';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getMyPaymentIntents,
  type PaymentIntentRow,
} from '@/services/payment-api';

type ActivityFilter = 'all' | 'processing' | 'settled' | 'failed';

export function WalletActivityScreen({
  onOpenTransaction,
}: {
  onOpenTransaction: (intent: PaymentIntentRow) => void;
}) {
  const theme = useVadTheme();
  const [rows, setRows] = useState<PaymentIntentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ActivityFilter>('all');

  const load = useCallback(async () => {
    try {
      setRows(await getMyPaymentIntents(50));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const counts = useMemo(() => {
    const next = {
      all: rows.length,
      processing: 0,
      settled: 0,
      failed: 0,
    };

    rows.forEach((row) => {
      next[classify(row.status)] += 1;
    });

    return next;
  }, [rows]);

  const visibleRows = useMemo(
    () =>
      filter === 'all'
        ? rows
        : rows.filter((row) => classify(row.status) === filter),
    [filter, rows],
  );

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">WALLET ACTIVITY</VadText>
        <VadText variant="title">Money movement, in one timeline.</VadText>
        <VadText tone="secondary">
          Review deposit and withdrawal intents without mixing them with
          trading orders or portfolio exposure.
        </VadText>
      </View>

      {loading ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadSkeleton height={74} />
          <VadSkeleton height={62} />
          <VadSkeleton height={62} />
          <VadSkeleton height={62} />
        </View>
      ) : (
        <>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: theme.spacing.sm,
            }}
          >
            <Summary label="All" value={counts.all} />
            <Summary label="Processing" value={counts.processing} />
            <Summary label="Settled" value={counts.settled} />
            <Summary label="Failed" value={counts.failed} />
          </View>

          <View
            style={{
              flexDirection: 'row',
              padding: theme.spacing.xxs,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.surfaceRaised,
            }}
          >
            {(
              [
                ['all', 'All'],
                ['processing', 'Processing'],
                ['settled', 'Settled'],
                ['failed', 'Failed'],
              ] as const
            ).map(([value, label]) => {
              const selected = filter === value;

              return (
                <Pressable
                  key={value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setFilter(value)}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 42,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: theme.radius.md,
                    backgroundColor: selected
                      ? theme.colors.surface
                      : 'transparent',
                    opacity: pressed ? 0.68 : 1,
                  })}
                >
                  <VadText
                    variant="caption"
                    tone={selected ? 'brand' : 'secondary'}
                  >
                    {label}
                  </VadText>
                </Pressable>
              );
            })}
          </View>

          {visibleRows.length ? (
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
              }}
            >
              {visibleRows.map((row) => (
                <PaymentRow
                  key={row.intent_public_id}
                  intent={row}
                  onPress={() => onOpenTransaction(row)}
                />
              ))}
            </View>
          ) : (
            <VadEmptyState
              title={
                filter === 'all'
                  ? 'No payment activity yet'
                  : 'Nothing in this status'
              }
              body={
                filter === 'all'
                  ? 'Your deposit and withdrawal intents will appear here.'
                  : 'Try another activity filter.'
              }
            />
          )}
        </>
      )}
    </View>
  );
}

function classify(status: string): Exclude<ActivityFilter, 'all'> {
  const normalized = status.toUpperCase();

  if (normalized === 'SETTLED' || normalized === 'COMPLETED') {
    return 'settled';
  }

  if (
    normalized.includes('FAIL') ||
    normalized.includes('REJECT') ||
    normalized.includes('CANCEL')
  ) {
    return 'failed';
  }

  return 'processing';
}

function Summary({ label, value }: { label: string; value: number }) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: 120,
        minHeight: 72,
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: theme.spacing.md,
      }}
    >
      <VadText variant="heading">{value}</VadText>
      <VadText variant="caption" tone="secondary">{label}</VadText>
    </View>
  );
}
