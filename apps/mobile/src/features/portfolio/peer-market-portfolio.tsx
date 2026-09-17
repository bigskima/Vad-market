import { useEffect, useMemo, useState } from 'react';
import { Image, View } from 'react-native';

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
import { getMyProfile, profileMediaUrl, type UserProfile } from '@/services/profile-api';
import {
  saveResultCard,
  shareResultCard,
  type ResultCardProfile,
} from './result-card-share';

type Tab = 'active' | 'wins' | 'losses' | 'other';

export function PeerMarketPortfolio({ poolStakes, marketHistory }: { poolStakes: PoolStakeRow[]; marketHistory: MarketHistoryRow[] }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [tab, setTab] = useState<Tab>('active');
  const [visible, setVisible] = useState(6);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getMyProfile().then((next) => {
      if (!cancelled) setProfile(next);
    }).catch(() => {
      // Result history remains usable if profile media is temporarily unavailable.
    });
    return () => { cancelled = true; };
  }, []);

  const active = useMemo(
    () => poolStakes.filter((row) => !['SETTLED', 'VOIDED', 'CANCELLED'].includes(row.market_status)),
    [poolStakes],
  );
  const wins = useMemo(() => marketHistory.filter((row) => row.result === 'WON'), [marketHistory]);
  const losses = useMemo(() => marketHistory.filter((row) => row.result === 'LOST'), [marketHistory]);
  const other = useMemo(() => marketHistory.filter((row) => !['WON', 'LOST'].includes(row.result)), [marketHistory]);
  const rows = tab === 'active' ? active : tab === 'wins' ? wins : tab === 'losses' ? losses : other;
  const shareProfile: ResultCardProfile = {
    displayName: profile?.display_name?.trim() || profile?.handle?.trim() || 'VAD participant',
    handle: profile?.handle ?? null,
    avatarUrl: profileMediaUrl(profile?.avatar_path),
  };

  return (
    <View style={{ gap: theme.spacing.md }}>
      <VadSectionHeader
        title="Predictions"
        subtitle="Every committed prediction remains traceable. Wins and losses stay permanently recorded with the final result, fees, payout and P&L."
      />
      <VadSegmentedControl
        value={tab}
        options={[
          { value: 'active', label: `Active ${active.length}` },
          { value: 'wins', label: `Wins ${wins.length}` },
          { value: 'losses', label: `Losses ${losses.length}` },
          { value: 'other', label: `Other ${other.length}` },
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
      ) : null}

      {tab !== 'active' ? (
        rows.length ? (
          <View style={{ gap: theme.spacing.md }}>
            <VadCard variant="brand" style={{ gap: 4 }}>
              <VadText variant="caption" tone="brand">PERMANENT RESULT RECORD</VadText>
              <VadText variant="bodyStrong">
                {tab === 'wins' ? 'Your settled wins live here.' : tab === 'losses' ? 'Your settled losses stay visible too.' : 'Refunds, voids and in-progress results stay separate.'}
              </VadText>
              <VadText variant="caption" tone="secondary">
                Result cards use the settled VAD ledger history. Share or save a card without changing the underlying market result.
              </VadText>
            </VadCard>
            <View style={{ flexDirection: density.wide ? 'row' : 'column', flexWrap: density.wide ? 'wrap' : 'nowrap', gap: theme.spacing.md }}>
              {rows.slice(0, visible).map((row, index) => (
                <View key={`${row.market_id}-${row.selected_outcome}-${index}`} style={{ width: density.wide ? '48.9%' : '100%' }}>
                  <ResultCard row={row} profile={shareProfile} />
                </View>
              ))}
            </View>
          </View>
        ) : (
          <VadEmptyState
            title={tab === 'wins' ? 'No settled wins yet' : tab === 'losses' ? 'No settled losses yet' : 'No other results'}
            body={tab === 'wins' ? 'A winning prediction appears here permanently after settlement, even after its celebration has been shown.' : tab === 'losses' ? 'When a prediction settles against your position, its full result and loss record appears here.' : 'Refunded, voided or still-settling markets appear here when applicable.'}
          />
        )
      ) : null}

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
        <Metric label="VAD trading fee" value={assetMoney(stake.trading_fee, stake.asset_code)} />
      </View>
      <VadText variant="caption" tone="secondary">This stake is held in the market’s participant collateral pool. VAD does not fund the opposing side.</VadText>
    </VadCard>
  );
}

