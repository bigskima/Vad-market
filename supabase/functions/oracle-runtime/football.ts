import { resolveFootballWithProvider as resolveLegacyFootball, providerSecret } from './providers.ts';
import {
  type FootballResultSpec,
  type JsonRecord,
  type OracleProvider,
  type OracleResource,
  OracleRuntimeError,
  type ProviderResolutionResult,
} from './types.ts';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, max = 180) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeTeam(value: unknown) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(football club|futbol club|club de futbol|fc|cf|afc|ac|sc)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function teamMatches(team: unknown, expected: string) {
  if (!isRecord(team)) return false;
  const wanted = normalizeTeam(expected);
  if (wanted.length < 3) return false;
  const candidates = [team.name, team.shortName, team.tla]
    .map(normalizeTeam)
    .filter(Boolean);
  return candidates.some((candidate) =>
    candidate === wanted
    || (candidate.length >= 5 && wanted.length >= 5 && (candidate.includes(wanted) || wanted.includes(candidate))),
  );
}

function dayString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function plusDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new OracleRuntimeError(`PROVIDER_HTTP_${response.status}`, `Football result provider returned HTTP ${response.status}`, 502);
    }
    return payload;
  } catch (error) {
    if (error instanceof OracleRuntimeError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new OracleRuntimeError('PROVIDER_TIMEOUT', 'Football result provider request timed out', 504);
    }
    throw new OracleRuntimeError('PROVIDER_NETWORK_ERROR', 'Football result provider request failed', 502);
  } finally {
    clearTimeout(timer);
  }
}

function finalResult(payload: JsonRecord) {
  const score = isRecord(payload.score) ? payload.score : null;
  const winner = text(score?.winner).toUpperCase();
  const actual = winner === 'HOME_TEAM'
    ? 'HOME_WIN'
    : winner === 'AWAY_TEAM'
      ? 'AWAY_WIN'
      : winner === 'DRAW'
        ? 'DRAW'
        : null;
  return { score, actual } as const;
}

function resolveObservedOutcome(actual: 'HOME_WIN' | 'AWAY_WIN' | 'DRAW', spec: FootballResultSpec) {
  if (spec.condition === 'THREE_WAY') return spec.outcomeCodes[actual];
  return actual === spec.condition ? 'YES' : 'NO';
}

