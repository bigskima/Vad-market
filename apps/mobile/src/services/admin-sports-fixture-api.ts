import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type AdminSportsFixture = {
  fixtureId: string;
  providerCode: string;
  providerCompetitionCode: string;
  sportCode: string;
  competitionCode: string;
  competitionName: string;
  homeTeam: string;
  homeTeamShortName: string | null;
  awayTeam: string;
  awayTeamShortName: string | null;
  startsAt: string;
  status: 'SCHEDULED' | 'TIMED' | 'IN_PLAY' | 'PAUSED';
  matchday: number | null;
  stage: string | null;
  venue: string | null;
  sourceName: string;
  sourceUrl: string;
  isUpcoming: boolean;
};

export type AdminSportsFixturePage = {
  ok: true;
  source: string;
  sourceUrl: string;
  purpose: 'FIXTURE_DISCOVERY_ONLY';
  sportCode: string;
  competitionCode: string;
  competitionName: string;
  dateFrom: string;
  dateTo: string;
  fetchedAt: string;
  cacheSeconds: number;
  cacheKey: string;
  fixtures: AdminSportsFixture[];
  cached?: boolean;
  stale?: boolean;
};

export type AdminSportsMarketDraft = {
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

function endpointError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : '';
  return userFacingError(error, 'admin', message || fallback);
}

export async function getAdminSportsFixtures(input: {
  sportCode: string;
  competitionCode: string;
  fromDate?: string;
  toDate?: string;
  forceRefresh?: boolean;
}): Promise<AdminSportsFixturePage> {
  const { data, error } = await supabase.functions.invoke('sports-fixture-discovery', {
    body: {
      sportCode: input.sportCode.trim().toUpperCase(),
      competitionCode: input.competitionCode.trim().toUpperCase(),
      fromDate: input.fromDate,
      toDate: input.toDate,
      forceRefresh: input.forceRefresh === true,
    },
  });
  if (error) throw endpointError(error, 'Upcoming fixtures could not be loaded.');
  const payload = data as Partial<AdminSportsFixturePage> & { error?: string; message?: string };
  if (payload?.error) throw new Error(payload.message || 'Upcoming fixtures could not be loaded.');
  if (!payload?.ok || !payload.cacheKey || !Array.isArray(payload.fixtures)) {
    throw new Error('The sports provider returned an invalid fixture list.');
  }
  return payload as AdminSportsFixturePage;
}

export async function createAdminSportsMarketDraft(input: {
  cacheKey: string;
  fixtureId: string;
  marketTypeCode: string;
  selectedResult?: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN' | 'YES';
}): Promise<AdminSportsMarketDraft> {
  const { data, error } = await supabase.functions.invoke('sports-market-draft', {
    body: {
      cacheKey: input.cacheKey.trim(),
      fixtureId: input.fixtureId.trim(),
      marketTypeCode: input.marketTypeCode.trim().toUpperCase(),
      selectedResult: input.selectedResult ?? 'YES',
    },
  });
  if (error) throw endpointError(error, 'AI could not prepare this market draft.');
  const payload = data as Partial<AdminSportsMarketDraft> & { error?: string; message?: string };
  if (payload?.error) throw new Error(payload.message || 'AI could not prepare this market draft.');
  if (
    !payload?.title
    || typeof payload.description !== 'string'
    || typeof payload.resolutionRules !== 'string'
    || payload.requiresAdminReview !== true
  ) {
    throw new Error('The AI draft service returned an incomplete response.');
  }
  return payload as AdminSportsMarketDraft;
}