function ResultCard({ row, profile }: { row: MarketHistoryRow; profile: ResultCardProfile }) {
  const theme = useVadTheme();
  const [working, setWorking] = useState<'share' | 'save' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const final = row.final_outcome ?? 'PENDING';
  const resultTone = row.result === 'WON' ? 'yes' : row.result === 'LOST' ? 'no' : 'brand';

  async function run(action: 'share' | 'save') {
    if (working) return;
    setWorking(action);
    setActionError(null);
    try {
      if (action === 'share') await shareResultCard(row, profile);
      else await saveResultCard(row, profile);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The result card could not be exported right now.');
    } finally {
      setWorking(null);
    }
  }

  return (
    <VadCard variant={row.result === 'WON' ? 'brand' : 'raised'} style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Avatar profile={profile} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <VadText variant="bodyStrong" numberOfLines={1}>{profile.displayName}</VadText>
          <VadText variant="caption" tone="tertiary" numberOfLines={1}>{profile.handle ? `@${profile.handle}` : 'VAD participant'}</VadText>
        </View>
        <VadChip label={friendly(row.result).toUpperCase()} tone={resultTone} />
      </View>

      <VadText variant="bodyStrong" numberOfLines={4}>{row.market_title}</VadText>

      <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
        <Outcome label="YOUR PICK" value={row.selected_outcome} />
        <Outcome label="FINAL RESULT" value={final} strong />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        <Metric label="Stake" value={assetMoney(row.stake_amount, row.asset_code)} />
        <Metric label="Gross payout" value={assetMoney(row.gross_payout, row.asset_code)} />
        <Metric label="VAD trading fee" value={assetMoney(row.trading_fee, row.asset_code)} />
        <Metric label="VAD settlement fee" value={assetMoney(row.settlement_fee, row.asset_code)} />
        <Metric label="Net payout" value={assetMoney(row.net_payout, row.asset_code)} />
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm }}>
        <VadText variant="bodyStrong">Realized P&amp;L</VadText>
        <VadText variant="heading" tone={Number(row.realized_pnl) >= 0 ? 'yes' : 'no'}>{signedMoney(row.realized_pnl, row.asset_code)}</VadText>
      </View>

      {row.settled_at ? <VadText variant="caption" tone="tertiary">Settled {new Date(row.settled_at).toLocaleString()}</VadText> : null}
      <VadText variant="caption" tone="secondary">Share to X, Instagram, Facebook, TikTok and other apps through your device share sheet.</VadText>
      {actionError ? <VadText variant="caption" tone="danger">{actionError}</VadText> : null}

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <VadButton label="Share card" size="small" loading={working === 'share'} disabled={Boolean(working)} onPress={() => void run('share')} style={{ flex: 1 }} />
        <VadButton label="Save card" variant="secondary" size="small" loading={working === 'save'} disabled={Boolean(working)} onPress={() => void run('save')} style={{ flex: 1 }} />
      </View>
    </VadCard>
  );
}

function Avatar({ profile }: { profile: ResultCardProfile }) {
  const theme = useVadTheme();
  return (
    <View style={{ width: 48, height: 48, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandSoft, borderWidth: 1, borderColor: theme.colors.brandPrimary }}>
      {profile.avatarUrl ? (
        <Image source={{ uri: profile.avatarUrl }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
      ) : (
        <VadText variant="bodyStrong" tone="brand">{initials(profile.displayName)}</VadText>
      )}
    </View>
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

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : value.slice(0, 2)).toUpperCase() || 'V';
}
