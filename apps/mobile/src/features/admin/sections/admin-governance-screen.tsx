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

export function AdminGovernanceScreen() {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const data = useAdminData();
  const [tab, setTab] = useState('markets');

  if (data.loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="55%" height={32} />
        <VadSkeleton height={44} />
        <VadSkeleton height={72} />
        <VadSkeleton height={72} />
      </View>
    );
  }

  if (data.error) {
    return (
      <VadErrorState
        title="Governance unavailable"
        message={data.error}
        onRetry={() => void data.load()}
      />
    );
  }

  const total = data.marketQueue.length + data.oracleQueue.length;

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.xl,
          alignItems: wide ? 'flex-end' : 'stretch',
        }}
      >
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="label" tone="brand">GOVERNANCE</VadText>
          <VadText variant="title">Markets & resolution.</VadText>
          <VadText tone="secondary">
            Keep proposal review separate from oracle resolution so each queue
            has one clear operational purpose.
          </VadText>
        </View>

        <View
          style={{
            minWidth: wide ? 300 : undefined,
            flexDirection: 'row',
            gap: theme.spacing.sm,
          }}
        >
          <AdminMetricCard
            label="Market review"
            value={data.marketQueue.length}
            tone={data.marketQueue.length ? 'warning' : 'yes'}
          />
          <AdminMetricCard
            label="Oracle"
            value={data.oracleQueue.length}
            tone={data.oracleQueue.length ? 'warning' : 'yes'}
          />
        </View>
      </View>

      <AdminSectionTabs
        active={tab}
        onChange={setTab}
        items={[
          {
            key: 'markets',
            label: 'Market review',
            count: data.marketQueue.length,
          },
          {
            key: 'oracle',
            label: 'Oracle',
            count: data.oracleQueue.length,
          },
        ]}
      />

      {tab === 'markets' ? (
        <OperationsSection
          title="Market review"
          description={
            total
              ? 'Questions waiting for governance review.'
              : 'No governance work is waiting.'
          }
          count={data.marketQueue.length}
        >
          {data.marketQueue.length ? (
            data.marketQueue.map((row, index) => (
              <OperationsRow
                key={'market-' + index}
                title={String(
                  row.question ?? row.title ?? 'Market proposal',
                )}
                detail={
                  String(row.category ?? 'General') +
                  ' · ' +
                  String(row.status ?? 'Awaiting review')
                }
                status={String(row.status ?? 'PENDING')}
              />
            ))
          ) : (
            <EmptyText>No market proposals need review.</EmptyText>
          )}
        </OperationsSection>
      ) : (
        <OperationsSection
          title="Oracle queue"
          description="Resolution cases waiting for evidence or finalization."
          count={data.oracleQueue.length}
        >
          {data.oracleQueue.length ? (
            data.oracleQueue.map((row, index) => (
              <OperationsRow
                key={'oracle-' + index}
                title={String(
                  row.event_title ??
                    row.market_title ??
                    row.title ??
                    'Oracle case',
                )}
                detail={String(
                  row.resolution_status ??
                    row.status ??
                    'Awaiting resolution',
                )}
                status={String(
                  row.status ?? row.resolution_status ?? 'OPEN',
                )}
              />
            ))
          ) : (
            <EmptyText>No oracle cases need attention.</EmptyText>
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
