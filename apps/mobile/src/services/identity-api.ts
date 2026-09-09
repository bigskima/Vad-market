import { supabase } from '@/lib/supabase';

export type KycStatus = {
  casePublicId?: string;
  verificationLevel?: 'BASIC' | 'STANDARD' | 'ENHANCED';
  status: 'NOT_STARTED' | 'CREATED' | 'PROVIDER_PENDING' | 'IN_REVIEW' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  providerCode?: string;
  providerConfigured?: boolean;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
  expiresAt?: string | null;
};

export async function getMyKycStatus() {
  const { data, error } = await supabase.rpc('my_kyc_status');
  if (error) throw new Error(error.message);
  return data as KycStatus;
}

export async function startDiditKyc() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) throw new Error('Your session is not available. Please sign in again.');

  const { data, error } = await supabase.functions.invoke('identity-gateway', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
  });
  if (error) throw new Error(error.message);
  if (!data?.verificationUrl) {
    if (data?.error === 'KYC_PROVIDER_NOT_CONFIGURED') throw new Error('Didit is selected for verification, but its Supabase secrets are not configured yet.');
    throw new Error(data?.error ?? 'Could not start identity verification.');
  }
  return data as { provider: 'DIDIT'; casePublicId: string; status: string; verificationUrl: string };
}
