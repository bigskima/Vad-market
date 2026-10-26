import { resolveFootballWithProvider as resolveLegacyFootball, providerSecret } from './providers.ts';
import {
  type FootballResultSpec,
  type FootballTotalGoalsThresholdSpec,
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
  const wanted = normalizeTeam(expected);
  if (wanted.length < 3) return false;
  const candidates = (isRecord(team) ? [team.name, team.shortName, team.tla] : [team])
    .map(normalizeTeam)
    .filter(Boolean);
  return candidates.some((candidate) =>
    candidate === wanted
    || (candidate.length >= 5 && wanted.length >= 5 && (candidate.includes(wanted) || wanted.includes(candidate))),
  );
}

type FootballResolverSpec = FootballResultSpec | FootballTotalGoalsThresholdSpec;

function evaluateThreshold(value: number, operator: 'GT' | 'GTE' | 'LT' | 'LTE', threshold: number) {
  if (operator === 'GT') return value > threshold;
  if (operator === 'GTE') return value >= threshold;
  if (operator === 'LT') return value < threshold;
  return value <= threshold;
}

function resolveObservedOutcome(
  actual: 'HOME_WIN' | 'AWAY_WIN' | 'DRAW',
  spec: FootballResolverSpec,
  teams: { home: string; away: string },
  scores: { home: number; away: number },
) {
  if (spec.resolverType === 'FOOTBALL_TOTAL_GOALS_THRESHOLD_V1') {
    const totalGoals = scores.home + scores.away;
    return evaluateThreshold(totalGoals, spec.operator, spec.threshold) ? 'YES' : 'NO';
  }
  if (spec.condition === 'THREE_WAY') return spec.outcomeCodes[actual];
  if (spec.condition === 'TEAM_WIN') {
    if (teamMatches(teams.home, spec.targetTeam)) return actual === 'HOME_WIN' ? 'YES' : 'NO';
    if (teamMatches(teams.away, spec.targetTeam)) return actual === 'AWAY_WIN' ? 'YES' : 'NO';
    throw new OracleRuntimeError('FOOTBALL_TARGET_TEAM_MISMATCH', 'The target team did not match either team in the verified fixture.', 422);
  }
  return actual === spec.condition ? 'YES' : 'NO';
}

