import {
  type DueOracleEvent,
  type JsonRecord,
  type OracleProvider,
  type OracleResource,
  OracleRuntimeError,
  type ProviderResolutionResult,
  type ResolverSpec,
  type CryptoTouchThresholdSpec,
  type FootballTotalGoalsThresholdSpec,
} from './types.ts';
import { resolveCryptoWithProvider, resolveCryptoTouchWithCoinGecko, resolveCryptoTouchWithKraken } from './providers.ts';
import { resolveFootballFixtureWithProvider } from './football.ts';
import { resolvePublicRecord } from './public-record.ts';
import { resolveFinancialPriceThresholdWithProvider, resolveFinancialPriceTouchThresholdWithProvider, resolveFredSeriesThresholdWithProvider } from './financial.ts';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function numericValue(...values: unknown[]) {
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function ensureBinaryYesNo(event: DueOracleEvent) {
  const codes = new Set(event.outcomes.map((outcome) => outcome.code.toUpperCase()));
  if (!codes.has('YES') || !codes.has('NO') || codes.size !== 2) {
    throw new OracleRuntimeError('UNSUPPORTED_OUTCOME_SCHEMA', 'This deterministic resolver requires exactly the configured YES and NO outcomes', 422);
  }
}

function normalizeOutcomeIdentifier(value: unknown) {
  return typeof value === 'string'
    ? value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
    : '';
}

function threeWayFootballOutcomeCodes(event: DueOracleEvent) {
  const scope = event.resolutionScope ?? {};
  const subject = isRecord(scope.subject) ? scope.subject : {};
  const homeTeam = stringValue(subject.home_team, subject.homeTeam, scope.home_team, scope.homeTeam);
  const awayTeam = stringValue(subject.away_team, subject.awayTeam, scope.away_team, scope.awayTeam);
  if (!homeTeam || !awayTeam) {
    throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'A three-way football market needs configured home and away team names', 422);
  }
  const homeKey = normalizeOutcomeIdentifier(homeTeam);
  const awayKey = normalizeOutcomeIdentifier(awayTeam);

  const findOutcome = (kind: 'HOME_WIN' | 'AWAY_WIN' | 'DRAW') => {
    const matches = event.outcomes.filter((outcome) => {
      const code = normalizeOutcomeIdentifier(outcome.code);
      const label = normalizeOutcomeIdentifier(outcome.label);
      if (kind === 'DRAW') {
        return ['DRAW', 'TIE', 'X', 'DRAW TIE'].includes(code)
          || ['DRAW', 'TIE', 'X', 'DRAW TIE'].includes(label)
          || /\bDRAW\b|\bTIE\b/.test(label);
      }
      if (kind === 'HOME_WIN') {
        return ['HOME', 'HOME WIN', 'HOME TEAM', 'HOME TEAM WIN', '1', '1X2 HOME'].includes(code)
          || ['HOME', 'HOME WIN', 'HOME TEAM', 'HOME TEAM WIN', '1', '1X2 HOME'].includes(label)
          || (homeKey.length >= 3 && label.includes(homeKey));
      }
      return ['AWAY', 'AWAY WIN', 'AWAY TEAM', 'AWAY TEAM WIN', '2', '1X2 AWAY'].includes(code)
        || ['AWAY', 'AWAY WIN', 'AWAY TEAM', 'AWAY TEAM WIN', '2', '1X2 AWAY'].includes(label)
        || (awayKey.length >= 3 && label.includes(awayKey));
    });
    const distinct = [...new Map(matches.map((outcome) => [outcome.code, outcome])).values()];
    if (distinct.length !== 1) {
      throw new OracleRuntimeError('UNSUPPORTED_OUTCOME_SCHEMA', 'A three-way football market must clearly map one configured outcome to home win, draw and away win', 422);
    }
    return distinct[0].code;
  };

  const result = {
    HOME_WIN: findOutcome('HOME_WIN'),
    DRAW: findOutcome('DRAW'),
    AWAY_WIN: findOutcome('AWAY_WIN'),
  };
  if (new Set(Object.values(result)).size !== 3) {
    throw new OracleRuntimeError('UNSUPPORTED_OUTCOME_SCHEMA', 'Home win, draw and away win must map to three different configured outcomes', 422);
  }
  return result;
}

