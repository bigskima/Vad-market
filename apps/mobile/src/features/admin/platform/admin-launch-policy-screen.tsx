import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getLaunchPolicyWorkspace,
  type LaunchPolicyWorkspace,
} from '@/services/launch-policy-admin-api';

export function AdminLaunchPolicyScreen() {
  const theme = useVadTheme();
  const [workspace, setWorkspace] = useState<LaunchPolicyWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWorkspace(await getLaunchPolicyWorkspace());
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Launch policy controls could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const productionOracle = useMemo(
    () => workspace?.oraclePolicies.find((policy) => policy.environment === 'PRODUCTION' && policy.status === 'ACTIVE') ?? null,
    [workspace],
  );
  const sandboxOracle = useMemo(
    () => workspace?.oraclePolicies.find((policy) => policy.environment === 'SANDBOX') ?? null,
    [workspace],
  );

  if (loading && !workspace) {
    return <View style={{ gap: theme.spacing.md }}><VadSkeleton width="48%" height={34} /><VadSkeleton height={120} /><VadSkeleton height={180} /><VadSkeleton height={180} /></View>;
  }
  if (error && !workspace) return <VadErrorState title="Launch controls unavailable" message={error} onRetry={() => void load()} />;

  const market = workspace?.marketAdmission;
  const launch = workspace?.launchPhase;
  const settlement = workspace?.settlementFee;
  const ready = Boolean(market?.status === 'ACTIVE' && launch?.status === 'ACTIVE' && settlement?.status === 'ACTIVE' && productionOracle);

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">LAUNCH & MARKET POLICY</VadText>
        <VadText variant="title">Production readiness in one place.</VadText>
        <VadText tone="secondary">Review the active market, settlement and oracle controls before opening VAD to real users. Changes remain versioned in the existing policy systems.</VadText>
      </View>

      <VadCard variant={ready ? 'brand' : 'outlined'} style={{ gap: theme.spacing.sm }}>
        <VadText variant="caption" tone={ready ? 'yes' : 'warning'}>{ready ? 'CORE POLICY READY' : 'ACTION REQUIRED'}</VadText>
        <VadText variant="heading">{ready ? 'Core launch policies are active.' : 'At least one launch policy is not active.'}</VadText>
        <VadText variant="caption" tone="secondary">This page does not replace the dedicated fee, market, oracle or provider workflows. It gives Super Admin a single readiness view and routes to the authoritative controls.</VadText>
      </VadCard>

      {error ? <VadErrorState title="Refresh needs attention" message={error} onRetry={() => void load()} /> : null}

      <View style={{ gap: theme.spacing.md }}>
        <PolicyRow title="Launch phase" status={launch?.status ?? 'MISSING'} detail={launch ? `Version ${launch.version} · ${String(launch.configuration.country_code ?? '—')} · ${String(launch.configuration.settlement_asset ?? '—')}` : 'No active launch phase policy found.'} />
        <PolicyRow title="Market admission" status={market?.status ?? 'MISSING'} detail={market ? `Version ${market.version} · Auto publish ${market.configuration.auto_publish_enabled === true ? 'on' : 'off'} · Min order ${String(market.configuration.minimum_order_notional ?? '—')}` : 'No market admission policy found.'} />
        <PolicyRow title="Settlement fee" status={settlement?.status ?? 'MISSING'} detail={settlement ? `Version ${settlement.version} · Rate ${bpsLabel(settlement.configuration.rate_bps)}` : 'No active settlement fee exists yet.'} />
        <PolicyRow title="Production oracle" status={productionOracle?.status ?? 'MISSING'} detail={productionOracle ? `${productionOracle.name} · v${productionOracle.version} · dispute ${durationLabel(productionOracle.disputeWindowSeconds)}` : 'No ACTIVE production oracle policy is available.'} />
        <PolicyRow title="Sandbox oracle" status={sandboxOracle?.status ?? 'MISSING'} detail={sandboxOracle ? `${sandboxOracle.name} · v${sandboxOracle.version} · ${durationLabel(sandboxOracle.disputeWindowSeconds)} dispute window` : 'Sandbox policy has not been created.'} />
      </View>

      <VadCard variant="muted" style={{ gap: theme.spacing.md }}>
        <VadText variant="heading">Authoritative controls</VadText>
        <VadText variant="caption" tone="secondary">Use the existing specialized admin workflows for changes. This avoids duplicating financial and oracle authority in multiple screens.</VadText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          <VadButton label="Fee controls" size="small" variant="secondary" fullWidth={false} onPress={() => router.push('/admin/fees')} />
          <VadButton label="Markets & oracle" size="small" variant="secondary" fullWidth={false} onPress={() => router.push('/admin/governance')} />
          <VadButton label="Providers" size="small" variant="secondary" fullWidth={false} onPress={() => router.push('/admin/providers')} />
          <VadButton label="Refresh" size="small" variant="ghost" fullWidth={false} onPress={() => void load()} />
        </View>
      </VadCard>
    </View>
  );
}

function PolicyRow({ title, status, detail }: { title: string; status: string; detail: string }) {
  const theme = useVadTheme();
  const tone = status === 'ACTIVE' ? 'yes' : status === 'DRAFT' ? 'warning' : 'danger';
  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.xs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md, alignItems: 'center' }}>
        <VadText variant="bodyStrong">{title}</VadText>
        <VadChip label={status} tone={tone} />
      </View>
      <VadText variant="caption" tone="secondary">{detail}</VadText>
    </VadCard>
  );
}

function bpsLabel(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? `${(number / 100).toFixed(2)}%` : '—';
}

function durationLabel(seconds: number) {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}
