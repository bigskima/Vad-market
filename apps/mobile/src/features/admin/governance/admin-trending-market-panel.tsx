import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { VadButton } from '@/components/ui/vad-button';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { refreshAdminTrendingMarketRankings, updateAdminTrendingMarketSettings, type AdminMarketPublicationRow, type AdminTrendingMarketSnapshot } from '@/services/admin-market-publishing-api';
import { DiscoveryChoiceGroup, DiscoveryMarketRow, DiscoveryRulePanel, formatDiscoveryGrowth, formatDiscoveryNaira } from './admin-market-discovery-ui';

export function AdminTrendingMarketPanel({ rows, snapshot, onChanged }: { rows: AdminMarketPublicationRow[]; snapshot: AdminTrendingMarketSnapshot; onChanged: (message: string) => Promise<void> }) {
  const theme = useVadTheme();
  const settings = snapshot.settings;
  const [enabled, setEnabled] = useState(settings.enabled);
  const [windowMinutes, setWindowMinutes] = useState(settings.windowMinutes);
  const [baselineHours, setBaselineHours] = useState(settings.baselineHours);
  const [minimum, setMinimum] = useState(String(Math.round(settings.minimumVolumeNgn)));
  const [trades, setTrades] = useState(String(settings.minimumTrades));
  const [traders, setTraders] = useState(String(settings.minimumUniqueTraders));
  const [acceleration, setAcceleration] = useState(settings.minimumAcceleration);
  const [maximum, setMaximum] = useState(String(settings.maxMarkets));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const rowMap = useMemo(() => new Map(rows.map((row) => [row.instrument_public_id, row])), [rows]);
  const visible = useMemo(() => snapshot.rankings.slice(0, settings.maxMarkets), [settings.maxMarkets, snapshot.rankings]);

  async function save() {
    const min = Number(minimum); const minTrades = Number(trades); const minTraders = Number(traders); const max = Number(maximum);
    if (!Number.isFinite(min) || min < 0) return setError('Enter a valid minimum trading amount.');
    if (!Number.isInteger(minTrades) || minTrades < 1) return setError('Minimum completed trades must be at least 1.');
    if (!Number.isInteger(minTraders) || minTraders < 2) return setError('Minimum distinct traders must be at least 2.');
    if (!Number.isInteger(max) || max < 1 || max > 50) return setError('Choose between 1 and 50 markets.');
    if (reason.trim().length < 3) return setError('Enter a short reason for this change.');
    setWorking(true); setError(null);
    try {
      await updateAdminTrendingMarketSettings({ enabled, windowMinutes, baselineHours, minimumVolumeNgn: min, minimumTrades: minTrades, minimumUniqueTraders: minTraders, minimumAcceleration: acceleration, maxMarkets: max, reason });
      setReason('');
      await onChanged('Trending Markets rules saved and ranking refreshed.');
    } catch (value) { setError(value instanceof Error ? value.message : 'Trending Markets settings could not be saved.'); }
    finally { setWorking(false); }
  }

  async function refresh() {
    setWorking(true); setError(null);
    try { await refreshAdminTrendingMarketRankings(); await onChanged('Trending Markets refreshed from current market momentum.'); }
    catch (value) { setError(value instanceof Error ? value.message : 'Trending Markets could not be refreshed.'); }
    finally { setWorking(false); }
  }

  return <View style={{ gap: theme.spacing.md }}>
    <DiscoveryRulePanel title="Trending Markets" subtitle="Finds markets heating up now by comparing recent completed activity with their previous pace." enabled={enabled} onEnabledChange={setEnabled}>
      <DiscoveryChoiceGroup label="Watch the latest" options={[{ label: '30 min', value: 30 }, { label: '1 hour', value: 60 }, { label: '2 hours', value: 120 }, { label: '3 hours', value: 180 }]} value={windowMinutes} onChange={setWindowMinutes} />
      <DiscoveryChoiceGroup label="Compare with the previous" options={[{ label: '3 hours', value: 3 }, { label: '6 hours', value: 6 }, { label: '12 hours', value: 12 }, { label: '24 hours', value: 24 }]} value={baselineHours} onChange={setBaselineHours} />
      <VadInput label="Minimum completed trading activity (₦)" value={minimum} onChangeText={(value) => setMinimum(value.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" hint="Prevents very small bursts from appearing as a trend." />
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}><View style={{ flex: 1, minWidth: 170 }}><VadInput label="Minimum completed trades" value={trades} onChangeText={(value) => setTrades(value.replace(/\D/g, ''))} keyboardType="number-pad" /></View><View style={{ flex: 1, minWidth: 170 }}><VadInput label="Minimum distinct traders" value={traders} onChangeText={(value) => setTraders(value.replace(/\D/g, ''))} keyboardType="number-pad" hint="Helps stop one or two accounts from manufacturing a trend." /></View></View>
      <DiscoveryChoiceGroup label="Activity growth needed" options={[{ label: '1.25×', value: 1.25 }, { label: '1.5×', value: 1.5 }, { label: '2×', value: 2 }, { label: '3×', value: 3 }]} value={acceleration} onChange={setAcceleration} />
      <VadText variant="caption" tone="tertiary">Example: 1.5× means recent trading must be at least 50% faster than its recent normal pace.</VadText>
      <VadInput label="Maximum markets shown" value={maximum} onChangeText={(value) => setMaximum(value.replace(/\D/g, ''))} keyboardType="number-pad" />
      <VadInput label="Reason for change" value={reason} onChangeText={setReason} placeholder="Why are you changing the Trending Markets rules?" />
      {error ? <VadErrorState title="Could not update Trending Markets" message={error} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><VadButton label="Save Trending rules" loading={working} fullWidth={false} onPress={() => void save()} /><VadButton label="Refresh Trending" variant="secondary" loading={working} fullWidth={false} onPress={() => void refresh()} /></View>
    </DiscoveryRulePanel>
    <View style={{ gap: theme.spacing.sm }}><VadText variant="heading">Trending Now</VadText>{visible.length ? visible.map((item) => { const row = rowMap.get(item.instrumentPublicId); return row ? <DiscoveryMarketRow key={item.instrumentPublicId} row={row} badge={`#${item.rank} TRENDING`} badgeTone="warning" detail={`${formatDiscoveryNaira(item.volumeNgn)} recent activity · ${item.tradeCount} trades · ${item.uniqueTraders} traders · ${formatDiscoveryGrowth(Math.max(item.volumeAcceleration, item.tradeAcceleration))}`} /> : null; }) : <VadEmptyState title="No market is trending right now" body="Markets appear when completed trading starts accelerating strongly enough." />}</View>
  </View>;
}