export function parseResolverSpec(event: DueOracleEvent): ResolverSpec {
  const scope = event.resolutionScope ?? {};
  const subject = isRecord(scope.subject) ? scope.subject : {};
  const condition = isRecord(scope.condition) ? scope.condition : {};
  const resolverType = stringValue(scope.resolver_type, scope.resolverType)?.toUpperCase();

  if (resolverType === 'CRYPTO_PRICE_THRESHOLD_V1') {
    ensureBinaryYesNo(event);
    const asset = stringValue(scope.asset, subject.asset)?.toUpperCase();
    const quote = stringValue(scope.quote, subject.quote, 'USD')?.toUpperCase();
    const operator = stringValue(scope.operator, condition.operator)?.toUpperCase();
    const threshold = numericValue(scope.threshold, condition.threshold);
    const observationRaw = stringValue(
      scope.observation_time,
      scope.observationTime,
      condition.observation_time,
      condition.observationTime,
      event.resolvesAfter,
    );
    if (!asset || !/^[A-Z0-9]{2,20}$/.test(asset)) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Crypto resolver asset is missing or invalid', 422);
    }
    if (!quote || !/^[A-Z0-9]{2,20}$/.test(quote)) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Crypto resolver quote is missing or invalid', 422);
    }
    if (!['GT','GTE','LT','LTE'].includes(String(operator))) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Crypto resolver operator must be GT, GTE, LT or LTE', 422);
    }
    if (threshold === null || threshold <= 0) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Crypto resolver threshold must be a positive number', 422);
    }
    const observationTime = observationRaw ? new Date(observationRaw) : null;
    if (!observationTime || !Number.isFinite(observationTime.getTime())) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Crypto resolver observation time is missing or invalid', 422);
    }
    return {
      resolverType: 'CRYPTO_PRICE_THRESHOLD_V1',
      asset,
      quote,
      operator: operator as 'GT' | 'GTE' | 'LT' | 'LTE',
      threshold,
      observationTime,
    };
  }

  if (resolverType === 'CRYPTO_PRICE_TOUCH_THRESHOLD_V1') {
    ensureBinaryYesNo(event);
    const asset = stringValue(scope.asset, subject.asset, scope.crypto_asset_symbol)?.toUpperCase();
    const quote = stringValue(scope.quote, subject.quote, 'USD')?.toUpperCase();
    const operator = stringValue(scope.operator, condition.operator)?.toUpperCase();
    const threshold = numericValue(scope.threshold, condition.threshold);
    const endRaw = stringValue(scope.window_end, scope.windowEnd, scope.observation_time, scope.observationTime, event.closesAt);
    const endFallback = endRaw ? new Date(endRaw) : null;
    const startRaw = stringValue(scope.window_start, scope.windowStart, scope.period_start, scope.periodStart);
    const windowStart = startRaw
      ? new Date(startRaw)
      : endFallback && Number.isFinite(endFallback.getTime())
        ? new Date(endFallback.toISOString().slice(0, 10) + 'T00:00:00.000Z')
        : null;
    const windowEnd = endRaw ? new Date(endRaw) : null;
    if (!asset || !/^[A-Z0-9]{2,20}$/.test(asset)) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Crypto touch resolver asset is missing or invalid', 422);
    }
    if (!quote || !/^[A-Z0-9]{2,20}$/.test(quote)) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Crypto touch resolver quote is missing or invalid', 422);
    }
    if (!['GT','GTE','LT','LTE'].includes(String(operator))) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Crypto touch threshold operator must be GT, GTE, LT or LTE', 422);
    }
    if (threshold === null || threshold <= 0) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Crypto touch threshold must be a positive number', 422);
    }
    if (!windowStart || !Number.isFinite(windowStart.getTime()) || !windowEnd || !Number.isFinite(windowEnd.getTime()) || windowEnd <= windowStart) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Crypto touch window start and end are invalid', 422);
    }
    return {
      resolverType: 'CRYPTO_PRICE_TOUCH_THRESHOLD_V1',
      asset,
      quote,
      operator: operator as 'GT' | 'GTE' | 'LT' | 'LTE',
      threshold,
      windowStart,
      windowEnd,
    };
  }

  if (resolverType === 'FINANCIAL_PRICE_THRESHOLD_V1') {
    ensureBinaryYesNo(event);
    const symbolRaw = stringValue(scope.symbol, subject.symbol, scope.asset, subject.asset)?.toUpperCase();
    const symbolParts = symbolRaw?.split('/');
    const symbol = symbolParts?.length === 2 ? symbolParts[0] : symbolRaw;
    // A canonical pair such as USD/JPY carries its own quote unless the contract
    // explicitly supplies one. Do not silently default a slash-pair to USD/USD.
    const quote = stringValue(scope.quote, subject.quote, symbolParts?.length === 2 ? symbolParts[1] : 'USD')?.toUpperCase();
    const operator = stringValue(scope.operator, condition.operator)?.toUpperCase();
    const threshold = numericValue(scope.threshold, condition.threshold);
    const observationRaw = stringValue(scope.observation_time, scope.observationTime, condition.observation_time, event.resolvesAfter);
    const observationTime = observationRaw ? new Date(observationRaw) : null;
    if (!symbol || !/^[A-Z0-9._-]{1,40}(?:\/[A-Z0-9]{2,12})?$/.test(symbol)) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Financial instrument symbol is missing or invalid', 422);
    }
    if (!quote || !/^[A-Z0-9]{2,12}$/.test(quote)) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Financial quote currency is missing or invalid', 422);
    }
    if (!['GT','GTE','LT','LTE'].includes(String(operator))) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Financial threshold operator must be GT, GTE, LT or LTE', 422);
    }
    if (threshold === null || threshold <= 0) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Financial threshold must be a positive number', 422);
    }
    if (!observationTime || !Number.isFinite(observationTime.getTime())) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Financial observation time is missing or invalid', 422);
    }
    return {
      resolverType: 'FINANCIAL_PRICE_THRESHOLD_V1',
      symbol: symbol.includes('/') ? symbol.split('/')[0] : symbol,
      quote,
      operator: operator as 'GT' | 'GTE' | 'LT' | 'LTE',
      threshold,
      observationTime,
    };
  }

  if (resolverType === 'FRED_SERIES_THRESHOLD_V1') {
    ensureBinaryYesNo(event);
    const seriesId = stringValue(scope.series_id, scope.seriesId, subject.series_id, subject.seriesId)?.toUpperCase();
    const operator = stringValue(scope.operator, condition.operator)?.toUpperCase();
    const threshold = numericValue(scope.threshold, condition.threshold);
    const dateRaw = stringValue(scope.observation_date, scope.observationDate, scope.record_date, scope.recordDate, scope.resolution_time, scope.resolutionTime, event.resolvesAfter);
    const observationDate = dateRaw ? dateRaw.slice(0, 10) : '';
    const vintageRaw = stringValue(scope.vintage_date, scope.vintageDate, event.resolvesAfter);
    // If the market does not specify a vintage, use the resolution cutoff rather
    // than the observation date: many official macro series are published later.
    const vintageDate = vintageRaw ? vintageRaw.slice(0, 10) : null;
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(value + 'T00:00:00Z').getTime());
    if (!seriesId || !/^[A-Z0-9_-]{1,40}$/.test(seriesId)) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'FRED series identifier is missing or invalid', 422);
    }
    if (!['GT','GTE','LT','LTE'].includes(String(operator))) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'FRED threshold operator must be GT, GTE, LT or LTE', 422);
    }
    if (threshold === null) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'FRED numeric threshold is missing or invalid', 422);
    }
    if (!validDate(observationDate) || (vintageDate !== null && !validDate(vintageDate))) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'FRED observation or vintage date is missing or invalid', 422);
    }
    return {
      resolverType: 'FRED_SERIES_THRESHOLD_V1',
      seriesId,
      operator: operator as 'GT' | 'GTE' | 'LT' | 'LTE',
      threshold,
      observationDate,
      vintageDate,
    };
  }

  if (resolverType === 'FOOTBALL_MATCH_RESULT_V1') {
    const supportedConditions = new Set(['HOME_WIN','AWAY_WIN','DRAW','TEAM_WIN','THREE_WAY']);
    const rawCondition = stringValue(
      scope.condition_code,
      scope.conditionCode,
      scope.condition_type,
      scope.conditionType,
      condition.code,
      condition.type,
      condition.value,
      condition.result,
      scope.result,
      typeof scope.condition === 'string' && supportedConditions.has(scope.condition.trim().toUpperCase())
        ? scope.condition
        : null,
    )?.toUpperCase();
    const targetTeam = stringValue(
      scope.target_team,
      scope.targetTeam,
      condition.target_team,
      condition.targetTeam,
      isRecord(scope.condition) ? scope.condition.target_team : null,
      isRecord(scope.condition) ? scope.condition.targetTeam : null,
    );
    const codes = new Set(event.outcomes.map((outcome) => outcome.code.toUpperCase()));
    if (codes.has('YES') && codes.has('NO')) {
      ensureBinaryYesNo(event);
      const conditionValue = targetTeam ? 'TEAM_WIN' : rawCondition;
      if (conditionValue === 'TEAM_WIN') {
        if (!targetTeam) {
          throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Team-win markets must specify the exact target_team', 422);
        }
        const homeTeam = stringValue(subject.home_team, subject.homeTeam, scope.home_team, scope.homeTeam, subject.competitor_a, subject.competitorA);
        const awayTeam = stringValue(subject.away_team, subject.awayTeam, scope.away_team, scope.awayTeam, subject.competitor_b, subject.competitorB);
        const targetKey = normalizeOutcomeIdentifier(targetTeam);
        const validParticipants = [homeTeam, awayTeam].filter((value): value is string => Boolean(value)).map(normalizeOutcomeIdentifier);
        if (!validParticipants.includes(targetKey)) {
          throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'target_team must match one of the configured participants', 422);
        }
        return { resolverType: 'FOOTBALL_MATCH_RESULT_V1', condition: 'TEAM_WIN', targetTeam };
      }
      if (!['HOME_WIN','AWAY_WIN','DRAW'].includes(String(conditionValue))) {
        throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Binary football resolver requires an explicit HOME_WIN, AWAY_WIN, DRAW or TEAM_WIN condition', 422);
      }
      return {
        resolverType: 'FOOTBALL_MATCH_RESULT_V1',
        condition: conditionValue as 'HOME_WIN' | 'AWAY_WIN' | 'DRAW',
      };
    }
    return {
      resolverType: 'FOOTBALL_MATCH_RESULT_V1',
      condition: 'THREE_WAY',
      outcomeCodes: threeWayFootballOutcomeCodes(event),
    };
  }

  if (resolverType === 'FOOTBALL_TOTAL_GOALS_THRESHOLD_V1') {
    ensureBinaryYesNo(event);
    const operator = stringValue(scope.operator, condition.operator)?.toUpperCase();
    const threshold = numericValue(scope.threshold, condition.threshold, scope.total_goals_threshold);
    if (!['GT','GTE','LT','LTE'].includes(String(operator))) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Football goals resolver operator must be GT, GTE, LT or LTE', 422);
    }
    if (threshold === null || threshold < 0 || threshold > 50) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Football total-goals threshold must be between 0 and 50', 422);
    }
    return {
      resolverType: 'FOOTBALL_TOTAL_GOALS_THRESHOLD_V1',
      operator: operator as 'GT' | 'GTE' | 'LT' | 'LTE',
      threshold,
    } satisfies FootballTotalGoalsThresholdSpec;
  }

  if (resolverType === 'PUBLIC_RECORD_RULE_V1') {
    ensureBinaryYesNo(event);
    const rule = isRecord(scope.rule) ? scope.rule : {};
    const legacyCondition = typeof scope.condition === 'string' ? scope.condition : '';
    const operator = stringValue(rule.operator, scope.operator)?.toUpperCase();
    const field = stringValue(rule.field, rule.field_pattern, scope.field_pattern);
    const cutoff = stringValue(rule.cutoff, scope.cutoff_local_time, scope.cutoffLocalTime) ?? legacyCondition.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i)?.[1] ?? null;
    if (!['BEFORE_OR_AT','AFTER','EQUALS','CONTAINS','EXISTS','GT','GTE','LT','LTE'].includes(String(operator))) throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID','Public-record rule requires a supported deterministic operator',422);
    return { resolverType:'PUBLIC_RECORD_RULE_V1', operator:operator as 'BEFORE_OR_AT'|'AFTER'|'EQUALS'|'CONTAINS'|'EXISTS'|'GT'|'GTE'|'LT'|'LTE', field, expected:(rule.expected as string|number|boolean|null) ?? null, cutoff, timeZone:stringValue(rule.timezone,scope.timezone,scope.time_zone), recordDate:stringValue(rule.record_date,scope.record_date) };
  }




  throw new OracleRuntimeError('RESOLVER_UNSUPPORTED','This market does not yet have a deterministic VAD resolver specification',422);
}

