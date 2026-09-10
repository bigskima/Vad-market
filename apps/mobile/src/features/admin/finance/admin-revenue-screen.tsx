import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useAdminResponsive } from '@/features/admin/components/use-admin-responsive';
import { OperationsSection } from '@/features/admin/operations/operations-section';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import {
  formatAdminAssetAmount,
  type AdminFinanceAsset,
} from '@/services/finance-admin-api';

export function AdminRevenueScreen() {
  const theme = useVadTheme();
  const data = useAdminData();
  const responsive = useAdminResponsive();

  if (data.loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="42%" height={34} />
        <VadSkeleton height={148} />
        <VadSkeleton height={92} />
        <VadSkeleton height={180} />
      </View>
    );
  }

  if (!data.finance) {
    return (
      <VadErrorState
        title="Revenue data unavailable"
        message={
          data.error ??
          data.warning ??
          'The ledger-backed finance summary could not be loaded for this operator.'
        }
        onRetry={() => void data.refresh()}
      />
    );
  }

  return (
    <View style={{ gap: theme.spacing.xxxl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">MONEY · VAD REVENUE</VadText>
        <VadText variant="title">Revenue is not platform balance.</VadText>
        <VadText tone="secondary">
          VAD revenue counts fee income recognized by posted ledger activity.
          Platform balance is shown separately because wallets, collateral,
          pending withdrawals and clearing funds are not VAD earnings.
        </VadText>
      </View>

      <VadCard
        variant="raised"
        style={{
          borderColor: theme.colors.brandPrimary,
          backgroundColor: theme.colors.brandSoft,
          gap: theme.spacing.xs,
        }}
      >
        <VadText variant="caption" tone="brand">ACCOUNTING BOUNDARY</VadText>
        <VadText variant="bodyStrong">
          Quoted or pending fees do not count as revenue.
        </VadText>
        <VadText variant="caption" tone="secondary">
          Only fee activity recognized through the ledger is included in earned
          revenue. Moving earned fees into treasury changes the current fee-account
          balance, but it does not erase the historical revenue already earned.
        </VadText>
      </VadCard>

      {data.finance.assets.length ? (
        data.finance.assets.map((asset) => (
          <AssetRevenueSection
            key={asset.assetCode}
            asset={asset}
            desktop={responsive.desktop}
          />
        ))
      ) : (
        <VadCard variant="outlined" style={{ gap: theme.spacing.sm }}>
          <VadText variant="heading">No finance assets are available.</VadText>
          <VadText tone="secondary">
            Revenue will appear here when an enabled or ledger-backed asset is available.
          </VadText>
        </VadCard>
      )}

      <FeePolicySnapshot policies={data.finance.feePolicies} />

      <VadText variant="caption" tone="tertiary">
        Revenue and platform balances are reported per asset. VAD does not add
        unlike assets together without an explicit currency-conversion policy.
      </VadText>
    </View>
  );
}

function AssetRevenueSection({
  asset,
  desktop,
}: {
  asset: AdminFinanceAsset;
  desktop: boolean;
}) {
  const theme = useVadTheme();
  const format = (value: number | string) =>
    formatAdminAssetAmount(asset.assetCode, value);
  const nonZeroPlatformRows = asset.platformBalance.breakdown.filter(
    (row) => Math.abs(Number(row.signedBalance ?? 0)) > 0,
  );

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.md,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <VadText variant="heading">{asset.assetCode}</VadText>
          <VadText variant="caption" tone="secondary">
            {asset.assetName} · {asset.assetStatus.replaceAll('_', ' ')}
          </VadText>
        </View>
        <VadText variant="caption" tone="tertiary">LEDGER BACKED</VadText>
      </View>

      <View
        style={{
          flexDirection: desktop ? 'row' : 'column',
          alignItems: 'stretch',
          gap: theme.spacing.md,
        }}
      >
        <VadCard
          variant="raised"
          style={{
            flex: 1,
            minHeight: 150,
            justifyContent: 'space-between',
            gap: theme.spacing.lg,
            borderColor: theme.colors.brandPrimary,
          }}
        >
          <View style={{ gap: theme.spacing.xs }}>
            <VadText variant="caption" tone="brand">TOTAL VAD REVENUE</VadText>
            <VadText variant="display">
              {format(asset.vadRevenue.earnedLifetime)}
            </VadText>
            <VadText variant="caption" tone="secondary">
              Lifetime recognized fee income for this asset.
            </VadText>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg }}>
            <MiniMetric label="Last 24h" value={format(asset.vadRevenue.earned24h)} />
            <MiniMetric label="Last 30 days" value={format(asset.vadRevenue.earned30d)} />
            <MiniMetric
              label="Still in fee accounts"
              value={format(asset.vadRevenue.currentRevenueBalance)}
            />
          </View>
        </VadCard>

        <VadCard
          variant="outlined"
          style={{
            flex: 1,
            minHeight: 150,
            justifyContent: 'space-between',
            gap: theme.spacing.lg,
          }}
        >
          <View style={{ gap: theme.spacing.xs }}>
            <VadText variant="caption" tone="secondary">TOTAL PLATFORM BALANCE</VadText>
            <VadText variant="display">
              {format(asset.platformBalance.total)}
            </VadText>
            <VadText variant="caption" tone="secondary">
              Gross positive balance across non-revenue operational accounts.
              This is not VAD income.
            </VadText>
          </View>

          <VadText variant="caption" tone="tertiary">
            Includes applicable wallets, collateral, pending, clearing, treasury
            and other non-revenue ledger buckets.
          </VadText>
        </VadCard>
      </View>

      <OperationsSection
        title="Revenue by source"
        description="Each source is kept separate so VAD can see exactly where its fee income came from."
        count={asset.vadRevenue.sources.length}
      >
        {asset.vadRevenue.sources.map((source) => (
          <RevenueRow
            key={source.code}
            label={source.label}
            lifetime={format(source.earnedLifetime)}
            recent={format(source.earned30d)}
            balance={format(source.currentBalance)}
          />
        ))}
      </OperationsSection>

      <OperationsSection
        title="Platform balance breakdown"
        description="Operational balances are intentionally outside the VAD revenue total."
        count={nonZeroPlatformRows.length}
      >
        {nonZeroPlatformRows.length ? (
          nonZeroPlatformRows.map((row) => (
            <BalanceRow
              key={row.code}
              label={row.label}
              value={format(row.amount)}
              signedValue={format(row.signedBalance)}
            />
          ))
        ) : (
          <View style={{ paddingVertical: theme.spacing.lg }}>
            <VadText variant="bodyStrong">No operational balance is posted yet.</VadText>
            <VadText variant="caption" tone="secondary">
              This remains separate from revenue even when platform funds begin moving.
            </VadText>
          </View>
        )}
      </OperationsSection>
    </View>
  );
}

