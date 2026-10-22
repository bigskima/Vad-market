import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
type Row = Record<string, unknown>;

function isRecord(value: unknown): value is Row {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function int(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}
function at(value: unknown, path: string[]): Row | null {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return isRecord(current) ? current : null;
}
function first(...values: unknown[]): string {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim();
  return '';
}
function iso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
function dateOnly(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}
async function fetchTimeout(url: string, init: RequestInit, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
function runtimeCredentials() {
  const url = Deno.env.get('SUPABASE_URL')?.trim();
  const anon = (Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY'))?.trim();
  const service = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY'))?.trim();
  if (!url || !anon || !service) throw new Error('Supabase runtime configuration is missing.');
  return { url, anon, service };
}
async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw json({ error: 'AUTH_REQUIRED', message: 'Sign in with a VAD admin account.' }, 401);
  const cfg = runtimeCredentials();
  const auth = createClient(cfg.url, cfg.anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) throw json({ error: 'AUTH_INVALID', message: 'Your session is not valid. Sign in again.' }, 401);
  const user = createClient(cfg.url, cfg.anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(cfg.url, cfg.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: permissionError } = await user.rpc('admin_guided_market_catalog');
  if (permissionError) throw json({ error: 'MARKET_MANAGEMENT_PERMISSION_REQUIRED', message: 'Market management permission is required.' }, 403);
  return { user, admin, userId: data.user.id };
}
function safeBaseUrl(value: unknown, adapter: string): string {
  let parsed: URL;
  try { parsed = new URL(text(value)); }
  catch { throw new Error('The fixture provider has no valid base URL.'); }
  if (parsed.protocol !== 'https:') throw new Error('Fixture providers must use HTTPS.');
  const host = parsed.hostname.toLowerCase();
  if (adapter === 'FOOTBALL_DATA_V4' && host !== 'api.football-data.org') {
    throw new Error('Football-Data URL is not on the approved provider host.');
  }
  if (adapter === 'API_SPORTS_V3' && host !== 'api-sports.io' && !host.endsWith('.api-sports.io')) {
    throw new Error('API-Sports URL is not on an approved provider host.');
  }
  if (adapter !== 'FOOTBALL_DATA_V4' && adapter !== 'API_SPORTS_V3') throw new Error('Unsupported fixture adapter: ' + adapter);
  return parsed.toString().replace(/\/$/, '');
}
function safePath(value: unknown, fallback: string): string {
  const path = text(value, fallback);
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || path.includes('://')) {
    throw new Error('Invalid fixture API path configuration.');
  }
  return path;
}
function normalizeFootballData(item: Row, config: Row) {
  const home = at(item, ['homeTeam']), away = at(item, ['awayTeam']);
  const competition = at(item, ['competition']), fullTime = at(item, ['score', 'fullTime']);
  const eventId = item.id === undefined || item.id === null ? '' : String(item.id);
  const startsAt = iso(item.utcDate);
  const a = first(home?.name), b = first(away?.name);
  if (!eventId || !startsAt || !a || !b) return null;
  const sportCode = text(config.sportCode).toUpperCase();
  const compCode = text(config.competitionCode).toUpperCase();
  const base = text(config.providerBaseUrl).replace(/\/$/, '');
  return {
    externalEventId: eventId, sportCode, competitionCode: compCode,
    competitionName: first(competition?.name, config.competitionName),
    eventName: a + ' vs ' + b, participantA: a, participantB: b, startsAt,
    status: first(item.status, 'SCHEDULED').toUpperCase(),
    scoreA: int(fullTime?.home), scoreB: int(fullTime?.away),
    season: text(at(item, ['season'])?.startDate),
    roundLabel: item.matchday ? 'Matchday ' + String(item.matchday) : '',
    venue: text(item.venue),
    sourceUrl: base + '/matches/' + encodeURIComponent(eventId),
    normalizedPayload: {
      adapter: 'FOOTBALL_DATA_V4', providerCompetitionId: competition?.id ?? null,
      homeTeamId: home?.id ?? null, awayTeamId: away?.id ?? null, kickoffUtc: startsAt,
    },
    rawPayload: item,
  };
}
function normalizeApiSports(item: Row, config: Row) {
  const fixture = at(item, ['fixture']) ?? at(item, ['game']) ?? item;
  const teams = at(item, ['teams']);
  const home = at(teams, ['home']) ?? at(item, ['homeTeam']);
  const away = at(teams, ['away']) ?? at(teams, ['visitors']) ?? at(item, ['awayTeam']);
  const score = at(item, ['score']) ?? at(item, ['scores']);
  const scoreAObject = score ? at(score, ['home']) : null;
  const scoreBObject = score ? at(score, ['away']) ?? at(score, ['visitors']) : null;
  const id = first(fixture?.id === undefined ? '' : String(fixture.id), item.id === undefined ? '' : String(item.id), item.gameId === undefined ? '' : String(item.gameId));
  const dateValue = first(typeof fixture?.date === 'string' ? fixture.date : '', typeof at(fixture, ['date'])?.start === 'string' ? String(at(fixture, ['date'])?.start) : '', typeof item.date === 'string' ? item.date : '', typeof item.startsAt === 'string' ? item.startsAt : '');
  const startsAt = iso(dateValue), a = first(home?.name, home?.nickname, item.participantA), b = first(away?.name, away?.nickname, item.participantB);
  if (!id || !startsAt || !a || !b) return null;
  const league = at(item, ['league']), status = at(fixture, ['status']);
  const scoreA = scoreAObject?.total ?? scoreAObject?.points ?? item.scoreA;
  const scoreB = scoreBObject?.total ?? scoreBObject?.points ?? item.scoreB;
  const base = text(config.providerBaseUrl).replace(/\/$/, '');
  const path = safePath(config.apiPath, '/fixtures');
  return {
    externalEventId: id, sportCode: text(config.sportCode).toUpperCase(),
    competitionCode: text(config.competitionCode).toUpperCase(),
    competitionName: first(league?.name, item.competitionName, config.competitionName),
    eventName: a + ' vs ' + b, participantA: a, participantB: b, startsAt,
    status: first(status?.short, status?.long, item.status, 'SCHEDULED').toUpperCase(),
    scoreA: int(scoreA), scoreB: int(scoreB),
    season: first(league?.season === undefined ? '' : String(league.season), text(item.season)),
    roundLabel: first(league?.round, item.round, item.week),
    venue: first(at(fixture, ['venue'])?.name, item.venue),
    sourceUrl: base + path,
    normalizedPayload: { adapter: 'API_SPORTS_V3', providerFixtureId: id, providerCompetitionId: league?.id ?? null, kickoffUtc: startsAt },
    rawPayload: item,
  };
}
async function fetchFootballData(config: Row, key: string, from: string, to: string) {
  const base = safeBaseUrl(config.providerBaseUrl, 'FOOTBALL_DATA_V4');
  const path = safePath(config.apiPath, '/competitions/' + encodeURIComponent(text(config.fixtureCompetitionCode)) + '/matches');
  const url = new URL(base + path);
  url.searchParams.set('dateFrom', from);
  url.searchParams.set('dateTo', to);
  url.searchParams.set('status', 'SCHEDULED,TIMED,IN_PLAY,PAUSED,POSTPONED');
  const response = await fetchTimeout(url.toString(), { headers: { 'X-Auth-Token': key, Accept: 'application/json' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 429) throw new Error('Football-Data.org request limit reached. Retry later; cached fixtures are still available.');
    if (response.status === 401 || response.status === 403) throw new Error('Football-Data.org rejected the credential. Configure FOOTBALL_DATA_API_KEY in Supabase Edge Function secrets.');
    throw new Error('Football-Data.org returned HTTP ' + response.status + '.');
  }
  const rows = Array.isArray(payload?.matches) ? payload.matches : [];
  const normalized = rows.filter(isRecord).map((row: Row) => normalizeFootballData(row, config)).filter((row: unknown) => Boolean(row));
  return { normalized, rawCount: rows.length };
}
async function fetchApiSports(config: Row, key: string, from: string, to: string) {
  const base = safeBaseUrl(config.providerBaseUrl, 'API_SPORTS_V3');
  const path = safePath(config.apiPath, '/fixtures');
  const url = new URL(base + path);
  const params = isRecord(config.queryParameters) ? config.queryParameters : {};
  const compParam = text(config.competitionParam, 'league');
  if (text(config.fixtureCompetitionCode)) url.searchParams.set(compParam, text(config.fixtureCompetitionCode));
  const seasonParam = text(config.seasonParam, 'season'), season = text(config.season);
  if (season) url.searchParams.set(seasonParam, season);
  url.searchParams.set(text(config.fromParam, 'from'), from);
  url.searchParams.set(text(config.toParam, 'to'), to);
  for (const [name, value] of Object.entries(params)) {
    if (/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(name) && (typeof value === 'string' || typeof value === 'number')) url.searchParams.set(name, String(value));
  }
  const response = await fetchTimeout(url.toString(), { headers: { 'x-apisports-key': key, Accept: 'application/json' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 429) throw new Error('API-Sports request quota reached. Cached fixtures are still available.');
    if (response.status === 401 || response.status === 403) throw new Error('API-Sports rejected its API key. Configure API_SPORTS_KEY in Supabase Edge Function secrets.');
    throw new Error('API-Sports returned HTTP ' + response.status + '.');
  }
  if (Array.isArray(payload?.errors) && payload.errors.length) throw new Error('API-Sports reported a configuration error; check its league, season, base URL and API path.');
  const rows = Array.isArray(payload?.response) ? payload.response : [];
  const normalized = rows.filter(isRecord).map((row: Row) => normalizeApiSports(row, config)).filter((row: unknown) => Boolean(row));
  return { normalized, rawCount: rows.length };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  let auth;
  try { auth = await requireAdmin(req); }
  catch (error) {
    if (error instanceof Response) return error;
    return json({ error: error instanceof Error ? error.message : 'Admin authentication failed.' }, 500);
  }

  try {
    const body: unknown = await req.json();
    if (!isRecord(body)) return json({ error: 'INVALID_BODY', message: 'Request body must be an object.' }, 400);
    const sportCode = text(body.sportCode).toUpperCase(), competitionCode = text(body.competitionCode).toUpperCase();
    const from = dateOnly(body.dateFrom), to = dateOnly(body.dateTo);
    if (!sportCode || !competitionCode || !from || !to) return json({ error: 'INVALID_QUERY', message: 'Choose a sport, competition and valid dates.' }, 400);
    const days = (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000;
    if (days < 0 || days > 60) return json({ error: 'INVALID_DATE_RANGE', message: 'Choose a date range of 60 days or less.' }, 400);

    const { data: runtime, error: runtimeError } = await auth.admin.rpc('get_market_builder_competition_runtime', { p_sport_code: sportCode, p_competition_code: competitionCode });
    if (runtimeError) return json({ error: 'COMPETITION_LOOKUP_FAILED', message: 'VAD could not load this competition mapping.' }, 502);
    if (!isRecord(runtime)) return json({ error: 'COMPETITION_NOT_FOUND', message: 'This active competition is not in VAD’s database catalog.' }, 404);

    const providerCode = text(runtime.fixtureProviderCode).toUpperCase(), providerStatus = text(runtime.providerStatus).toUpperCase();
    const adapter = text(runtime.fixtureAdapter).toUpperCase();
    const capabilities = Array.isArray(runtime.providerCapabilities) ? runtime.providerCapabilities.map((v) => text(v).toUpperCase()) : [];
    if (!providerCode || !adapter) return json({ error: 'FIXTURE_PROVIDER_NOT_MAPPED', message: 'This competition is in the catalogue but has no fixture provider mapping yet. Configure a fixture provider in Admin → Providers.' }, 409);
    if (!['ACTIVE', 'DEGRADED'].includes(providerStatus) || !capabilities.includes('SPORTS_FIXTURE_DISCOVERY')) {
      return json({ error: 'FIXTURE_PROVIDER_NOT_ACTIVE', message: providerCode + ' is disabled for fixture discovery. Cached events, if any, can still be viewed.' }, 409);
    }
    const secretReference = text(runtime.secretReference), apiKey = secretReference ? Deno.env.get(secretReference)?.trim() : '';
    if (!apiKey) return json({ error: 'PROVIDER_CREDENTIAL_MISSING', message: providerCode + ' is active but its server-side credential ' + (secretReference || '(not configured)') + ' is missing.' }, 409);

    const providerMetadata = isRecord(runtime.providerMetadata) ? runtime.providerMetadata : {};
    const fixtureConfig = isRecord(runtime.fixtureConfig) ? runtime.fixtureConfig : {};
    const config: Row = {
      ...fixtureConfig,
      sportCode,
      competitionCode,
      competitionName: text(runtime.competitionName),
      fixtureCompetitionCode: text(runtime.fixtureCompetitionCode),
      providerBaseUrl: text(fixtureConfig.base_url, text(providerMetadata.base_url, text(runtime.providerBaseUrl))),
    };

    let fetched: { normalized: unknown[]; rawCount: number };
    if (adapter === 'FOOTBALL_DATA_V4') fetched = await fetchFootballData(config, apiKey, from, to);
    else if (adapter === 'API_SPORTS_V3') fetched = await fetchApiSports(config, apiKey, from, to);
    else return json({ error: 'UNSUPPORTED_FIXTURE_ADAPTER', message: 'Fixture adapter ' + adapter + ' is not installed.' }, 409);

    const { data: upserted, error: upsertError } = await auth.admin.rpc('upsert_market_provider_events', {
      p_provider_code: providerCode, p_sport_code: sportCode, p_competition_code: competitionCode, p_events: fetched.normalized,
    });
    if (upsertError) return json({ error: 'EVENT_CACHE_WRITE_FAILED', message: 'Fixtures were fetched but could not be cached in VAD.' }, 502);
    const limit = Math.max(1, Math.min(200, Math.floor(typeof body.limit === 'number' ? body.limit : 100)));
    const search = typeof body.search === 'string' ? body.search.slice(0, 120).trim() : null;
    const { data: catalog, error: catalogError } = await auth.user.rpc('admin_list_market_provider_events', {
      p_sport_code: sportCode, p_competition_code: competitionCode, p_from_date: from, p_to_date: to, p_search: search, p_limit: limit,
    });
    if (catalogError) return json({ error: 'EVENT_CACHE_READ_FAILED', message: 'The fixture cache was updated, but the events could not be listed.' }, 502);
    const details = isRecord(catalog) ? catalog : { events: [] };
    return json({
      ok: true, source: providerCode, adapter, sportCode, competitionCode, providerEventCount: fetched.rawCount,
      importedCount: int(upserted) ?? fetched.normalized.length, fetchedAt: new Date().toISOString(),
      dataPurpose: 'FIXTURE_DISCOVERY_ONLY', settlementAuthority: 'VAD_ORACLE_POLICY', ...details,
    });
  } catch (error) {
    return json({ error: 'PROVIDER_GATEWAY_ERROR', message: error instanceof Error ? error.message : 'The fixture provider could not be reached.' }, 502);
  }
});