function requiredCapability(spec: ResolverSpec) {
  if (spec.resolverType === 'CRYPTO_PRICE_THRESHOLD_V1' || spec.resolverType === 'CRYPTO_PRICE_TOUCH_THRESHOLD_V1') return 'CRYPTO_PRICE_THRESHOLD';
  if (spec.resolverType === 'FOOTBALL_MATCH_RESULT_V1' || spec.resolverType === 'FOOTBALL_TOTAL_GOALS_THRESHOLD_V1') return 'FOOTBALL_MATCH_RESULT';
  if (spec.resolverType === 'FINANCIAL_PRICE_THRESHOLD_V1') return 'FINANCIAL_PRICE_THRESHOLD';
  if (spec.resolverType === 'FRED_SERIES_THRESHOLD_V1') return 'FRED_SERIES_THRESHOLD';
  return 'PUBLIC_RECORD_EVIDENCE';
}

function policyProviderCodes(sourceHierarchy: unknown) {
  if (!Array.isArray(sourceHierarchy)) return new Set<string>();
  const selected = new Set<string>();
  for (const entry of sourceHierarchy) {
    const candidate = typeof entry === 'string'
      ? entry
      : isRecord(entry)
        ? stringValue(entry.provider_code, entry.providerCode, entry.code)
        : null;
    if (!candidate) continue;
    selected.add(candidate.toUpperCase());
  }
  return selected;
}

