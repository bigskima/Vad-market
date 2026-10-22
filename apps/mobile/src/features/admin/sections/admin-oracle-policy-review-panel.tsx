import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  approveAdminOraclePolicy,
  getAdminOraclePolicies,
  type AdminOraclePolicy,
} from '@/services/admin-oracle-policy-api';

type Props = { canReview: boolean };

export function AdminOraclePolicyReviewPanel({ canReview }: Props) {
  const theme = useVadTheme();
  const [policies, setPolicies] = useState<AdminOraclePolicy[]>([]);
  const [selected, setSelected] = useState<AdminOraclePolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPolicies(await getAdminOraclePolicies());
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Oracle policy records could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const drafts = policies.filter((policy) => policy.status === 'DRAFT').length;
  const active = policies.filter((policy) => policy.status === 'ACTIVE').length;

  async function approve() {
    if (!selected || !canReview || selected.status !== 'DRAFT' || workingId) return;
    setWorkingId(selected.public_id);
    setError(null);
    setNotice(null);
    try {
      const label = selected.name + ' v' + selected.version;
      await approveAdminOraclePolicy(selected.public_id);
      setSelected(null);
      setNotice(label + ' was approved. Newly created eligible markets can now bind to this policy.');
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'The policy could not be approved.');
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
        <VadText variant="label" tone="brand">ORACLE GOVERNANCE</VadText>
        <VadText variant="heading">Resolution policies</VadText>
        <VadText variant="body" tone="secondary" style={{ fontSize: 14, lineHeight: 21 }}>
          Review the source hierarchy, consensus quorum and dispute window before activating a policy. Approval is performed by the existing server-side dual-control workflow; this screen does not bypass reviewer permissions.
        </VadText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          <VadChip label={drafts + ' draft' + (drafts === 1 ? '' : 's')} tone={drafts ? 'warning' : 'neutral'} />
          <VadChip label={active + ' active'} tone={active ? 'yes' : 'neutral'} />
        </View>
        {!canReview ? (
          <VadText variant="caption" tone="secondary">
            You can inspect policy versions, but activating a draft requires the oracle.review permission and approval by an authorized reviewer other than its creator.
          </VadText>
        ) : null}
        <VadButton label="Refresh policies" size="small" variant="secondary" disabled={loading || Boolean(workingId)} onPress={() => void load()} />
      </VadCard>

      {notice ? (
        <VadCard variant="raised" style={{ borderColor: theme.colors.yes, gap: 4 }}>
          <VadText variant="bodyStrong" tone="yes">Policy approval recorded</VadText>
          <VadText variant="caption" tone="secondary">{notice}</VadText>
        </VadCard>
      ) : null}

      {error ? <VadErrorState title="Oracle policy action failed" message={error} onRetry={() => void load()} /> : null}

      {loading ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
          <VadSkeleton height={22} width="64%" />
          <VadSkeleton height={16} width="86%" />
          <VadSkeleton height={16} width="52%" />
        </VadCard>
      ) : policies.length ? (
        <View style={{ gap: theme.spacing.sm }}>
          {policies.map((policy) => {
            const sources = describeSources(policy.source_hierarchy);
            const environment = asText(policy.consensus_rule?.environment).toUpperCase() || 'PRODUCTION';
            const isDraft = policy.status === 'DRAFT';
            return (
              <VadCard key={policy.public_id} variant="raised" style={{ gap: theme.spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <VadText variant="bodyStrong">{policy.name}</VadText>
                    <VadText variant="caption" tone="secondary">Version {policy.version} · {policy.capability_code}</VadText>
                  </View>
                  <VadChip label={policy.status} tone={policy.status === 'ACTIVE' ? 'yes' : isDraft ? 'warning' : 'neutral'} />
                </View>
                <View style={{ padding: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceMuted, gap: 5 }}>
                  <PolicyLine label="Environment" value={environment} />
                  <PolicyLine label="Evidence sources" value={sources || 'No source hierarchy configured'} />
                  <PolicyLine label="Consensus" value={consensusLabel(policy.consensus_rule)} />
                  <PolicyLine label="Dispute window" value={formatDuration(policy.dispute_window_seconds)} />
                  <PolicyLine label="Effective from" value={formatDate(policy.effective_at)} />
                </View>
                {isDraft ? (
                  canReview ? (
                    <VadButton label="Review draft policy" variant="secondary" onPress={() => { setError(null); setSelected(policy); }} />
                  ) : (
                    <VadText variant="caption" tone="secondary">Waiting for an authorized Oracle reviewer.</VadText>
                  )
                ) : policy.status === 'ACTIVE' ? (
                  <VadText variant="caption" tone="secondary">
                    New events that satisfy this policy's capability and environment may bind to this version. Existing event bindings remain pinned.
                  </VadText>
                ) : null}
              </VadCard>
            );
          })}
        </View>
      ) : (
        <VadCard variant="raised" style={{ gap: 4 }}>
          <VadText variant="bodyStrong">No Oracle policies returned</VadText>
          <VadText variant="caption" tone="secondary">Check access to the Oracle policy catalog and refresh.</VadText>
        </VadCard>
      )}

      <VadBottomSheet
        visible={Boolean(selected)}
        title="Review Oracle policy"
        onClose={() => { if (!workingId) setSelected(null); }}
      >
        {selected ? (
          <View style={{ gap: theme.spacing.md }}>
            <View style={{ gap: 4 }}>
              <VadText variant="label" tone="brand">DRAFT · VERSION {selected.version}</VadText>
              <VadText variant="heading">{selected.name}</VadText>
              <VadText variant="body" tone="secondary">
                Activating this version makes it eligible for future events using the matching capability and environment. It does not rewrite policies already bound to existing events.
              </VadText>
            </View>
            <View style={{ padding: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, gap: theme.spacing.sm }}>
              <PolicyLine label="Capability" value={selected.capability_code} />
              <PolicyLine label="Environment" value={asText(selected.consensus_rule?.environment).toUpperCase() || 'PRODUCTION'} />
              <PolicyLine label="Evidence sources" value={describeSources(selected.source_hierarchy) || 'No source hierarchy configured'} />
              <PolicyLine label="Consensus" value={consensusLabel(selected.consensus_rule)} />
              <PolicyLine label="Dispute window" value={formatDuration(selected.dispute_window_seconds)} />
              <PolicyLine label="Effective from" value={formatDate(selected.effective_at)} />
            </View>
            <VadCard variant="raised" style={{ borderColor: theme.colors.borderStrong, gap: 4 }}>
              <VadText variant="bodyStrong">Approval safeguards</VadText>
              <VadText variant="caption" tone="secondary">
                The server checks oracle.review and enforces independent approval. If the database says this account created the policy, approval will be rejected and another reviewer must approve it.
              </VadText>
            </VadCard>
            {error ? <VadErrorState title="Approval rejected" message={error} /> : null}
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <VadButton label="Cancel" variant="secondary" disabled={Boolean(workingId)} onPress={() => setSelected(null)} />
              </View>
              <View style={{ flex: 1.35 }}>
                <VadButton
                  label={'Approve & activate v' + selected.version}
                  loading={workingId === selected.public_id}
                  disabled={!canReview || Boolean(workingId)}
                  onPress={() => void approve()}
                />
              </View>
            </View>
          </View>
        ) : null}
      </VadBottomSheet>
    </View>
  );
}

function PolicyLine({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ gap: 2 }}>
      <VadText variant="caption" tone="secondary">{label}</VadText>
      <VadText variant="bodyStrong" style={{ fontSize: 14, lineHeight: 20 }}>{value}</VadText>
    </View>
  );
}

