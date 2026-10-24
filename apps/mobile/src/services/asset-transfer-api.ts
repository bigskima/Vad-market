import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';
import { verifyCurrentServiceLocation } from '@/services/location-eligibility';

export type TransferAssetCode = 'NGN' | 'USDC';

export type AssetTransferReceipt = {
  transferId: string;
  journalId: string;
  assetCode: TransferAssetCode;
  amount: number | string;
  status: 'POSTED';
  idempotentReplay?: boolean;
  temporaryTestCredit?: boolean;
};

export async function transferAssetToEmail(input: {
  recipientEmail: string;
  assetCode: TransferAssetCode;
  amount: number;
  idempotencyKey: string;
}): Promise<AssetTransferReceipt> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error('Your sign-in session has expired. Sign in again before sending assets.');
  }

  if (input.assetCode === 'NGN') {
    const location = await verifyCurrentServiceLocation().catch(() => ({ allowed: false, reasonCode: 'LOCATION_VERIFICATION_UNAVAILABLE' }));
    if (!location.allowed) {
      throw new Error('NGN transfers require current location verification in Nigeria. Enable location permission and try again.');
    }
  }

  const { data, error } = await supabase.rpc('transfer_asset_to_email', {
    p_recipient_email: input.recipientEmail.trim().toLowerCase(),
    p_asset_code: input.assetCode,
    p_amount: input.amount,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    const raw = String(error.message ?? '').toLowerCase();
    if (raw.includes('no vad account exists for that email')) {
      throw new Error('No VAD account exists for that email address. No funds were moved.');
    }
    if (raw.includes('insufficient available') || raw.includes('insufficient balance')) {
      throw new Error(`Your available ${input.assetCode} balance is not enough. No funds were moved.`);
    }
    if (raw.includes('recipient must complete current nigeria location verification')) {
      throw new Error('The recipient must complete current Nigeria location verification before receiving NGN. No funds were moved.');
    }
    if (raw.includes('location verification')) {
      throw new Error('NGN transfers require current Nigeria location and network verification for your account. Complete the location check and try again.');
    }
    if (raw.includes('real ngn cannot be transferred into a temporary test-credit account')
      || raw.includes('test-credit transfers are allowed only')
      || raw.includes('test funds cannot be mixed')) {
      throw new Error('These test NGN funds can only move between eligible test-credit accounts. They cannot mix with cash-funded NGN, and no funds were moved.');
    }
    if (raw.includes('recipient must enable ngn')) {
      throw new Error('The recipient must enable NGN in Currency settings before receiving test funds. No funds were moved.');
    }
    if (raw.includes('previous temporary test credit was revoked')) {
      throw new Error('The recipient’s previous test credit was revoked. A super administrator must authorize a new test grant before they can receive test funds.');
    }
    if (raw.includes('historical ngn cash deposit')) {
      throw new Error('The recipient has previous NGN cash-funding history, so test funds cannot be mixed into that account. No funds were moved.');
    }
    if (raw.includes('recipient account is registered') || raw.includes('recipient account is not active')) {
      throw new Error('The recipient VAD account is not active for transfers. No funds were moved.');
    }
    if (raw.includes('frozen or closed')) {
      throw new Error('One of the wallets is frozen or closed. No funds were moved.');
    }
    throw userFacingError(
      error,
      'portfolio',
      'The transfer could not be completed. Check the recipient email, asset eligibility and available balance, then try again.',
    );
  }
  if (!data || typeof data !== 'object' || typeof data.transferId !== 'string'
      || typeof data.journalId !== 'string' || data.status !== 'POSTED') {
    throw new Error('VAD did not confirm the transfer was posted. Check wallet activity before retrying.');
  }

  return data as AssetTransferReceipt;
}
