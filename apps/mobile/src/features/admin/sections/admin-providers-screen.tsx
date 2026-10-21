import { useCallback, useEffect, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
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
import { getAdminMarketDataSources, setAdminMarketDataSourceStatus, updateAdminMarketDataSourceSettings } from '@/services/crypto-market-data-api';
import { getSportsMarketTaxonomy, setAdminSportsCompetitionStatus, upsertAdminSportsCompetition, type SportsMarketTaxonomy, type SportsMarketCompetition } from '@/services/admin-guided-market-catalog-api';
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
  const canManageMarkets = hasAdminPermission(data.access, 'markets.manage');
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

      {canManage ? <AdminMarketDataSourcePanel canManage={canManage} /> : null}
      {canManageMarkets ? <AdminSportsCompetitionPanel /> : null}

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

function AdminMarketDataSourcePanel({ canManage }: { canManage: boolean }) {
  const theme = useVadTheme();
  const [source, setSource] = useState<import('@/services/crypto-market-data-api').AdminMarketDataSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [reason, setReason] = useState('');
  const [quoteCurrencyDraft, setQuoteCurrencyDraft] = useState('USD');
  const [pageSizeDraft, setPageSizeDraft] = useState('24');
  const [cacheSecondsDraft, setCacheSecondsDraft] = useState('60');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const sources = await getAdminMarketDataSources();
      const nextSource = sources.find((item) => item.code === 'COINGECKO') ?? sources[0] ?? null;
      setSource(nextSource);
      if (nextSource) {
        setQuoteCurrencyDraft(nextSource.quote_currency);
        setPageSizeDraft(String(nextSource.default_page_size));
        setCacheSecondsDraft(String(nextSource.cache_seconds));
      }
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Market-data source configuration is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void getAdminMarketDataSources()
      .then((sources) => {
        if (!active) return;
        const nextSource = sources.find((item) => item.code === 'COINGECKO') ?? sources[0] ?? null;
        setSource(nextSource);
        if (nextSource) {
          setQuoteCurrencyDraft(nextSource.quote_currency);
          setPageSizeDraft(String(nextSource.default_page_size));
          setCacheSecondsDraft(String(nextSource.cache_seconds));
        }
      })
      .catch((value: unknown) => { if (active) setError(value instanceof Error ? value.message : 'Market-data source configuration is unavailable.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function updateSettings() {
    const pageSize = Number(pageSizeDraft);
    const cacheSeconds = Number(cacheSecondsDraft);
    if (!source || !canManage || reason.trim().length < 3) return;
    if (!/^[A-Za-z]{3,8}$/.test(quoteCurrencyDraft.trim())) {
      setError('Enter a valid quote currency code (3–8 letters).');
      return;
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      setError('Default page size must be between 1 and 100.');
      return;
    }
    if (!Number.isInteger(cacheSeconds) || cacheSeconds < 15 || cacheSeconds > 3600) {
      setError('Cache duration must be between 15 and 3600 seconds.');
      return;
    }
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      await updateAdminMarketDataSourceSettings({
        code: source.code,
        quoteCurrency: quoteCurrencyDraft,
        defaultPageSize: pageSize,
        cacheSeconds,
        reason: reason.trim(),
      });
      setReason('');
      setMessage('Crypto display feed settings saved.');
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Market-data source settings could not be updated.');
    } finally {
      setWorking(false);
    }
  }

  async function changeStatus() {
    if (!source || !canManage || reason.trim().length < 3) return;
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      const status = source.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
      await setAdminMarketDataSourceStatus({ code: source.code, status, reason: reason.trim() });
      setReason('');
      setMessage(`${source.name} display feed ${status.toLowerCase()}.`);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Market-data source status could not be changed.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 3 }}>
        <VadText variant="label" tone="brand">MARKET DATA · DISPLAY ONLY</VadText>
        <VadText variant="heading">Crypto prices feed</VadText>
        <VadText variant="caption" tone="secondary">
          Controls the public CoinGecko coin catalogue and live display quotes. This is deliberately separate from Oracle providers, outcome consensus and settlement.
        </VadText>
      </View>
      {loading ? (
        <VadSkeleton height={72} radius={theme.radius.md} />
      ) : source ? (
        <>
          <View style={{ gap: 4 }}>
            <VadText variant="bodyStrong">{source.name}</VadText>
            <VadText variant="caption" tone="secondary">{source.base_url}</VadText>
            <VadText variant="caption" tone={source.status === 'ACTIVE' ? 'yes' : 'warning'}>
              {source.status === 'ACTIVE' ? 'Active · public API quotes available' : 'Disabled · crypto live quotes hidden'}
            </VadText>
            <VadText variant="caption" tone="tertiary">
              Quote currency: {source.quote_currency} · page size: {source.default_page_size} · cache: {source.cache_seconds}s
            </VadText>
          </View>
          {canManage ? (
            <>
              <VadInput
                label="Quote currency"
                value={quoteCurrencyDraft}
                onChangeText={setQuoteCurrencyDraft}
                placeholder="USD"
              />
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <VadInput label="Assets per page (1–100)" value={pageSizeDraft} onChangeText={setPageSizeDraft} placeholder="24" />
                </View>
                <View style={{ flex: 1 }}>
                  <VadInput label="Cache seconds (15–3600)" value={cacheSecondsDraft} onChangeText={setCacheSecondsDraft} placeholder="60" />
                </View>
              </View>
              <VadInput
                label="Reason for feed change"
                value={reason}
                onChangeText={setReason}
                placeholder="Why are you changing this display feed or its settings?"
              />
              <VadButton
                label={working ? 'Saving…' : 'Save crypto feed settings'}
                variant="secondary"
                loading={working}
                disabled={working || reason.trim().length < 3}
                onPress={() => void updateSettings()}
              />
              <VadButton
                label={source.status === 'ACTIVE' ? 'Disable crypto display feed' : 'Enable crypto display feed'}
                variant={source.status === 'ACTIVE' ? 'secondary' : 'primary'}
                loading={working}
                disabled={working || reason.trim().length < 3}
                onPress={() => void changeStatus()}
              />
            </>
          ) : (
            <VadText variant="caption" tone="secondary">Read-only: provider management permission is required to change this setting.</VadText>
          )}
        </>
      ) : (
        <VadText variant="caption" tone="secondary">No display-only market data source has been configured.</VadText>
      )}
      {error ? <VadErrorState title="Market-data settings unavailable" message={error} onRetry={() => void load()} /> : null}
      {message ? <VadText variant="caption" tone="yes">{message}</VadText> : null}
    </VadCard>
  );
}


