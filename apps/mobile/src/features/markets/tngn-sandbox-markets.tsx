import { useCallback, useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { supabase } from '@/lib/supabase';
import { useVadTheme } from '@/providers/theme-provider';

type DemoStatus = { globally_enabled: boolean; user_enabled: boolean };
type DemoMarket = { id: number; key: string; title: string; description: string; status: string; outcomes: { code: string; label: string }[] };
type DemoAccount = { assetCode: string; availableBalance: number; environment: 'DEMO' };
type DemoOrder = { orderId: string; marketTitle: string; outcomeCode: string; stake: number; status: string; createdAt: string };

export function TngnSandboxMarkets() {
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
    setLoading(true);
    setError(null);
    try {
      const { data: statusData, error: statusError } = await supabase.rpc('get_demo_mode_status');
      if (statusError) throw statusError;
      const value = (Array.isArray(statusData) ? statusData[0] : statusData) as DemoStatus | null;
      const next = { globally_enabled: value?.globally_enabled === true, user_enabled: value?.user_enabled === true };
      setStatus(next);
      if (!next.globally_enabled || !next.user_enabled) {
        setAccount(null); setMarkets([]); setOrders([]);
        return;
      }
      const [accountResult, marketsResult, ordersResult] = await Promise.all([
        supabase.rpc('my_demo_account'),
        supabase.rpc('my_demo_markets'),
        supabase.rpc('my_demo_orders'),
      ]);
      if (accountResult.error) throw accountResult.error;
      if (marketsResult.error) throw marketsResult.error;
      if (ordersResult.error) throw ordersResult.error;
      const accountValue = Array.isArray(accountResult.data) ? accountResult.data[0] : accountResult.data;
      setAccount(accountValue as DemoAccount);
      setMarkets((marketsResult.data ?? []) as DemoMarket[]);
      setOrders((ordersResult.data ?? []) as DemoOrder[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'TNGN sandbox could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { const timer = setTimeout(() => void refresh(), 0); return () => clearTimeout(timer); }, [refresh]);

  const enable = async () => {
    setSaving(true); setError(null); setNotice(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('set_my_demo_mode', { p_enabled: true });
      if (rpcError) throw rpcError;
      if (data !== true) throw new Error('TNGN sandbox is currently disabled by the platform administrator.');
      setNotice('Your separate TNGN sandbox account is ready. No real funds are used.');
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not enable TNGN sandbox.'); }
    finally { setSaving(false); }
  };

  const placeOrder = async (market: DemoMarket, outcomeCode: string) => {
    const amount = Number(stake);
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a positive TNGN stake.'); return; }
    setSaving(true); setError(null); setNotice(null);
    try {
      const { error: rpcError } = await supabase.rpc('place_demo_order', {
        p_market_key: market.key, p_outcome_code: outcomeCode, p_stake: amount, p_side: 'BUY',
      });
      if (rpcError) throw rpcError;
      setNotice('Sandbox order recorded in the isolated TNGN ledger. No real-money order or settlement was created.');
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Sandbox order could not be placed.'); }
    finally { setSaving(false); }
  };

  return (
    <VadCard variant="surface" style={{ padding: 14, gap: 12, borderRadius: 18 }}>
      <View style={{ gap: 3 }}>
        <VadText variant="bodyStrong">TNGN sandbox markets</VadText>
        <VadText variant="caption" tone="secondary">Separate practice account using synthetic TNGN. No deposits, withdrawals, real-money orders or real settlement.</VadText>
      </View>
      {loading ? <VadText variant="caption" tone="secondary">Checking sandbox availability…</VadText> : !status.globally_enabled ? (
        <VadText variant="caption" tone="secondary">TNGN sandbox is currently unavailable because the platform administrator has disabled it.</VadText>
      ) : !status.user_enabled ? (
        <Pressable disabled={saving} onPress={() => void enable()} style={{ padding: 12, borderRadius: 12, backgroundColor: theme.colors.brandPrimary, alignItems: 'center', opacity: saving ? 0.6 : 1 }}>
          <VadText variant="label" tone="inverse">{saving ? 'Enabling…' : 'Open TNGN sandbox account'}</VadText>
        </Pressable>
      ) : (
        <View style={{ gap: 12 }}>
          <View style={{ padding: 12, borderRadius: 14, backgroundColor: theme.colors.surfaceMuted, gap: 3 }}>
            <VadText variant="caption" tone="secondary">AVAILABLE PRACTICE BALANCE</VadText>
            <VadText variant="heading">{Number(account?.availableBalance ?? 0).toLocaleString()} TNGN</VadText>
            <VadText variant="caption" tone="tertiary">DEMO environment · not withdrawable</VadText>
          </View>
          <TextInput value={stake} onChangeText={setStake} keyboardType="decimal-pad" accessibilityLabel="Sandbox stake in TNGN" placeholder="Stake in TNGN" placeholderTextColor={theme.colors.textTertiary} style={{ color: theme.colors.textPrimary, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }} />
          {markets.map((market) => (
            <View key={market.key} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, padding: 12, gap: 8 }}>
              <VadText variant="bodyStrong">{market.title}</VadText>
              <VadText variant="caption" tone="secondary">{market.description}</VadText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(market.outcomes ?? []).map((outcome) => (
                  <Pressable key={outcome.code} disabled={saving || market.status !== 'OPEN'} onPress={() => void placeOrder(market, outcome.code)} style={{ paddingVertical: 10, paddingHorizontal: 13, borderRadius: 10, backgroundColor: theme.colors.brandPrimary, opacity: saving ? 0.5 : 1 }}>
                    <VadText variant="label" tone="inverse">{saving ? 'Please wait…' : outcome.label}</VadText>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          {!markets.length ? <VadText variant="caption" tone="secondary">No sandbox markets are currently open.</VadText> : null}
          <VadText variant="bodyStrong">Sandbox order history</VadText>
          {orders.length ? orders.slice(0, 5).map((order) => (
            <View key={order.orderId} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              <View style={{ flex: 1, gap: 2 }}>
                <VadText variant="label">{order.marketTitle}</VadText>
                <VadText variant="caption" tone="secondary">{order.outcomeCode} · {new Date(order.createdAt).toLocaleString()}</VadText>
              </View>
              <VadText variant="label">−{Number(order.stake).toLocaleString()} TNGN</VadText>
            </View>
          )) : <VadText variant="caption" tone="secondary">Your sandbox orders will appear here.</VadText>}
        </View>
      )}
      {notice ? <VadText variant="caption" tone="secondary">{notice}</VadText> : null}
      {error ? <VadText variant="caption" tone="danger">{error}</VadText> : null}
      {!loading && status.user_enabled ? <Pressable disabled={saving} onPress={() => void refresh()}><VadText variant="label" tone="brand">Refresh sandbox</VadText></Pressable> : null}
    </VadCard>
  );
}
