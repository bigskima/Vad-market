import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getAdminMarketTradeLimitDefaults,
  saveAdminMarketTradeLimitDefaults,
  type TradingMethod,
} from '@/services/admin-market-trade-limits-api';

type Asset = 'NGN' | 'USDC';

export default function AdminMarketLimitsScreen() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [asset, setAsset] = useState<Asset>('NGN');
  const [method, setMethod] = useState<TradingMethod>('ORDER_BOOK');
  const [minimum, setMinimum] = useState('100');
  const [maximum, setMaximum] = useState('100000');
  const [loadedKey, setLoadedKey] = useState('');
  const configKey = `${asset}:${method}`;
  const loading = loadedKey !== configKey;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getAdminMarketTradeLimitDefaults(asset, method)
      .then((value) => {
        if (!active) return;
        setMinimum(String(value.minTradeAmount));
        setMaximum(String(value.maxTradeAmount));
      })
      .catch((value: unknown) => {
        if (active) setError(value instanceof Error ? value.message : 'Trade limits could not be loaded.');
      })
      .finally(() => { if (active) setLoadedKey(configKey); });
    return () => { active = false; };
  }, [asset, method, configKey]);

  async function save() {
    const min = Number(minimum);
    const max = Number(maximum);
    if (!Number.isFinite(min) || min <= 0 || !Number.isFinite(max) || max <= min) {
      setError('Enter a positive minimum and a maximum greater than the minimum.');
      return;
    }
    setSaving(true); setError(null); setNotice(null);
    try {
      await saveAdminMarketTradeLimitDefaults({ assetCode: asset, liquidityModel: method, minTradeAmount: min, maxTradeAmount: max });
      setNotice('Defaults saved. New markets using this currency and trading method will start with these amounts; already-created markets keep their own limits.');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Trade limits could not be saved.');
    } finally { setSaving(false); }
  }

  return (
    <AdminPermissionGate permissions={['markets.manage']}>
      <AdminRouteContainer>
      <View style={{ gap: density.phone ? 12 : theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
        <View style={{ gap: 4 }}>
          <VadText variant="label" tone="brand">MARKET CONFIGURATION</VadText>
          <VadText variant="title">Default trade limits</VadText>
          <VadText variant="caption" tone="secondary">Configure starting minimum and maximum amounts independently for NGN/USDC and Peer Pool/Order Book. Each market can override these during creation.</VadText>
        </View>

        <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
          <VadText variant="heading">Choose currency</VadText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['NGN', 'USDC'] as const).map((value) => (
              <VadChip key={value} label={value} selected={asset === value} tone={asset === value ? 'brand' : 'neutral'} onPress={() => setAsset(value)} />
            ))}
          </View>
          <VadText variant="heading">Choose trading method</VadText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {([
              ['POOL', 'Peer Pool'],
              ['ORDER_BOOK', 'Order Book'],
            ] as const).map(([value, label]) => (
              <VadChip key={value} label={label} selected={method === value} tone={method === value ? 'brand' : 'neutral'} onPress={() => setMethod(value)} />
            ))}
          </View>
          {loading ? <VadText variant="caption" tone="secondary">Loading configured defaults…</VadText> : null}
          <VadInput
            label={'Default minimum (' + asset + ')'}
            value={minimum}
            onChangeText={(value) => setMinimum(value.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            hint={method === 'ORDER_BOOK' ? 'Minimum order notional: limit price × share quantity.' : 'Minimum amount per pool stake.'}
          />
          <VadInput
            label={'Default maximum (' + asset + ')'}
            value={maximum}
            onChangeText={(value) => setMaximum(value.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            hint={method === 'ORDER_BOOK' ? 'Maximum order notional per individual order. Separate user exposure limits still apply.' : 'Maximum amount per stake. Separate total-market and total-user stake limits still apply.'}
          />
          {notice ? <VadCard variant="muted"><VadText tone="yes">{notice}</VadText></VadCard> : null}
          {error ? <VadErrorState title="Trade limits need attention" message={error} onRetry={() => {
            void getAdminMarketTradeLimitDefaults(asset, method)
              .then((value) => { setMinimum(String(value.minTradeAmount)); setMaximum(String(value.maxTradeAmount)); setError(null); })
              .catch((value: unknown) => setError(value instanceof Error ? value.message : 'Trade limits could not be loaded.'))
              .finally(() => setLoadedKey(configKey));
          }} /> : null}
          <VadButton label={saving ? 'Saving defaults…' : 'Save defaults'} loading={saving} disabled={loading || saving} onPress={() => void save()} />
        </VadCard>
      </View>
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
