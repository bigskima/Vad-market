import { useCallback, useEffect, useState } from 'react';
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
  issueMarketAgentKey,
  listMarketAgentKeys,
  revokeMarketAgentKey,
  type IssuedMarketAgentKey,
  type MarketAgentKey,
  type MarketAgentScope,
} from '@/services/admin-market-agent-api';

const allScopes: Array<{ value: MarketAgentScope; label: string; description: string }> = [
  { value: 'market:read', label: 'Read catalogue', description: 'Read configured categories and market types.' },
  { value: 'market:create', label: 'Create markets', description: 'Create a market draft through the configured VAD lifecycle.' },
  { value: 'market:publish', label: 'Publish markets', description: 'Publish immediately when the market rules and open window permit.' },
];

export default function AdminMarketAgentsScreen() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [name, setName] = useState('ChatGPT market agent');
  const [scopes, setScopes] = useState<MarketAgentScope[]>(['market:read', 'market:create', 'market:publish']);
  const [keys, setKeys] = useState<MarketAgentKey[]>([]);
  const [issued, setIssued] = useState<IssuedMarketAgentKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const rows = await listMarketAgentKeys();
    setKeys(rows);
  }, []);

  useEffect(() => {
    let active = true;
    void listMarketAgentKeys()
      .then((rows) => { if (active) setKeys(rows); })
      .catch((value: unknown) => { if (active) setError(value instanceof Error ? value.message : 'Agent keys could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function toggleScope(value: MarketAgentScope) {
    setScopes((current) => current.includes(value)
      ? current.filter((scope) => scope !== value)
      : [...current, value]);
  }

  async function createKey() {
    if (working) return;
    if (name.trim().length < 3) return setError('Name this agent key with at least 3 characters.');
    if (!scopes.length) return setError('Select at least one permission.');
    setWorking(true); setError(null); setNotice(null); setIssued(null);
    try {
      const value = await issueMarketAgentKey({ name, scopes });
      setIssued(value);
      await reload();
      setNotice('Agent key created. The full token is shown only once and cannot be retrieved later.');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Agent key could not be created.');
    } finally { setWorking(false); }
  }

  async function revoke(id: string) {
    if (working) return;
    setWorking(true); setError(null); setNotice(null);
    try {
      await revokeMarketAgentKey(id);
      await reload();
      setNotice('Agent key revoked. Calls using it will fail immediately.');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Agent key could not be revoked.');
    } finally { setWorking(false); }
  }

  return (
    <AdminPermissionGate permissions={['markets.manage']}>
      <AdminRouteContainer>
      <View style={{ gap: density.phone ? 12 : theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
        <View style={{ gap: 4 }}>
          <VadText variant="label" tone="brand">AUTONOMOUS MARKET WORKFLOW</VadText>
          <VadText variant="title">Market agent access</VadText>
          <VadText variant="caption" tone="secondary">Issue a scoped key so an authorized AI agent can read VAD’s market catalogue and create or publish markets through the existing database, trading-limit and resolution pipeline—not by bypassing it.</VadText>
        </View>

        <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
          <VadText variant="heading">Create agent key</VadText>
          <VadInput label="Agent name" value={name} onChangeText={setName} placeholder="e.g. ChatGPT market agent" autoCapitalize="words" />
          <VadText variant="label">Permissions</VadText>
          {allScopes.map((scope) => (
            <View key={scope.value} style={{ gap: 4, borderWidth: 1, borderColor: scopes.includes(scope.value) ? theme.colors.brandPrimary : theme.colors.border, borderRadius: theme.radius.md, padding: 10 }}>
              <VadChip label={scope.label} selected={scopes.includes(scope.value)} tone={scopes.includes(scope.value) ? 'brand' : 'neutral'} onPress={() => toggleScope(scope.value)} />
              <VadText variant="caption" tone="secondary">{scope.description}</VadText>
            </View>
          ))}
          <VadButton label={working ? 'Creating key…' : 'Create one-time key'} loading={working} disabled={working} onPress={() => void createKey()} />
          {notice ? <VadCard variant="muted"><VadText tone="yes">{notice}</VadText></VadCard> : null}
          {error ? <VadErrorState title="Agent access needs attention" message={error} onRetry={() => { setError(null); setLoading(true); void reload().catch((value: unknown) => setError(value instanceof Error ? value.message : 'Refresh failed.')).finally(() => setLoading(false)); }} /> : null}
        </VadCard>

        {issued ? (
          <VadCard variant="raised" style={{ gap: theme.spacing.md, borderColor: theme.colors.warning }}>
            <VadText variant="heading">Copy this key now</VadText>
            <VadText variant="caption" tone="warning">VAD stores only a one-way hash. The full key will not appear again. Store it as a secret in the AI agent or connector configuration. Never commit it to GitHub or paste it into public prompts.</VadText>
            <VadInput label="One-time agent API key" value={issued.apiKey} onChangeText={(value) => setIssued((current) => current ? { ...current, apiKey: value } : current)} autoCapitalize="none" autoCorrect={false} />
            <VadText variant="caption" tone="secondary">Permissions: {issued.scopes.join(', ')}</VadText>
            <VadButton label="Hide one-time key" variant="secondary" onPress={() => setIssued(null)} />
          </VadCard>
        ) : null}

        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <VadText variant="heading">Existing keys</VadText>
            <VadButton label="Refresh" size="small" variant="secondary" loading={loading} disabled={loading} onPress={() => { setLoading(true); void reload().catch((value: unknown) => setError(value instanceof Error ? value.message : 'Refresh failed.')).finally(() => setLoading(false)); }} />
          </View>
          {loading ? <VadText variant="caption" tone="secondary">Loading agent keys…</VadText> : keys.length ? keys.map((key) => (
            <VadCard key={key.id} variant="surface" style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <VadText variant="bodyStrong">{key.name}</VadText>
                  <VadText variant="caption" tone="secondary">Created {new Date(key.created_at).toLocaleString()}</VadText>
                </View>
                <VadChip label={key.status} tone={key.status === 'ACTIVE' ? 'yes' : 'neutral'} />
              </View>
              <VadText variant="caption" tone="secondary">Permissions: {key.scopes.join(', ')}</VadText>
              <VadText variant="caption" tone="secondary">Last used: {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : 'Never'}</VadText>
              <VadText variant="caption" tone="secondary">Expires: {key.expires_at ? new Date(key.expires_at).toLocaleString() : 'No expiry (revoke manually)'}</VadText>
              {key.status === 'ACTIVE' ? <VadButton label="Revoke key" size="small" variant="secondary" disabled={working} onPress={() => void revoke(key.id)} /> : null}
            </VadCard>
          )) : <VadCard variant="muted"><VadText>No agent keys have been created for this admin account.</VadText></VadCard>}
        </View>
      </View>
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
