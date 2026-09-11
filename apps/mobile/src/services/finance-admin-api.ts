import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type FeePolicyName = 'trading_fee' | 'settlement_fee' | 'payment_fees';

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

export type AdminFeeChangeRequest = {
  requestPublicId: string;
  policyName: FeePolicyName;
  configuration: Record<string, unknown>;
  proposalReason: string;
  proposedBy: string;
  proposerEmail: string | null;
  proposedAt: string;
  currentVersionIdAtProposal: number | null;
  currentConfiguration: Record<string, unknown>;
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

function normalizeFeeRequest(value: unknown): AdminFeeChangeRequest {
  const row = record(value);
  return {
    requestPublicId: String(row.request_public_id ?? ''),
    policyName: String(row.policy_name ?? 'trading_fee') as FeePolicyName,
    configuration: record(row.configuration),
    proposalReason: String(row.proposal_reason ?? ''),
    proposedBy: String(row.proposed_by ?? ''),
    proposerEmail: row.proposer_email ? String(row.proposer_email) : null,
    proposedAt: String(row.proposed_at ?? ''),
    currentVersionIdAtProposal:
      row.current_version_id_at_proposal == null
        ? null
        : Number(row.current_version_id_at_proposal),
    currentConfiguration: record(row.current_configuration),
  };
}

function financeError(error: unknown, fallback: string) {
  return userFacingError(error, 'admin', fallback);
}

export async function getAdminFinanceSummary(): Promise<AdminFinanceSummary> {
  const { data, error } = await supabase.rpc('admin_finance_summary');
  if (error) throw financeError(error, 'We could not load the finance summary right now. Refresh and try again.');

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

export async function getAdminFeePolicyQueue(): Promise<AdminFeeChangeRequest[]> {
  const { data, error } = await supabase.rpc('admin_fee_policy_queue');
  if (error) throw financeError(error, 'We could not load pending fee changes right now. Refresh and try again.');
  return Array.isArray(data) ? data.map(normalizeFeeRequest) : [];
}

export async function proposeAdminFeePolicy(input: {
  policyName: FeePolicyName;
  configuration: Record<string, unknown>;
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_propose_fee_policy', {
    p_policy_name: input.policyName,
    p_configuration: input.configuration,
    p_reason: input.reason.trim(),
  });
  if (error) throw financeError(error, 'We could not submit this fee change right now. Please try again.');
  return String(data);
}

export async function setAdminFeePolicyImmediate(input: {
  policyName: FeePolicyName;
  configuration: Record<string, unknown>;
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_set_fee_policy_immediate', {
    p_policy_name: input.policyName,
    p_configuration: input.configuration,
    p_reason: input.reason.trim(),
  });
  if (error) throw financeError(error, 'We could not apply this fee change right now. Please try again.');
  return Number(data);
}

export async function decideAdminFeePolicyProposal(input: {
  requestPublicId: string;
  decision: 'APPROVE' | 'REJECT';
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_decide_fee_policy_proposal', {
    p_request_public_id: input.requestPublicId,
    p_decision: input.decision,
    p_reason: input.reason.trim(),
  });
  if (error) throw financeError(error, 'We could not save this fee decision right now. Please try again.');
  return Boolean(data);
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
