import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { supabase, supabaseConfiguration } from '@/lib/supabase';
import { useVadTheme } from '@/providers/theme-provider';

type Status = { globally_enabled: boolean; user_enabled: boolean };

export function TngnDemoAdminControl() {
  const theme = useVadTheme();
  const [status, setStatus] = useState<Status>({ globally_enabled: false, user_enabled: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!supabaseConfiguration.ready) { setLoading(false); return; }
    const { data, error: rpcError } = await supabase.rpc('get_demo_mode_status');
    if (rpcError) { setError('Could not load the current demo-mode setting.'); setLoading(false); return; }
    const row = (Array.isArray(data) ? data[0] : data) as Status | null;
    setStatus({ globally_enabled: row?.globally_enabled === true, user_enabled: row?.user_enabled === true });
    setError(null);
    setLoading(false);
  }, []);
  useEffect(() => { const timer = setTimeout(() => void refresh(), 0); return () => clearTimeout(timer); }, [refresh]);
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
          <VadText variant="caption" tone="tertiary">{status.globally_enabled ? 'Eligible users may opt in from Wallet.' : 'Demo mode is unavailable to all users.'}</VadText>
        </View>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: status.globally_enabled, disabled: loading || saving }} disabled={loading || saving} onPress={() => void toggle()} style={({ pressed }) => ({ width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center', alignItems: status.globally_enabled ? 'flex-end' : 'flex-start', backgroundColor: status.globally_enabled ? theme.colors.brandPrimary : theme.colors.border, opacity: loading || saving ? 0.45 : pressed ? 0.75 : 1 })}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.surface }} />
        </Pressable>
      </View>
      {error ? <VadText variant="caption" tone="danger">{error}</VadText> : null}
    </VadCard>
  );
}