export function eligibleProviders(event: DueOracleEvent, spec: ResolverSpec, providers: OracleProvider[]) {
  const policyCodes = policyProviderCodes(event.sourceHierarchy);
  const hasPolicyHierarchy = Array.isArray(event.sourceHierarchy) && event.sourceHierarchy.length > 0;
  const capability = requiredCapability(spec);
  const policyPriority = new Map<string, number>();
  if (Array.isArray(event.sourceHierarchy)) {
    event.sourceHierarchy.forEach((entry, index) => {
      const code = typeof entry === 'string'
        ? entry
        : isRecord(entry) ? stringValue(entry.provider_code, entry.providerCode, entry.code) : null;
      if (!code) return;
      const explicit = isRecord(entry) ? numericValue(entry.priority) : null;
      policyPriority.set(code.toUpperCase(), explicit === null ? index : explicit);
    });
  }
  return providers
    .filter((provider) => provider.environment === 'PRODUCTION')
    .filter((provider) => ['ACTIVE','DEGRADED'].includes(provider.status))
    // Never attempt a settlement source until its secret/configuration is present.
    .filter((provider) => provider.configured === true)
    // A previously confirmed outage removes the provider from this run; UNKNOWN
    // remains eligible because credential-only probes intentionally avoid spend.
    .filter((provider) => !provider.healthStatus || !['UNAVAILABLE'].includes(String(provider.healthStatus).toUpperCase()))
    .filter((provider) => provider.capabilities.map((item) => String(item).toUpperCase()).includes(capability))
    .filter((provider) => !hasPolicyHierarchy || policyCodes.has(provider.code.toUpperCase()))
    .sort((a, b) => {
      const aPriority = policyPriority.get(a.code.toUpperCase()) ?? a.priority;
      const bPriority = policyPriority.get(b.code.toUpperCase()) ?? b.priority;
      return aPriority - bPriority || a.priority - b.priority || a.code.localeCompare(b.code);
    });
}

