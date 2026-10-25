import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadInput } from '@/components/ui/vad-input';
import { VadSegmentedControl } from '@/components/ui/vad-segmented-control';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getAdminTradingRiskPolicies,
  updateAdminTradingRiskPolicy,
  type AdminTradingRiskPolicy,
} from '@/services/admin-trading-risk-api';

type Draft = {
  enabled: boolean;
  pool_max_entry_stake: string;
  pool_max_user_market_stake: string;
  pool_max_market_total: string;
  pool_max_payout_multiple: string;
  order_max_order_notional: string;
  order_max_user_market_exposure: string;
};

type Drafts = Record<string, Draft>;

function toDraft(policy: AdminTradingRiskPolicy): Draft {
  return {
    enabled: policy.enabled,
    pool_max_entry_stake: String(policy.pool_max_entry_stake),
    pool_max_user_market_stake: String(policy.pool_max_user_market_stake),
    pool_max_market_total: String(policy.pool_max_market_total),
    pool_max_payout_multiple: String(policy.pool_max_payout_multiple),
    order_max_order_notional: String(policy.order_max_order_notional),
    order_max_user_market_exposure: String(policy.order_max_user_market_exposure),
  };
}

const FIELDS: { key: Exclude<keyof Draft, 'enabled'>; label: string; hint: string }[] = [
  { key: 'pool_max_entry_stake', label: 'Peer Pool maximum single stake', hint: 'Maximum amount accepted in one pool-stake transaction.' },
  { key: 'pool_max_user_market_stake', label: 'Peer Pool maximum combined user stake', hint: 'Maximum principal one account can commit to one market across all outcomes.' },
  { key: 'pool_max_market_total', label: 'Peer Pool maximum market pool', hint: 'Maximum combined stake accepted by a single pool market.' },
  { key: 'pool_max_payout_multiple', label: 'Peer Pool maximum gross payout multiple', hint: 'For example, 10 means gross winning payout is capped at ten times the winning stake when the cap applies.' },
  { key: 'order_max_order_notional', label: 'Order Book maximum order value', hint: 'Maximum notional value of a single order.' },
  { key: 'order_max_user_market_exposure', label: 'Order Book maximum user exposure', hint: 'Maximum open BUY exposure for one account in one market.' },
];

