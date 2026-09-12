import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { setAdminMarketHomeSuppression, type AdminMarketPublicationRow, type AdminTrendingMarketSnapshot } from '@/services/admin-market-publishing-api';
import { DiscoveryMarketRow } from './admin-market-discovery-ui';

type Action = { row: AdminMarketPublicationRow; surface: 'FEATURED' | 'TRENDING'; hidden: boolean } | null;

export function AdminMarketDiscoveryModeration({ rows, snapshot, onChanged }: { rows: AdminMarketPublicationRow[]; snapshot: AdminTrendingMarketSnapshot; onChanged: (message: string) => Promise<void> }) {
  const theme = useVadTheme();
  const [action, setAction] = useState<Action>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const rowMap = useMemo(() => new Map(rows.map((row) => [row.instrument_public_id, row])), [rows]);
  const featured = useMemo(() => rows.filter((row) => row.instrument_status === 'OPEN' && Boolean(row.automatic_featured)), [rows]);
  const trending = useMemo(() => snapshot.rankings.slice(0, snapshot.settings.maxMarkets).map((item) => rowMap.get(item.instrumentPublicId)).filter((row): row is AdminMarketPublicationRow => Boolean(row)), [rowMap, snapshot]);
  const hidden = useMemo(() => snapshot.suppressions.filter((item) => item.featuredSuppressed || item.trendingSuppressed), [snapshot.suppressions]);

  function open(row: AdminMarketPublicationRow, surface: 'FEATURED' | 'TRENDING', isHidden: boolean) {
    setAction({ row, surface, hidden: isHidden });
    setReason('');
    setError(null);
  }

  async function apply() {
    if (!action || reason.trim().length < 3) return;
    setWorking(true); setError(null);
    try {
      await setAdminMarketHomeSuppression({ instrumentPublicId: action.row.instrument_public_id, surface: action.surface, suppressed: action.hidden, reason });
      const name = action.surface === 'FEATURED' ? 'Featured Markets' : 'Trending Markets';
      setAction(null); setReason('');
      await onChanged(action.hidden ? `Market removed from ${name} without closing it.` : `Market restored to ${name} eligibility.`);
    } catch (value) { setError(value instanceof Error ? value.message : 'Market visibility could not be updated.'); }
    finally { setWorking(false); }
  }

  return <View style={{ gap: theme.spacing.md }}>
    <View style={{ gap: 3 }}><VadText variant="heading">Manual visibility controls</VadText><VadText variant="caption" tone="secondary">Use these controls when a live market should temporarily stop appearing in Featured or Trending. Trading stays open.</VadText></View>
    <View style={{ gap: theme.spacing.sm }}><VadText variant="label">Featured Markets</VadText>{featured.length ? featured.map((row) => <DiscoveryMarketRow key={row.instrument_public_id} row={row} badge="FEATURED" badgeTone="yes"><VadButton label="Remove from Featured" variant="secondary" size="small" fullWidth={false} onPress={() => open(row, 'FEATURED', true)} /></DiscoveryMarketRow>) : <VadEmptyState title="No Featured Markets to manage" body="Qualified markets will appear here." />}</View>
    <View style={{ gap: theme.spacing.sm }}><VadText variant="label">Trending Markets</VadText>{trending.length ? trending.map((row) => <DiscoveryMarketRow key={row.instrument_public_id} row={row} badge="TRENDING" badgeTone="warning"><VadButton label="Remove from Trending" variant="secondary" size="small" fullWidth={false} onPress={() => open(row, 'TRENDING', true)} /></DiscoveryMarketRow>) : <VadEmptyState title="No Trending Markets to manage" body="Markets with strong momentum will appear here." />}</View>
    {hidden.length ? <View style={{ gap: theme.spacing.sm }}><VadText variant="label">Manually hidden</VadText>{hidden.map((item) => { const row = rowMap.get(item.instrumentPublicId); return row ? <DiscoveryMarketRow key={item.instrumentPublicId} row={row} badge="HIDDEN" badgeTone="warning" detail={item.reason ? `Reason: ${item.reason}` : undefined}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{item.featuredSuppressed ? <VadButton label="Restore Featured" variant="secondary" size="small" fullWidth={false} onPress={() => open(row, 'FEATURED', false)} /> : null}{item.trendingSuppressed ? <VadButton label="Restore Trending" variant="secondary" size="small" fullWidth={false} onPress={() => open(row, 'TRENDING', false)} /> : null}</View></DiscoveryMarketRow> : null; })}</View> : null}
    <VadBottomSheet visible={Boolean(action)} title={action?.hidden ? 'Remove from Home ranking' : 'Restore Home ranking eligibility'} onClose={() => { if (!working) setAction(null); }}>
      {action ? <View style={{ gap: theme.spacing.md }}><VadText variant="bodyStrong">{action.row.title}</VadText><VadText variant="caption" tone="secondary">{action.hidden ? 'The market remains live and tradable. It will stay out of this ranking until restored.' : 'The market can appear again when it meets the current automatic rules.'}</VadText><VadInput label="Reason" value={reason} onChangeText={setReason} placeholder="Why are you making this change?" multiline />{error ? <VadErrorState title="Could not update market visibility" message={error} /> : null}<VadButton label={action.hidden ? 'Confirm removal' : 'Restore eligibility'} loading={working} disabled={reason.trim().length < 3} onPress={() => void apply()} /></View> : null}
    </VadBottomSheet>
  </View>;
}