function RevenueRow({
  label,
  lifetime,
  recent,
  balance,
}: {
  label: string;
  lifetime: string;
  recent: string;
  balance: string;
}) {
  const theme = useVadTheme();
  return (
    <View
      style={{
        minHeight: 76,
        paddingVertical: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <VadText variant="bodyStrong">{label}</VadText>
        <VadText variant="caption" tone="secondary">
          30 days {recent} · fee-account balance {balance}
        </VadText>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <VadText variant="heading">{lifetime}</VadText>
        <VadText variant="caption" tone="tertiary">LIFETIME</VadText>
      </View>
    </View>
  );
}

function BalanceRow({
  label,
  value,
  signedValue,
}: {
  label: string;
  value: string;
  signedValue: string;
}) {
  const theme = useVadTheme();
  return (
    <View
      style={{
        minHeight: 64,
        paddingVertical: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <VadText variant="bodyStrong" style={{ flex: 1 }}>{label}</VadText>
      <View style={{ alignItems: 'flex-end', gap: 1 }}>
        <VadText variant="bodyStrong">{value}</VadText>
        {value !== signedValue ? (
          <VadText variant="caption" tone="tertiary">net {signedValue}</VadText>
        ) : null}
      </View>
    </View>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 112, flexGrow: 1, gap: 2 }}>
      <VadText variant="bodyStrong">{value}</VadText>
      <VadText variant="caption" tone="secondary">{label}</VadText>
    </View>
  );
}

function FeePolicySnapshot({
  policies,
}: {
  policies: {
    trading: Record<string, unknown>;
    settlement: Record<string, unknown>;
    payments: Record<string, unknown>;
  };
}) {
  const theme = useVadTheme();
  const rows = [
    ['Maker trading fee', bps(policies.trading.maker_rate_bps)],
    ['Taker trading fee', bps(policies.trading.taker_rate_bps)],
    ['Settlement fee', bps(policies.settlement.rate_bps)],
    ['Deposit fee', bps(policies.payments.deposit_rate_bps)],
    ['Withdrawal fee', bps(policies.payments.withdrawal_rate_bps)],
  ];

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 2 }}>
        <VadText variant="heading">Current fee policy</VadText>
        <VadText variant="caption" tone="secondary">
          Configuration only. A configured fee becomes revenue only when the accounting flow recognizes it.
        </VadText>
      </View>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
        }}
      >
        {rows.map(([label, value]) => (
          <VadCard
            key={label}
            variant="outlined"
            style={{ minWidth: 150, flexGrow: 1, gap: 2 }}
          >
            <VadText variant="heading">{value}</VadText>
            <VadText variant="caption" tone="secondary">{label}</VadText>
          </VadCard>
        ))}
      </View>
    </View>
  );
}

function bps(value: unknown) {
  if (value == null || value === '') return 'Not configured';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Not configured';
  return `${(numeric / 100).toLocaleString(undefined, { maximumFractionDigits: 4 })}%`;
}
