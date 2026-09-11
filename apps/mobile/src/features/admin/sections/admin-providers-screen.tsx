import { useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { AdminSectionTabs } from '@/features/admin/components/admin-section-tabs';
import { AdminMetricCard } from '@/features/admin/dashboard/admin-metric-card';
import {
  OperationsRow,
  OperationsSection,
} from '@/features/admin/operations/operations-section';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { hasAdminPermission } from '@/services/admin-control-api';
import {
  decideProviderStatusRequest,
  requestProviderStatus,
  runOracleProviderHealth,
  setProviderSafetyStatus,
  type OracleHealthResult,
  type ProviderChangeRequest,
  type ProviderReadinessRow,
} from '@/services/provider-admin-api';

type ProviderStatus = 'ACTIVE' | 'DISABLED' | 'DEGRADED' | 'UNAVAILABLE';
type Decision = 'APPROVE' | 'REJECT';

const statusOptions: { value: ProviderStatus; title: string; detail: string }[] = [
  { value: 'ACTIVE', title: 'Active', detail: 'Return the provider to normal routing after independent approval.' },
  { value: 'DEGRADED', title: 'Degraded', detail: 'Keep the provider available while signaling reduced operational confidence.' },
  { value: 'DISABLED', title: 'Disabled', detail: 'Stop normal routing to this provider.' },
  { value: 'UNAVAILABLE', title: 'Unavailable', detail: 'Mark the provider as currently unavailable for selection.' },
];

export function AdminProvidersScreen() {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const data = useAdminData();
  const canManage = hasAdminPermission(data.access, 'providers.manage');
  const canCheckOracle = canManage || hasAdminPermission(data.access, 'oracle.review');
  const [tab, setTab] = useState('readiness');
  const [selectedProvider, setSelectedProvider] = useState<ProviderReadinessRow | null>(null);
  const [targetStatus, setTargetStatus] = useState<ProviderStatus | null>(null);
  const [selectedChange, setSelectedChange] = useState<ProviderChangeRequest | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthResults, setHealthResults] = useState<OracleHealthResult[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  if (data.loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="50%" height={32} />
        <VadSkeleton height={112} />
        <VadSkeleton height={52} />
        <VadSkeleton height={76} />
      </View>
    );
  }

  if (data.error) {
    return (
      <VadErrorState
        title="Provider controls unavailable"
        message={data.error}
        onRetry={() => void data.load()}
      />
    );
  }

  const configured = data.providers.filter((row) => row.configured).length;
  const ready = data.providers.filter(isReady).length;
  const degraded = data.providers.filter(
    (row) => row.configured && !isReady(row),
  ).length;
  const readinessRatio =
    data.providers.length > 0 ? ready / data.providers.length : 0;
  const healthyOracle = healthResults.filter((result) => result.health === 'HEALTHY').length;

  function openProvider(row: ProviderReadinessRow) {
    if (!canManage) return;
    setSelectedProvider(row);
    setTargetStatus(null);
    setReason('');
    setActionError(null);
    setActionMessage(null);
  }

  function openChange(row: ProviderChangeRequest) {
    if (!canManage) return;
    setSelectedChange(row);
    setDecision(null);
    setReason('');
    setActionError(null);
    setActionMessage(null);
  }

  async function checkOracleProviders() {
    if (!canCheckOracle) return;
    setHealthChecking(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const response = await runOracleProviderHealth();
      const results = response.providers ?? [];
      setHealthResults(results);
      const healthy = results.filter((result) => result.health === 'HEALTHY').length;
      setActionMessage(`Oracle provider check completed: ${healthy}/${results.length} healthy.`);
      await data.refresh();
    } catch (value) {
      setActionError(value instanceof Error ? value.message : 'Oracle provider health could not be checked.');
    } finally {
      setHealthChecking(false);
    }
  }

  async function submitStatusRequest() {
    if (!selectedProvider || !targetStatus || reason.trim().length < 3) return;

    setWorking(true);
    setActionError(null);
    try {
      const requestId = await requestProviderStatus({
        providerCode: selectedProvider.provider_code,
        environment: selectedProvider.environment,
        requestedStatus: targetStatus,
        reason: reason.trim(),
      });
      setSelectedProvider(null);
      setTargetStatus(null);
      setReason('');
      setActionMessage(`Provider status request ${requestId} is waiting for an independent approver.`);
      setTab('changes');
      await data.refresh();
    } catch (reasonValue) {
      setActionError(
        reasonValue instanceof Error
          ? reasonValue.message
          : 'Provider status request could not be created.',
      );
    } finally {
      setWorking(false);
    }
  }

  async function emergencyDowngrade(status: 'DISABLED' | 'UNAVAILABLE') {
    if (!selectedProvider) return;

    setWorking(true);
    setActionError(null);
    try {
      await setProviderSafetyStatus(
        selectedProvider.provider_code,
        selectedProvider.environment,
        status,
      );
      setSelectedProvider(null);
      setTargetStatus(null);
      setReason('');
      setActionMessage(`${selectedProvider.provider_code} was immediately marked ${status.toLowerCase()} as a safety action.`);
      await data.refresh();
    } catch (reasonValue) {
      setActionError(
        reasonValue instanceof Error
          ? reasonValue.message
          : 'Emergency provider downgrade could not be completed.',
      );
    } finally {
      setWorking(false);
    }
  }

  async function submitDecision() {
    if (!selectedChange || !decision || reason.trim().length < 3) return;

    setWorking(true);
    setActionError(null);
    try {
      await decideProviderStatusRequest(
        selectedChange.request_public_id,
        decision,
        reason.trim(),
      );
      setSelectedChange(null);
      setDecision(null);
      setReason('');
      setActionMessage(
        decision === 'APPROVE'
          ? `${selectedChange.provider_code} status change approved.`
          : `${selectedChange.provider_code} status change rejected.`,
      );
      await data.refresh();
    } catch (reasonValue) {
      setActionError(
        reasonValue instanceof Error
          ? reasonValue.message
          : 'Provider decision could not be completed.',
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <View style={{ gap: theme.spacing.xxxl }}>
      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.xl,
          alignItems: 'stretch',
        }}
      >
        <View
          style={{
            flex: 1.1,
            justifyContent: 'center',
            gap: theme.spacing.xs,
          }}
        >
          <VadText variant="label" tone="brand">PROVIDER CONTROL</VadText>
          <VadText variant="title">External routes at a glance.</VadText>
          <VadText tone="secondary">
            Provider admins can request status changes, independently approve another operator&apos;s request, or immediately downgrade a provider for safety. Reactivation and other risk-increasing changes require independent approval.
          </VadText>
          {canCheckOracle ? (
            <VadButton
              label="Check oracle providers"
              variant="secondary"
              size="small"
              fullWidth={false}
              loading={healthChecking}
              onPress={() => void checkOracleProviders()}
              style={{ alignSelf: 'flex-start', marginTop: theme.spacing.sm }}
            />
          ) : null}
        </View>

        <View
          style={{
            flex: wide ? 0.9 : undefined,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor:
              readinessRatio === 1 && data.providers.length
                ? theme.colors.yes
                : theme.colors.border,
            paddingVertical: theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: theme.spacing.md,
              alignItems: 'flex-end',
            }}
          >
            <View style={{ gap: 2 }}>
              <VadText variant="caption" tone="secondary">READY ROUTES</VadText>
              <VadText variant="display">
                {ready}/{data.providers.length}
              </VadText>
            </View>
            <VadText
              variant="heading"
              tone={readinessRatio === 1 && data.providers.length ? 'yes' : 'brand'}
            >
              {Math.round(readinessRatio * 100)}%
            </VadText>
          </View>

          <View
            accessibilityRole="progressbar"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: Math.round(readinessRatio * 100),
            }}
            style={{
              height: 8,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.surfaceMuted,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${Math.round(readinessRatio * 100)}%` as `${number}%`,
                height: '100%',
                backgroundColor:
                  readinessRatio === 1 && data.providers.length
                    ? theme.colors.yes
                    : theme.colors.brandPrimary,
              }}
            />
          </View>

          <VadText variant="caption" tone="tertiary">
            Based on the provider status information available to your role.
          </VadText>
        </View>
      </View>

      {actionMessage ? (
        <View
          style={{
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.yes,
            backgroundColor: theme.colors.yesSoft,
            padding: theme.spacing.md,
            gap: theme.spacing.xs,
          }}
        >
          <VadText variant="caption" tone="yes">PROVIDER ACTION RECORDED</VadText>
          <VadText variant="caption" tone="secondary">{actionMessage}</VadText>
          <VadButton
            label="Dismiss"
            variant="ghost"
            size="small"
            fullWidth={false}
            onPress={() => setActionMessage(null)}
          />
        </View>
      ) : null}

      {actionError && !selectedProvider && !selectedChange ? (
        <VadErrorState title="Provider check failed" message={actionError} />
      ) : null}

      {healthResults.length ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadText variant="heading">Latest oracle check</VadText>
          <VadText variant="caption" tone="secondary">
            {healthyOracle}/{healthResults.length} providers responded successfully. A successful check confirms credentials and connectivity; activation still follows independent approval.
          </VadText>
          <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
            {healthResults.map((result) => (
              <View
                key={result.provider}
                style={{
                  minHeight: 58,
                  paddingVertical: theme.spacing.sm,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: theme.spacing.md,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <VadText variant="bodyStrong">{result.provider}</VadText>
                  <VadText variant="caption" tone="secondary">
                    {result.configured ? 'Credentials available' : 'Credentials unavailable'}
                    {typeof result.latencyMs === 'number' ? ` · ${result.latencyMs} ms` : ''}
                  </VadText>
                </View>
                <VadText
                  variant="caption"
                  tone={result.health === 'HEALTHY' ? 'yes' : result.health === 'DEGRADED' ? 'warning' : 'danger'}
                >
                  {result.health}
                </VadText>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
        }}
      >
        <AdminMetricCard label="Configured" value={configured} tone="brand" />
        <AdminMetricCard label="Ready" value={ready} tone={ready ? 'yes' : 'primary'} />
        <AdminMetricCard
          label="Needs attention"
          value={degraded}
          tone={degraded ? 'warning' : 'yes'}
        />
        <AdminMetricCard
          label="Pending approvals"
          value={data.providerChanges.length}
          tone={data.providerChanges.length ? 'warning' : 'yes'}
        />
      </View>

      <AdminSectionTabs
        active={tab}
        onChange={setTab}
        items={[
          {
            key: 'readiness',
            label: 'Provider routes',
            count: data.providers.length,
          },
          {
            key: 'changes',
            label: 'Approvals',
            count: data.providerChanges.length,
          },
        ]}
      />

      {tab === 'readiness' ? (
        <OperationsSection
          title="Provider routes"
          description={
            canManage
              ? 'Select a row to request a provider-level status change or use an emergency safety downgrade.'
              : 'Provider status and route status are shown independently in each row.'
          }
          count={data.providers.length}
        >
          {data.providers.length ? (
            data.providers.map((row, index) => {
              const readyRow = isReady(row);
              const status = !row.configured
                ? 'UNCONFIGURED'
                : readyRow
                  ? 'READY'
                  : row.route_status ?? row.provider_status;

              return (
                <OperationsRow
                  key={`${row.provider_code}-${String(row.operation)}-${index}`}
                  title={`${row.provider_code} · ${row.environment}`}
                  detail={
                    `${String(row.operation ?? 'No route')} · ` +
                    `${String(row.country_code ?? '—')} · ` +
                    `${String(row.asset_code ?? 'all assets')}`
                  }
                  meta={
                    `Provider ${String(row.provider_status)} · ` +
                    `Route ${String(row.route_status ?? 'not reported')} · ` +
                    `Priority ${row.priority ?? '—'}`
                  }
                  status={status}
                  ready={readyRow}
                  actionLabel={canManage ? 'Manage' : undefined}
                  onPress={canManage ? () => openProvider(row) : undefined}
                />
              );
            })
          ) : (
            <EmptyText>No provider readiness rows are available.</EmptyText>
          )}
        </OperationsSection>
      ) : (
        <OperationsSection
          title="Pending approvals"
          description="Provider status changes waiting for an independent approver."
          count={data.providerChanges.length}
        >
          {data.providerChanges.length ? (
            data.providerChanges.map((row) => (
              <OperationsRow
                key={row.request_public_id}
                title={`${row.provider_code}: ${row.current_status} → ${row.requested_status}`}
                detail={row.reason}
                meta={`${row.environment} · requested ${new Date(row.created_at).toLocaleString()}`}
                status="PENDING"
                actionLabel={canManage ? 'Decide' : undefined}
                onPress={canManage ? () => openChange(row) : undefined}
              />
            ))
          ) : (
            <EmptyText>No provider changes are awaiting approval.</EmptyText>
          )}
        </OperationsSection>
      )}

      <View
        style={{
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
          paddingVertical: theme.spacing.md,
          gap: 2,
        }}
      >
        <VadText variant="bodyStrong">Independent approval</VadText>
        <VadText variant="caption" tone="secondary">
          Active or degraded transitions require a request approved by another operator. Immediate actions are restricted to safety downgrades only.
        </VadText>
      </View>

      <VadBottomSheet
        visible={Boolean(selectedProvider)}
        title="Provider status control"
        onClose={() => {
          if (!working) setSelectedProvider(null);
        }}
      >
        {selectedProvider ? (
          <View style={{ gap: theme.spacing.lg }}>
            <View style={{ gap: 2 }}>
              <VadText variant="label" tone="brand">PROVIDER</VadText>
              <VadText variant="heading">
                {selectedProvider.provider_code} · {selectedProvider.environment}
              </VadText>
              <VadText variant="caption" tone="secondary">
                Current provider status: {selectedProvider.provider_status}
              </VadText>
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
              {statusOptions.map((option) => {
                const selected = targetStatus === option.value;
                const current = selectedProvider.provider_status.toUpperCase() === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: current }}
                    disabled={working || current}
                    onPress={() => setTargetStatus(option.value)}
                    style={({ pressed }) => ({
                      minHeight: 68,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.border,
                      paddingVertical: theme.spacing.sm,
                      flexDirection: 'row',
                      gap: theme.spacing.md,
                      alignItems: 'center',
                      opacity: current ? 0.4 : pressed ? 0.65 : 1,
                    })}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <VadText variant="bodyStrong" tone={selected ? 'brand' : 'primary'}>
                        {option.title}
                      </VadText>
                      <VadText variant="caption" tone="secondary">{option.detail}</VadText>
                    </View>
                    {selected ? <VadText tone="brand">✓</VadText> : null}
                  </Pressable>
                );
              })}
            </View>

            <VadInput
              label="Reason"
              value={reason}
              onChangeText={(value) => {
                setReason(value);
                setActionError(null);
              }}
              placeholder="Why should this provider status change?"
              multiline
              error={reason.length > 0 && reason.trim().length < 3 ? 'Enter at least 3 characters.' : undefined}
            />

            {actionError ? <VadErrorState title="Provider action failed" message={actionError} /> : null}

            <VadButton
              label="Request status change"
              loading={working}
              disabled={!targetStatus || reason.trim().length < 3}
              onPress={() => void submitStatusRequest()}
            />

            {targetStatus === 'DISABLED' || targetStatus === 'UNAVAILABLE' ? (
              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                  paddingTop: theme.spacing.md,
                  gap: theme.spacing.sm,
                }}
              >
                <VadText variant="bodyStrong">Emergency safety action</VadText>
                <VadText variant="caption" tone="secondary">
                  Safety downgrades can be applied immediately. Reactivation still requires independent approval.
                </VadText>
                <VadButton
                  label={`Apply ${targetStatus.toLowerCase()} now`}
                  variant="danger"
                  loading={working}
                  onPress={() => void emergencyDowngrade(targetStatus)}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </VadBottomSheet>

      <VadBottomSheet
        visible={Boolean(selectedChange)}
        title="Provider approval"
        onClose={() => {
          if (!working) setSelectedChange(null);
        }}
      >
        {selectedChange ? (
          <View style={{ gap: theme.spacing.lg }}>
            <View style={{ gap: 2 }}>
              <VadText variant="label" tone="brand">STATUS REQUEST</VadText>
              <VadText variant="heading">
                {selectedChange.provider_code}: {selectedChange.current_status} → {selectedChange.requested_status}
              </VadText>
              <VadText variant="caption" tone="secondary">
                {selectedChange.reason}
              </VadText>
            </View>

            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <VadButton
                label="Approve"
                variant={decision === 'APPROVE' ? 'primary' : 'secondary'}
                onPress={() => setDecision('APPROVE')}
                style={{ flex: 1 }}
              />
              <VadButton
                label="Reject"
                variant={decision === 'REJECT' ? 'danger' : 'secondary'}
                onPress={() => setDecision('REJECT')}
                style={{ flex: 1 }}
              />
            </View>

            <VadInput
              label="Decision reason"
              value={reason}
              onChangeText={(value) => {
                setReason(value);
                setActionError(null);
              }}
              placeholder="Why are you approving or rejecting this change?"
              multiline
              error={reason.length > 0 && reason.trim().length < 3 ? 'Enter at least 3 characters.' : undefined}
            />

            <View
              style={{
                borderLeftWidth: 3,
                borderLeftColor: theme.colors.brandPrimary,
                backgroundColor: theme.colors.brandSoft,
                padding: theme.spacing.md,
                gap: 2,
              }}
            >
              <VadText variant="caption" tone="brand">INDEPENDENT APPROVAL</VadText>
              <VadText variant="caption" tone="secondary">
                The operator who requested this change cannot approve the same request.
              </VadText>
            </View>

            {actionError ? <VadErrorState title="Decision failed" message={actionError} /> : null}

            <VadButton
              label={decision ? `${decision === 'APPROVE' ? 'Approve' : 'Reject'} provider change` : 'Choose a decision'}
              variant={decision === 'REJECT' ? 'danger' : 'primary'}
              loading={working}
              disabled={!decision || reason.trim().length < 3}
              onPress={() => void submitDecision()}
            />
          </View>
        ) : null}
      </VadBottomSheet>
    </View>
  );
}

function isReady(row: ProviderReadinessRow) {
  if (!row.configured) return false;

  const providerReady = ['ACTIVE', 'READY', 'HEALTHY', 'ENABLED'].includes(
    String(row.provider_status).toUpperCase(),
  );
  const routeReady =
    row.route_status == null ||
    ['ACTIVE', 'READY', 'HEALTHY', 'ENABLED'].includes(
      String(row.route_status).toUpperCase(),
    );

  return providerReady && routeReady;
}

function EmptyText({ children }: { children: string }) {
  return (
    <View style={{ paddingVertical: 18 }}>
      <VadText tone="secondary">{children}</VadText>
    </View>
  );
}
