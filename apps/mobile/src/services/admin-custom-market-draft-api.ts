import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type CustomMarketDraft = {
  title: string;
  description: string;
  resolutionRules: string;
  riskNotes: string;
  categoryCode: string;
  marketTypeCode: string;
  configuredHandler: string;
  sourceName: string;
  sourceUrl: string;
  regionScope: 'NIGERIA' | 'AFRICA' | 'GLOBAL';
  providerCode: string;
  providerName: string;
  modelCode: string;
  promptVersion: number;
  requiresAdminReview: true;
};

export async function createAdminCustomMarketDraft(input: {
  categoryCode: string;
  marketTypeCode: string;
  title: string;
  description: string;
  details: Record<string, string>;
  condition: string;
  sourceName: string;
  sourceUrl?: string;
  regionScope: 'NIGERIA' | 'AFRICA' | 'GLOBAL';
  opensAt?: string;
  closesAt?: string;
  resolvesAfter?: string;
}): Promise<CustomMarketDraft> {
  const { data, error } = await supabase.functions.invoke('custom-market-draft', {
    body: {
      categoryCode: input.categoryCode.trim().toUpperCase(),
      marketTypeCode: input.marketTypeCode.trim().toUpperCase(),
      title: input.title.trim(),
      description: input.description.trim(),
      details: input.details,
      condition: input.condition.trim(),
      sourceName: input.sourceName.trim(),
      sourceUrl: input.sourceUrl?.trim() || null,
      regionScope: input.regionScope,
      opensAt: input.opensAt || null,
      closesAt: input.closesAt || null,
      resolvesAfter: input.resolvesAfter || null,
    },
  });
  if (error) {
    const message = error instanceof Error ? error.message : '';
    throw userFacingError(error, 'admin', message || 'AI could not prepare this custom market draft.');
  }
  const payload = data as Partial<CustomMarketDraft> & { error?: string; message?: string };
  if (payload?.error) throw new Error(payload.message || 'AI could not prepare this custom market draft.');
  if (
    !payload || typeof payload.title !== 'string' || payload.title.length < 10
    || typeof payload.description !== 'string'
    || typeof payload.resolutionRules !== 'string' || payload.resolutionRules.length < 20
    || typeof payload.riskNotes !== 'string'
    || typeof payload.providerName !== 'string'
    || typeof payload.modelCode !== 'string'
    || payload.requiresAdminReview !== true
  ) throw new Error('The custom-market AI service returned an incomplete draft.');
  return payload as CustomMarketDraft;
}
