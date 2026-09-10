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
import type { ProviderReadinessRow } from '@/services/provider-admin-api';

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
            Configuration, provider health and route state are separate. A row
            is shown as ready only when the configured provider and its route
            both report an operational state.
          </VadText>
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
            Based on the provider readiness rows returned to this operator role.
          </VadText>
        </View>
      </View>

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
          description="Provider status and route status are shown independently in each row."
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
          description="Governed provider status changes awaiting a separate checker."
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
        <VadText variant="bodyStrong">Maker-checker boundary</VadText>
        <VadText variant="caption" tone="secondary">
          This overview reports current readiness and pending changes. Governed
          status transitions remain controlled by the existing backend approval
          functions and permission checks.
        </VadText>
      </View>
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
