import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  View,
} from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSegmentedControl } from '@/components/ui/vad-segmented-control';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { money } from '@/features/markets/format';
import { PaymentRow } from '@/features/wallet/wallet-screen';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getMyPaymentIntents,
  type PaymentIntentRow,
} from '@/services/payment-api';

type ActivityFilter = 'all' | 'processing' | 'settled' | 'failed';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'processing', label: 'Pending' },
  { value: 'settled', label: 'Settled' },
  { value: 'failed', label: 'Failed' },
] as const;

export function WalletActivityScreen({
  onOpenTransaction,
}: {
  onOpenTransaction: (intent: PaymentIntentRow) => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const desktopTable = density.width >= 920;
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
    <View style={{ gap: density.compact ? theme.spacing.lg : theme.spacing.xl }}>
      <View
        style={{
          flexDirection: density.width >= 760 ? 'row' : 'column',
          alignItems: density.width >= 760 ? 'flex-end' : 'stretch',
          gap: density.compact ? theme.spacing.sm : theme.spacing.md,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <VadText variant="caption" tone="brand">WALLET ACTIVITY</VadText>
          <VadText variant="title">Money movement</VadText>
          <VadText variant="caption" tone="secondary">
            Deposits, withdrawals and their latest provider status.
          </VadText>
        </View>

        <VadButton
          label="Refresh"
          variant="secondary"
          size="small"
          fullWidth={false}
          loading={refreshing}
          onPress={() => void load(true)}
        />
      </View>

      {loading ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadSkeleton height={density.compact ? 76 : 88} radius={theme.radius.lg} />
          <VadSkeleton height={density.compact ? 36 : 40} radius={theme.radius.pill} />
          <VadSkeleton height={density.compact ? 60 : 66} radius={theme.radius.lg} />
          <VadSkeleton height={density.compact ? 60 : 66} radius={theme.radius.lg} />
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

          <VadCard variant="raised" style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Summary label="Deposited" value={money(totals.deposits)} tone={totals.deposits ? 'yes' : 'primary'} />
              <Summary label="Withdrawn" value={money(totals.withdrawals)} tone={totals.withdrawals ? 'brand' : 'primary'} />
            </View>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <MiniStat label="All" value={counts.all} />
              <MiniStat label="Pending" value={counts.processing} tone={counts.processing ? 'warning' : 'primary'} />
              <MiniStat label="Settled" value={counts.settled} tone={counts.settled ? 'yes' : 'primary'} />
              <MiniStat label="Failed" value={counts.failed} tone={counts.failed ? 'danger' : 'primary'} />
            </View>
          </VadCard>

          <VadSegmentedControl
            value={filter}
            options={FILTERS}
            onChange={setFilter}
          />

          {visibleRows.length ? (
            desktopTable ? (
              <DesktopActivityTable
                rows={visibleRows}
                onOpenTransaction={onOpenTransaction}
              />
            ) : (
              <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
                {groupedRows.map((group) => (
                  <View key={group.label} style={{ gap: 6 }}>
                    <VadText variant="caption" tone="tertiary">
                      {group.label.toUpperCase()}
                    </VadText>
                    <View style={{ gap: density.compact ? 6 : theme.spacing.sm }}>
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
              title={filter === 'all' ? 'No payment activity yet' : 'Nothing in this status'}
              body={filter === 'all' ? 'Your deposit and withdrawal intents will appear here.' : 'Try another activity filter.'}
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
    <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.border }}>
      <View style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <TableLabel flex={1.2}>TYPE</TableLabel>
        <TableLabel flex={1}>AMOUNT</TableLabel>
        <TableLabel flex={1}>STATUS</TableLabel>
        <TableLabel flex={1.2}>CREATED</TableLabel>
        <TableLabel flex={1.7}>REFERENCE</TableLabel>
      </View>

      {rows.map((row) => {
        const classification = classify(row);
        const statusTone = classification === 'settled' ? 'yes' : classification === 'failed' ? 'danger' : 'warning';

        return (
          <Pressable
            key={row.intent_public_id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${row.operation.toLowerCase()} transaction`}
            onPress={() => onOpenTransaction(row)}
            style={({ pressed }) => ({
              minHeight: 62,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <TableCell flex={1.2}>
              <VadText variant="bodyStrong">{operationLabel(row.operation)}</VadText>
              <VadText variant="caption" tone="tertiary">{row.asset_code}</VadText>
            </TableCell>
            <TableCell flex={1}><VadText variant="bodyStrong">{money(row.amount)}</VadText></TableCell>
            <TableCell flex={1}><VadText variant="caption" tone={statusTone}>{row.status.replaceAll('_', ' ')}</VadText></TableCell>
            <TableCell flex={1.2}><VadText variant="caption" tone="secondary">{new Date(row.created_at).toLocaleString()}</VadText></TableCell>
            <TableCell flex={1.7}><VadText variant="caption" tone="secondary" numberOfLines={1}>{row.intent_public_id}</VadText></TableCell>
          </Pressable>
        );
      })}
    </View>
  );
}

function TableLabel({ flex, children }: { flex: number; children: string }) {
  return <View style={{ flex, minWidth: 0 }}><VadText variant="caption" tone="tertiary">{children}</VadText></View>;
}

function TableCell({ flex, children }: { flex: number; children: ReactNode }) {
  return <View style={{ flex, minWidth: 0 }}>{children}</View>;
}

function classify(row: PaymentIntentRow): Exclude<ActivityFilter, 'all'> {
  if (row.settled_at) return 'settled';
  if (row.failure_code) return 'failed';

  const normalized = row.status.toUpperCase();
  if (normalized === 'SETTLED' || normalized === 'COMPLETED') return 'settled';
  if (normalized.includes('FAIL') || normalized.includes('REJECT') || normalized.includes('CANCEL')) return 'failed';
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
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startToday - startDate) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

function Summary({ label, value, tone = 'primary' }: { label: string; value: string; tone?: 'primary' | 'yes' | 'brand' }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 0 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="heading" tone={tone} numberOfLines={1} adjustsFontSizeToFit>{value}</VadText>
    </View>
  );
}

function MiniStat({ label, value, tone = 'primary' }: { label: string; value: number; tone?: 'primary' | 'warning' | 'yes' | 'danger' }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, minHeight: 26, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surface }}>
      <VadText variant="caption" tone={tone}>{value}</VadText>
      <VadText variant="caption" tone="secondary">{label}</VadText>
    </View>
  );
}
