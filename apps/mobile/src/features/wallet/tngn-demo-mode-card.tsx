import { useCallback, useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { supabase, supabaseConfiguration } from '@/lib/supabase';
import { useVadTheme } from '@/providers/theme-provider';

type DemoStatus = { globally_enabled: boolean; user_enabled: boolean };
type DemoMarket = { id: number; key: string; title: string; description: string; status: string; outcomes: { code: string; label: string }[] };
type DemoAccount = { assetCode: string; availableBalance: number; environment: 'DEMO' };
type DemoOrder = { orderId: string; marketTitle: string; outcomeCode: string; stake: number; status: string; finalOutcome?: string | null; payout?: number; settledAt?: string | null; createdAt: string };

export function TngnDemoModeCard() {
  const theme = useVadTheme();
  const [status, setStatus] = useState<DemoStatus>({ globally_enabled: false, user_enabled: false });
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [markets, setMarkets] = useState<DemoMarket[]>([]);
  const [orders, setOrders] = useState<DemoOrder[]>([]);
  const [stake, setStake] = useState('100');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabaseConfiguration.ready) { setLoading(false); return; }
    try {
      const { data, error: rpcError } = await supabase.rpc('get_demo_mode_status');
      if (rpcError) throw rpcError;
      const value = (Array.isArray(data) ? data[0] : data) as DemoStatus | null;
      const next = { globally_enabled: value?.globally_enabled === true, user_enabled: value?.user_enabled === true };
      setStatus(next);
      if (!next.user_enabled) { setAccount(null); setMarkets([]); setOrders([]); return; }
      const [accountResult, marketResult] = await Promise.all([
        supabase.rpc('my_demo_account'),
        supabase.rpc('my_demo_markets'),
      ]);
      if (accountResult.error) throw accountResult.error;
      if (marketResult.error) throw marketResult.error;
      setAccount((Array.isArray(accountResult.data) ? accountResult.data[0] : accountResult.data) as DemoAccount | null);
      setMarkets((marketResult.data ?? []) as DemoMarket[]);
      const { data: orderData, error: orderError } = await supabase.rpc('my_demo_orders');
      if (orderError) throw orderError;
      setOrders((orderData ?? []) as DemoOrder[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Demo environment is temporarily unavailable.');
      setAccount(null); setMarkets([]); setOrders([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const interval = setInterval(() => void refresh(), 30_000);
    const { data } = supabase.auth.onAuthStateChange(() => setTimeout(() => void refresh(), 0));
    return () => { clearTimeout(timer); clearInterval(interval); data.subscription.unsubscribe(); };
  }, [refresh]);

  const toggle = async () => {
    if (!status.globally_enabled || saving) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('set_my_demo_mode', { p_enabled: !status.user_enabled });
      if (rpcError) throw rpcError;
      await refresh();
      setNotice(data === true ? 'Demo account enabled. Your synthetic TNGN balance is separate from real funds.' : 'Demo mode is disabled or unavailable.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update demo mode.'); }
    finally { setSaving(false); }
  };

  const placeOrder = async (market: DemoMarket, outcomeCode: string) => {
    const amount = Number(stake);
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a positive TNGN stake.'); return; }
    setSaving(true); setError(null); setNotice(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('place_demo_order', {
        p_market_key: market.key, p_outcome_code: outcomeCode, p_stake: amount, p_side: 'BUY',
      });
      if (rpcError) throw rpcError;
      const row = (Array.isArray(data) ? data[0] : data) as { availableBalance?: number } | null;
      setNotice('Demo order placed using TNGN only. No real money or real settlement was used.');
      if (row?.availableBalance !== undefined && account) setAccount({ ...account, availableBalance: row.availableBalance });
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Demo order could not be placed.'); }
    finally { setSaving(false); }
  };

  return (
    <VadCard variant="surface" style={{ padding: 14, gap: 12, borderRadius: 18 }}>
      <View style={{ gap: 3 }}>
        <VadText variant="bodyStrong">TNGN demo account</VadText>
        <VadText variant="caption" tone="secondary">
          Practice with synthetic funds in a separate demo ledger and demo markets. TNGN cannot be deposited, withdrawn, or mixed with real NGN or USDC.
        </VadText>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <VadText variant="label">{loading ? 'Checking availability…' : !status.globally_enabled ? 'Disabled by platform admin' : status.user_enabled ? 'Demo mode enabled' : 'Demo mode off'}</VadText>
          <VadText variant="caption" tone="tertiary">{!status.globally_enabled ? 'Unavailable until an admin enables it globally.' : 'This preference only controls your isolated demo account.'}</VadText>
        </View>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: status.user_enabled, disabled: loading || saving || !status.globally_enabled }} accessibilityLabel="Enable TNGN demo account" disabled={loading || saving || !status.globally_enabled} onPress={() => void toggle()} style={({ pressed }) => ({ width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center', alignItems: status.user_enabled ? 'flex-end' : 'flex-start', backgroundColor: status.user_enabled ? theme.colors.brandPrimary : theme.colors.border, opacity: loading || saving || !status.globally_enabled ? 0.45 : pressed ? 0.75 : 1 })}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.surface }} />
        </Pressable>
      </View>
      {account && status.user_enabled ? (
        <View style={{ gap: 10 }}>
          <View style={{ borderRadius: 14, padding: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, gap: 3 }}>
            <VadText variant="caption" tone="secondary">DEMO BALANCE · TNGN</VadText>
            <VadText variant="heading">{Number(account.availableBalance).toLocaleString()} TNGN</VadText>
            <VadText variant="caption" tone="tertiary">Synthetic practice balance · not withdrawable</VadText>
          </View>
          <VadText variant="bodyStrong">Practice markets</VadText>
          <View style={{ gap: 10 }}>
            {markets.map((market) => (
              <View key={market.key} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, padding: 12, gap: 8 }}>
                <VadText variant="bodyStrong">{market.title}</VadText>
                <VadText variant="caption" tone="secondary">{market.description}</VadText>
                <TextInput value={stake} onChangeText={setStake} keyboardType="decimal-pad" accessibilityLabel="Demo stake in TNGN" placeholder="Stake in TNGN" placeholderTextColor={theme.colors.textTertiary} style={{ color: theme.colors.textPrimary, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(market.outcomes ?? []).map((outcome) => (
                    <Pressable key={outcome.code} disabled={saving || !status.globally_enabled || !status.user_enabled} onPress={() => void placeOrder(market, outcome.code)} style={({ pressed }) => ({ paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, backgroundColor: theme.colors.brandPrimary, opacity: saving ? 0.5 : pressed ? 0.75 : 1 })}>
                      <VadText variant="label" tone="inverse">{saving ? 'Please wait…' : outcome.label}</VadText>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
          <VadText variant="bodyStrong">Recent demo orders</VadText>
          {orders.length ? orders.slice(0, 5).map((order) => (
            <View key={order.orderId} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              <View style={{ flex: 1, gap: 2 }}>
                <VadText variant="label">{order.marketTitle}</VadText>
                <VadText variant="caption" tone="secondary">{order.outcomeCode} · {new Date(order.createdAt).toLocaleString()}</VadText>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <VadText variant="label">−{Number(order.stake).toLocaleString()} TNGN</VadText>
                <VadText variant="caption" tone="tertiary">{order.status}{order.finalOutcome ? ` · Result ${order.finalOutcome}` : ''}</VadText>
                {order.status === 'SETTLED' ? <VadText variant="caption" tone={Number(order.payout ?? 0) > 0 ? 'success' : 'secondary'}>{Number(order.payout ?? 0).toLocaleString()} TNGN payout</VadText> : null}
              </View>
            </View>
          )) : <VadText variant="caption" tone="tertiary">Your practice orders will appear here.</VadText>}
        </View>
      ) : null}
      {notice ? <VadText variant="caption" tone="secondary">{notice}</VadText> : null}
      {error ? <VadText variant="caption" tone="danger">{error}</VadText> : null}
    </VadCard>
  );
}
