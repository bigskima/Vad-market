import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useBalanceVisibility } from '@/hooks/use-balance-visibility';
import { useVadTheme } from '@/providers/theme-provider';
import { getMyOnchainPositions, type OnchainPositionRow } from '@/services/onchain-api';
import { settleUsdcPosition } from '@/services/onchain-settlement';

export function OnchainPositionsPanel({ enabled }: { enabled: boolean }) {
  const theme = useVadTheme();
  const { hidden: balancesHidden } = useBalanceVisibility();
  const [rows, setRows] = useState<OnchainPositionRow[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [pendingSettlement, setPendingSettlement] = useState<OnchainPositionRow | null>(null);
  const [settlementError, setSettlementError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }
    setError(null);
    try {
      setRows(await getMyOnchainPositions());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not load your USDC positions.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!enabled) return null;
  const actionable = rows.filter((row) =>
    (row.entitlement_type === 'CLAIM' || row.entitlement_type === 'REFUND') &&
    (row.entitlement_status === 'PENDING' || row.entitlement_status === 'AUTHORIZED'),
  );

  async function claimOrRefund(row: OnchainPositionRow) {
    setWorkingId(row.position_record_id);
    setError(null);
    setSettlementError(null);
    setNotice(null);
    try {
      const result = await settleUsdcPosition(row);
      setNotice(result.noAction
        ? `This position is already resolved: ${result.result}.`
        : `${row.entitlement_type === 'REFUND' ? 'Refund' : 'Payout'} submitted on ${result.chainCode}. Transaction: ${result.transactionHash.slice(0, 10)}…${result.transactionHash.slice(-6)}`);
      setPendingSettlement(null);
      await load();
    } catch (reason) {
      setSettlementError(reason instanceof Error ? reason.message : 'The USDC payout could not be submitted.');
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 3 }}>
        <VadText variant="caption" tone="brand">SELF-CUSTODY USDC</VadText>
        <VadText variant="heading">Positions & payouts</VadText>
        <VadText variant="caption" tone="secondary">
          Your USDC positions remain on-chain. Claim eligible payouts or refunds directly to the verified wallet that opened the position.
        </VadText>
      </View>
      {loading ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadSkeleton height={82} radius={theme.radius.lg} />
          <VadSkeleton height={82} radius={theme.radius.lg} />
        </View>
      ) : error && !rows.length ? (
        <VadErrorState title="USDC positions unavailable" message={error} onRetry={() => { setLoading(true); void load(); }} />
      ) : rows.length ? (
        <View style={{ gap: theme.spacing.sm }}>
          {rows.map((row) => {
            const canSettle = actionable.some((item) => item.position_record_id === row.position_record_id);
            const label = row.entitlement_type === 'REFUND' ? 'Claim refund' : 'Claim payout';
            return (
              <VadCard key={row.position_record_id} variant="muted" style={{ gap: theme.spacing.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.spacing.sm }}>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <VadText variant="bodyStrong" numberOfLines={2}>{row.market_title}</VadText>
                    <VadText variant="caption" tone="tertiary">{row.chain_code} · {row.outcome_code} · {row.wallet_address.slice(0, 8)}…{row.wallet_address.slice(-6)}</VadText>
                  </View>
                  <VadChip label={positionStatus(row)} tone={row.position_status === 'SETTLED' || row.position_status === 'REFUNDED' ? 'yes' : 'neutral'} />
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                  <VadChip label={`Stake ${balancesHidden ? '••••••' : `${Number(row.collateral_amount).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`}`} tone="neutral" />
                  {row.net_payout != null ? <VadChip label={`Net payout ${balancesHidden ? '••••••' : `${Number(row.net_payout).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`}`} tone="brand" /> : null}
                  {row.entitlement_type ? <VadChip label={row.entitlement_type} tone={row.entitlement_type === 'REFUND' ? 'warning' : 'brand'} /> : null}
                </View>
                {canSettle ? (
                  <VadButton label={label} loading={workingId === row.position_record_id} disabled={workingId !== null} onPress={() => { setSettlementError(null); setPendingSettlement(row); }} />
                ) : row.entitlement_status ? (
                  <VadText variant="caption" tone="secondary">Payout status: {row.entitlement_status.replaceAll('_', ' ').toLowerCase()}.</VadText>
                ) : (
                  <VadText variant="caption" tone="tertiary">Awaiting market resolution.</VadText>
                )}
              </VadCard>
            );
          })}
        </View>
      ) : (
        <VadEmptyState title="No USDC positions yet" body="Your Arc USDC predictions and eligible payouts will appear here." />
      )}
      {notice ? <VadText variant="caption" tone="secondary">{notice}</VadText> : null}
      {error && rows.length ? <VadErrorState title="Could not refresh positions" message={error} onRetry={() => void load()} /> : null}

      <VadBottomSheet
        visible={pendingSettlement !== null}
        title={pendingSettlement?.entitlement_type === 'REFUND' ? 'Review USDC refund' : 'Review USDC payout'}
        onClose={() => {
          if (!workingId) setPendingSettlement(null);
        }}
        dismissible={!workingId}
      >
        {pendingSettlement ? (
          <View style={{ gap: theme.spacing.md }}>
            <View style={{ gap: 3 }}>
              <VadText variant="bodyStrong">{pendingSettlement.market_title}</VadText>
              <VadText variant="caption" tone="secondary">
                {pendingSettlement.chain_code} · {pendingSettlement.outcome_code} · {pendingSettlement.wallet_address.slice(0, 8)}…{pendingSettlement.wallet_address.slice(-6)}
              </VadText>
              <VadText variant="caption" tone="secondary">
                You are about to submit an on-chain {pendingSettlement.entitlement_type === 'REFUND' ? 'refund' : 'payout claim'} from the verified wallet shown above. Review these details before continuing.
              </VadText>
            </View>
            <VadCard variant="muted" style={{ gap: theme.spacing.xs }}>
              <MoneyReviewLine label="Market outcome" value={pendingSettlement.outcome_code} />
              <MoneyReviewLine
                label="Original stake"
                value={balancesHidden ? '••••••' : `${Number(pendingSettlement.collateral_amount).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`}
              />
              <MoneyReviewLine
                label={pendingSettlement.entitlement_type === 'REFUND' ? 'Refund amount on record' : 'Net payout on record'}
                value={pendingSettlement.net_payout == null
                  ? 'Not available yet'
                  : balancesHidden
                    ? '••••••'
                    : `${Number(pendingSettlement.net_payout).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`}
              />
              <MoneyReviewLine label="Wallet" value={`${pendingSettlement.wallet_address.slice(0, 8)}…${pendingSettlement.wallet_address.slice(-6)}`} />
            </VadCard>
            <VadText variant="caption" tone="warning">
              This submits a blockchain transaction. Network fees may apply, and the request cannot be undone after it is submitted.
            </VadText>
            {settlementError ? (
              <VadErrorState title="Payout not submitted" message={settlementError} onRetry={() => void claimOrRefund(pendingSettlement)} />
            ) : null}
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <VadButton
                label="Cancel"
                variant="secondary"
                disabled={Boolean(workingId)}
                onPress={() => setPendingSettlement(null)}
                style={{ flex: 1 }}
              />
              <VadButton
                label={pendingSettlement.entitlement_type === 'REFUND' ? 'Confirm & claim refund' : 'Confirm & claim payout'}
                loading={workingId === pendingSettlement.position_record_id}
                disabled={Boolean(workingId)}
                onPress={() => void claimOrRefund(pendingSettlement)}
                style={{ flex: 1.4 }}
              />
            </View>
          </View>
        ) : null}
      </VadBottomSheet>
    </VadCard>
  );
}

function positionStatus(row: OnchainPositionRow) {
  if (row.position_status === 'SETTLED') return 'SETTLED';
  if (row.position_status === 'REFUNDED') return 'REFUNDED';
  if (row.position_status === 'LOST') return 'LOST';
  if (row.entitlement_status === 'SUBMITTED') return 'SUBMITTED';
  if (row.entitlement_status === 'CONFIRMED') return 'CONFIRMED';
  if (row.entitlement_type === 'CLAIM' || row.entitlement_type === 'REFUND') return 'READY';
  return 'LOCKED';
}


function MoneyReviewLine({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: theme.spacing.xs }}>
      <VadText variant="caption" tone="secondary" style={{ flex: 1 }}>{label}</VadText>
      <VadText variant="bodyStrong" style={{ flexShrink: 1, textAlign: 'right' }}>{value}</VadText>
    </View>
  );
}