function conditionPayload(spec: FootballResolverSpec) {
  return spec.resolverType === 'FOOTBALL_TOTAL_GOALS_THRESHOLD_V1'
    ? { condition: 'TOTAL_GOALS_THRESHOLD', operator: spec.operator, threshold: spec.threshold }
    : { condition: spec.condition, target_team: spec.condition === 'TEAM_WIN' ? spec.targetTeam : null };
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

async function resolveTheSportsDbResult(
  provider: OracleProvider,
  resource: OracleResource,
  spec: FootballResolverSpec,
): Promise<ProviderResolutionResult> {
  const baseUrl = provider.baseUrl?.replace(/\/$/, '');
  if (!baseUrl || !baseUrl.startsWith('https://www.thesportsdb.com/api/v1/json/')) {
    throw new OracleRuntimeError('PROVIDER_CONFIG_INVALID', 'TheSportsDB must use its approved HTTPS API host and versioned path', 500);
  }

  let url: URL;
  let rows: JsonRecord[];
  let selected: JsonRecord | undefined;
  let kickoffDeltaMs = 0;
  const externalId = resource.externalKey.trim();

  if (/^\d+$/.test(externalId)) {
    url = new URL(`${baseUrl}/lookupevent.php`);
    url.searchParams.set('id', externalId);
    const raw = await fetchJson(url.toString());
    if (!isRecord(raw) || !Array.isArray(raw.events)) {
      throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'TheSportsDB returned an invalid event payload', 502);
    }
    rows = raw.events.filter(isRecord);
    selected = rows[0];
  } else {
    const metadata = resource.metadata ?? {};
    const homeTeam = text(metadata.home_team);
    const awayTeam = text(metadata.away_team);
    const targetStart = new Date(text(metadata.match_starts_at));
    if (!homeTeam || !awayTeam || !Number.isFinite(targetStart.getTime())) {
      return { kind: 'skipped', code: 'FOOTBALL_RESOURCE_INVALID', detail: 'TheSportsDB needs configured teams and the scheduled kickoff time.' };
    }

    // This public endpoint returns the Soccer fixtures for one calendar day.
    // Fixture identity is checked against both teams before accepting any score.
    url = new URL(`${baseUrl}/eventsday.php`);
    url.searchParams.set('d', dayString(targetStart));
    url.searchParams.set('s', 'Soccer');
    const raw = await fetchJson(url.toString());
    if (!isRecord(raw) || !Array.isArray(raw.events)) {
      throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'TheSportsDB day-event payload was invalid', 502);
    }
    rows = raw.events.filter(isRecord);
    const allowFlip = metadata.allow_home_away_flip === true;
    const matches = rows
      .filter((candidate) => {
        const direct = teamMatches(candidate.strHomeTeam, homeTeam) && teamMatches(candidate.strAwayTeam, awayTeam);
        const flipped = allowFlip && teamMatches(candidate.strHomeTeam, awayTeam) && teamMatches(candidate.strAwayTeam, homeTeam);
        return direct || flipped;
      })
      .map((candidate) => {
        const rawTimestamp = text(candidate.strTimestamp);
        const eventTime = rawTimestamp ? new Date(rawTimestamp) : null;
        const delta = eventTime && Number.isFinite(eventTime.getTime())
          ? Math.abs(eventTime.getTime() - targetStart.getTime())
          : 0; // The API already restricted the result set to the requested calendar day.
        return { candidate, delta };
      })
      .sort((a, b) => a.delta - b.delta);
    selected = matches[0]?.candidate;
    kickoffDeltaMs = matches[0]?.delta ?? 0;
    if (!selected) {
      return { kind: 'skipped', code: 'MATCH_NOT_FOUND', detail: 'TheSportsDB had no same-day event matching the configured teams.' };
    }
    if (kickoffDeltaMs > 18 * 60 * 60 * 1000) {
      return { kind: 'skipped', code: 'MATCH_TIME_MISMATCH', detail: 'The matching TheSportsDB fixture kickoff was too far from the configured time.' };
    }
  }

  if (!selected) return { kind: 'skipped', code: 'MATCH_NOT_FOUND', detail: 'TheSportsDB did not return the configured event.' };
  const status = text(selected.strStatus ?? selected.strProgress).toUpperCase();
  if (!/(FINISHED|AFTER EXTRA TIME|AFTER PENALTIES|FULL.?TIME|^FT$|^AET$|^PEN$)/.test(status)) {
    return { kind: 'skipped', code: 'MATCH_NOT_FINAL', detail: 'TheSportsDB has not published a verified final score yet.' };
  }

  const homeRaw = selected.intHomeScore;
  const awayRaw = selected.intAwayScore;
  if (homeRaw === null || homeRaw === undefined || String(homeRaw).trim() === ''
      || awayRaw === null || awayRaw === undefined || String(awayRaw).trim() === '') {
    return { kind: 'skipped', code: 'SPORTS_RESULT_INVALID', detail: 'TheSportsDB has not published both final scores.' };
  }
  const homeScore = Number(homeRaw);
  const awayScore = Number(awayRaw);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore < 0 || awayScore < 0) {
    return { kind: 'skipped', code: 'SPORTS_RESULT_INVALID', detail: 'TheSportsDB final scores are not valid non-negative numbers.' };
  }
  const actual = homeScore > awayScore ? 'HOME_WIN' : awayScore > homeScore ? 'AWAY_WIN' : 'DRAW';
  const homeName = text(selected.strHomeTeam, 120);
  const awayName = text(selected.strAwayTeam, 120);
  const rawTimestamp = text(selected.strTimestamp);
  const eventTime = rawTimestamp ? new Date(rawTimestamp) : new Date();
  const observedAt = Number.isFinite(eventTime.getTime()) ? eventTime : new Date();

  return {
    kind: 'observation',
    observation: {
      observedOutcome: resolveObservedOutcome(actual, spec, { home: homeName, away: awayName }, { home: homeScore, away: awayScore }),
      observedAt,
      evidenceReference: url.toString(),
      payload: {
        resolver_type: spec.resolverType,
        provider: provider.code,
        event_id: text(selected.idEvent, 80) || externalId,
        sport: text(selected.strSport, 80) || null,
        home_team: homeName || null,
        away_team: awayName || null,
        home_score: homeScore,
        away_score: awayScore,
        total_goals: homeScore + awayScore,
        status,
        ...conditionPayload(spec),
        actual_result: actual,
        timestamp: rawTimestamp || null,
        fixture_lookup: /^\d+$/.test(externalId) ? 'EVENT_ID' : 'EVENTS_BY_DAY_AND_TEAMS',
      },
    },
  };
}