function sportsResourceFor(provider: OracleProvider, event: DueOracleEvent): OracleResource | null {
  const existing = provider.resources.find((resource) =>
    resource.status === 'ACTIVE'
    && resource.resourceType === 'CANONICAL_EVENT'
    && resource.canonicalKey === event.eventPublicId,
  );
  if (existing) return existing;

  const scope = event.resolutionScope ?? {};
  const subject = isRecord(scope.subject) ? scope.subject : {};
  const normalized = event.normalizedParameters ?? {};
  const homeTeam = stringValue(
    subject.home_team, subject.homeTeam, subject.competitor_a, subject.competitorA,
    subject.participant_a, subject.participantA, scope.home_team, scope.homeTeam,
  );
  const awayTeam = stringValue(
    subject.away_team, subject.awayTeam, subject.competitor_b, subject.competitorB,
    subject.participant_b, subject.participantB, scope.away_team, scope.awayTeam,
  );
  const kickoffRaw = stringValue(
    subject.match_starts_at, subject.matchStartsAt, subject.starts_at, subject.startsAt,
    scope.match_starts_at, scope.matchStartsAt, normalized.time_scope, normalized.timeScope,
  );
  const kickoff = kickoffRaw ? new Date(kickoffRaw) : null;
  const competitionName = stringValue(subject.competition, subject.competition_name, subject.competitionName, scope.competition, normalized.competition);
  if (!homeTeam || !awayTeam || homeTeam.toLowerCase() === awayTeam.toLowerCase()
      || !kickoff || !Number.isFinite(kickoff.getTime()) || !competitionName) {
    return null;
  }

  let competitionCode: string | null = null;
  if (provider.code === 'FOOTBALL_DATA') {
    const normalize = (value: string) => normalizeOutcomeIdentifier(value);
    const competition = normalize(competitionName);
    const mapped = provider.resources.find((resource) => {
      if (resource.status !== 'ACTIVE' || resource.resourceType !== 'SPORTS_COMPETITION') return false;
      const metadata = resource.metadata ?? {};
      const aliases = Array.isArray(metadata.aliases)
        ? metadata.aliases.filter((value): value is string => typeof value === 'string')
        : [];
      const names = [resource.canonicalKey, resource.externalKey, stringValue(metadata.display_name, metadata.displayName), ...aliases]
        .filter((value): value is string => Boolean(value))
        .map(normalize);
      return names.includes(competition);
    });
    competitionCode = mapped?.externalKey ?? null;
    if (!competitionCode) return null;
  } else if (provider.code !== 'THESPORTSDB' && provider.code !== 'API_SPORTS') {
    return null;
  }

  const explicitlyHomeAway = Boolean(
    stringValue(subject.home_team, subject.homeTeam, scope.home_team, scope.homeTeam)
    && stringValue(subject.away_team, subject.awayTeam, scope.away_team, scope.awayTeam),
  );
  return {
    id: -Math.abs(event.eventId),
    resourceType: 'CANONICAL_EVENT',
    canonicalKey: event.eventPublicId,
    externalKey: event.eventPublicId,
    status: 'ACTIVE',
    metadata: {
      lookup_mode: provider.code === 'FOOTBALL_DATA' ? 'COMPETITION_DAY_TEAMS' : 'EVENTS_DAY_TEAMS',
      competition_code: competitionCode,
      competition_name: competitionName,
      home_team: homeTeam,
      away_team: awayTeam,
      match_starts_at: kickoff.toISOString(),
      allow_home_away_flip: scope.allow_home_away_flip === true || !explicitlyHomeAway,
      canonical_event_public_id: event.eventPublicId,
    },
  };
}