function describeSources(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
    const row = item as Record<string, unknown>;
    const role = asText(row.role).replaceAll('_', ' ').toLowerCase();
    const provider = asText(row.provider_code ?? row.providerCode).toUpperCase();
    const priority = Number(row.priority);
    return [role || 'source', provider, Number.isFinite(priority) ? 'priority ' + priority : ''].filter(Boolean).join(' · ');
  }).filter(Boolean).join(' / ');
}

function consensusLabel(rule: Record<string, unknown> | null): string {
  if (!rule) return 'Consensus rule is not configured';
  const required = Number(rule.min_agreeing_providers ?? rule.minAgreeingProviders);
  const distinct = rule.distinct_providers ?? rule.distinctProviders;
  const parts = [];
  if (Number.isFinite(required) && required > 0) parts.push(required + ' agreeing provider' + (required === 1 ? '' : 's'));
  if (distinct === true) parts.push('distinct providers');
  if (asText(rule.finalization_mode)) parts.push(asText(rule.finalization_mode).replaceAll('_', ' ').toLowerCase());
  if (asText(rule.environment)) parts.push(asText(rule.environment).toUpperCase());
  return parts.join(' · ') || 'See full policy details';
}

function formatDuration(seconds: number): string {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return 'Not specified';
  if (value < 60) return value + ' seconds';
  if (value < 3600) return Math.round(value / 60) + ' minutes';
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return minutes ? hours + 'h ' + minutes + 'm' : hours + ' hours';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not specified';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : String(value);
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
