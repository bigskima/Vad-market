import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type OnchainTransactionIntentRow = {
  intent_id: string;
  action: 'PREDICT' | 'CLAIM' | 'REFUND';
  status:
    | 'CREATED'
    | 'AWAITING_SIGNATURE'
    | 'SIGNED'
    | 'SUBMITTED'
    | 'CONFIRMING'
    | 'CONFIRMED'
    | 'FAILED'
    | 'CANCELLED'
    | 'REPLACED'
    | 'DROPPED';
  chain_code: string;
  wallet_address: string;
  amount: number | string | null;
  outcome_label: string | null;
  transaction_id: string | null;
  transaction_status: 'SUBMITTED' | 'CONFIRMING' | 'CONFIRMED' | 'FAILED' | 'REPLACED' | 'DROPPED' | null;
  confirmations: number;
  finalized: boolean;
  failure_code: string | null;
  created_at: string;
  updated_at: string;
};

export async function getMyOnchainTransactionIntents(limit = 50) {
  const { data, error } = await supabase.rpc('my_onchain_transaction_intents', {
    p_limit: Math.max(1, Math.min(limit, 200)),
  });

  if (error) {
    throw userFacingError(
      error,
      'portfolio',
      'We could not load your on-chain activity right now.',
    );
  }

  return (data ?? []) as OnchainTransactionIntentRow[];
}
