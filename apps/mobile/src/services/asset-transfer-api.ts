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
    if (raw.includes('location verification')) {
      throw new Error('NGN transfers require current location verification in Nigeria. Enable location permission and try again.');
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
