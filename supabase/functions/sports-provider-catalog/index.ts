import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

type JsonRecord = Record<string, unknown>;
type Provider = {
  id: number;
  code: string;
  name: string;
  environment: string;
  status: string;
  priority: number;
  adapter?: string | null;
  baseUrl?: string | null;
  secretReference?: string | null;
  publicMetadata?: JsonRecord;
  capabilities?: string[];
};

const json = (body: unknown, status = 200, cacheSeconds = 0) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    'Content-Type': 'application/json',
    'Cache-Control': cacheSeconds > 0 ? 'private, max-age=15, s-maxage=' + cacheSeconds : 'no-store',
  },
});

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function safeText(value: unknown, max = 180): string {
  return typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f]/g, '').slice(0, max) : '';
}
function safeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function records(value: unknown, keys: string[]): JsonRecord[] {
  if (!isRecord(value)) return [];
  for (const key of keys) {
    if (Array.isArray(value[key])) return (value[key] as unknown[]).filter(isRecord);
  }
  return [];
}
function slug(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 70);
}
function sportCodeFor(name: string): string {
  return name.trim().toLowerCase() === 'soccer' ? 'FOOTBALL' : slug(name);
}
function dateOnly(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}
function plusDays(input: string, days: number): string {
  const value = new Date(input + 'T00:00:00.000Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function metadata(provider: Provider): JsonRecord {
  return isRecord(provider.publicMetadata) ? provider.publicMetadata : {};
}
function isConfiguredProvider(provider: Provider): boolean {
  const adapter = safeText(provider.adapter, 80).toUpperCase();
  if (!['FOOTBALL_DATA_V4', 'THESPORTSDB_V1'].includes(adapter)) return false;
  if (provider.environment !== 'PRODUCTION' || !['ACTIVE', 'DEGRADED'].includes(provider.status)) return false;
  if (provider.capabilities && !provider.capabilities.includes('SPORTS_FIXTURE_DISCOVERY')) return false;
  if (metadata(provider).fixture_discovery_enabled === false || metadata(provider).configured === false) return false;
  if (adapter === 'THESPORTSDB_V1') return Boolean(provider.baseUrl);
  return Boolean(provider.secretReference && provider.baseUrl && Deno.env.get(provider.secretReference)?.trim());
}
function providerUrl(provider: Provider, path: string, query: Record<string, string> = {}): URL {
  const base = new URL(safeText(provider.baseUrl, 600));
  const adapter = safeText(provider.adapter, 80).toUpperCase();
  if (base.protocol !== 'https:') throw new Error('Sports provider endpoints must use HTTPS.');
  if (adapter === 'FOOTBALL_DATA_V4' && base.hostname !== 'api.football-data.org') {
    throw new Error('Football-Data requests are restricted to its approved HTTPS host.');
  }
  if (adapter === 'THESPORTSDB_V1' && base.hostname !== 'www.thesportsdb.com') {
    throw new Error('TheSportsDB requests are restricted to its approved HTTPS host.');
  }
  base.pathname = base.pathname.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
  base.search = '';
  for (const [key, value] of Object.entries(query)) {
    if (value) base.searchParams.set(key, value);
  }
  return base;
}
async function externalJson(provider: Provider, url: URL): Promise<JsonRecord> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (safeText(provider.adapter, 80).toUpperCase() === 'FOOTBALL_DATA_V4') {
      const apiKey = provider.secretReference ? Deno.env.get(provider.secretReference)?.trim() : '';
      if (!apiKey) throw new Error('Football-Data credentials are not configured in the secure Edge Function environment.');
      headers['X-Auth-Token'] = apiKey;
    }
    const response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 429) throw new Error('The provider rate limit was reached. Use cached options or retry later.');
      if (response.status === 401 || response.status === 403) throw new Error('The provider rejected its configured credential.');
      throw new Error('The provider returned HTTP ' + response.status + '.');
    }
    if (!isRecord(payload)) throw new Error('The provider returned invalid JSON.');
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
  if (!token) throw new Error('Sign in with an administrator account to browse sports data.');
  if (!url || !anon || !service) throw new Error('Sports provider discovery is not configured.');
  const user = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await user.auth.getUser(token);
  if (authError || !authData.user) throw new Error('Your administrator session is invalid or expired.');
  const { error: permissionError } = await user.rpc('get_sports_market_catalog');
  if (permissionError) throw new Error('Sports catalogue access is unavailable; check market-management permission.');
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc('internal_oracle_provider_catalog');
  if (error || !Array.isArray(data)) throw new Error('VAD could not load the provider registry.');
  return { admin, providers: (data as Provider[]).filter(isConfiguredProvider) };
}
async function cachedFetch(
  admin: any, provider: Provider, key: string, sportCode: string, competitionCode: string,
  from: string, to: string, loader: () => Promise<JsonRecord>, defaultTtl: number, forceRefresh: boolean,
) {
  const { data: cached } = await admin.rpc('internal_get_sports_fixture_cache', { p_request_key: key });
  if (!forceRefresh && isRecord(cached) && isRecord(cached.payload)) {
    const expires = Date.parse(safeText(cached.expiresAt, 80));
    if (Number.isFinite(expires) && expires > Date.now()) {
      return { payload: cached.payload, cached: true, stale: false, ttl: Math.max(30, Math.min(86400, safeNumber(cached.payload.cacheSeconds, defaultTtl))) };
    }
  }
  const meta = metadata(provider);
  const dailyLimit = Math.max(1, Math.min(10000, Math.floor(safeNumber(meta.fixture_requests_per_day, 80))));
  const minuteLimit = Math.max(1, Math.min(9, Math.floor(safeNumber(meta.fixture_requests_per_minute, 6))));
  const { data: reserved, error: reserveError } = await admin.rpc('internal_reserve_sports_fixture_request', {
    p_provider_code: provider.code, p_daily_limit: dailyLimit, p_minute_limit: minuteLimit,
  });
  if (reserveError || reserved !== true) {
    if (isRecord(cached) && isRecord(cached.payload)) {
      const stale = Date.parse(safeText(cached.staleUntil, 80));
      if (Number.isFinite(stale) && stale > Date.now()) return { payload: cached.payload, cached: true, stale: true, ttl: 30 };
    }
    throw new Error('The provider request budget is exhausted or unavailable. Reuse cached results or try later.');
  }
  try {
    const payload = await loader();
    const ttl = Math.max(30, Math.min(86400, Math.floor(safeNumber(payload.cacheSeconds, defaultTtl))));
    const staleSeconds = Math.max(0, Math.min(604800, Math.floor(safeNumber(meta.fixture_catalog_stale_seconds, 86400))));
    const { error } = await admin.rpc('internal_upsert_sports_fixture_cache', {
      p_request_key: key, p_provider_code: provider.code, p_sport_code: sportCode || 'CATALOG',
      p_competition_code: competitionCode || 'CATALOG', p_date_from: from, p_date_to: to,
      p_payload: payload, p_ttl_seconds: ttl, p_stale_seconds: staleSeconds,
    });
    if (error) throw new Error('VAD could not safely cache the provider response.');
    return { payload, cached: false, stale: false, ttl };
  } catch (error) {
    if (isRecord(cached) && isRecord(cached.payload)) {
      const stale = Date.parse(safeText(cached.staleUntil, 80));
      if (Number.isFinite(stale) && stale > Date.now()) return { payload: cached.payload, cached: true, stale: true, ttl: 30 };
    }
    throw error;
  }
}
function cacheDates() {
  return { from: '2000-01-01', to: '9999-12-31' };
}
function cacheKey(providerCode: string, label: string) {
  return 'CATALOG:' + providerCode + ':' + slug(label || 'LIST') + ':2000-01-01:9999-12-31';
}
function seasonFromEvent(event: JsonRecord): string {
  return safeText(event.idSeason, 80) || safeText(event.strSeason, 80) || safeText(event.season, 80);
}
function eventKickoff(event: JsonRecord): Date | null {
  const timestamp = safeText(event.strTimestamp, 60);
  if (timestamp) {
    const fromTimestamp = new Date(timestamp);
    if (Number.isFinite(fromTimestamp.getTime())) return fromTimestamp;
  }
  const date = safeText(event.dateEvent, 20);
  const time = safeText(event.strTime, 20);
  if (!date) return null;
  const parsed = new Date(date + 'T' + (time && /^\d{2}:\d{2}(:\d{2})?$/.test(time) ? time : '12:00:00') + 'Z');
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
function normalizeFootballDataMatch(match: JsonRecord, provider: Provider, sportCode: string, competitionCode: string, competitionName: string, seasonCode: string) {
  const home = isRecord(match.homeTeam) ? match.homeTeam : {};
  const away = isRecord(match.awayTeam) ? match.awayTeam : {};
  const kickoff = new Date(safeText(match.utcDate, 80));
  const status = safeText(match.status, 40).toUpperCase();
  if (!match.id || !safeText(home.name, 160) || !safeText(away.name, 160) || !Number.isFinite(kickoff.getTime())) return null;
  if (!['SCHEDULED', 'TIMED'].includes(status) || kickoff.getTime() <= Date.now()) return null;
  return {
    fixtureId: String(match.id), providerCode: provider.code, providerCompetitionCode: competitionCode,
    sportCode, competitionCode, competitionName, seasonCode,
    homeTeam: safeText(home.name, 160), homeTeamShortName: safeText(home.shortName, 100) || null,
    awayTeam: safeText(away.name, 160), awayTeamShortName: safeText(away.shortName, 100) || null,
    startsAt: kickoff.toISOString(), status, matchday: safeNumber(match.matchday, 0) || null,
    stage: safeText(match.stage, 100) || null, venue: safeText(match.venue, 180) || null,
    sourceName: provider.name, sourceUrl: safeText(metadata(provider).attribution_url, 400) || 'https://www.football-data.org/',
    isUpcoming: true,
  };
}
function normalizeSportsDbEvent(event: JsonRecord, provider: Provider, sportCode: string, competitionCode: string, competitionName: string, seasonCode: string) {
  const id = safeText(event.idEvent, 120);
  const home = safeText(event.strHomeTeam, 160);
  const away = safeText(event.strAwayTeam, 160);
  const kickoff = eventKickoff(event);
  if (!id || !home || !away || !kickoff || kickoff.getTime() <= Date.now()) return null;
  return {
    fixtureId: id, providerCode: provider.code, providerCompetitionCode: competitionCode,
    sportCode, competitionCode, competitionName, seasonCode,
    homeTeam: home, homeTeamShortName: safeText(event.strHomeTeamShort, 100) || null,
    awayTeam: away, awayTeamShortName: safeText(event.strAwayTeamShort, 100) || null,
    startsAt: kickoff.toISOString(), status: 'SCHEDULED', matchday: null,
    stage: safeText(event.intRound, 80) || safeText(event.strRound, 80) || null,
    venue: safeText(event.strVenue, 180) || null,
    sourceName: provider.name, sourceUrl: safeText(metadata(provider).attribution_url, 400) || 'https://www.thesportsdb.com/',
    isUpcoming: true,
  };
}

async function handle(req: Request) {
  const { admin, providers } = await authenticate(req);
  let body: JsonRecord;
  try {
    const parsed = await req.json();
    if (!isRecord(parsed)) return json({ error: 'INVALID_BODY', message: 'Request body must be an object.' }, 400);
    body = parsed;
  } catch {
    return json({ error: 'INVALID_BODY', message: 'Request body must be valid JSON.' }, 400);
  }
  const action = safeText(body.action, 40).toLowerCase();
  const providerCode = safeText(body.providerCode, 80).toUpperCase();
  const provider = providers.find((item) => item.code.toUpperCase() === providerCode);
  if (action !== 'providers' && !provider) return json({ error: 'PROVIDER_UNAVAILABLE', message: 'Choose an active configured sports-data provider.' }, 404);

  if (action === 'providers') {
    return json({
      ok: true, providers: providers.map((item) => ({
        code: item.code, name: item.name, adapter: item.adapter,
        sourceUrl: safeText(metadata(item).attribution_url, 400) || safeText(item.baseUrl, 400),
        note: item.code === 'THESPORTSDB'
          ? 'Free multi-sport provider. Coverage and request limits vary by sport; VAD caches results.'
          : 'Provider availability and competition access depend on the configured API plan.',
      })),
    });
  }
  if (!provider) return json({ error: 'PROVIDER_UNAVAILABLE', message: 'Choose an active configured sports-data provider.' }, 404);

  const adapter = safeText(provider.adapter, 80).toUpperCase();
  const sportCode = safeText(body.sportCode, 80).toUpperCase();
  const providerSportCode = safeText(body.providerSportCode, 120);
  const competitionCode = safeText(body.competitionCode, 120);
  const competitionName = safeText(body.competitionName, 160);
  const seasonCode = safeText(body.seasonCode, 120);
  const countryCode = safeText(body.countryCode, 100);
  const forceRefresh = body.forceRefresh === true;
  const meta = metadata(provider);
  const sourceUrl = safeText(meta.attribution_url, 400) || safeText(provider.baseUrl, 400);
  const catalogs = cacheDates();

  if (action === 'sports') {
    const key = cacheKey(provider.code, 'SPORTS');
    try {
      const result = await cachedFetch(admin, provider, key, 'CATALOG', 'SPORTS', catalogs.from, catalogs.to, async () => {
        let sports: JsonRecord[];
        if (adapter === 'FOOTBALL_DATA_V4') {
          sports = [{ code: 'FOOTBALL', name: 'Football', providerSportCode: 'Soccer' }];
        } else {
          const payload = await externalJson(provider, providerUrl(provider, 'all_sports.php'));
          sports = records(payload, ['sports']).map((row) => {
            const name = safeText(row.strSport, 120);
            return { code: sportCodeFor(name), name, providerSportCode: name };
          }).filter((row) => row.name);
        }
        return { ok: true, action, providerCode: provider.code, source: provider.name, sourceUrl, cacheSeconds: Math.max(300, safeNumber(meta.fixture_catalog_cache_seconds, 21600)), sports };
      }, 21600, forceRefresh);
      return json({ ...result.payload, cached: result.cached, stale: result.stale }, 200, result.ttl);
    } catch (error) {
      return json({ error: 'SPORTS_CATALOG_FAILED', message: error instanceof Error ? error.message : 'Sports list could not be loaded.' }, 502);
    }
  }

  if (action === 'competitions') {
    if (!sportCode || !providerSportCode) return json({ error: 'SPORT_REQUIRED', message: 'Choose a sport first.' }, 400);
    const key = cacheKey(provider.code, 'COMPETITIONS_' + sportCode + '_' + providerSportCode + '_' + countryCode);
    try {
      const result = await cachedFetch(admin, provider, key, sportCode, 'COMPETITIONS', catalogs.from, catalogs.to, async () => {
        let competitions: JsonRecord[];
        if (adapter === 'FOOTBALL_DATA_V4') {
          const payload = await externalJson(provider, providerUrl(provider, 'competitions', countryCode ? { areas: countryCode } : {}));
          competitions = records(payload, ['competitions']).map((row) => {
            const current = isRecord(row.currentSeason) ? row.currentSeason : {};
            const area = isRecord(row.area) ? row.area : {};
            const code = safeText(row.code, 100) || (row.id == null ? '' : String(row.id));
            return {
              code, name: safeText(row.name, 160), region: safeText(area.name, 120),
              providerCompetitionCode: code, providerSportCode: 'Soccer',
              currentSeasonCode: safeText(current.startDate, 20).slice(0, 4),
              currentSeasonStart: safeText(current.startDate, 20) || null,
              currentSeasonEnd: safeText(current.endDate, 20) || null,
            };
          }).filter((row) => row.code && row.name);
        } else {
          const query: Record<string, string> = { s: providerSportCode };
          if (countryCode) query.c = countryCode;
          const payload = await externalJson(provider, providerUrl(provider, 'search_all_leagues.php', query));
          competitions = records(payload, ['countries', 'leagues']).map((row) => {
            const code = safeText(row.idLeague, 120);
            return {
              code, name: safeText(row.strLeague, 160), region: safeText(row.strCountry, 120),
              providerCompetitionCode: code, providerSportCode,
              format: safeText(row.strSport, 100), badgeUrl: safeText(row.strBadge, 500) || null,
            };
          }).filter((row) => row.code && row.name);
        }
        return { ok: true, action, providerCode: provider.code, sportCode, providerSportCode, source: provider.name, sourceUrl, cacheSeconds: Math.max(300, safeNumber(meta.fixture_catalog_cache_seconds, 21600)), competitions };
      }, 21600, forceRefresh);
      return json({ ...result.payload, cached: result.cached, stale: result.stale }, 200, result.ttl);
    } catch (error) {
      return json({ error: 'COMPETITIONS_CATALOG_FAILED', message: error instanceof Error ? error.message : 'Competitions could not be loaded.' }, 502);
    }
  }

  if (action === 'seasons') {
    if (!competitionCode) return json({ error: 'COMPETITION_REQUIRED', message: 'Choose a competition first.' }, 400);
    const key = cacheKey(provider.code, 'SEASONS_' + sportCode + '_' + competitionCode);
    try {
      const result = await cachedFetch(admin, provider, key, sportCode || 'CATALOG', 'SEASONS', catalogs.from, catalogs.to, async () => {
        let seasons: JsonRecord[];
        if (adapter === 'FOOTBALL_DATA_V4') {
          const payload = await externalJson(provider, providerUrl(provider, 'competitions/' + encodeURIComponent(competitionCode)));
          const values = [
            ...(Array.isArray(payload.seasons) ? payload.seasons.filter(isRecord) : []),
            ...(isRecord(payload.currentSeason) ? [payload.currentSeason] : []),
          ];
          const unique = new Map<string, JsonRecord>();
          for (const row of values) {
            const start = safeText(row.startDate, 20);
            const end = safeText(row.endDate, 20);
            const code = start.slice(0, 4) || safeText(row.id, 40);
            if (code) unique.set(code, { code, name: start && end ? start.slice(0, 4) + '/' + end.slice(2, 4) : code, startsAt: start || null, endsAt: end || null, current: isRecord(payload.currentSeason) && safeText(payload.currentSeason.id, 40) === safeText(row.id, 40) });
          }
          seasons = [...unique.values()].sort((a, b) => String(b.code).localeCompare(String(a.code)));
        } else {
          const payload = await externalJson(provider, providerUrl(provider, 'search_all_seasons.php', { id: competitionCode }));
          seasons = records(payload, ['seasons']).map((row) => {
            const name = safeText(row.strSeason, 100);
            return { code: safeText(row.idSeason, 100) || name, name, seasonLabel: name, current: false };
          }).filter((row) => row.code && row.name).sort((a, b) => String(b.name).localeCompare(String(a.name)));
          if (seasons.length) {
            const year = String(new Date().getUTCFullYear());
            const current = seasons.findIndex((row) => String(row.name).includes(year));
            const chosen = current >= 0 ? current : 0;
            seasons = seasons.map((row, index) => ({ ...row, current: index === chosen }));
          }
        }
        return { ok: true, action, providerCode: provider.code, sportCode, competitionCode, source: provider.name, sourceUrl, cacheSeconds: Math.max(1800, safeNumber(meta.fixture_catalog_cache_seconds, 21600)), seasons };
      }, 86400, forceRefresh);
      return json({ ...result.payload, cached: result.cached, stale: result.stale }, 200, result.ttl);
    } catch (error) {
      return json({ error: 'SEASONS_CATALOG_FAILED', message: error instanceof Error ? error.message : 'Seasons could not be loaded.' }, 502);
    }
  }

  if (action === 'fixtures') {
    const fromDate = dateOnly(body.fromDate) || new Date().toISOString().slice(0, 10);
    const toDate = dateOnly(body.toDate) || plusDays(fromDate, 14);
    if (!sportCode || !competitionCode || !seasonCode) return json({ error: 'FIXTURE_SELECTION_REQUIRED', message: 'Choose a sport, league and season.' }, 400);
    if (fromDate < new Date().toISOString().slice(0, 10) || toDate < fromDate || toDate > plusDays(fromDate, 30) || toDate > plusDays(new Date().toISOString().slice(0, 10), 45)) {
      return json({ error: 'INVALID_DATE_RANGE', message: 'Fixture lookup must use a future date range of up to 31 days.' }, 400);
    }
    const key = provider.code.toUpperCase() + ':' + sportCode + ':' + slug(competitionCode + '_' + seasonCode) + ':' + fromDate + ':' + toDate;
    try {
      const result = await cachedFetch(admin, provider, key, sportCode, competitionCode + '_' + seasonCode, fromDate, toDate, async () => {
        let fixtures: JsonRecord[];
        if (adapter === 'FOOTBALL_DATA_V4') {
          const query: Record<string, string> = { dateFrom: fromDate, dateTo: toDate, season: seasonCode };
          const payload = await externalJson(provider, providerUrl(provider, 'competitions/' + encodeURIComponent(competitionCode) + '/matches', query));
          fixtures = records(payload, ['matches']).map((row) => normalizeFootballDataMatch(row, provider, sportCode, competitionCode, competitionName || safeText((isRecord(row.competition) ? row.competition.name : ''), 160), seasonCode)).filter((row) => row !== null);
        } else {
          const payload = await externalJson(provider, providerUrl(provider, 'eventsseason.php', { id: seasonCode }));
          fixtures = records(payload, ['events']).map((row) => normalizeSportsDbEvent(row, provider, sportCode, competitionCode, competitionName || safeText(row.strLeague, 160), seasonCode)).filter((row) => row !== null);
        }
        fixtures = fixtures.filter((row) => Date.parse(String(row.startsAt)) >= Date.parse(fromDate + 'T00:00:00Z') && Date.parse(String(row.startsAt)) < Date.parse(plusDays(toDate, 1) + 'T00:00:00Z')).sort((a, b) => Date.parse(String(a.startsAt)) - Date.parse(String(b.startsAt))).slice(0, 250);
        return { ok: true, action, providerCode: provider.code, source: provider.name, sourceUrl, purpose: 'FIXTURE_DISCOVERY_ONLY', sportCode, competitionCode, competitionName, seasonCode, fromDate, toDate, fetchedAt: new Date().toISOString(), cacheSeconds: Math.max(60, Math.min(3600, safeNumber(meta.fixture_cache_seconds, 900))), fixtures, cached: false, stale: false };
      }, 900, forceRefresh);
      const payload = { ...result.payload, cacheKey: key, cached: result.cached, stale: result.stale };
      return json(payload, 200, result.ttl);
    } catch (error) {
      return json({ error: 'FIXTURES_CATALOG_FAILED', message: error instanceof Error ? error.message : 'Upcoming fixtures could not be loaded.' }, 502);
    }
  }
  return json({ error: 'INVALID_ACTION', message: 'Choose providers, sports, competitions, seasons or fixtures.' }, 400);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    return await handle(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sports provider catalogue failed.';
    const status = /sign in/i.test(message) ? 401 : /permission|administrator account|session/i.test(message) ? 403 : 500;
    return json({ error: 'SPORTS_PROVIDER_CATALOG_FAILED', message }, status);
  }
});
