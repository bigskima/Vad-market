import type {
  PreparedUsdcPrediction,
  PrepareUsdcPredictionInput,
  SubmittedUsdcPrediction,
} from '@/services/onchain-prediction.types';

export type {
  PreparedUsdcPrediction,
  PrepareUsdcPredictionInput,
  SubmittedUsdcPrediction,
} from '@/services/onchain-prediction.types';

function nativeOnly(): never {
  throw new Error(
    'USDC settlement is native-app first in this VAD release. Open VAD on Android or iOS to continue.',
  );
}

export async function prepareUsdcPrediction(
  _input: PrepareUsdcPredictionInput,
): Promise<PreparedUsdcPrediction> {
  return nativeOnly();
}

export async function submitPreparedUsdcPrediction(
  _prepared: PreparedUsdcPrediction,
): Promise<SubmittedUsdcPrediction> {
  return nativeOnly();
}

export async function cancelPreparedUsdcPrediction(
  _prepared: PreparedUsdcPrediction | null,
  _failureCode = 'USER_EDITED_AUTHORIZATION',
): Promise<void> {
  return;
}
