import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
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
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>('all');

  const load = useCallback(async () => {
    setError(null);

    try {
      const next = await getMyPaymentIntents(50);
      setRows(
        [...next].sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Wallet activity could not be loaded.',
      );
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

  const groupedRows = useMemo(() => {
    const groups: { label: string; rows: PaymentIntentRow[] }[] = [];

    visibleRows.forEach((row) => {
      const label = dayLabel(row.created_at);
      const existing = groups.find((group) => group.label === label);

      if (existing) {
        existing.rows.push(row);
      } else {
        groups.push({ label, rows: [row] });
      }
    });

    return groups;
  }, [visibleRows]);

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">WALLET ACTIVITY</VadText>
        <VadText variant="title">Money movement, in one timeline.</VadText>
        <VadText tone="secondary">
          Deposit and withdrawal intents live here, separate from market orders
          and portfolio exposure.
        </VadText>
      </View>

      {loading ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadSkeleton height={74} />
          <VadSkeleton height={62} />
          <VadSkeleton height={62} />
          <VadSkeleton height={62} />
        </View>
      ) : error && !rows.length ? (
        <VadErrorState
          title="Wallet activity unavailable"
          message={error}
          onRetry={() => {
            setLoading(true);
            void load();
          }}
        />
      ) : (
        <>
          {error ? (
            <VadErrorState
              title="Wallet activity refresh failed"
              message={error}
              onRetry={() => void load()}
            />
          ) : null}

          <View
            style={{
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: theme.colors.border,
              paddingVertical: theme.spacing.md,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: theme.spacing.xl,
            }}
          >
            <Summary label="All" value={counts.all} />
            <Summary label="Processing" value={counts.processing} tone={counts.processing ? 'warning' : 'primary'} />
            <Summary label="Settled" value={counts.settled} tone={counts.settled ? 'yes' : 'primary'} />
            <Summary label="Failed" value={counts.failed} tone={counts.failed ? 'no' : 'primary'} />
          </View>

          <View
            accessibilityRole="tablist"
            style={{
              flexDirection: 'row',
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
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
                    minHeight: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderBottomWidth: 2,
                    borderBottomColor: selected
                      ? theme.colors.brandPrimary
                      : 'transparent',
                    opacity: pressed ? 0.65 : 1,
                  })}
                >
                  <VadText
                    variant="caption"
                    tone={selected ? 'brand' : 'secondary'}
                    numberOfLines={1}
                  >
                    {label}
                  </VadText>
                </Pressable>
              );
            })}
          </View>

          {groupedRows.length ? (
            <View style={{ gap: theme.spacing.xl }}>
              {groupedRows.map((group) => (
                <View key={group.label} style={{ gap: theme.spacing.xs }}>
                  <VadText variant="caption" tone="tertiary">
                    {group.label.toUpperCase()}
                  </VadText>

                  <View
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: theme.colors.border,
                    }}
                  >
                    {group.rows.map((row) => (
                      <PaymentRow
                        key={row.intent_public_id}
                        intent={row}
                        onPress={() => onOpenTransaction(row)}
                      />
                    ))}
                  </View>
                </View>
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
              actionLabel={filter !== 'all' ? 'Show all activity' : undefined}
              onAction={filter !== 'all' ? () => setFilter('all') : undefined}
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

function dayLabel(value: string) {
  const date = new Date(value);
  const now = new Date();

  const startToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();

  const startDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();

  const diffDays = Math.round((startToday - startDate) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

function Summary({
  label,
  value,
  tone = 'primary',
}: {
  label: string;
  value: number;
  tone?: 'primary' | 'warning' | 'yes' | 'no';
}) {
  return (
    <View style={{ minWidth: 88, flexGrow: 1, flexBasis: 100, gap: 2 }}>
      <VadText variant="heading" tone={tone}>{value}</VadText>
      <VadText variant="caption" tone="secondary">{label}</VadText>
    </View>
  );
}