function parseTheSportsDbUtcTimestamp(value: unknown): Date | null {
  const raw = text(value, 80);
  if (!raw) return null;
  // TheSportsDB documents strTimestamp as UTC ISO time, sometimes without a
  // zone suffix. Its documented contract is UTC, so append Z only for that
  // exact known source format; never do this for arbitrary provider strings.
  const isoUtcWithoutZone = /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?$/.test(raw);
  const normalized = isoUtcWithoutZone ? raw + 'Z' : raw;
  if (!/(?:Z|[+-]\\d{2}:?\\d{2})$/i.test(normalized)) return null;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

async function resolveTheSportsDbByTeamsAndTime(
  provider: OracleProvider,
  resource: OracleResource,
  spec: FootballResultSpec,
): Promise<ProviderResolutionResult> {
  const metadata = resource.metadata ?? {};
  const homeTeam = text(metadata.home_team, 180);
  const awayTeam = text(metadata.away_team, 180);
  const expectedKickoff = parseTheSportsDbUtcTimestamp(metadata.match_starts_at);
  const baseUrl = provider.baseUrl?.replace(/\\/$/, '');
  if (!homeTeam || !awayTeam || !expectedKickoff || !baseUrl
      || !baseUrl.startsWith('https://www.thesportsdb.com/api/v1/json/')) {
    return { kind: 'skipped', code: 'SPORTS_TEAM_TIME_MAPPING_INVALID', detail: 'TheSportsDB team and UTC kickoff mapping is incomplete' };
  }

  const url = new URL(`${baseUrl}/eventsday.php`);
  url.searchParams.set('d', expectedKickoff.toISOString().slice(0, 10));
  url.searchParams.set('s', 'Soccer');
  const raw = await fetchJson(url.toString());
  if (!isRecord(raw) || !Array.isArray(raw.events)) {
    throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'TheSportsDB event-day payload was invalid', 502);
  }

  const matches = raw.events.filter(isRecord)
    .filter((event) => teamMatches({ name: event.strHomeTeam }, homeTeam)
      && teamMatches({ name: event.strAwayTeam }, awayTeam))
    .map((event) => {
      const kickoff = parseTheSportsDbUtcTimestamp(event.strTimestamp);
      const delta = kickoff ? Math.abs(kickoff.getTime() - expectedKickoff.getTime()) : Number.POSITIVE_INFINITY;
      return { event, kickoff, delta };
    })
    .sort((a, b) => a.delta - b.delta);

  const selected = matches[0];
  if (!selected || !selected.kickoff) {
    return { kind: 'skipped', code: 'MATCH_NOT_FOUND', detail: 'TheSportsDB did not return the configured home/away fixture with an explicit UTC kickoff timestamp' };
  }
  // If this feed has a different or rescheduled fixture, do not accept a
  // similarly named event as corroboration for settlement.
  if (selected.delta > 4 * 60 * 60 * 1000) {
    return { kind: 'skipped', code: 'MATCH_TIME_MISMATCH', detail: 'TheSportsDB kickoff differed from the canonical UTC fixture by more than four hours' };
  }

  const event = selected.event;
  const status = text(event.strStatus ?? event.strProgress, 40).toUpperCase();
  if (!/(^FT$|^AET$|^PEN$|FINISHED|AFTER EXTRA TIME|AFTER PENALTIES|FULL.?TIME)/.test(status)) {
    return { kind: 'skipped', code: 'MATCH_NOT_FINAL', detail: 'TheSportsDB has not published a verified full-time result yet' };
  }
  const homeRaw = event.intHomeScore;
  const awayRaw = event.intAwayScore;
  if (homeRaw === null || homeRaw === undefined || String(homeRaw).trim() === ''
      || awayRaw === null || awayRaw === undefined || String(awayRaw).trim() === '') {
    return { kind: 'skipped', code: 'SPORTS_RESULT_INVALID', detail: 'TheSportsDB has not published both final scores' };
  }
  const homeScore = Number(homeRaw);
  const awayScore = Number(awayRaw);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore < 0 || awayScore < 0) {
    return { kind: 'skipped', code: 'SPORTS_RESULT_INVALID', detail: 'TheSportsDB final scores are not valid non-negative numbers' };
  }
  const actual = homeScore > awayScore ? 'HOME_WIN' : awayScore > homeScore ? 'AWAY_WIN' : 'DRAW';
  return {
    kind: 'observation',
    observation: {
      observedOutcome: resolveObservedOutcome(actual, spec),
      // Timestamp the observation when the verified final score was fetched;
      // strTimestamp is the kickoff instant, not the result publication time.
      observedAt: new Date(),
      evidenceReference: url.toString(),
      payload: {
        resolver_type: spec.resolverType,
        provider: provider.code,
        fixture_lookup: 'TEAM_DATE_LOOKUP',
        event_id: text(event.idEvent, 80) || null,
        expected_kickoff_utc: expectedKickoff.toISOString(),
        provider_kickoff_utc: selected.kickoff.toISOString(),
        kickoff_delta_ms: selected.delta,
        home_team: text(event.strHomeTeam, 120) || null,
        away_team: text(event.strAwayTeam, 120) || null,
        home_score: homeScore,
        away_score: awayScore,
        status,
        requested_condition: spec.condition,
        actual_result: actual,
        provider_timestamp: text(event.strTimestamp, 80) || null,
      },
    },
  };
}