export function resourceFor(provider: OracleProvider, event: DueOracleEvent, spec: ResolverSpec): OracleResource | null {
  if (spec.resolverType === 'CRYPTO_PRICE_THRESHOLD_V1' || spec.resolverType === 'CRYPTO_PRICE_TOUCH_THRESHOLD_V1') {
    const canonicalKey = `${spec.asset}/${spec.quote}`.toUpperCase();
    return provider.resources.find((resource) =>
      resource.status === 'ACTIVE'
      && (resource.resourceType === 'CRYPTO_PAIR' || resource.resourceType === 'FINANCIAL_SYMBOL')
      && resource.canonicalKey.toUpperCase() === canonicalKey,
    ) ?? null;
  }
  if (spec.resolverType === 'FOOTBALL_MATCH_RESULT_V1' || spec.resolverType === 'FOOTBALL_TOTAL_GOALS_THRESHOLD_V1') {
    return sportsResourceFor(provider, event);
  }
  if (spec.resolverType === 'FINANCIAL_PRICE_THRESHOLD_V1') {
    const pair = `${spec.symbol}/${spec.quote}`.toUpperCase();
    const allowedTypes = new Set(['FINANCIAL_SYMBOL', 'CRYPTO_PAIR']);
    return provider.resources.find((resource) =>
      resource.status === 'ACTIVE' && allowedTypes.has(resource.resourceType)
      && resource.canonicalKey.toUpperCase() === pair,
    ) ?? null;
  }
  if (spec.resolverType === 'FRED_SERIES_THRESHOLD_V1') {
    return provider.resources.find((resource) =>
      resource.status === 'ACTIVE' && resource.resourceType === 'FRED_SERIES'
      && resource.canonicalKey.toUpperCase() === spec.seriesId,
    ) ?? null;
  }
  return provider.resources.find((resource) =>
    resource.status === 'ACTIVE' && resource.resourceType === 'PUBLIC_EVENT' && resource.canonicalKey === event.eventPublicId,
  ) ?? null;
}

