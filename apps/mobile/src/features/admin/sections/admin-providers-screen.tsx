import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { VadErrorState } from '@/components/ui/vad-error-state';
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

export function AdminProvidersScreen() {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const data = useAdminData();
  const [tab, setTab] = useState('readiness');

  if (data.loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="50%" height={32} />
        <VadSkeleton height={92} />
        <VadSkeleton height={72} />
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
  const ready = data.providers.filter(
    (row) =>
      row.configured &&
      ['ACTIVE', 'READY', 'HEALTHY', 'ENABLED'].includes(
        String(row.provider_status).toUpperCase(),
      ),
  ).length;

  const readinessRatio =
    data.providers.length > 0 ? ready / data.providers.length : 0;

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.xl,
          alignItems: 'stretch',
        }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            gap: theme.spacing.xs,
          }}
        >
          <VadText variant="label" tone="brand">PROVIDERS</VadText>
          <VadText variant="title">Runtime readiness.</VadText>
          <VadText tone="secondary">
            A configured provider is not automatically active. Readiness,
            runtime state and governed status changes remain separate signals.
          </VadText>
        </View>

        <View
          style={{
            flex: wide ? 0.9 : undefined,
            borderRadius: theme.radius.xl,
            backgroundColor: theme.colors.surfaceRaised,
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: theme.spacing.md,
            }}
          >
            <View style={{ gap: 2 }}>
              <VadText variant="caption" tone="secondary">
                READY ROUTES
              </VadText>
              <VadText variant="title">
                {ready} / {data.providers.length}
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
            style={{
              height: 8,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.surfaceMuted,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: Math.round(readinessRatio * 100) + '%',
                height: '100%',
                backgroundColor:
                  readinessRatio === 1 && data.providers.length
                    ? theme.colors.yes
                    : theme.colors.brandPrimary,
              }}
            />
          </View>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
        }}
      >
        <AdminMetricCard
          label="Configured"
          value={configured}
          tone="brand"
        />
        <AdminMetricCard
          label="Ready"
          value={ready}
          tone={ready ? 'yes' : 'primary'}
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
            label: 'Readiness',
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
          description="Runtime readiness by provider, environment and operation."
          count={data.providers.length}
        >
          {data.providers.length ? (
            data.providers.map((row, index) => (
              <OperationsRow
                key={
                  row.provider_code +
                  '-' +
                  String(row.operation) +
                  '-' +
                  index
                }
                title={row.provider_code + ' · ' + row.environment}
                detail={
                  String(row.operation ?? 'No route') +
                  ' · ' +
                  String(row.country_code ?? '—') +
                  ' · ' +
                  String(row.asset_code ?? 'all assets')
                }
                status={
                  row.configured
                    ? String(row.provider_status)
                    : 'UNCONFIGURED'
                }
                ready={
                  row.configured &&
                  ['ACTIVE', 'READY', 'HEALTHY', 'ENABLED'].includes(
                    String(row.provider_status).toUpperCase(),
                  )
                }
              />
            ))
          ) : (
            <EmptyText>No provider readiness rows are available.</EmptyText>
          )}
        </OperationsSection>
      ) : (
        <OperationsSection
          title="Pending approvals"
          description="Governed provider status changes awaiting a checker."
          count={data.providerChanges.length}
        >
          {data.providerChanges.length ? (
            data.providerChanges.map((row) => (
              <OperationsRow
                key={row.request_public_id}
                title={
                  row.provider_code +
                  ': ' +
                  row.current_status +
                  ' → ' +
                  row.requested_status
                }
                detail={row.reason}
                status="PENDING"
              />
            ))
          ) : (
            <EmptyText>No provider changes are awaiting approval.</EmptyText>
          )}
        </OperationsSection>
      )}
    </View>
  );
}

function EmptyText({ children }: { children: string }) {
  return (
    <View style={{ paddingVertical: 18 }}>
      <VadText tone="secondary">{children}</VadText>
    </View>
  );
}
