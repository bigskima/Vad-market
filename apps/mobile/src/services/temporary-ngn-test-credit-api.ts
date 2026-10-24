import { supabase } from '@/lib/supabase';

export type TemporaryNgnTestCreditStatus = {
  active: boolean;
  publicId?: string;
  assetCode?: 'NGN';
  amount?: number | string;
  availableBalance?: number | string;
  createdAt?: string;
  withdrawalsBlocked?: boolean;
  transfersBlocked?: boolean;
  transfersRestricted?: boolean;
  depositsBlocked?: boolean;
  marketOrdersUseStandardSettlement?: boolean;
  message?: string;
};

export async function getTemporaryNgnTestCreditStatus(): Promise<TemporaryNgnTestCreditStatus | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return null;

  const { data, error } = await supabase.rpc('my_temporary_ngn_test_credit_status');
  if (error) throw error;
  if (!data || typeof data !== 'object' || (data as { active?: unknown }).active !== true) return null;
  return data as TemporaryNgnTestCreditStatus;
}
