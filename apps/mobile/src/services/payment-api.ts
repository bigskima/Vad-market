import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type PaymentQuote = {
  enabled: boolean;
  reason: string | null;
  operation: 'DEPOSIT' | 'WITHDRAWAL';
  assetCode: string;
  amount: number | string;
  feeAmount?: number | string;
  netAmount?: number | string;
  providerCode?: string;
  requiredKycLevel?: string;
  minimum?: number | string;
  maximum?: number | string;
};

export type PaymentIntentRow = {
  intent_public_id: string;
  asset_code: string;
  operation: 'DEPOSIT' | 'WITHDRAWAL' | 'REFUND';
  amount: number | string;
  fee_amount: number | string;
  net_amount: number | string;
  status: string;
  provider_configured: boolean;
  failure_code: string | null;
  created_at: string;
  settled_at: string | null;
};

function fail(
  error: { message: string; code?: string; details?: string; hint?: string } | null,
  context: 'payments' | 'deposit' | 'withdrawal' = 'payments',
  fallback?: string,
) {
  if (error) throw userFacingError(error, context, fallback);
}

export async function quotePayment(operation: 'DEPOSIT' | 'WITHDRAWAL', amount: number, assetCode = 'NGN') {
  const { data, error } = await supabase.rpc('payment_quote', { p_operation: operation, p_asset_code: assetCode, p_amount: amount });
  fail(
    error,
    operation === 'DEPOSIT' ? 'deposit' : 'withdrawal',
    operation === 'DEPOSIT'
      ? 'We could not prepare your deposit right now. Please try again.'
      : 'We could not prepare your withdrawal right now. Please try again.',
  );
  return data as PaymentQuote;
}

export async function createPaymentIntent(operation: 'DEPOSIT' | 'WITHDRAWAL', amount: number, assetCode = 'NGN') {
  const idempotencyKey = `mobile:${operation.toLowerCase()}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const { data, error } = await supabase.rpc('create_payment_intent', {
    p_operation: operation,
    p_asset_code: assetCode,
    p_amount: amount,
    p_idempotency_key: idempotencyKey,
  });
  fail(error, operation === 'DEPOSIT' ? 'deposit' : 'withdrawal');
  return data as string;
}

export async function cancelPaymentIntent(intentPublicId: string) {
  const { error } = await supabase.rpc('cancel_payment_intent', { p_intent_public_id: intentPublicId });
  fail(error, 'payments', 'We could not cancel this payment request right now. Please try again.');
}

export async function getMyPaymentIntents(limit = 30) {
  const { data, error } = await supabase.rpc('my_payment_intents', { p_limit: limit });
  fail(error, 'payments', 'We could not load your payment activity right now. Please try again.');
  return (data ?? []) as PaymentIntentRow[];
}

export async function getProviderReadiness() {
  const { data, error } = await supabase.rpc('provider_readiness');
  fail(error, 'payments', 'We could not check funding availability right now. Please try again.');
  return data as { countryCode?: string; kycProvider?: string; kycConfigured?: boolean; depositConfigured?: boolean; withdrawalConfigured?: boolean; generatedAt?: string };
}
