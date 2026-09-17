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

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
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

export async function resolveFootballFixtureWithProvider(
  provider: OracleProvider,
  resource: OracleResource,
  spec: FootballResultSpec,
): Promise<ProviderResolutionResult> {
  if (/^\d+$/.test(resource.externalKey.trim())) {
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
      observedOutcome: actual === spec.condition ? 'YES' : 'NO',
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
