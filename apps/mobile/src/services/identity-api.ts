import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type KycStatus = {
  casePublicId?: string;
  verificationLevel?: 'BASIC' | 'STANDARD' | 'ENHANCED';
  status: 'NOT_STARTED' | 'CREATED' | 'PROVIDER_PENDING' | 'IN_REVIEW' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  providerCode?: string;
  providerConfigured?: boolean;
  kycStartAvailable?: boolean;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
  expiresAt?: string | null;
};

export async function getMyKycStatus() {
  const { data, error } = await supabase.rpc('my_kyc_status');
  if (error) throw userFacingError(error, 'identityVerification', 'We could not load your verification status. Please try again.');
  return data as KycStatus;
}

export async function startDiditKyc() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    throw new Error('Your session has expired. Sign in again to continue.');
  }

  const { data, error } = await supabase.functions.invoke('identity-gateway', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
  });
  if (error) throw userFacingError(error, 'identityVerification');
  if (!data?.verificationUrl) {
    throw userFacingError(data?.error ?? data?.message, 'identityVerification');
  }
  return data as { provider: 'DIDIT'; casePublicId: string; status: string; verificationUrl: string };
}
