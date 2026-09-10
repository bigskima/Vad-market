import { supabase } from '@/lib/supabase';

export type AdminRevenueSource = {
  code: string;
  label: string;
  earnedLifetime: number | string;
  earned24h: number | string;
  earned30d: number | string;
  currentBalance: number | string;
};

export type AdminPlatformBalanceRow = {
  code: string;
  label: string;
  amount: number | string;
  signedBalance: number | string;
};

export type AdminFinanceAsset = {
  assetCode: string;
  assetName: string;
  assetStatus: string;
  vadRevenue: {
    earnedLifetime: number | string;
    earned24h: number | string;
    earned30d: number | string;
    currentRevenueBalance: number | string;
    sources: AdminRevenueSource[];
  };
  platformBalance: {
    total: number | string;
    breakdown: AdminPlatformBalanceRow[];
  };
};

export type AdminFinanceSummary = {
  assets: AdminFinanceAsset[];
  feePolicies: {
    trading: Record<string, unknown>;
    settlement: Record<string, unknown>;
    payments: Record<string, unknown>;
  };
  generatedAt: string;
};

const emptySummary: AdminFinanceSummary = {
  assets: [],
  feePolicies: {
    trading: {},
    settlement: {},
    payments: {},
  },
  generatedAt: '',
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function amount(value: unknown): number | string {
  return typeof value === 'number' || typeof value === 'string' ? value : 0;
}

function normalizeSource(value: unknown): AdminRevenueSource {
  const row = record(value);
  return {
    code: String(row.code ?? ''),
    label: String(row.label ?? 'Fee revenue'),
    earnedLifetime: amount(row.earnedLifetime),
    earned24h: amount(row.earned24h),
    earned30d: amount(row.earned30d),
    currentBalance: amount(row.currentBalance),
  };
}

function normalizeBalanceRow(value: unknown): AdminPlatformBalanceRow {
  const row = record(value);
  return {
    code: String(row.code ?? ''),
    label: String(row.label ?? 'Operational balance'),
    amount: amount(row.amount),
    signedBalance: amount(row.signedBalance),
  };
}

function normalizeAsset(value: unknown): AdminFinanceAsset {
  const row = record(value);
  const revenue = record(row.vadRevenue);
  const platform = record(row.platformBalance);

  return {
    assetCode: String(row.assetCode ?? ''),
    assetName: String(row.assetName ?? row.assetCode ?? 'Asset'),
    assetStatus: String(row.assetStatus ?? 'UNKNOWN'),
    vadRevenue: {
      earnedLifetime: amount(revenue.earnedLifetime),
      earned24h: amount(revenue.earned24h),
      earned30d: amount(revenue.earned30d),
      currentRevenueBalance: amount(revenue.currentRevenueBalance),
      sources: Array.isArray(revenue.sources)
        ? revenue.sources.map(normalizeSource)
        : [],
    },
    platformBalance: {
      total: amount(platform.total),
      breakdown: Array.isArray(platform.breakdown)
        ? platform.breakdown.map(normalizeBalanceRow)
        : [],
    },
  };
}

export async function getAdminFinanceSummary(): Promise<AdminFinanceSummary> {
  const { data, error } = await supabase.rpc('admin_finance_summary');
  if (error) throw new Error(error.message);

  const raw = record(data);
  if (!Object.keys(raw).length) return emptySummary;
  const policies = record(raw.feePolicies);

  return {
    assets: Array.isArray(raw.assets) ? raw.assets.map(normalizeAsset) : [],
    feePolicies: {
      trading: record(policies.trading),
      settlement: record(policies.settlement),
      payments: record(policies.payments),
    },
    generatedAt: String(raw.generatedAt ?? ''),
  };
}

export function formatAdminAssetAmount(
  assetCode: string,
  value: number | string,
  options?: { maximumFractionDigits?: number },
) {
  const numeric = Number(value ?? 0);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;
  const formatted = safeValue.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  });

  return assetCode.toUpperCase() === 'NGN'
    ? `₦${formatted}`
    : `${assetCode.toUpperCase()} ${formatted}`;
}
