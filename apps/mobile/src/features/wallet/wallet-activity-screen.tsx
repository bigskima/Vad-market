import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { money } from '@/features/markets/format';
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
  const { width } = useWindowDimensions();
  const desktopTable = width >= 920;
  const compact = width < 380;
  const [rows, setRows] = useState<PaymentIntentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>('all');

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
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
      if (background) setRefreshing(false);
      else setLoading(false);
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
      next[classify(row)] += 1;
    });

    return next;
  }, [rows]);

  const totals = useMemo(() => {
    return rows.reduce(
      (summary, row) => {
        const amount = Number(row.amount ?? 0);
        if (row.operation === 'DEPOSIT') summary.deposits += amount;
        if (row.operation === 'WITHDRAWAL') summary.withdrawals += amount;
        return summary;
      },
      { deposits: 0, withdrawals: 0 },
    );
  }, [rows]);

  const visibleRows = useMemo(
    () =>
      filter === 'all'
        ? rows
        : rows.filter((row) => classify(row) === filter),
    [filter, rows],
  );

  const groupedRows = useMemo(() => {
    const groups: { label: string; rows: PaymentIntentRow[] }[] = [];

    visibleRows.forEach((row) => {
      const label = dayLabel(row.created_at);
      const existing = groups.find((group) => group.label === label);

      if (existing) existing.rows.push(row);
      else groups.push({ label, rows: [row] });
    });

    return groups;
  }, [visibleRows]);

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      <View
        style={{
          flexDirection: width >= 760 ? 'row' : 'column',
          alignItems: width >= 760 ? 'flex-end' : 'stretch',
          gap: theme.spacing.lg,
        }}
      >
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="label" tone="brand">WALLET ACTIVITY</VadText>
          <VadText variant="title">Your money-movement timeline.</VadText>
          <VadText tone="secondary">
            Deposits and withdrawals stay separate from market orders so every
            payment intent can be reviewed on its own.
          </VadText>
        </View>

        <VadButton
          label="Refresh"
          variant="secondary"
          size="small"
          fullWidth={width < 520}
          loading={refreshing}
          onPress={() => void load(true)}
        />
      </View>

      {loading ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadSkeleton height={88} />
          <VadSkeleton height={52} />
          <VadSkeleton height={68} />
          <VadSkeleton height={68} />
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
              onRetry={() => void load(true)}
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
              gap: compact ? theme.spacing.md : theme.spacing.xl,
            }}
          >
            <Summary label="All" value={String(counts.all)} />
            <Summary
              label="Processing"
              value={String(counts.processing)}
              tone={counts.processing ? 'warning' : 'primary'}
            />
            <Summary
              label="Settled"
              value={String(counts.settled)}
              tone={counts.settled ? 'yes' : 'primary'}
            />
            <Summary
              label="Deposits"
              value={money(totals.deposits)}
              tone={totals.deposits ? 'yes' : 'primary'}
            />
            <Summary
              label="Withdrawals"
              value={money(totals.withdrawals)}
              tone={totals.withdrawals ? 'brand' : 'primary'}
            />
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
                    minHeight: 46,
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

          {visibleRows.length ? (
            desktopTable ? (
              <DesktopActivityTable
                rows={visibleRows}
                onOpenTransaction={onOpenTransaction}
              />
            ) : (
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
            )
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

function DesktopActivityTable({
  rows,
  onOpenTransaction,
}: {
  rows: PaymentIntentRow[];
  onOpenTransaction: (intent: PaymentIntentRow) => void;
}) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <View
        style={{
          minHeight: 42,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
        }}
      >
        <TableLabel flex={1.2}>TYPE</TableLabel>
        <TableLabel flex={1}>AMOUNT</TableLabel>
        <TableLabel flex={1}>STATUS</TableLabel>
        <TableLabel flex={1.2}>CREATED</TableLabel>
        <TableLabel flex={1.7}>REFERENCE</TableLabel>
      </View>

      {rows.map((row) => {
        const classification = classify(row);
        const statusTone =
          classification === 'settled'
            ? 'yes'
            : classification === 'failed'
              ? 'danger'
              : 'warning';

        return (
          <Pressable
            key={row.intent_public_id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${row.operation.toLowerCase()} transaction`}
            onPress={() => onOpenTransaction(row)}
            style={({ pressed }) => ({
              minHeight: 68,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <TableCell flex={1.2}>
              <VadText variant="bodyStrong">
                {operationLabel(row.operation)}
              </VadText>
              <VadText variant="caption" tone="tertiary">
                {row.asset_code}
              </VadText>
            </TableCell>
            <TableCell flex={1}>
              <VadText variant="bodyStrong">{money(row.amount)}</VadText>
            </TableCell>
            <TableCell flex={1}>
              <VadText variant="caption" tone={statusTone}>
                {row.status.replaceAll('_', ' ')}
              </VadText>
            </TableCell>
            <TableCell flex={1.2}>
              <VadText variant="caption" tone="secondary">
                {new Date(row.created_at).toLocaleString()}
              </VadText>
            </TableCell>
            <TableCell flex={1.7}>
              <VadText variant="caption" tone="secondary" numberOfLines={1}>
                {row.intent_public_id}
              </VadText>
            </TableCell>
          </Pressable>
        );
      })}
    </View>
  );
}

function TableLabel({
  flex,
  children,
}: {
  flex: number;
  children: string;
}) {
  return (
    <View style={{ flex, minWidth: 0 }}>
      <VadText variant="caption" tone="tertiary">{children}</VadText>
    </View>
  );
}

function TableCell({
  flex,
  children,
}: {
  flex: number;
  children: React.ReactNode;
}) {
  return <View style={{ flex, minWidth: 0 }}>{children}</View>;
}

function classify(row: PaymentIntentRow): Exclude<ActivityFilter, 'all'> {
  if (row.settled_at) return 'settled';
  if (row.failure_code) return 'failed';

  const normalized = row.status.toUpperCase();

  if (normalized === 'SETTLED' || normalized === 'COMPLETED') return 'settled';

  if (
    normalized.includes('FAIL') ||
    normalized.includes('REJECT') ||
    normalized.includes('CANCEL')
  ) return 'failed';

  return 'processing';
}

function operationLabel(operation: PaymentIntentRow['operation']) {
  if (operation === 'DEPOSIT') return 'Deposit';
  if (operation === 'WITHDRAWAL') return 'Withdrawal';
  return 'Refund';
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
  value: string;
  tone?: 'primary' | 'warning' | 'yes' | 'brand';
}) {
  return (
    <View style={{ minWidth: 94, flexGrow: 1, flexBasis: 118, gap: 2 }}>
      <VadText variant="heading" tone={tone} numberOfLines={1}>
        {value}
      </VadText>
      <VadText variant="caption" tone="secondary">{label}</VadText>
    </View>
  );
}