async function resolveTheSportsDbResult(
  provider: OracleProvider,
  resource: OracleResource,
  spec: FootballResultSpec,
): Promise<ProviderResolutionResult> {
  if (!/^\d+$/.test(resource.externalKey.trim())) {
    return { kind: 'skipped', code: 'SPORTS_RESOURCE_INVALID', detail: 'TheSportsDB event ID must be numeric' };
  }
  const baseUrl = provider.baseUrl?.replace(/\/$/, '');
  if (!baseUrl || !baseUrl.startsWith('https://www.thesportsdb.com/api/v1/json/')) {
    throw new OracleRuntimeError('PROVIDER_CONFIG_INVALID', 'TheSportsDB must use its approved HTTPS API host and versioned path', 500);
  }
  const url = new URL(`${baseUrl}/lookupevent.php`);
  url.searchParams.set('id', resource.externalKey.trim());
  const raw = await fetchJson(url.toString());
  if (!isRecord(raw) || !Array.isArray(raw.events)) {
    throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'TheSportsDB returned an invalid event payload', 502);
  }
  const event = raw.events.find(isRecord);
  if (!event) return { kind: 'skipped', code: 'MATCH_NOT_FOUND', detail: 'TheSportsDB did not return the configured event' };
  const status = text(event.strStatus ?? event.strProgress).toUpperCase();
  if (!/(FINISHED|AFTER EXTRA TIME|AFTER PENALTIES|FULL.?TIME|^FT$|^AET$|^PEN$)/.test(status)) {
    return { kind: 'skipped', code: 'MATCH_NOT_FINAL', detail: 'TheSportsDB has not published a verified final score yet' };
  }
  const homeRaw = event.intHomeScore;
  const awayRaw = event.intAwayScore;
  if (homeRaw === null || homeRaw === undefined || String(homeRaw).trim() === ''
      || awayRaw === null || awayRaw === undefined || String(awayRaw).trim() === '') {
    return { kind: 'skipped', code: 'SPORTS_RESULT_INVALID', detail: 'TheSportsDB has not published both final scores' };
  }
  const homeScore = Number(homeRaw);
  const awayScore = Number(awayRaw);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
    return { kind: 'skipped', code: 'SPORTS_RESULT_INVALID', detail: 'TheSportsDB final scores are not numeric' };
  }
  const actual = homeScore > awayScore ? 'HOME_WIN' : awayScore > homeScore ? 'AWAY_WIN' : 'DRAW';
  const rawTimestamp = text(event.strTimestamp);
  const eventTime = rawTimestamp ? new Date(rawTimestamp) : new Date();
  const observedAt = Number.isFinite(eventTime.getTime()) ? eventTime : new Date();
  const evidenceUrl = url.toString();
  return {
    kind: 'observation',
    observation: {
      observedOutcome: resolveObservedOutcome(actual, spec),
      observedAt,
      evidenceReference: evidenceUrl,
      payload: {
        resolver_type: spec.resolverType,
        provider: provider.code,
        event_id: text(event.idEvent, 80) || resource.externalKey,
        sport: text(event.strSport, 80) || null,
        home_team: text(event.strHomeTeam, 120) || null,
        away_team: text(event.strAwayTeam, 120) || null,
        home_score: homeScore,
        away_score: awayScore,
        status,
        requested_condition: spec.condition,
        actual_result: actual,
        timestamp: rawTimestamp || null,
      },
    },
  };
}

