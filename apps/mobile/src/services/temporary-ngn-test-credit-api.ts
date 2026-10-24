import { supabase } from '@/lib/supabase';

export type TemporaryNgnTestCreditStatus = {
  active: boolean;
  testModeEnabled?: boolean;
  publicId?: string;
  assetCode?: 'NGN';
  amount?: number | string;
  availableBalance?: number | string;
  createdAt?: string;
  withdrawalsBlocked?: boolean;
  transfersBlocked?: boolean;
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

export async function setTemporaryNgnTestMode(enabled: boolean): Promise<TemporaryNgnTestCreditStatus> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Sign in to change market testing settings.');

  const { data, error } = await supabase.rpc('set_my_temporary_ngn_test_mode', {
    p_enabled: enabled,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || typeof (data as { active?: unknown }).active !== 'boolean') {
    throw new Error('The server did not confirm the market testing preference.');
  }
  return data as TemporaryNgnTestCreditStatus;
}
