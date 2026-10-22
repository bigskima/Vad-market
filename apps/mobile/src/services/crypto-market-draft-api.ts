import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type CryptoMarketDraftInput = {
  marketTypeCode: string;
  symbol: string;
  coinGeckoId: string;
  assetName: string;
  operator: 'GT' | 'GTE' | 'LT' | 'LTE' | string;
  threshold: string;
  quote: 'USD';
  sourceName: string;
  sourceUrl?: string;
};

export type CryptoMarketDraft = {
  title: string;
  description: string;
  resolutionRules: string;
  riskNotes: string;
  providerCode: string;
  providerName: string;
  modelCode: string;
  promptVersion: number;
  requiresAdminReview: true;
};

export async function createAdminCryptoMarketDraft(input: CryptoMarketDraftInput): Promise<CryptoMarketDraft> {
  const { data, error } = await supabase.functions.invoke('crypto-market-draft', {
    body: {
      marketTypeCode: input.marketTypeCode.trim().toUpperCase(),
      symbol: input.symbol.trim().toUpperCase(),
      coinGeckoId: input.coinGeckoId.trim().toLowerCase(),
      assetName: input.assetName.trim(),
      operator: input.operator.trim().toUpperCase(),
      threshold: input.threshold.trim(),
      quote: input.quote,
      sourceName: input.sourceName.trim(),
      sourceUrl: input.sourceUrl?.trim() || null,
    },
  });
  if (error) {
    throw userFacingError(error, 'admin', 'AI could not prepare this crypto market draft.');
  }
  const payload = data as Partial<CryptoMarketDraft> & { error?: string; message?: string };
  if (payload?.error) throw new Error(payload.message || 'AI could not prepare this crypto market draft.');
  if (
    !payload
    || typeof payload.title !== 'string'
    || typeof payload.description !== 'string'
    || typeof payload.resolutionRules !== 'string'
    || typeof payload.riskNotes !== 'string'
    || typeof payload.providerName !== 'string'
    || typeof payload.modelCode !== 'string'
    || payload.requiresAdminReview !== true
  ) {
    throw new Error('The AI provider returned an incomplete crypto market draft.');
  }
  return payload as CryptoMarketDraft;
}