async function resolveApiSportsResult(
  provider: OracleProvider,
  resource: OracleResource,
  spec: FootballResultSpec,
): Promise<ProviderResolutionResult> {
  if (!/^\d+$/.test(resource.externalKey.trim())) {
    return { kind: 'skipped', code: 'SPORTS_RESOURCE_INVALID', detail: 'API-Sports fixture ID must be numeric' };
  }
  const baseUrl = provider.baseUrl?.replace(/\/$/, '');
  if (baseUrl !== 'https://v3.football.api-sports.io') {
    throw new OracleRuntimeError('PROVIDER_CONFIG_INVALID', 'API-Sports must use its approved HTTPS API host', 500);
  }
  const secret = providerSecret(provider);
  if (!secret) throw new OracleRuntimeError('SECRET_MISSING', 'API-Sports credential is not configured', 503);
  const url = new URL('/fixtures', baseUrl);
  url.searchParams.set('id', resource.externalKey.trim());
  const raw = await fetchJson(url.toString(), {
    headers: { 'x-apisports-key': String(secret), Accept: 'application/json' },
  });
  if (!isRecord(raw) || !Array.isArray(raw.response)) {
    throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'API-Sports returned an invalid fixture payload', 502);
  }
  const row = raw.response.find(isRecord);
  if (!row) return { kind: 'skipped', code: 'MATCH_NOT_FOUND', detail: 'API-Sports did not return the configured fixture' };
  const fixture = isRecord(row.fixture) ? row.fixture : {};
  const score = isRecord(row.score) ? row.score : {};
  const goals = isRecord(row.goals) ? row.goals : {};
  const statusNode = isRecord(fixture.status) ? fixture.status : {};
  const status = text(statusNode.short).toUpperCase();
  if (!['FT','AET','PEN'].includes(status)) {
    return { kind: 'skipped', code: `MATCH_${status || 'NOT_FINAL'}`, detail: 'API-Sports has not published a verified full-time result yet' };
  }
  const homeRaw = goals.home;
  const awayRaw = goals.away;
  if (homeRaw === null || homeRaw === undefined || String(homeRaw).trim() === ''
      || awayRaw === null || awayRaw === undefined || String(awayRaw).trim() === '') {
    return { kind: 'skipped', code: 'SPORTS_RESULT_INVALID', detail: 'API-Sports has not published both final scores' };
  }
  const homeScore = Number(homeRaw);
  const awayScore = Number(awayRaw);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
    return { kind: 'skipped', code: 'SPORTS_RESULT_INVALID', detail: 'API-Sports final scores are not numeric' };
  }
  const actual = homeScore > awayScore ? 'HOME_WIN' : awayScore > homeScore ? 'AWAY_WIN' : 'DRAW';
  const updatedAt = new Date(text(fixture.date));
  const observedAt = Number.isFinite(updatedAt.getTime()) ? updatedAt : new Date();
  return {
    kind: 'observation',
    observation: {
      observedOutcome: resolveObservedOutcome(actual, spec),
      observedAt,
      evidenceReference: url.toString(),
      payload: {
        resolver_type: spec.resolverType,
        provider: provider.code,
        fixture_id: text(fixture.id, 80) || resource.externalKey,
        home_team: isRecord(row.teams) && isRecord(row.teams.home) ? text(row.teams.home.name, 120) || null : null,
        away_team: isRecord(row.teams) && isRecord(row.teams.away) ? text(row.teams.away.name, 120) || null : null,
        home_score: homeScore,
        away_score: awayScore,
        halftime_score: isRecord(score.halftime) ? score.halftime : null,
        extra_time_score: isRecord(score.extratime) ? score.extratime : null,
        penalty_score: isRecord(score.penalty) ? score.penalty : null,
        status,
        requested_condition: spec.condition,
        actual_result: actual,
      },
    },
  };
}

