import { View } from 'react-native';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { AdminMetricCard } from '@/features/admin/dashboard/admin-metric-card';
import {
  OperationsRow,
  OperationsSection,
} from '@/features/admin/operations/operations-section';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

export function AdminComplianceScreen() {
  const theme = useVadTheme();
  const data = useAdminData();

  if (data.loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="52%" height={32} />
        <VadSkeleton height={90} />
        <VadSkeleton height={72} />
      </View>
    );
  }

  if (data.error) {
    return (
      <VadErrorState
        title="Compliance unavailable"
        message={data.error}
        onRetry={() => void data.load()}
      />
    );
  }

  const inReview = Number(
    data.operations?.kycInReview ?? data.kycQueue.length,
  );
  const verified = Number(data.operations?.kycVerified ?? 0);

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">COMPLIANCE</VadText>
        <VadText variant="title">Identity verification.</VadText>
        <VadText tone="secondary">
          Track provider-hosted verification states without exposing raw
          identity documents in the operations UI.
        </VadText>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        <AdminMetricCard
          label="In review"
          value={inReview}
          tone={inReview ? 'warning' : 'yes'}
        />
        <AdminMetricCard label="Verified" value={verified} tone="yes" />
        <AdminMetricCard
          label="Visible queue"
          value={data.kycQueue.length}
        />
      </View>

      <OperationsSection
        title="KYC queue"
        description="Current verification cases visible to this role."
        count={data.kycQueue.length}
      >
        {data.kycQueue.length ? (
          data.kycQueue.map((row) => (
            <OperationsRow
              key={row.case_public_id}
              title={
                row.verification_level +
                ' · ' +
                String(row.provider_code ?? 'No provider')
              }
              detail={
                row.user_id.slice(0, 8) +
                '… · ' +
                String(row.country_code ?? '—')
              }
              status={row.status}
              ready={row.status === 'VERIFIED'}
            />
          ))
        ) : (
          <View style={{ paddingVertical: 18 }}>
            <VadText tone="secondary">No KYC cases in this queue.</VadText>
          </View>
        )}
      </OperationsSection>
    </View>
  );
}
