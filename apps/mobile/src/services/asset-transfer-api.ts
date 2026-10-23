import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

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

  const { data, error } = await supabase.rpc('transfer_asset_to_email', {
    p_recipient_email: input.recipientEmail.trim().toLowerCase(),
    p_asset_code: input.assetCode,
    p_amount: input.amount,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    throw userFacingError(
      error,
      'portfolio',
      'The transfer could not be completed. Check the recipient email and available balance, then try again.',
    );
  }
  if (!data || typeof data !== 'object' || typeof data.transferId !== 'string'
      || typeof data.journalId !== 'string' || data.status !== 'POSTED') {
    throw new Error('VAD did not confirm the transfer was posted. Check wallet activity before retrying.');
  }

  return data as AssetTransferReceipt;
}