export async function resolveFootballFixtureWithProvider(
  provider: OracleProvider,
  resource: OracleResource,
  spec: FootballResultSpec,
): Promise<ProviderResolutionResult> {
  if (provider.code === 'THESPORTSDB') return resolveTheSportsDbResult(provider, resource, spec);
  if (provider.code === 'API_SPORTS') return resolveApiSportsResult(provider, resource, spec);
  if (/^\d+$/.test(resource.externalKey.trim())) {
    if (spec.condition === 'THREE_WAY') {
      return { kind: 'skipped', code: 'THREE_WAY_LEGACY_PROVIDER_UNSUPPORTED', detail: 'This provider adapter cannot safely map a three-way outcome; try the next configured result provider' };
    }
    return resolveLegacyFootball(provider, resource, spec);
  }
  if (provider.code !== 'FOOTBALL_DATA') return { kind: 'skipped', code: 'PROVIDER_NOT_COMPATIBLE' };
  if (resource.status !== 'ACTIVE') return { kind: 'skipped', code: 'RESOURCE_DISABLED' };

  const metadata = resource.metadata ?? {};
  if (text(metadata.lookup_mode).toUpperCase() !== 'COMPETITION_DAY_TEAMS') {
    return { kind: 'skipped', code: 'FOOTBALL_RESOURCE_INVALID', detail: 'Football fixture lookup configuration is unavailable' };
  }

  const competitionCode = text(metadata.competition_code).toUpperCase();
  const homeTeam = text(metadata.home_team);
  const awayTeam = text(metadata.away_team);
  const matchStartsAt = new Date(text(metadata.match_starts_at));
  if (!competitionCode || !homeTeam || !awayTeam || !Number.isFinite(matchStartsAt.getTime())) {
    throw new OracleRuntimeError('FOOTBALL_RESOURCE_INVALID', 'Football fixture details are incomplete', 422);
  }

  const secret = providerSecret(provider);
  if (!secret) throw new OracleRuntimeError('SECRET_MISSING', `${provider.code} credential is not configured`, 503);
  const baseUrl = provider.baseUrl?.replace(/\/$/, '');
  if (!baseUrl) throw new OracleRuntimeError('PROVIDER_CONFIG_INVALID', 'Football result provider URL is missing', 500);

  // One provider request is enough: request the competition's narrow date window,
  // identify the configured teams, and read the final score from the same payload.
  const lookupUrl = new URL(`${baseUrl}/competitions/${encodeURIComponent(competitionCode)}/matches`);
  lookupUrl.searchParams.set('dateFrom', dayString(plusDays(matchStartsAt, -1)));
  lookupUrl.searchParams.set('dateTo', dayString(plusDays(matchStartsAt, 1)));

  const raw = await fetchJson(lookupUrl.toString(), {
    headers: { 'X-Auth-Token': String(secret), Accept: 'application/json' },
  });
  if (!isRecord(raw) || !Array.isArray(raw.matches)) {
    throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'Football fixture payload was invalid', 502);
  }

  const matching = raw.matches
    .filter(isRecord)
    .filter((match) => teamMatches(match.homeTeam, homeTeam) && teamMatches(match.awayTeam, awayTeam))
    .map((match) => {
      const kickoff = new Date(text(match.utcDate));
      const delta = Number.isFinite(kickoff.getTime())
        ? Math.abs(kickoff.getTime() - matchStartsAt.getTime())
        : Number.POSITIVE_INFINITY;
      return { match, kickoff, delta };
    })
    .sort((a, b) => a.delta - b.delta);

  const selected = matching[0];
  if (!selected) {
    return { kind: 'skipped', code: 'MATCH_NOT_FOUND', detail: 'No matching fixture was found for the configured competition, teams and date' };
  }
  // Prevent a similarly named fixture on another day from being selected accidentally.
  if (!Number.isFinite(selected.delta) || selected.delta > 18 * 60 * 60 * 1000) {
    return { kind: 'skipped', code: 'MATCH_TIME_MISMATCH', detail: 'The matching fixture kickoff was too far from the configured match time' };
  }

  const payload = selected.match;
  const status = text(payload.status).toUpperCase();
  if (status !== 'FINISHED') {
    return { kind: 'skipped', code: `MATCH_${status || 'NOT_FINAL'}`, detail: 'Match is not in a final FINISHED state' };
  }

  const { score, actual } = finalResult(payload);
  if (!actual) throw new OracleRuntimeError('FOOTBALL_RESULT_INVALID', 'Football final winner was unavailable', 502);

  const lastUpdated = new Date(text(payload.lastUpdated));
  const observedAt = Number.isFinite(lastUpdated.getTime()) ? lastUpdated : new Date();
  const fullTime = isRecord(score?.fullTime) ? score.fullTime : {};
  const providerMatchId = payload.id == null ? null : String(payload.id);

  return {
    kind: 'observation',
    observation: {
      observedOutcome: resolveObservedOutcome(actual, spec),
      observedAt,
      evidenceReference: lookupUrl.toString(),
      payload: {
        resolver_type: spec.resolverType,
        match_id: providerMatchId,
        fixture_lookup: 'COMPETITION_DAY_TEAMS',
        competition_code: competitionCode,
        configured_home_team: homeTeam,
        configured_away_team: awayTeam,
        status,
        requested_condition: spec.condition,
        actual_result: actual,
        home_score: fullTime.home ?? null,
        away_score: fullTime.away ?? null,
        utc_date: payload.utcDate ?? null,
        last_updated: payload.lastUpdated ?? null,
      },
    },
  };
}
