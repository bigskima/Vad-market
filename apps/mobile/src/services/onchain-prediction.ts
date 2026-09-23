import type { OnchainMarketVenue } from '@/services/onchain-api';

export type PreparedUsdcPrediction = never;

function nativeOnly(): never {
  throw new Error(
    'USDC settlement is native-app first in this VAD release. Open VAD on Android or iOS to continue.',
  );
}

export async function prepareUsdcPrediction(_input: {
  marketId: string;
  outcomeCode: 'YES' | 'NO';
  amount: number;
  venue: OnchainMarketVenue;
}): Promise<never> {
  return nativeOnly();
}

export async function submitPreparedUsdcPrediction(): Promise<never> {
  return nativeOnly();
}

export async function cancelPreparedUsdcPrediction(): Promise<void> {
  return;
}