export async function resolveWithProvider(
  provider: OracleProvider,
  resource: OracleResource,
  spec: ResolverSpec,
): Promise<ProviderResolutionResult> {
  if (spec.resolverType === 'CRYPTO_PRICE_THRESHOLD_V1') {
    return resolveCryptoWithProvider(provider, resource, spec);
  }
  if (spec.resolverType === 'CRYPTO_PRICE_TOUCH_THRESHOLD_V1') {
    if (provider.code === 'PYTH') return { kind: 'skipped', code: 'RESOLVER_NOT_SUPPORTED_BY_PROVIDER', detail: 'Pyth historical snapshots cannot prove whether a threshold was touched anywhere inside the full window' };
    if (provider.code === 'COINGECKO') return resolveCryptoTouchWithCoinGecko(provider, resource, spec);
    if (provider.code === 'KRAKEN') return resolveCryptoTouchWithKraken(provider, resource, spec);
    if (provider.code === 'TWELVE_DATA' || provider.code === 'COINBASE') return resolveFinancialPriceTouchThresholdWithProvider(provider, resource, spec);
    return { kind: 'skipped', code: 'PROVIDER_NOT_COMPATIBLE' };
  }
  if (spec.resolverType === 'FOOTBALL_MATCH_RESULT_V1' || spec.resolverType === 'FOOTBALL_TOTAL_GOALS_THRESHOLD_V1') {
    return resolveFootballFixtureWithProvider(provider, resource, spec);
  }
  if (spec.resolverType === 'FINANCIAL_PRICE_THRESHOLD_V1') {
    return resolveFinancialPriceThresholdWithProvider(provider, resource, spec);
  }
  if (spec.resolverType === 'FRED_SERIES_THRESHOLD_V1') {
    return resolveFredSeriesThresholdWithProvider(provider, resource, spec);
  }
  return resolvePublicRecord(resource, spec, provider);
}
