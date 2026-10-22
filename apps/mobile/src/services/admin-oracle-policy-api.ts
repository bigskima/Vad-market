import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type AdminOraclePolicy = {
  public_id: string;
  name: string;
  capability_code: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED' | string;
  source_hierarchy: unknown;
  consensus_rule: Record<string, unknown> | null;
  void_rule: Record<string, unknown> | null;
  dispute_window_seconds: number;
  effective_at: string;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
};

export async function getAdminOraclePolicies(): Promise<AdminOraclePolicy[]> {
  const { data, error } = await supabase.rpc('admin_oracle_policy_catalog');
  if (error) {
    throw userFacingError(error, 'admin', 'Oracle policies could not be loaded. Check your Admin permissions and retry.');
  }
  return (Array.isArray(data) ? data : []) as AdminOraclePolicy[];
}

/**
 * Uses the existing dual-control database RPC. The caller must have oracle.review,
 * and the database still rejects approval by the policy creator.
 */
export async function approveAdminOraclePolicy(publicId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('admin_approve_oracle_policy', {
    p_policy_public_id: publicId,
  });
  if (error) {
    throw userFacingError(error, 'admin', 'Oracle policy approval was rejected. A different authorized reviewer may be required.');
  }
  return data === true;
}
