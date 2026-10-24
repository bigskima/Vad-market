import { supabase } from '@/lib/supabase';

export type TemporaryNgnMarketTestingStatus = {
  active: boolean;
  eligible: boolean;
  testModeEnabled: boolean;
  reasonCode?: string;
  grantId?: string;
  assetCode?: 'NGN';
  grantAmount?: number | string;
  availableBalance?: number | string;
  createdAt?: string;
  openMarketCount?: number;
  withdrawalsBlocked?: boolean;
  depositsBlocked?: boolean;
  marketOrdersUseStandardSettlement?: boolean;
  message?: string;
};

function asStatus(value: unknown): TemporaryNgnMarketTestingStatus {
  if (!value || typeof value !== 'object') {
    throw new Error('The server did not return NGN market-testing status.');
  }
  const row = value as Record<string, unknown>;
  if (typeof row.active !== 'boolean'
    || typeof row.eligible !== 'boolean'
    || typeof row.testModeEnabled !== 'boolean') {
    throw new Error('The server returned an invalid NGN market-testing status.');
  }
  return row as unknown as TemporaryNgnMarketTestingStatus;
}

export async function getTemporaryNgnMarketTestingStatus(): Promise<TemporaryNgnMarketTestingStatus | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return null;

  const { data, error } = await supabase.rpc('my_temporary_ngn_market_testing_status');
  if (error) throw error;
  const status = asStatus(data);
  return status.active ? status : null;
}

export async function setTemporaryNgnMarketTesting(enabled: boolean): Promise<TemporaryNgnMarketTestingStatus> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error('Your sign-in session has expired. Sign in again to change market-testing settings.');
  }

  const { data, error } = await supabase.rpc('set_my_temporary_ngn_market_testing', {
    p_enabled: enabled,
  });
  if (error) {
    const message = String(error.message ?? '').toLowerCase();
    if (message.includes('location') || message.includes('network_risk') || message.includes('location_mismatch')) {
      throw new Error('Current Nigeria location verification is required before enabling NGN market testing. Verify your current location, then try again.');
    }
    if (message.includes('active temporary ngn test allocation')) {
      throw new Error('There is no active temporary NGN test allocation on this account.');
    }
    throw new Error(error.message || 'Your NGN market-testing setting could not be saved.');
  }

  const status = asStatus(data);
  if (status.testModeEnabled !== enabled) {
    throw new Error('The server did not confirm the NGN market-testing setting.');
  }
  return status;
}
