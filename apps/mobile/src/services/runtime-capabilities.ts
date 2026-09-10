import { parseRuntimeCapabilities } from '@vad/schemas';
import type {
  RuntimeCapabilitiesResponse,
  RuntimeCapabilityKey,
} from '@vad/types';

import { supabase } from '@/lib/supabase';

const capabilityKeys: RuntimeCapabilityKey[] = [
  'createPost',
  'submitMarketProposal',
  'viewPortfolio',
  'trade',
  'deposit',
  'withdraw',
];

export function unavailableCapabilities(
  reason = 'CAPABILITY_SERVICE_UNAVAILABLE',
): RuntimeCapabilitiesResponse {
  const capabilities = Object.fromEntries(
    capabilityKeys.map((key) => [key, false]),
  ) as RuntimeCapabilitiesResponse['capabilities'];
  const reasons = Object.fromEntries(
    capabilityKeys.map((key) => [key, reason]),
  ) as RuntimeCapabilitiesResponse['reasons'];

  return {
    version: 2,
    status: 'degraded',
    requestId: 'local-fail-closed',
    evaluatedAt: new Date().toISOString(),
    context: { countryCode: 'NG', activeAssetCodes: [] },
    capabilities,
    reasons,
  };
}

export async function fetchRuntimeCapabilities() {
  const { data, error } = await supabase.functions.invoke(
    'runtime-capabilities',
    { method: 'POST' },
  );

  if (error) return unavailableCapabilities();
  return parseRuntimeCapabilities(data) ?? unavailableCapabilities('INVALID_RESPONSE');
}
