import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { supabase, supabaseConfiguration } from '@/lib/supabase';
import { useVadTheme } from '@/providers/theme-provider';

type Status = { globally_enabled: boolean; user_enabled: boolean };
type DemoMarket = { key: string; title: string; status: string; resolvedOutcome?: string | null; outcomes: { code: string; label: string }[] };

export function TngnDemoAdminControl() {
  const theme = useVadTheme();
  const [status, setStatus] = useState<Status>({ globally_enabled: false, user_enabled: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markets, setMarkets] = useState<DemoMarket[]>([]);
  const [resolutionBusy, setResolutionBusy] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!supabaseConfiguration.ready) { setLoading(false); return; }
    const { data, error: rpcError } = await supabase.rpc('get_demo_mode_status');
    if (rpcError) { setError('Could not load the current demo-mode setting.'); setLoading(false); return; }
    const row = (Array.isArray(data) ? data[0] : data) as Status | null;
    setStatus({ globally_enabled: row?.globally_enabled === true, user_enabled: row?.user_enabled === true });
    const { data: marketData, error: marketError } = await supabase.rpc('admin_demo_markets');
    if (marketError) { setMarkets([]); setError('Could not load sandbox markets. Confirm your platform settings permission and apply the sandbox settlement migration.'); }
    else { setMarkets((marketData ?? []) as DemoMarket[]); setError(null); }
    setLoading(false);
  }, []);
  useEffect(() => { const timer = setTimeout(() => void refresh(), 0); return () => clearTimeout(timer); }, [refresh]);
  const resolveMarket = (market: DemoMarket, outcomeCode: string) => {
    Alert.alert('Resolve sandbox market?', 'Set ' + market.title + ' to ' + outcomeCode + '. Winning demo orders receive 2x their stake; losing orders receive no payout. This affects synthetic TNGN only.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resolve market', style: 'destructive', onPress: () => {
        void (async () => {
          setResolutionBusy(market.key); setError(null);
          try {
            const { error: resolveError } = await supabase.rpc('admin_resolve_demo_market', { p_market_key: market.key, p_outcome_code: outcomeCode });
            if (resolveError) throw resolveError;
            await refresh();
          } catch (e) { setError(e instanceof Error ? e.message : 'Could not resolve sandbox market.'); }
          finally { setResolutionBusy(null); }
        })();
      } },
    ]);
  };
  const toggle = async () => {
    if (saving || loading) return;
    setSaving(true); setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_set_tngn_demo_mode', { p_enabled: !status.globally_enabled });
      if (rpcError) throw rpcError;
      setStatus({ globally_enabled: data === true, user_enabled: false });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update demo mode. Check your platform settings permission.');
    } finally { setSaving(false); }
  };
  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
      <View style={{ gap: 3 }}>
        <VadText variant="caption" tone="tertiary">PLATFORM CONTROL</VadText>
        <VadText variant="heading">TNGN demo environment</VadText>
        <VadText variant="caption" tone="secondary">Global kill switch for synthetic demo accounts. Turning this off revokes all user opt-ins. It does not activate Arc Mainnet or real-money payment rails.</VadText>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <VadText variant="bodyStrong">{loading ? 'Checking status…' : status.globally_enabled ? 'Globally enabled' : 'Globally disabled'}</VadText>
          <VadText variant="caption" tone="tertiary">{status.globally_enabled ? 'Eligible users may opt in from Wallet, Markets, or Portfolio.' : 'Demo mode is unavailable to all users.'}</VadText>
        </View>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: status.globally_enabled, disabled: loading || saving }} disabled={loading || saving} onPress={() => void toggle()} style={({ pressed }) => ({ width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center', alignItems: status.globally_enabled ? 'flex-end' : 'flex-start', backgroundColor: status.globally_enabled ? theme.colors.brandPrimary : theme.colors.border, opacity: loading || saving ? 0.45 : pressed ? 0.75 : 1 })}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.surface }} />
        </Pressable>
      </View>
      {error ? <VadText variant="caption" tone="danger">{error}</VadText> : null}
      <View style={{ gap: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.md }}>
        <VadText variant="bodyStrong">Sandbox market resolution</VadText>
        <VadText variant="caption" tone="secondary">Resolve practice markets explicitly. This never resolves or changes real VAD markets.</VadText>
        {markets.map((market) => (
          <View key={market.key} style={{ gap: 8, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 10 }}>
            <View style={{ gap: 2 }}>
              <VadText variant="label">{market.title}</VadText>
              <VadText variant="caption" tone="tertiary">{market.status === 'OPEN' ? 'Open for practice orders' : 'Resolved · ' + (market.resolvedOutcome ?? 'Closed')}</VadText>
            </View>
            {market.status === 'OPEN' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(market.outcomes ?? []).map((outcome) => (
                  <Pressable key={outcome.code} disabled={resolutionBusy !== null || !status.globally_enabled} onPress={() => resolveMarket(market, outcome.code)} style={{ borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: theme.colors.surfaceMuted, opacity: resolutionBusy !== null || !status.globally_enabled ? 0.5 : 1 }}>
                    <VadText variant="label">{resolutionBusy === market.key ? 'Resolving…' : 'Resolve: ' + outcome.label}</VadText>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ))}
        {!markets.length ? <VadText variant="caption" tone="tertiary">No sandbox markets returned for this admin account.</VadText> : null}
      </View>
    </VadCard>
  );
}
