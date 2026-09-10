import { useWindowDimensions, View } from 'react-native';

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
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const data = useAdminData();

  if (data.loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="52%" height={32} />
        <VadSkeleton height={112} />
        <VadSkeleton height={76} />
        <VadSkeleton height={76} />
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

  const awaitingUser = Number(data.operations?.kycAwaitingUser ?? 0);
  const inReview = Number(
    data.operations?.kycInReview ?? data.kycQueue.length,
  );
  const verified = Number(data.operations?.kycVerified ?? 0);
  const accounted = awaitingUser + inReview + verified;
  const completionRatio = accounted > 0 ? verified / accounted : 0;

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
          <VadText variant="label" tone="brand">COMPLIANCE</VadText>
          <VadText variant="title">Identity verification operations.</VadText>
          <VadText tone="secondary">
            Work from verification status and provider references without
            placing raw identity-document payloads in the operations interface.
          </VadText>
        </View>

        <View
          style={{
            flex: wide ? 0.9 : undefined,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: inReview > 0 ? theme.colors.warning : theme.colors.yes,
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
              <VadText
                variant="caption"
                tone={inReview > 0 ? 'warning' : 'yes'}
              >
                REVIEW LOAD
              </VadText>
              <VadText variant="display">{inReview}</VadText>
              <VadText variant="caption" tone="secondary">cases in review</VadText>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <VadText variant="heading" tone="yes">
                {Math.round(completionRatio * 100)}%
              </VadText>
              <VadText variant="caption" tone="tertiary">
                verified in summary
              </VadText>
            </View>
          </View>

          <View
            accessibilityRole="progressbar"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: Math.round(completionRatio * 100),
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
                width: `${Math.round(completionRatio * 100)}%` as `${number}%`,
                height: '100%',
                backgroundColor: theme.colors.yes,
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
          label="Awaiting user"
          value={awaitingUser}
          tone={awaitingUser ? 'brand' : 'primary'}
        />
        <AdminMetricCard
          label="In review"
          value={inReview}
          tone={inReview ? 'warning' : 'yes'}
        />
        <AdminMetricCard label="Verified" value={verified} tone="yes" />
        <AdminMetricCard label="Visible queue" value={data.kycQueue.length} />
      </View>

      <OperationsSection
        title="Verification queue"
        description="Current provider-hosted verification cases visible to this operator role."
        count={data.kycQueue.length}
      >
        {data.kycQueue.length ? (
          data.kycQueue.map((row) => (
            <OperationsRow
              key={row.case_public_id}
              title={`${row.verification_level} · ${String(row.provider_code ?? 'No provider')}`}
              detail={`${row.user_id.slice(0, 8)}… · ${String(row.country_code ?? '—')}`}
              meta={
                `Created ${new Date(row.created_at).toLocaleString()} · ` +
                `updated ${new Date(row.updated_at).toLocaleString()}`
              }
              status={row.status}
              ready={row.status === 'VERIFIED'}
            />
          ))
        ) : (
          <View style={{ paddingVertical: theme.spacing.lg }}>
            <VadText variant="bodyStrong">No verification review is waiting.</VadText>
            <VadText variant="caption" tone="secondary">
              New provider-hosted cases will appear here when they are visible
              to this role.
            </VadText>
          </View>
        )}
      </OperationsSection>

      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.xl,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
          paddingVertical: theme.spacing.md,
        }}
      >
        <Boundary
          title="Operator view"
          body="Provider references, verification level, jurisdiction and status."
        />
        <Boundary
          title="Outside this view"
          body="Raw identity-document payloads and provider capture screens."
        />
      </View>
    </View>
  );
}

function Boundary({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ flex: 1, minWidth: 220, gap: 2 }}>
      <VadText variant="bodyStrong">{title}</VadText>
      <VadText variant="caption" tone="secondary">{body}</VadText>
    </View>
  );
}