function AdminSportsCompetitionPanel() {
  const theme = useVadTheme();
  const [catalog, setCatalog] = useState<SportsMarketTaxonomy>({ sports: [], competitions: [] });
  const [loading, setLoading] = useState(true);
  const [workingCode, setWorkingCode] = useState<string | null>(null);
  const [selectedSport, setSelectedSport] = useState('FOOTBALL');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draftSportCode, setDraftSportCode] = useState('FOOTBALL');
  const [draftSportName, setDraftSportName] = useState('Football');
  const [draftCompetitionCode, setDraftCompetitionCode] = useState('');
  const [draftCompetitionName, setDraftCompetitionName] = useState('');
  const [draftRegion, setDraftRegion] = useState('International');
  const [draftAliases, setDraftAliases] = useState('');
  const [draftResultMode, setDraftResultMode] = useState<'AUTOMATIC' | 'VERIFIED'>('VERIFIED');
  const [draftProviderCode, setDraftProviderCode] = useState('FOOTBALL_DATA');
  const [draftProviderCompetitionCode, setDraftProviderCompetitionCode] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCatalog(await getSportsMarketTaxonomy());
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Sports competition catalog could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const sports = [...catalog.sports].sort((a, b) => a.name.localeCompare(b.name));
  const entries = catalog.competitions.filter((item) => item.sportCode === selectedSport)
    .sort((a, b) => a.name.localeCompare(b.name));

  async function saveCompetition() {
    if (reason.trim().length < 3) {
      setError('Enter a reason before adding or updating a competition.');
      return;
    }
    if (!draftSportCode.trim() || !draftSportName.trim() || !draftCompetitionCode.trim() || !draftCompetitionName.trim()) {
      setError('Enter the sport and competition codes and names.');
      return;
    }
    if (draftResultMode === 'AUTOMATIC' && (!draftProviderCode.trim() || !draftProviderCompetitionCode.trim())) {
      setError('Automatic mode requires a provider code and exact provider competition mapping.');
      return;
    }
    setWorkingCode('CREATE_COMPETITION');
    setError(null);
    setMessage(null);
    try {
      await upsertAdminSportsCompetition({
        sportCode: draftSportCode,
        sportName: draftSportName,
        competitionCode: draftCompetitionCode,
        competitionName: draftCompetitionName,
        region: draftRegion,
        aliases: draftAliases.split(',').map((value) => value.trim()).filter(Boolean),
        resultMode: draftResultMode,
        providerCode: draftResultMode === 'AUTOMATIC' ? draftProviderCode : undefined,
        providerCompetitionCode: draftResultMode === 'AUTOMATIC' ? draftProviderCompetitionCode : undefined,
        reason: reason.trim(),
      });
      setSelectedSport(draftSportCode.trim().toUpperCase());
      setDraftCompetitionCode('');
      setDraftCompetitionName('');
      setDraftAliases('');
      setDraftProviderCompetitionCode('');
      setReason('');
      setMessage('Sports competition saved to the database.');
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Competition could not be saved.');
    } finally {
      setWorkingCode(null);
    }
  }

  async function toggle(item: SportsMarketCompetition) {
    if (reason.trim().length < 3) {
      setError('Enter a reason before changing a competition.');
      return;
    }
    const key = `${item.sportCode}:${item.code}`;
    setWorkingCode(key);
    setError(null);
    setMessage(null);
    try {
      const status = item.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
      await setAdminSportsCompetitionStatus({
        sportCode: item.sportCode,
        competitionCode: item.code,
        status,
        reason: reason.trim(),
      });
      setReason('');
      setMessage(`${item.name} is now ${status.toLowerCase()}.`);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Competition status could not be changed.');
    } finally {
      setWorkingCode(null);
    }
  }

  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 3 }}>
        <VadText variant="label" tone="brand">SPORTS · DATABASE CONTROL</VadText>
        <VadText variant="heading">Sports and competitions</VadText>
        <VadText variant="caption" tone="secondary">
          Manage which database-backed leagues and sports appear in market creation. Automatic results are advertised only for competitions with an approved provider mapping; other sports use verified result review.
        </VadText>
      </View>
      {loading ? <VadSkeleton height={88} radius={theme.radius.md} /> : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {sports.map((sport) => {
              const active = sport.code === selectedSport;
              const activeCount = catalog.competitions.filter((item) => item.sportCode === sport.code && item.status === 'ACTIVE').length;
              return (
                <VadChip
                  key={sport.code}
                  label={`${sport.name} · ${activeCount}`}
                  selected={active}
                  tone={active ? 'brand' : 'neutral'}
                  onPress={() => setSelectedSport(sport.code)}
                />
              );
            })}
          </View>
          {entries.length ? entries.map((item) => {
            const key = `${item.sportCode}:${item.code}`;
            const busy = workingCode === key;
            return (
              <View key={key} style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                paddingVertical: theme.spacing.xs,
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
              }}>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <VadText variant="bodyStrong">{item.name}</VadText>
                  <VadText variant="caption" tone="secondary">
                    {item.region || 'International'} · {item.resultMode === 'AUTOMATIC' ? `Automatic · ${item.providerCode ?? 'configured provider'}` : 'Verified result'}
                  </VadText>
                  <VadText variant="caption" tone={item.status === 'ACTIVE' ? 'yes' : 'warning'}>
                    {item.status}
                  </VadText>
                </View>
                <VadButton
                  label={busy ? 'Saving…' : item.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                  variant="secondary"
                  size="small"
                  fullWidth={false}
                  loading={busy}
                  disabled={Boolean(workingCode)}
                  onPress={() => void toggle(item)}
                />
              </View>
            );
          }) : (
            <VadText variant="caption" tone="secondary">No competition records are configured for this sport yet.</VadText>
          )}
          <View style={{ gap: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.md }}>
            <VadText variant="bodyStrong">Add a sport or competition</VadText>
            <VadText variant="caption" tone="secondary">
              New records are saved to the database. Use Verified by default; Automatic requires an already approved Oracle competition resource.
            </VadText>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <VadInput label="Sport code" value={draftSportCode} onChangeText={setDraftSportCode} placeholder="FOOTBALL" />
              </View>
              <View style={{ flex: 1 }}>
                <VadInput label="Sport name" value={draftSportName} onChangeText={setDraftSportName} placeholder="Football" />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <VadInput label="Competition code" value={draftCompetitionCode} onChangeText={setDraftCompetitionCode} placeholder="PL" />
              </View>
              <View style={{ flex: 1 }}>
                <VadInput label="Competition name" value={draftCompetitionName} onChangeText={setDraftCompetitionName} placeholder="Premier League" />
              </View>
            </View>
            <VadInput label="Region · optional" value={draftRegion} onChangeText={setDraftRegion} placeholder="England" />
            <VadInput label="Aliases · comma separated, optional" value={draftAliases} onChangeText={setDraftAliases} placeholder="EPL, English Premier League" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              <VadChip label="Verified source" selected={draftResultMode === 'VERIFIED'} tone={draftResultMode === 'VERIFIED' ? 'brand' : 'neutral'} onPress={() => setDraftResultMode('VERIFIED')} />
              <VadChip label="Automatic provider" selected={draftResultMode === 'AUTOMATIC'} tone={draftResultMode === 'AUTOMATIC' ? 'brand' : 'neutral'} onPress={() => setDraftResultMode('AUTOMATIC')} />
            </View>
            {draftResultMode === 'AUTOMATIC' ? (
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <VadInput label="Oracle provider code" value={draftProviderCode} onChangeText={setDraftProviderCode} placeholder="FOOTBALL_DATA" />
                </View>
                <View style={{ flex: 1 }}>
                  <VadInput label="Provider competition code" value={draftProviderCompetitionCode} onChangeText={setDraftProviderCompetitionCode} placeholder="PL" />
                </View>
              </View>
            ) : null}
          </View>
          <VadInput
            label="Reason for catalog change"
            value={reason}
            onChangeText={setReason}
            placeholder="Why are you adding or changing this competition?"
          />
          <VadButton
            label={workingCode === 'CREATE_COMPETITION' ? 'Saving…' : 'Save sport / competition'}
            variant="secondary"
            loading={workingCode === 'CREATE_COMPETITION'}
            disabled={Boolean(workingCode) || reason.trim().length < 3}
            onPress={() => void saveCompetition()}
          />
          <VadText variant="caption" tone="secondary">
            Status changes are permission-checked and written to the audit log. Disabling a league hides it from new-market selection; it does not rewrite previously published outcomes.
          </VadText>
        </>
      )}
      {error ? <VadErrorState title="Sports catalog controls unavailable" message={error} onRetry={() => void load()} /> : null}
      {message ? <VadText variant="caption" tone="yes">{message}</VadText> : null}
    </VadCard>
  );
}
