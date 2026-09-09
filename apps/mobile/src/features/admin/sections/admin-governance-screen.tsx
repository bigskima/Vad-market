import { useState } from 'react';
import { View } from 'react-native';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { AdminSectionTabs } from '@/features/admin/components/admin-section-tabs';
import {
  OperationsRow,
  OperationsSection,
} from '@/features/admin/operations/operations-section';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

export function AdminGovernanceScreen() {
  const theme = useVadTheme();
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

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">GOVERNANCE</VadText>
        <VadText variant="title">Markets & resolution.</VadText>
        <VadText tone="secondary">
          Review market proposals and oracle cases in separate queues without
          mixing governance with provider or finance operations.
        </VadText>
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
          description="Questions waiting for governance review."
          count={data.marketQueue.length}
        >
          {data.marketQueue.length ? (
            data.marketQueue.map((row, index) => (
              <OperationsRow
                key={'market-' + index}
                title={String(row.question ?? row.title ?? 'Market proposal')}
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
