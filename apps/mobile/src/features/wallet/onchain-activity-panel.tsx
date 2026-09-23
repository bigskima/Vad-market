import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { assetMoney } from '@/features/markets/format';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getMyOnchainTransactionIntents,
  type OnchainTransactionIntentRow,
} from '@/services/onchain-api';

export function OnchainActivityPanel({ enabled }: { enabled: boolean }) {
  const theme = useVadTheme();
  const [rows, setRows] = useState<OnchainTransactionIntentRow[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }

    setError(null);
    try {
      setRows(await getMyOnchainTransactionIntents(8));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'We could not load your on-chain activity right now.',
      );
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!enabled) return null;

  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 3 }}>
        <VadText variant="caption" tone="brand">USDC · ON-CHAIN ACTIVITY</VadText>
        <VadText variant="heading">Settlement activity</VadText>
        <VadText variant="caption" tone="secondary">
          Position locks, claims and refunds are tracked separately from VAD&apos;s internal payment ledger.
        </VadText>
      </View>

      {loading ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadSkeleton height={68} radius={theme.radius.lg} />
          <VadSkeleton height={68} radius={theme.radius.lg} />
        </View>
      ) : error && !rows.length ? (
        <VadErrorState
          title="On-chain activity unavailable"
          message={error}
          onRetry={() => {
            setLoading(true);
            void load();
          }}
        />
      ) : rows.length ? (
        <View style={{ gap: theme.spacing.sm }}>
          {rows.map((row) => <OnchainActivityRow key={row.intent_id} row={row} />)}
          {error ? (
            <VadText variant="caption" tone="tertiary">
              The latest refresh could not complete. Previously loaded activity is still shown.
            </VadText>
          ) : null}
        </View>
      ) : (
        <VadEmptyState
          title="No USDC settlement activity yet"
          body="Your first on-chain prediction, claim or refund will appear here after it is submitted."
        />
      )}
    </VadCard>
  );
}

function OnchainActivityRow({ row }: { row: OnchainTransactionIntentRow }) {
  const theme = useVadTheme();
  const status = displayStatus(row);

  return (
    <VadCard variant="muted" style={{ gap: theme.spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <VadText variant="bodyStrong">{actionLabel(row.action)}</VadText>
          <VadText variant="caption" tone="tertiary">
            {row.chain_code} · {new Date(row.created_at).toLocaleString()}
          </VadText>
        </View>
        <VadChip label={status.label} tone={status.tone} />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <VadText variant="caption" tone="secondary">
          {row.outcome_label ? `${row.outcome_label} · ` : ''}
          {row.amount == null ? 'Amount pending' : assetMoney(row.amount, 'USDC')}
        </VadText>
        <VadText variant="caption" tone="tertiary" numberOfLines={1}>
          {row.transaction_id ? shortTransactionId(row.transaction_id) : 'Awaiting transaction'}
        </VadText>
      </View>

      {row.transaction_status === 'CONFIRMING' && row.confirmations > 0 ? (
        <VadText variant="caption" tone="tertiary">
          {row.confirmations} confirmation{row.confirmations === 1 ? '' : 's'} observed
        </VadText>
      ) : null}
      {row.failure_code ? (
        <VadText variant="caption" tone="danger">
          This transaction needs attention. Reference: {row.failure_code}
        </VadText>
      ) : null}
    </VadCard>
  );
}

function actionLabel(action: OnchainTransactionIntentRow['action']) {
  if (action === 'PREDICT') return 'USDC prediction';
  if (action === 'CLAIM') return 'USDC payout claim';
  return 'USDC refund';
}

function displayStatus(row: OnchainTransactionIntentRow): {
  label: string;
  tone: 'neutral' | 'brand' | 'yes' | 'warning' | 'danger';
} {
  if (row.finalized || row.transaction_status === 'CONFIRMED' || row.status === 'CONFIRMED') {
    return { label: 'CONFIRMED', tone: 'yes' };
  }
  if (
    row.status === 'FAILED'
    || row.status === 'DROPPED'
    || row.status === 'CANCELLED'
    || row.transaction_status === 'FAILED'
    || row.transaction_status === 'DROPPED'
  ) {
    return { label: 'NEEDS ATTENTION', tone: 'danger' };
  }
  if (row.status === 'AWAITING_SIGNATURE' || row.status === 'SIGNED') {
    return { label: 'SIGNING', tone: 'brand' };
  }
  if (row.status === 'SUBMITTED' || row.status === 'CONFIRMING' || row.transaction_status === 'CONFIRMING') {
    return { label: 'CONFIRMING', tone: 'warning' };
  }
  return { label: 'PREPARING', tone: 'neutral' };
}

function shortTransactionId(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}