async function resolveApiSportsResult(
  provider: OracleProvider,
  resource: OracleResource,
  spec: FootballResolverSpec,
): Promise<ProviderResolutionResult> {
  if (!/^\d+$/.test(resource.externalKey.trim())) {
    return { kind: 'skipped', code: 'SPORTS_RESOURCE_INVALID', detail: 'API-Sports fixture ID must be numeric.' };
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
  if (!row) return { kind: 'skipped', code: 'MATCH_NOT_FOUND', detail: 'API-Sports did not return the configured fixture.' };
  const fixture = isRecord(row.fixture) ? row.fixture : {};
  const score = isRecord(row.score) ? row.score : {};
  const goals = isRecord(row.goals) ? row.goals : {};
  const statusNode = isRecord(fixture.status) ? fixture.status : {};
  const status = text(statusNode.short).toUpperCase();
  if (!['FT','AET','PEN'].includes(status)) {
    return { kind: 'skipped', code: `MATCH_${status || 'NOT_FINAL'}`, detail: 'API-Sports has not published a verified full-time result yet.' };
  }
  const homeRaw = goals.home;
  const awayRaw = goals.away;
  if (homeRaw === null || homeRaw === undefined || String(homeRaw).trim() === ''
      || awayRaw === null || awayRaw === undefined || String(awayRaw).trim() === '') {
    return { kind: 'skipped', code: 'SPORTS_RESULT_INVALID', detail: 'API-Sports has not published both final scores.' };
  }
  const homeScore = Number(homeRaw);
  const awayScore = Number(awayRaw);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore < 0 || awayScore < 0) {
    return { kind: 'skipped', code: 'SPORTS_RESULT_INVALID', detail: 'API-Sports final scores are not valid non-negative numbers.' };
  }
  const actual = homeScore > awayScore ? 'HOME_WIN' : awayScore > homeScore ? 'AWAY_WIN' : 'DRAW';
  const homeName = isRecord(row.teams) && isRecord(row.teams.home) ? text(row.teams.home.name, 120) : '';
  const awayName = isRecord(row.teams) && isRecord(row.teams.away) ? text(row.teams.away.name, 120) : '';
  const updatedAt = new Date(text(fixture.date));
  const observedAt = Number.isFinite(updatedAt.getTime()) ? updatedAt : new Date();
  return {
    kind: 'observation',
    observation: {
      observedOutcome: resolveObservedOutcome(actual, spec, { home: homeName, away: awayName }, { home: homeScore, away: awayScore }),
      observedAt,
      evidenceReference: url.toString(),
      payload: {
        resolver_type: spec.resolverType,
        provider: provider.code,
        fixture_id: text(fixture.id, 80) || resource.externalKey,
        home_team: homeName || null,
        away_team: awayName || null,
        home_score: homeScore,
        away_score: awayScore,
        total_goals: homeScore + awayScore,
        halftime_score: isRecord(score.halftime) ? score.halftime : null,
        extra_time_score: isRecord(score.extratime) ? score.extratime : null,
        penalty_score: isRecord(score.penalty) ? score.penalty : null,
        status,
        ...conditionPayload(spec),
        actual_result: actual,
      },
    },
  };
}

