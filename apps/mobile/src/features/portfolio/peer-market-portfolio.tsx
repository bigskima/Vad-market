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
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketHistoryRow, PoolStakeRow } from '@/services/market-api';

type Tab = 'active' | 'results';

export function PeerMarketPortfolio({ poolStakes, marketHistory }: { poolStakes: PoolStakeRow[]; marketHistory: MarketHistoryRow[] }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [tab, setTab] = useState<Tab>('active');
  const [visible, setVisible] = useState(6);
  const active = useMemo(() => poolStakes.filter((row) => !['SETTLED', 'VOIDED', 'CANCELLED'].includes(row.market_status)), [poolStakes]);
  const rows = tab === 'active' ? active : marketHistory;

  return (
    <View style={{ gap: theme.spacing.md }}>
      <VadSectionHeader
        title="Predictions"
        subtitle="Peer-funded stakes and final outcomes stay visible from commitment through settlement."
      />
      <VadSegmentedControl
        value={tab}
        options={[
          { value: 'active', label: `Active ${active.length}` },
          { value: 'results', label: `Results ${marketHistory.length}` },
        ] as const}
        onChange={(next) => { setTab(next); setVisible(6); }}
      />

      {tab === 'active' ? (
        active.length ? (
          <View style={{ flexDirection: density.wide ? 'row' : 'column', flexWrap: density.wide ? 'wrap' : 'nowrap', gap: theme.spacing.md }}>
            {active.slice(0, visible).map((stake) => (
              <View key={stake.stake_id} style={{ width: density.wide ? '48.9%' : '100%' }}>
                <StakeCard stake={stake} />
              </View>
            ))}
          </View>
        ) : <VadEmptyState title="No active pooled predictions" body="When you commit a stake to a peer-funded market, it appears here immediately and remains traceable through result and settlement." />
      ) : marketHistory.length ? (
        <View style={{ gap: theme.spacing.md }}>
          <VadCard variant="brand" style={{ gap: 4 }}>
            <VadText variant="caption" tone="brand">RESULT CLARITY</VadText>
            <VadText variant="bodyStrong">Your pick and the final YES/NO result are shown separately.</VadText>
            <VadText variant="caption" tone="secondary">The final result is the outcome actually used for settlement. The earlier market split is not the result.</VadText>
          </VadCard>
          <View style={{ flexDirection: density.wide ? 'row' : 'column', flexWrap: density.wide ? 'wrap' : 'nowrap', gap: theme.spacing.md }}>
            {marketHistory.slice(0, visible).map((row, index) => (
              <View key={`${row.market_id}-${row.selected_outcome}-${index}`} style={{ width: density.wide ? '48.9%' : '100%' }}>
                <ResultCard row={row} />
              </View>
            ))}
          </View>
        </View>
      ) : <VadEmptyState title="No finalized predictions yet" body="Finalized markets will show the confirmed YES/NO result, your selection, win/loss status, stake, payout and P&L here." />}

      {rows.length > visible ? <VadButton label={`Show more · ${rows.length - visible} remaining`} variant="secondary" onPress={() => setVisible((value) => value + 6)} /> : null}
    </View>
  );
}

function StakeCard({ stake }: { stake: PoolStakeRow }) {
  const theme = useVadTheme();
  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <VadText variant="caption" tone="brand">PEER-POOL STAKE</VadText>
          <VadText variant="bodyStrong" numberOfLines={3}>{stake.market_title}</VadText>
          <VadText variant="caption" tone="tertiary">{stake.asset_code} · {friendly(stake.market_status)}</VadText>
        </View>
        <VadChip label={stake.outcome_code} tone={stake.outcome_code === 'YES' ? 'yes' : 'no'} />
      </View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
        <Metric label="Committed" value={assetMoney(stake.amount, stake.asset_code)} />
        <Metric label="Trading fee" value={assetMoney(stake.trading_fee, stake.asset_code)} />
      </View>
      <VadText variant="caption" tone="secondary">This stake is held in the market’s participant collateral pool. VAD does not fund the opposing side.</VadText>
    </VadCard>
  );
}

function ResultCard({ row }: { row: MarketHistoryRow }) {
  const theme = useVadTheme();
  const final = row.final_outcome ?? 'PENDING';
  const resultTone = row.result === 'WON' ? 'yes' : row.result === 'LOST' ? 'no' : 'brand';
  return (
    <VadCard variant={row.result === 'WON' ? 'brand' : 'raised'} style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm }}>
        <VadText variant="caption" tone={resultTone}>{friendly(row.result).toUpperCase()}</VadText>
        <VadChip label={row.asset_code} />
      </View>
      <VadText variant="bodyStrong" numberOfLines={3}>{row.market_title}</VadText>

      <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
        <Outcome label="YOUR PICK" value={row.selected_outcome} />
        <Outcome label="FINAL RESULT" value={final} strong />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        <Metric label="Stake" value={assetMoney(row.stake_amount, row.asset_code)} />
        <Metric label="Gross payout" value={assetMoney(row.gross_payout, row.asset_code)} />
        <Metric label="Trading fee" value={assetMoney(row.trading_fee, row.asset_code)} />
        <Metric label="Settlement fee" value={assetMoney(row.settlement_fee, row.asset_code)} />
        <Metric label="Net payout" value={assetMoney(row.net_payout, row.asset_code)} />
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm }}>
        <VadText variant="bodyStrong">Realized P&amp;L</VadText>
        <VadText variant="heading" tone={Number(row.realized_pnl) >= 0 ? 'yes' : 'no'}>{signedMoney(row.realized_pnl, row.asset_code)}</VadText>
      </View>
      {row.settled_at ? <VadText variant="caption" tone="tertiary">Settled {new Date(row.settled_at).toLocaleString()}</VadText> : null}
    </VadCard>
  );
}

function Outcome({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  const theme = useVadTheme();
  const tone = value === 'YES' ? 'yes' : value === 'NO' ? 'no' : 'brand';
  return (
    <View style={{ flex: 1, minWidth: 0, padding: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: tone === 'yes' ? theme.colors.yesSoft : tone === 'no' ? theme.colors.noSoft : theme.colors.brandSoft, borderWidth: strong ? 2 : 1, borderColor: tone === 'yes' ? theme.colors.yes : tone === 'no' ? theme.colors.no : theme.colors.brandPrimary, gap: 2 }}>
      <VadText variant="caption" tone={tone}>{label}</VadText>
      <VadText variant={strong ? 'title' : 'heading'} tone={tone}>{value}</VadText>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ flex: 1, minWidth: 105, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, padding: 10, gap: 1 }}>
      <VadText variant="caption" tone="tertiary" numberOfLines={1}>{label}</VadText>
      <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{value}</VadText>
    </View>
  );
}

function signedMoney(value: number | string, assetCode: string) {
  const numeric = Number(value ?? 0);
  return `${numeric > 0 ? '+' : ''}${assetMoney(numeric, assetCode)}`;
}

function friendly(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