export function AdminTradingRiskScreen() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [policies, setPolicies] = useState<AdminTradingRiskPolicy[]>([]);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [loading, setLoading] = useState(true);
  const [savingAsset, setSavingAsset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getAdminTradingRiskPolicies();
      setPolicies(rows);
      setDrafts(Object.fromEntries(rows.map((row) => [row.asset_code, toDraft(row)])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load trading risk policies.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patch(assetCode: string, key: keyof Draft, value: string | boolean) {
    setDrafts((current) => ({
      ...current,
      [assetCode]: { ...current[assetCode], [key]: value } as Draft,
    }));
    setMessage(null);
    setError(null);
  }

  async function save(assetCode: string) {
    const draft = drafts[assetCode];
    if (!draft) return;
    const poolMaxEntryStake = Number(draft.pool_max_entry_stake);
    const poolMaxUserMarketStake = Number(draft.pool_max_user_market_stake);
    const poolMaxMarketTotal = Number(draft.pool_max_market_total);
    const poolMaxPayoutMultiple = Number(draft.pool_max_payout_multiple);
    const orderMaxOrderNotional = Number(draft.order_max_order_notional);
    const orderMaxUserMarketExposure = Number(draft.order_max_user_market_exposure);
    const numbers = [poolMaxEntryStake, poolMaxUserMarketStake, poolMaxMarketTotal, poolMaxPayoutMultiple, orderMaxOrderNotional, orderMaxUserMarketExposure];
    if (numbers.some((value) => !Number.isFinite(value) || value <= 0)) {
      setError('Enter a positive number for every limit before saving.');
      return;
    }
    if (poolMaxUserMarketStake < poolMaxEntryStake || poolMaxMarketTotal < poolMaxUserMarketStake
      || poolMaxPayoutMultiple <= 1 || orderMaxUserMarketExposure < orderMaxOrderNotional) {
      setError('Check the limits: combined limits must cover a single entry, the payout multiple must exceed 1×, and user exposure must cover a single order.');
      return;
    }

    setSavingAsset(assetCode);
    setError(null);
    setMessage(null);
    try {
      const version = await updateAdminTradingRiskPolicy({
        assetCode,
        enabled: draft.enabled,
        poolMaxEntryStake,
        poolMaxUserMarketStake,
        poolMaxMarketTotal,
        poolMaxPayoutMultiple,
        orderMaxOrderNotional,
        orderMaxUserMarketExposure,
      });
      setMessage(assetCode + ' defaults saved as version ' + version + '. They apply to newly created markets; existing market snapshots are unchanged.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save trading risk policies.');
    } finally {
      setSavingAsset(null);
    }
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="heading">Trading risk & payout limits</VadText>
        <VadText variant="body" tone="secondary">
          Configure distinct Peer Pool and Order Book limits. Peer Pool uses a stake-weighted pool payout with an optional maximum gross payout multiple. Order Book exposure is based on priced orders and held positions.
        </VadText>
      </View>

      <VadCard variant="muted" style={{ gap: theme.spacing.xs, padding: theme.spacing.md }}>
        <VadText variant="bodyStrong">Important: policy versioning</VadText>
        <VadText variant="caption" tone="secondary">
          Saving increments the asset policy version and affects newly created market instruments only. Existing markets retain their recorded policy snapshot. Pre-existing Peer Pool markets keep their original uncapped payout terms; do not change those terms retroactively.
        </VadText>
      </VadCard>

      {error ? (
        <VadCard variant="surface" style={{ borderColor: theme.colors.danger, gap: 4, padding: theme.spacing.md }}>
          <VadText variant="bodyStrong" tone="danger">Unable to complete action</VadText>
          <VadText variant="caption" tone="secondary">{error}</VadText>
        </VadCard>
      ) : null}
      {message ? (
        <VadCard variant="surface" style={{ borderColor: theme.colors.yes, gap: 4, padding: theme.spacing.md }}>
          <VadText variant="bodyStrong" tone="yes">Saved</VadText>
          <VadText variant="caption" tone="secondary">{message}</VadText>
        </VadCard>
      ) : null}

      {loading ? (
        <VadCard variant="surface" style={{ gap: 4, padding: theme.spacing.md }}>
          <VadText variant="bodyStrong">Loading risk policies…</VadText>
          <VadText variant="caption" tone="secondary">Checking the current asset-level defaults.</VadText>
        </VadCard>
      ) : policies.length === 0 ? (
        <VadCard variant="surface" style={{ gap: 4, padding: theme.spacing.md }}>
          <VadText variant="bodyStrong">No trading risk policies configured</VadText>
          <VadText variant="caption" tone="secondary">An authorized administrator must configure an active risk policy for a supported asset before creating new markets.</VadText>
          <VadButton label="Retry" variant="secondary" onPress={() => void load()} />
        </VadCard>
      ) : policies.map((policy) => {
        const draft = drafts[policy.asset_code];
        if (!draft) return null;
        const isSaving = savingAsset === policy.asset_code;
        return (
          <VadCard key={policy.asset_code} variant="raised" style={{ gap: theme.spacing.md, padding: theme.spacing.md }}>
            <View style={{ gap: 3 }}>
              <VadText variant="heading">{policy.asset_code} risk defaults</VadText>
              <VadText variant="caption" tone="secondary">
                Current version: {policy.policy_version} · Last updated: {new Date(policy.updated_at).toLocaleString()}
              </VadText>
            </View>

            <View style={{ gap: 5 }}>
              <VadText variant="bodyStrong">New market policy</VadText>
              <VadSegmentedControl
                value={draft.enabled ? 'ENABLED' : 'DISABLED'}
                options={[
                  { value: 'ENABLED', label: 'Enabled' },
                  { value: 'DISABLED', label: 'Disabled' },
                ]}
                onChange={(value) => patch(policy.asset_code, 'enabled', value === 'ENABLED')}
              />
              <VadText variant="caption" tone="secondary">
                Disabled assets cannot create new instrument snapshots until the defaults are re-enabled.
              </VadText>
            </View>

            <View style={{ flexDirection: density.narrow ? 'column' : 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {FIELDS.map((field) => (
                <View key={field.key} style={{ flex: 1, flexBasis: density.narrow ? '100%' : '46%', minWidth: density.narrow ? '100%' : 220, gap: 3 }}>
                  <VadInput
                    label={field.label}
                    hint={field.hint}
                    value={draft[field.key]}
                    editable={!isSaving}
                    onChangeText={(value) => patch(policy.asset_code, field.key, value)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                </View>
              ))}
            </View>

            <VadButton
              label={'Save ' + policy.asset_code + ' defaults'}
              loading={isSaving}
              disabled={isSaving || savingAsset !== null}
              onPress={() => void save(policy.asset_code)}
            />
          </VadCard>
        );
      })}
    </View>
  );
}