export async function resolveFootballFixtureWithProvider(
  provider: OracleProvider,
  resource: OracleResource,
  spec: FootballResolverSpec,
): Promise<ProviderResolutionResult> {
  if (provider.code === 'THESPORTSDB') return resolveTheSportsDbResult(provider, resource, spec);
  if (provider.code === 'API_SPORTS') return resolveApiSportsResult(provider, resource, spec);
  if (/^\d+$/.test(resource.externalKey.trim())) {
    if (spec.resolverType === 'FOOTBALL_TOTAL_GOALS_THRESHOLD_V1'
        || spec.condition === 'THREE_WAY'
        || spec.condition === 'TEAM_WIN') {
      return { kind: 'skipped', code: 'LEGACY_FOOTBALL_MAPPING_UNSUPPORTED', detail: 'The legacy fixture mapping does not carry the structured fields required by this market; the runtime will not infer a result from it.' };
    }
    return resolveLegacyFootball(provider, resource, spec);
  }
  if (provider.code !== 'FOOTBALL_DATA') return { kind: 'skipped', code: 'PROVIDER_NOT_COMPATIBLE' };
  if (resource.status !== 'ACTIVE') return { kind: 'skipped', code: 'RESOURCE_DISABLED' };

  const metadata = resource.metadata ?? {};
  if (text(metadata.lookup_mode).toUpperCase() !== 'COMPETITION_DAY_TEAMS') {
    return { kind: 'skipped', code: 'FOOTBALL_RESOURCE_INVALID', detail: 'Football fixture lookup configuration is unavailable.' };
  }

  const competitionCode = text(metadata.competition_code).toUpperCase();
  const homeTeam = text(metadata.home_team);
  const awayTeam = text(metadata.away_team);
  const matchStartsAt = new Date(text(metadata.match_starts_at));
  const allowFlip = metadata.allow_home_away_flip === true;
  if (!competitionCode || !homeTeam || !awayTeam || !Number.isFinite(matchStartsAt.getTime())) {
    throw new OracleRuntimeError('FOOTBALL_RESOURCE_INVALID', 'Football fixture details are incomplete', 422);
  }

  const secret = providerSecret(provider);
  if (!secret) throw new OracleRuntimeError('SECRET_MISSING', `${provider.code} credential is not configured`, 503);
  const baseUrl = provider.baseUrl?.replace(/\/$/, '');
  if (!baseUrl) throw new OracleRuntimeError('PROVIDER_CONFIG_INVALID', 'Football result provider URL is missing', 500);

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
    .filter((match) => {
      const direct = teamMatches(match.homeTeam, homeTeam) && teamMatches(match.awayTeam, awayTeam);
      const flipped = allowFlip && teamMatches(match.homeTeam, awayTeam) && teamMatches(match.awayTeam, homeTeam);
      return direct || flipped;
    })
    .map((match) => {
      const kickoff = new Date(text(match.utcDate));
      const delta = Number.isFinite(kickoff.getTime())
        ? Math.abs(kickoff.getTime() - matchStartsAt.getTime())
        : Number.POSITIVE_INFINITY;
      return { match, delta };
    })
    .sort((a, b) => a.delta - b.delta);

  const selected = matching[0];
  if (!selected) {
    return { kind: 'skipped', code: 'MATCH_NOT_FOUND', detail: 'No matching fixture was found for the configured competition, teams and date.' };
  }
  if (!Number.isFinite(selected.delta) || selected.delta > 18 * 60 * 60 * 1000) {
    return { kind: 'skipped', code: 'MATCH_TIME_MISMATCH', detail: 'The matching fixture kickoff was too far from the configured time.' };
  }

  const payload = selected.match;
  const status = text(payload.status).toUpperCase();
  if (status !== 'FINISHED') {
    return { kind: 'skipped', code: `MATCH_${status || 'NOT_FINAL'}`, detail: 'The source has not published a verified FINISHED result yet.' };
  }
  const scoreNode = isRecord(payload.score) ? payload.score : {};
  const fullTime = isRecord(scoreNode.fullTime) ? scoreNode.fullTime : {};
  const homeScore = Number(fullTime.home);
  const awayScore = Number(fullTime.away);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore < 0 || awayScore < 0) {
    return { kind: 'skipped', code: 'SPORTS_RESULT_INVALID', detail: 'Football-Data has not published both valid full-time scores.' };
  }
  const actual = homeScore > awayScore ? 'HOME_WIN' : awayScore > homeScore ? 'AWAY_WIN' : 'DRAW';
  const lastUpdated = new Date(text(payload.lastUpdated));
  const observedAt = Number.isFinite(lastUpdated.getTime()) ? lastUpdated : new Date();
  const homeName = isRecord(payload.homeTeam) ? text(payload.homeTeam.name, 120) : '';
  const awayName = isRecord(payload.awayTeam) ? text(payload.awayTeam.name, 120) : '';
  const providerMatchId = payload.id == null ? null : String(payload.id);

  return {
    kind: 'observation',
    observation: {
      observedOutcome: resolveObservedOutcome(actual, spec, { home: homeName, away: awayName }, { home: homeScore, away: awayScore }),
      observedAt,
      evidenceReference: lookupUrl.toString(),
      payload: {
        resolver_type: spec.resolverType,
        match_id: providerMatchId,
        fixture_lookup: 'COMPETITION_DAY_TEAMS',
        competition_code: competitionCode,
        configured_home_team: homeTeam,
        configured_away_team: awayTeam,
        allow_home_away_flip: allowFlip,
        home_team: homeName || null,
        away_team: awayName || null,
        status,
        ...conditionPayload(spec),
        actual_result: actual,
        home_score: homeScore,
        away_score: awayScore,
        total_goals: homeScore + awayScore,
        utc_date: payload.utcDate ?? null,
        last_updated: payload.lastUpdated ?? null,
      },
    },
  };
}
