import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadSegmentedControl } from '@/components/ui/vad-segmented-control';
import { VadText } from '@/components/ui/vad-text';
import { assetMoney } from '@/features/markets/format';
import { useLiveNow } from '@/hooks/use-live-now';
import { useVadTheme } from '@/providers/theme-provider';
import type { WalletActivityRow } from '@/services/market-api';

type Filter = 'all' | 'markets' | 'payouts' | 'other';

export function WalletLedgerActivity({ rows, compact = false }: { rows: WalletActivityRow[]; compact?: boolean }) {
  const theme = useVadTheme();
  const now = useLiveNow();
  const [filter, setFilter] = useState<Filter>('all');
  const [visible, setVisible] = useState(compact ? 5 : 10);

  const filtered = useMemo(() => rows.filter((row) => {
    if (filter === 'all') return true;
    if (filter === 'markets') return isMarketMovement(row) && row.activity_type !== 'MARKET_SETTLEMENT';
    if (filter === 'payouts') return row.activity_type === 'MARKET_SETTLEMENT';
    return !isMarketMovement(row);
  }), [filter, rows]);

  return (
    <View style={{ gap: theme.spacing.md }}>
      <VadSectionHeader
        title={compact ? 'Wallet ledger' : 'Complete wallet activity'}
        subtitle="Market stakes, fees, holds, releases and payouts update from the same ledger that drives your balance."
      />
      {!compact ? (
        <VadSegmentedControl
          value={filter}
          options={[
            { value: 'all', label: `All ${rows.length}` },
            { value: 'markets', label: 'Markets' },
            { value: 'payouts', label: 'Payouts' },
            { value: 'other', label: 'Other' },
          ] as const}
          onChange={(next) => { setFilter(next); setVisible(10); }}
        />
      ) : null}

      {filtered.length ? (
        <View style={{ gap: theme.spacing.xs }}>
          {filtered.slice(0, visible).map((row) => <LedgerRow key={`${row.activity_id}-${row.account_type}`} row={row} now={now} />)}
        </View>
      ) : (
        <VadEmptyState title="No wallet ledger activity" body="When money moves into a market, returns from a release, or settles back to your wallet, it appears here." />
      )}

      {filtered.length > visible ? <VadButton label={`Show more · ${filtered.length - visible} remaining`} variant="secondary" size="small" onPress={() => setVisible((value) => value + (compact ? 5 : 10))} /> : null}
    </View>
  );
}

function LedgerRow({ row, now }: { row: WalletActivityRow; now: number }) {
  const theme = useVadTheme();
  const incoming = isIncoming(row);
  const label = movementLabel(row.activity_type);
  return (
    <VadCard variant="raised" style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: 10 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: incoming ? theme.colors.yesSoft : theme.colors.brandSoft }}>
        <VadText variant="bodyStrong" tone={incoming ? 'yes' : 'brand'}>{incoming ? '+' : '−'}</VadText>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <VadText variant="bodyStrong">{label}</VadText>
          {row.market_title ? <VadChip label="MARKET" tone="brand" /> : null}
        </View>
        <VadText variant="caption" tone="secondary" numberOfLines={2}>{row.market_title ?? row.description ?? friendly(row.activity_type)}</VadText>
        <VadText variant="caption" tone="tertiary">{relativeTime(row.created_at, now)}</VadText>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2, maxWidth: '40%' }}>
        <VadText variant="bodyStrong" tone={incoming ? 'yes' : 'primary'} numberOfLines={1} adjustsFontSizeToFit>
          {incoming ? '+' : '−'}{assetMoney(row.amount, row.asset_code)}
        </VadText>
        <VadText variant="caption" tone="tertiary">{row.asset_code}</VadText>
      </View>
    </VadCard>
  );
}

function isMarketMovement(row: WalletActivityRow) {
  return Boolean(row.market_id) || ['POOL_STAKE', 'TRADING_FEE', 'ORDER_RESERVE', 'ORDER_FEE_RESERVE_RELEASE', 'MARKET_CLOSE_ORDER_RELEASE', 'MARKET_SETTLEMENT', 'LEGACY_SANDBOX_CORRECTION', 'LEGACY_SANDBOX_FEE_REFUND'].includes(row.activity_type);
}

function isIncoming(row: WalletActivityRow) {
  // For the user's available account, ledger CREDIT increases balance and DEBIT decreases it.
  // Reserved-account trading-fee rows are represented by their journal meaning instead.
  if (row.account_type === 'USER_AVAILABLE') return row.direction === 'CREDIT';
  return ['ORDER_FEE_RESERVE_RELEASE', 'MARKET_CLOSE_ORDER_RELEASE'].includes(row.activity_type);
}

function movementLabel(type: string) {
  const labels: Record<string, string> = {
    POOL_STAKE: 'Market stake committed',
    TRADING_FEE: 'Trading fee',
    ORDER_RESERVE: 'Order funds reserved',
    ORDER_FEE_RESERVE_RELEASE: 'Order reserve released',
    MARKET_CLOSE_ORDER_RELEASE: 'Unmatched order released',
    MARKET_SETTLEMENT: 'Market payout',
    LEGACY_SANDBOX_CORRECTION: 'Test trade correction',
    LEGACY_SANDBOX_FEE_REFUND: 'Test fee refund',
    DEPOSIT: 'Deposit',
    WITHDRAWAL: 'Withdrawal',
    REFUND: 'Refund',
  };
  return labels[type] ?? friendly(type);
}

function friendly(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function relativeTime(value: string, now: number) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 'Recently';
  const diff = Math.max(0, now - time);
  if (diff < 10_000) return 'Just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
