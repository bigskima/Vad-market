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
  providerCode: string;
  providerCompetitionCode: string;
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

export type AdminAutomaticFootballMarketResult = {
  status: 'PUBLISHED' | 'ALREADY_PUBLISHED' | 'ALREADY_EXISTS';
  eventId: string;
  instrumentId: string;
  title: string;
  outcomes: { code: string; label: string }[];
  opensAt: string;
  closesAt: string;
  resolvesAfter: string;
};

export async function createAdminAutomaticFootballMarket(input: {
  sportCode: string;
  competitionCode: string;
  competitionName: string;
  providerCompetitionCode: string;
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  countryCode: string;
  assetCode: string;
}): Promise<AdminAutomaticFootballMarketResult> {
  const { data, error } = await supabase.rpc('admin_create_football_1x2_market_v1', {
    p_sport_code: input.sportCode.trim().toUpperCase(),
    p_competition_code: input.competitionCode.trim().toUpperCase(),
    p_competition_name: input.competitionName.trim(),
    p_provider_competition_code: input.providerCompetitionCode.trim().toUpperCase(),
    p_fixture_id: input.fixtureId.trim(),
    p_home_team: input.homeTeam.trim(),
    p_away_team: input.awayTeam.trim(),
    p_match_starts_at: input.startsAt,
    p_country_code: input.countryCode.trim().toUpperCase(),
    p_asset_code: input.assetCode.trim().toUpperCase(),
    p_publish_now: true,
  });
  if (error) throw endpointError(error, 'The automatic football market could not be created.');
  const payload = data as Partial<AdminAutomaticFootballMarketResult> & { error?: string; message?: string };
  if (payload?.error) throw new Error(payload.message || 'The automatic football market could not be created.');
  if (!payload?.eventId || !payload?.instrumentId || !payload?.title
    || !['PUBLISHED', 'ALREADY_PUBLISHED', 'ALREADY_EXISTS'].includes(String(payload.status))) {
    throw new Error('VAD returned an incomplete result while creating this fixture market.');
  }
  return payload as AdminAutomaticFootballMarketResult;
}
