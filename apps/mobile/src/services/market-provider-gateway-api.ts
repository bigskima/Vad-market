import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type ProviderFixture = {
  publicId: string;
  providerCode: string;
  externalEventId: string;
  sportCode: string;
  competitionCode: string;
  competitionName: string;
  eventName?: string | null;
  participantA: string;
  participantB: string;
  startsAt: string;
  status: string;
  season?: string | null;
  roundLabel?: string | null;
  venue?: string | null;
  sourceUrl?: string | null;
  lastSeenAt?: string | null;
};

export type FixtureDiscoveryResult = {
  ok: boolean;
  source: string;
  adapter: string;
  sportCode: string;
  competitionCode: string;
  fromDate: string;
  toDate: string;
  providerEventCount: number;
  importedCount: number;
  fetchedAt: string;
  dataPurpose: 'FIXTURE_DISCOVERY_ONLY';
  settlementAuthority: 'VAD_ORACLE_POLICY';
  events: ProviderFixture[];
};

export type AIDraftedMarket = {
  eventPublicId: string;
  providerCode: string;
  externalEventId: string;
  sportCode: string;
  competitionCode: string;
  competition: string;
  participantA: string;
  participantB: string;
  startsAt: string;
  prediction: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN' | 'MATCH_WINNER';
  title: string;
  description: string;
  condition: string;
  resultChecking: 'AUTOMATIC' | 'VERIFIED';
  resultMode: 'AUTOMATIC' | 'VERIFIED';
  confidence: number;
  riskFlags: string[];
  sourceUrl?: string;
  status: 'DRAFT_ONLY';
  publicationAllowed: false;
};

function throwInvokeError(error: { message: string; context?: unknown } | null, fallback: string) {
  if (!error) return;
  const context = error.context as { json?: () => Promise<{ message?: string; error?: string }> } | undefined;
  throw userFacingError(error, 'admin', fallback);
}

export async function discoverSportsFixtures(input: {
  sportCode: string;
  competitionCode: string;
  dateFrom: string;
  dateTo: string;
  search?: string;
  limit?: number;
}) {
  const { data, error } = await supabase.functions.invoke('market-provider-gateway', {
    body: {
      sportCode: input.sportCode.trim().toUpperCase(),
      competitionCode: input.competitionCode.trim().toUpperCase(),
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      search: input.search?.trim() || undefined,
      limit: input.limit ?? 100,
    },
  });
  throwInvokeError(error, 'VAD could not import fixtures from the selected sports provider.');
  if (!data || data.error) throw new Error(String(data?.message ?? data?.error ?? 'Fixture discovery failed.'));
  return data as FixtureDiscoveryResult;
}

export async function draftSportsMarketsWithAI(eventPublicIds: string[]) {
  const ids = [...new Set(eventPublicIds.filter(Boolean))];
  if (ids.length < 1 || ids.length > 10) throw new Error('Select between one and ten fixtures.');
  const { data, error } = await supabase.functions.invoke('market-builder-ai', {
    body: { eventPublicIds: ids },
  });
  throwInvokeError(error, 'VAD could not draft markets from these fixtures.');
  if (!data || data.error) throw new Error(String(data?.message ?? data?.error ?? 'AI market drafting failed.'));
  return data as {
    ok: boolean;
    runPublicId: string;
    fixtureProviderCode: string;
    aiProvider: string;
    aiModel: string;
    fixtureCount: number;
    suggestionCount: number;
    status: 'DRAFT_ONLY';
    publicationAllowed: false;
    suggestions: AIDraftedMarket[];
  };
}
