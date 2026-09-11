import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type KycQueueRow = {
  case_public_id: string;
  user_id: string;
  country_code: string;
  verification_level: string;
  provider_code: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type PaymentQueueRow = {
  intent_public_id: string;
  user_id: string;
  asset_code: string;
  operation: string;
  amount: number | string;
  fee_amount: number | string;
  net_amount: number | string;
  provider_code: string | null;
  status: string;
  failure_code: string | null;
  created_at: string;
  settled_at: string | null;
};

export type OperationsSummary = {
  kycAwaitingUser: number | string;
  kycInReview: number | string;
  kycVerified: number | string;
  paymentCreated: number | string;
  paymentProviderPending: number | string;
  paymentFailed: number | string;
  pendingProviderChanges: number | string;
  configuredProviders: number | string;
  generatedAt: string;
};

function fail(error: { message: string; code?: string; details?: string; hint?: string } | null, fallback: string) {
  if (error) throw userFacingError(error, 'admin', fallback);
}

export async function getAdminOperationsSummary() {
  const { data, error } = await supabase.rpc('admin_operations_summary');
  fail(error, 'We could not load the operations summary right now. Refresh and try again.');
  return data as OperationsSummary;
}

export async function getAdminKycQueue(limit = 100) {
  const { data, error } = await supabase.rpc('admin_kyc_queue', { p_limit: limit });
  fail(error, 'We could not load the verification queue right now. Refresh and try again.');
  return (data ?? []) as KycQueueRow[];
}

export async function getAdminPaymentQueue(limit = 100) {
  const { data, error } = await supabase.rpc('admin_payment_queue', { p_limit: limit });
  fail(error, 'We could not load the payment queue right now. Refresh and try again.');
  return (data ?? []) as PaymentQueueRow[];
}
