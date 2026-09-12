import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { VadButton } from '@/components/ui/vad-button';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { refreshAdminFeaturedMarketRankings, updateAdminFeaturedMarketSettings, type AdminFeaturedMarketSettings, type AdminMarketPublicationRow } from '@/services/admin-market-publishing-api';
import { DiscoveryChoiceGroup, DiscoveryMarketRow, DiscoveryRulePanel, formatDiscoveryNaira } from './admin-market-discovery-ui';

export function AdminFeaturedMarketPanel({ rows, settings, onChanged }: { rows: AdminMarketPublicationRow[]; settings: AdminFeaturedMarketSettings; onChanged: (message: string) => Promise<void> }) {
  const theme = useVadTheme();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [minimum, setMinimum] = useState(String(Math.round(settings.minimumVolumeNgn)));
  const [windowHours, setWindowHours] = useState(settings.windowHours);
  const [maximum, setMaximum] = useState(String(settings.maxMarkets));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const current = useMemo(() => rows.filter((row) => row.instrument_status === 'OPEN' && Boolean(row.automatic_featured)).sort((a, b) => (a.automatic_feature_rank ?? 9999) - (b.automatic_feature_rank ?? 9999)), [rows]);

  async function save() {
    const min = Number(minimum);
    const max = Number(maximum);
    if (!Number.isFinite(min) || min < 0) return setError('Enter a valid minimum trading amount.');
    if (!Number.isInteger(max) || max < 1 || max > 50) return setError('Choose between 1 and 50 markets.');
    if (reason.trim().length < 3) return setError('Enter a short reason for this change.');
    setWorking(true); setError(null);
    try {
      await updateAdminFeaturedMarketSettings({ enabled, minimumVolumeNgn: min, windowHours, maxMarkets: max, reason });
      setReason('');
      await onChanged('Featured Markets rules saved and ranking refreshed.');
    } catch (value) { setError(value instanceof Error ? value.message : 'Featured Markets settings could not be saved.'); }
    finally { setWorking(false); }
  }

  async function refresh() {
    setWorking(true); setError(null);
    try { await refreshAdminFeaturedMarketRankings(); await onChanged('Featured Markets refreshed from completed trading activity.'); }
    catch (value) { setError(value instanceof Error ? value.message : 'Featured Markets could not be refreshed.'); }
    finally { setWorking(false); }
  }

  return <View style={{ gap: theme.spacing.md }}>
    <DiscoveryRulePanel title="Featured Markets" subtitle="Highlights sustained completed trading activity over a longer period." enabled={enabled} onEnabledChange={setEnabled}>
      <VadInput label="Minimum completed trading activity (₦)" value={minimum} onChangeText={(value) => setMinimum(value.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" />
      <DiscoveryChoiceGroup label="Measure activity over" options={[{ label: '6 hours', value: 6 }, { label: '24 hours', value: 24 }, { label: '7 days', value: 168 }]} value={windowHours} onChange={setWindowHours} />
      <VadInput label="Maximum markets shown" value={maximum} onChangeText={(value) => setMaximum(value.replace(/\D/g, ''))} keyboardType="number-pad" />
      <VadInput label="Reason for change" value={reason} onChangeText={setReason} placeholder="Why are you changing the Featured Markets rules?" />
      {error ? <VadErrorState title="Could not update Featured Markets" message={error} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><VadButton label="Save Featured rules" loading={working} fullWidth={false} onPress={() => void save()} /><VadButton label="Refresh Featured" variant="secondary" loading={working} fullWidth={false} onPress={() => void refresh()} /></View>
    </DiscoveryRulePanel>
    <View style={{ gap: theme.spacing.sm }}><VadText variant="heading">Currently Featured</VadText>{current.length ? current.map((row) => <DiscoveryMarketRow key={row.instrument_public_id} row={row} badge={`#${row.automatic_feature_rank ?? '—'} FEATURED`} badgeTone="yes" detail={`${formatDiscoveryNaira(row.automatic_volume_ngn ?? 0)} completed activity · ${row.automatic_trade_count ?? 0} trades`} />) : <VadEmptyState title="No market has qualified yet" body="Markets appear automatically when they reach the Featured requirement." />}</View>
  </View>;
}
