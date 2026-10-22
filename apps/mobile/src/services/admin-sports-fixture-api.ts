import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type AdminSportsProvider = {
  code: string;
  name: string;
  adapter: string;
  sourceUrl: string;
  note: string;
};
export type AdminSportsOption = {
  code: string;
  name: string;
  providerSportCode: string;
};
export type AdminSportsCompetitionOption = {
  code: string;
  name: string;
  region?: string | null;
  providerCompetitionCode: string;
  providerSportCode: string;
  currentSeasonCode?: string | null;
  currentSeasonStart?: string | null;
  currentSeasonEnd?: string | null;
  badgeUrl?: string | null;
};
export type AdminSportsSeasonOption = {
  code: string;
  name: string;
  startsAt?: string | null;
  endsAt?: string | null;
  current?: boolean;
};
export type AdminSportsFixture = {
  fixtureId: string;
  providerCode: string;
  providerCompetitionCode: string;
  sportCode: string;
  competitionCode: string;
  competitionName: string;
  seasonCode?: string;
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
  seasonCode: string;
  providerCode: string;
  cacheKey: string;
  fetchedAt: string;
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
async function invokeCatalog<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('sports-provider-catalog', { body });
  if (error) throw endpointError(error, fallback);
  const payload = data as (T & { error?: string; message?: string }) | null;
  if (payload?.error) throw new Error(payload.message || fallback);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error(fallback);
  return payload as T;
}
export async function getAdminSportsProviders() {
  const payload = await invokeCatalog<{ ok: true; providers: AdminSportsProvider[] }>({ action: 'providers' }, 'Sports providers could not be loaded.');
  if (!payload.ok || !Array.isArray(payload.providers)) throw new Error('The sports provider catalogue returned an invalid response.');
  return payload.providers;
}
export async function getAdminProviderSports(providerCode: string) {
  const payload = await invokeCatalog<{ ok: true; sports: AdminSportsOption[] }>({
    action: 'sports', providerCode: providerCode.trim().toUpperCase(),
  }, 'Sports could not be loaded from the selected provider.');
  if (!payload.ok || !Array.isArray(payload.sports)) throw new Error('The provider returned an invalid sports list.');
  return payload.sports;
}
export async function getAdminProviderCompetitions(input: {
  providerCode: string;
  sportCode: string;
  providerSportCode: string;
  countryCode?: string;
}) {
  const payload = await invokeCatalog<{ ok: true; competitions: AdminSportsCompetitionOption[] }>({
    action: 'competitions',
    providerCode: input.providerCode.trim().toUpperCase(),
    sportCode: input.sportCode.trim().toUpperCase(),
    providerSportCode: input.providerSportCode.trim(),
    countryCode: input.countryCode?.trim() || '',
  }, 'Competitions could not be loaded from the selected provider.');
  if (!payload.ok || !Array.isArray(payload.competitions)) throw new Error('The provider returned an invalid competitions list.');
  return payload.competitions;
}
export async function getAdminProviderSeasons(input: {
  providerCode: string;
  sportCode: string;
  competitionCode: string;
}) {
  const payload = await invokeCatalog<{ ok: true; seasons: AdminSportsSeasonOption[] }>({
    action: 'seasons',
    providerCode: input.providerCode.trim().toUpperCase(),
    sportCode: input.sportCode.trim().toUpperCase(),
    competitionCode: input.competitionCode.trim(),
  }, 'Seasons could not be loaded from the selected provider.');
  if (!payload.ok || !Array.isArray(payload.seasons)) throw new Error('The provider returned an invalid seasons list.');
  return payload.seasons;
}
export async function getAdminProviderFixtures(input: {
  providerCode: string;
  sportCode: string;
  competitionCode: string;
  competitionName: string;
  seasonCode: string;
  fromDate?: string;
  toDate?: string;
  forceRefresh?: boolean;
}) {
  const { data, error } = await supabase.functions.invoke('sports-provider-catalog', {
    body: {
      action: 'fixtures',
      providerCode: input.providerCode.trim().toUpperCase(),
      sportCode: input.sportCode.trim().toUpperCase(),
      competitionCode: input.competitionCode.trim(),
      competitionName: input.competitionName.trim(),
      seasonCode: input.seasonCode.trim(),
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
  if (!payload?.title || typeof payload.description !== 'string' || typeof payload.resolutionRules !== 'string' || payload.requiresAdminReview !== true) {
    throw new Error('The AI draft service returned an incomplete response.');
  }
  return payload as AdminSportsMarketDraft;
}
