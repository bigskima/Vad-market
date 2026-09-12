import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type LaunchPolicySnapshot = {
  status: string;
  version: number;
  configuration: Record<string, unknown>;
  effectiveAt: string;
} | null;

export type LaunchOraclePolicy = {
  publicId: string;
  name: string;
  version: number;
  status: string;
  environment: 'SANDBOX' | 'PRODUCTION' | string;
  disputeWindowSeconds: number;
  effectiveAt: string;
};

export type LaunchPolicyWorkspace = {
  launchPhase: LaunchPolicySnapshot;
  marketAdmission: LaunchPolicySnapshot;
  settlementFee: LaunchPolicySnapshot;
  oraclePolicies: LaunchOraclePolicy[];
};

export async function getLaunchPolicyWorkspace() {
  const { data, error } = await supabase.rpc('admin_launch_policy_workspace');
  if (error) {
    throw userFacingError(error, 'admin', 'We could not load launch policy controls right now.');
  }
  const raw = (data ?? {}) as Partial<LaunchPolicyWorkspace>;
  return {
    launchPhase: raw.launchPhase ?? null,
    marketAdmission: raw.marketAdmission ?? null,
    settlementFee: raw.settlementFee ?? null,
    oraclePolicies: Array.isArray(raw.oraclePolicies) ? raw.oraclePolicies : [],
  } satisfies LaunchPolicyWorkspace;
}
