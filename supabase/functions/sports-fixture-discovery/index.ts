import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

const json = (body: unknown, status = 200, cacheSeconds = 0) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    'Content-Type': 'application/json',
    'Cache-Control': cacheSeconds > 0 ? 'private, max-age=15, s-maxage=' + cacheSeconds : 'no-store',
  },
});

type JsonRecord = Record<string, unknown>;
type SportsCompetition = {
  sportCode: string;
  status: 'ACTIVE' | 'DISABLED';
  code: string;
  name: string;
  resultMode: 'AUTOMATIC' | 'VERIFIED';
  providerCode?: string | null;
  providerCompetitionCode?: string | null;
  aliases?: string[];
};
type SportsProvider = {
  id: number;
  code: string;
  name: string;
  environment: string;
  status: string;
  adapter?: string | null;
  baseUrl?: string | null;
  secretReference?: string | null;
  publicMetadata?: JsonRecord;
  resources?: Array<{ resourceType: string; canonicalKey: string; externalKey: string; status: string }>;
};
type ProviderMatch = {
  id?: string | number | null;
  utcDate?: string;
  status?: string;
  matchday?: number | null;
  stage?: string;
  homeTeam?: JsonRecord;
  awayTeam?: JsonRecord;
  competition?: JsonRecord;
  season?: JsonRecord;
  venue?: string | null;
  lastUpdated?: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeText(value: unknown, max = 180): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function safeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateOnly(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function plusDays(isoDate: string, days: number): string {
  const date = new Date(isoDate + 'T00:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function fetchJson(url: URL, apiKey: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'X-Auth-Token': apiKey, Accept: 'application/json' },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 429) throw new Error('The sports data provider rate limit has been reached. Please try again after the retry window.');
      if (response.status === 401 || response.status === 403) throw new Error('The configured sports provider credentials are missing or not authorised for this competition.');
      if (response.status === 404) throw new Error('This competition is not available from the configured sports provider.');
      throw new Error('The sports data provider returned HTTP ' + response.status + '.');
    }
    if (!isRecord(payload)) throw new Error('The sports data provider returned an invalid response.');
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The sports data request timed out.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function authenticate(req: Request) {
  const authorization = req.headers.get('authorization') ?? '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = Deno.env.get('SUPABASE_URL')?.trim();
  const anon = (Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY'))?.trim();
  const service = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY'))?.trim();
  if (!token) throw new Error('Please sign in with an administrator account to browse sports fixtures.');
  if (!url || !anon || !service) throw new Error('Sports fixture discovery is not configured.');
  const user = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await user.auth.getUser(token);
  if (authError || !authData.user) throw new Error('Your administrator session is invalid or has expired.');
  const { data: taxonomy, error: taxonomyError } = await user.rpc('get_sports_market_catalog');
  if (taxonomyError || !isRecord(taxonomy) || !Array.isArray(taxonomy.competitions)) {
    throw new Error('Sports catalogue access is unavailable. Check that you have market-management permission.');
  }
  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { user, admin, userId: authData.user.id, taxonomy, service };
}

function normalizeFixture(match: ProviderMatch, provider: SportsProvider, competition: SportsCompetition, requestUrl: string) {
  const home = isRecord(match.homeTeam) ? match.homeTeam : {};
  const away = isRecord(match.awayTeam) ? match.awayTeam : {};
  const kickoff = new Date(safeText(match.utcDate, 80));
  const status = safeText(match.status, 40).toUpperCase();
  const externalId = match.id === null || match.id === undefined ? '' : String(match.id).trim().slice(0, 120);
  const homeName = safeText(home.name, 160);
  const awayName = safeText(away.name, 160);
  if (!externalId || !homeName || !awayName || !Number.isFinite(kickoff.getTime())) return null;
  if (!['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED'].includes(status)) return null;
  return {
    fixtureId: externalId,
    providerCode: provider.code,
    providerCompetitionCode: competition.providerCompetitionCode,
    sportCode: competition.sportCode,
    competitionCode: competition.code,
    competitionName: competition.name,
    homeTeam: homeName,
    homeTeamShortName: safeText(home.shortName, 100) || null,
    awayTeam: awayName,
    awayTeamShortName: safeText(away.shortName, 100) || null,
    startsAt: kickoff.toISOString(),
    status,
    matchday: Number.isFinite(Number(match.matchday)) ? Number(match.matchday) : null,
    stage: safeText(match.stage, 100) || null,
    venue: safeText(match.venue, 180) || null,
    sourceName: provider.name,
    sourceUrl: 'https://www.football-data.org/',
    sourceQuery: requestUrl,
    fetchedAt: new Date().toISOString(),
    isUpcoming: kickoff.getTime() > Date.now() && ['SCHEDULED', 'TIMED'].includes(status),
  };
}

async function handle(req: Request) {
  const { user, admin, taxonomy } = await authenticate(req);
  let body: JsonRecord;
  try {
    const parsed = await req.json();
    if (!isRecord(parsed)) return json({ error: 'INVALID_BODY', message: 'Request body must be an object.' }, 400);
    body = parsed;
  } catch {
    return json({ error: 'INVALID_BODY', message: 'Request body must be valid JSON.' }, 400);
  }

  const sportCode = safeText(body.sportCode, 50).toUpperCase();
  const competitionCode = safeText(body.competitionCode, 80).toUpperCase();
  const today = new Date().toISOString().slice(0, 10);
  const fromDate = dateOnly(body.fromDate) ?? today;
  const toDate = dateOnly(body.toDate) ?? plusDays(fromDate, 7);
  const forceRefresh = body.forceRefresh === true;

  if (!sportCode || !competitionCode) return json({ error: 'COMPETITION_REQUIRED', message: 'Choose a sport and competition first.' }, 400);
  if (fromDate < today || toDate < fromDate || toDate > plusDays(fromDate, 14) || fromDate > plusDays(today, 30)) {
    return json({ error: 'INVALID_DATE_RANGE', message: 'Fixture discovery is limited to a date range of up to 15 days within the next 30 days.' }, 400);
  }

  const competitions = (taxonomy.competitions as SportsCompetition[]);
  const competition = competitions.find((item) =>
    item.status === 'ACTIVE'
    && item.sportCode.toUpperCase() === sportCode
    && item.code.toUpperCase() === competitionCode
  );
  if (!competition) return json({ error: 'COMPETITION_UNAVAILABLE', message: 'This competition is not active in the VAD sports catalogue.' }, 404);
  if (!competition.providerCode || !competition.providerCompetitionCode) {
    return json({
      error: 'PROVIDER_MAPPING_REQUIRED',
      message: 'Fixture importing is not configured for this competition yet. Configure an active fixture provider and its competition mapping in the Admin Sports Catalogue.',
      sportCode,
      competitionCode,
    }, 409);
  }

  const { data: providerRows, error: providerError } = await admin.rpc('internal_oracle_provider_catalog');
  if (providerError || !Array.isArray(providerRows)) return json({ error: 'PROVIDER_CATALOG_UNAVAILABLE', message: 'VAD could not load the configured sports provider.' }, 503);
  const provider = (providerRows as SportsProvider[]).find((item) =>
    item.code.toUpperCase() === String(competition.providerCode).toUpperCase()
    && item.environment === 'PRODUCTION'
    && ['ACTIVE', 'DEGRADED'].includes(item.status)
  );
  if (!provider) return json({ error: 'PROVIDER_UNAVAILABLE', message: 'The provider mapped to this competition is not active. Check provider status in Admin.' }, 503);

  const mappedResource = (provider.resources ?? []).some((resource) =>
    resource.status === 'ACTIVE'
    && resource.resourceType === 'SPORTS_COMPETITION'
    && (
      resource.canonicalKey.trim().toUpperCase() === sportCode + ':' + String(competition.providerCompetitionCode).trim().toUpperCase()
      || resource.externalKey.trim().toUpperCase() === String(competition.providerCompetitionCode).trim().toUpperCase()
    )
  );
  if (!mappedResource) return json({ error: 'PROVIDER_MAPPING_INACTIVE', message: 'The Oracle provider has no active competition resource for this mapping. Re-enable or repair the provider mapping in Admin before importing fixtures.' }, 409);

  const adapter = safeText(provider.adapter, 80).toUpperCase();
  // Every adapter has its own strict host and response contract. The first
  // adapter is Football-Data v4; future sports adapters can be added without
  // embedding fixture or competition lists in the mobile application.
  if (adapter !== 'FOOTBALL_DATA_V4' || sportCode !== 'FOOTBALL') {
    return json({ error: 'FIXTURE_ADAPTER_UNSUPPORTED', message: 'The configured provider has no fixture-discovery adapter for this sport yet. Its catalogue entry remains available, but fixture import is not enabled.' }, 409);
  }

  const secretReference = safeText(provider.secretReference, 120);
  const apiKey = secretReference ? Deno.env.get(secretReference)?.trim() : null;
  if (!apiKey) return json({ error: 'PROVIDER_CREDENTIAL_MISSING', message: 'The configured sports provider credential is not available in the secure Edge Function environment.' }, 503);

  let base: URL;
  try {
    base = new URL(safeText(provider.baseUrl, 500));
  } catch {
    return json({ error: 'PROVIDER_URL_INVALID', message: 'The sports provider URL is not configured correctly.' }, 503);
  }
  if (base.protocol !== 'https:' || base.hostname !== 'api.football-data.org') {
    return json({ error: 'PROVIDER_URL_NOT_ALLOWED', message: 'The configured Football-Data adapter must use its approved HTTPS API host.' }, 503);
  }
  base.pathname = base.pathname.replace(/\/+$/, '') + '/competitions/' + encodeURIComponent(String(competition.providerCompetitionCode)) + '/matches';
  base.search = '';
  base.searchParams.set('dateFrom', fromDate);
  base.searchParams.set('dateTo', toDate);
  const requestKey = [
    provider.code.toUpperCase(),
    sportCode,
    competition.code.toUpperCase(),
    fromDate,
    toDate,
  ].join(':');

  let stalePayload: JsonRecord | null = null;
  const { data: cached, error: cacheError } = await admin.rpc('internal_get_sports_fixture_cache', { p_request_key: requestKey });
  if (!cacheError && isRecord(cached) && isRecord(cached.payload)) {
    const payload = cached.payload as JsonRecord;
    const expiresAt = Date.parse(String(cached.expiresAt ?? ''));
    const staleUntil = Date.parse(String(cached.staleUntil ?? ''));
    if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
      if (!forceRefresh) {
        return json({ ...payload, cached: true }, 200, Math.max(15, Math.min(3600, safeNumber(payload.cacheSeconds, 900))));
      }
    } else if (Number.isFinite(staleUntil) && staleUntil > Date.now()) {
      stalePayload = payload;
    }
  }

  const publicMetadata = isRecord(provider.publicMetadata) ? provider.publicMetadata : {};
  const dailyLimit = Math.max(1, Math.min(10000, Math.floor(safeNumber(publicMetadata.fixture_requests_per_day, 100))));
  // The Football-Data free plan is limited to 10 calls/minute; default to 8
  // so VAD leaves headroom for other provider operations.
  const minuteLimit = Math.max(1, Math.min(9, Math.floor(safeNumber(publicMetadata.fixture_requests_per_minute, 8))));
  const { data: reserved, error: reserveError } = await admin.rpc('internal_reserve_sports_fixture_request', {
    p_provider_code: provider.code,
    p_daily_limit: dailyLimit,
    p_minute_limit: minuteLimit,
  });
  if (reserveError) return json({ error: 'REQUEST_LIMIT_CHECK_FAILED', message: 'VAD could not confirm the provider request budget. Please retry later.' }, 503);
  if (reserved !== true) {
    if (stalePayload) return json({ ...stalePayload, cached: true, stale: true }, 200, 15);
    return json({ error: 'PROVIDER_REQUEST_BUDGET_REACHED', message: 'VAD has reached the configured daily fixture-query budget for this provider. Try cached results later or adjust the limit in provider settings.' }, 429);
  }

  try {
    const payload = await fetchJson(base, apiKey);
    const rawMatches = Array.isArray(payload.matches) ? payload.matches as ProviderMatch[] : [];
    const fixtures = rawMatches
      .map((match) => normalizeFixture(match, provider, competition, base.toString()))
      .filter((fixture): fixture is NonNullable<ReturnType<typeof normalizeFixture>> => Boolean(fixture))
      .filter((fixture) => fixture.isUpcoming)
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
      .slice(0, 250);
    const now = new Date();
    const cacheSeconds = Math.max(30, Math.min(3600, Math.floor(safeNumber(publicMetadata.fixture_cache_seconds, 900))));
    const responsePayload = {
      ok: true,
      source: provider.name,
      sourceUrl: 'https://www.football-data.org/',
      purpose: 'FIXTURE_DISCOVERY_ONLY',
      sportCode,
      competitionCode,
      competitionName: competition.name,
      dateFrom: fromDate,
      dateTo: toDate,
      fetchedAt: now.toISOString(),
      cacheSeconds,
      cacheKey: requestKey,
      fixtures,
      cached: false,
      stale: false,
    };
    const staleSeconds = Math.max(0, Math.min(86400, Math.floor(safeNumber(publicMetadata.fixture_stale_seconds, 21600))));
    const { error: cacheWriteError } = await admin.rpc('internal_upsert_sports_fixture_cache', {
      p_request_key: requestKey,
      p_provider_code: provider.code,
      p_sport_code: sportCode,
      p_competition_code: competition.code,
      p_date_from: fromDate,
      p_date_to: toDate,
      p_payload: responsePayload,
      p_ttl_seconds: cacheSeconds,
      p_stale_seconds: staleSeconds,
    });
    if (cacheWriteError) console.warn('Sports fixture cache write failed:', cacheWriteError.code);
    return json(responsePayload, 200, cacheSeconds);
  } catch (error) {
    if (stalePayload) return json({ ...stalePayload, cached: true, stale: true }, 200, 15);
    const message = error instanceof Error ? error.message : 'The sports provider is temporarily unavailable.';
    const status = /rate limit/i.test(message) ? 429 : 502;
    return json({ error: 'FIXTURE_PROVIDER_FAILED', message }, status);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    return await handle(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sports fixture discovery failed.';
    const status = /sign in/i.test(message) ? 401 : /permission|administrator account|session/i.test(message) ? 403 : 500;
    return json({ error: 'FIXTURE_DISCOVERY_FAILED', message }, status);
  }
});
