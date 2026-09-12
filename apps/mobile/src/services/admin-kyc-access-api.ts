import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type AdminKycAccessRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  country_code: string | null;
  provider_kyc_status: string;
  verification_level: string;
  provider_code: string | null;
  override_enabled: boolean;
  override_scope: 'SANDBOX' | 'ALL' | null;
  override_reason: string | null;
  override_expires_at: string | null;
  override_updated_at: string | null;
};

function fail(error: { message: string; code?: string; details?: string; hint?: string } | null, fallback: string) {
  if (error) throw userFacingError(error, 'admin', fallback);
}

export async function getAdminKycAccess(search?: string) {
  const { data, error } = await supabase.rpc('admin_kyc_access_overrides', {
    p_search: search?.trim() || null,
    p_limit: 100,
  });
  fail(error, 'We could not load tester and KYC access right now.');
  const now = Date.now();
  return ((data ?? []) as AdminKycAccessRow[]).map((row) => ({
    ...row,
    override_enabled: Boolean(
      row.override_enabled
      && (!row.override_expires_at || Date.parse(row.override_expires_at) > now),
    ),
  }));
}

export async function setAdminKycAccess(input: {
  userId: string;
  scope: 'SANDBOX' | 'ALL';
  enabled: boolean;
  reason: string;
  expiresAt?: string | null;
}) {
  const { data, error } = await supabase.rpc('admin_set_kyc_access_override', {
    p_user_id: input.userId,
    p_scope: input.scope,
    p_enabled: input.enabled,
    p_reason: input.reason.trim(),
    p_expires_at: input.expiresAt ?? null,
  });
  fail(error, 'We could not update this user’s tester access.');
  return (data ?? {}) as Record<string, unknown>;
}
