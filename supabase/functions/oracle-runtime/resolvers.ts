import {
  type DueOracleEvent,
  type JsonRecord,
  type OracleProvider,
  type OracleResource,
  OracleRuntimeError,
  type ProviderResolutionResult,
  type ResolverSpec,
  type CryptoTouchThresholdSpec,
} from './types.ts';
import { resolveCryptoWithProvider, resolveCryptoTouchWithCoinGecko } from './providers.ts';
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
  if (!codes.has('YES') || !codes.has('NO')) {
    throw new OracleRuntimeError('UNSUPPORTED_OUTCOME_SCHEMA', 'Automated V1 resolvers require YES and NO outcomes', 422);
  }
}

export function parseResolverSpec(event: DueOracleEvent): ResolverSpec {
  ensureBinaryYesNo(event);
  const scope = event.resolutionScope ?? {};
  const subject = isRecord(scope.subject) ? scope.subject : {};
  const condition = isRecord(scope.condition) ? scope.condition : {};
  const resolverType = stringValue(scope.resolver_type, scope.resolverType)?.toUpperCase();

  if (resolverType === 'CRYPTO_PRICE_THRESHOLD_V1') {
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
    const symbol = stringValue(scope.symbol, subject.symbol, scope.asset, subject.asset)?.toUpperCase();
    const quote = stringValue(scope.quote, subject.quote, 'USD')?.toUpperCase();
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
    const seriesId = stringValue(scope.series_id, scope.seriesId, subject.series_id, subject.seriesId)?.toUpperCase();
    const operator = stringValue(scope.operator, condition.operator)?.toUpperCase();
    const threshold = numericValue(scope.threshold, condition.threshold);
    const dateRaw = stringValue(scope.observation_date, scope.observationDate, scope.record_date, scope.recordDate, scope.resolution_time, scope.resolutionTime, event.resolvesAfter);
    const observationDate = dateRaw ? dateRaw.slice(0, 10) : '';
    const vintageRaw = stringValue(scope.vintage_date, scope.vintageDate);
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
    const conditionValue = stringValue(
      typeof scope.condition === 'string' ? scope.condition : null,
      condition.value,
      condition.result,
      scope.result,
    )?.toUpperCase();
    if (!['HOME_WIN','AWAY_WIN','DRAW'].includes(String(conditionValue))) {
      throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Football resolver condition must be HOME_WIN, AWAY_WIN or DRAW', 422);
    }
    return {
      resolverType: 'FOOTBALL_MATCH_RESULT_V1',
      condition: conditionValue as 'HOME_WIN' | 'AWAY_WIN' | 'DRAW',
    };
  }

  if (resolverType === 'PUBLIC_RECORD_RULE_V1') {
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
  if (spec.resolverType === 'FOOTBALL_MATCH_RESULT_V1') return 'FOOTBALL_MATCH_RESULT';
  if (spec.resolverType === 'FINANCIAL_PRICE_THRESHOLD_V1') return 'FINANCIAL_PRICE_THRESHOLD';
  if (spec.resolverType === 'FRED_SERIES_THRESHOLD_V1') return 'FRED_SERIES_THRESHOLD';
  return 'PUBLIC_RECORD_EVIDENCE';
}

function policyProviderCodes(sourceHierarchy: unknown, knownProviderCodes: Set<string>) {
  if (!Array.isArray(sourceHierarchy)) return new Set<string>();
  const selected = new Set<string>();
  for (const entry of sourceHierarchy) {
    const candidate = typeof entry === 'string'
      ? entry
      : isRecord(entry)
        ? stringValue(entry.provider_code, entry.providerCode, entry.code)
        : null;
    if (!candidate) continue;
    const normalized = candidate.toUpperCase();
    if (knownProviderCodes.has(normalized)) selected.add(normalized);
  }
  return selected;
}

export function eligibleProviders(event: DueOracleEvent, spec: ResolverSpec, providers: OracleProvider[]) {
  const knownCodes = new Set(providers.map((provider) => provider.code.toUpperCase()));
  const policyCodes = policyProviderCodes(event.sourceHierarchy, knownCodes);
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
    .filter((provider) => provider.capabilities.map((item) => String(item).toUpperCase()).includes(capability))
    .filter((provider) => policyCodes.size === 0 || policyCodes.has(provider.code.toUpperCase()))
    .sort((a, b) => {
      const aPriority = policyPriority.get(a.code.toUpperCase()) ?? a.priority;
      const bPriority = policyPriority.get(b.code.toUpperCase()) ?? b.priority;
      return aPriority - bPriority || a.priority - b.priority || a.code.localeCompare(b.code);
    });
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
  if (spec.resolverType === 'FOOTBALL_MATCH_RESULT_V1') {
    return provider.resources.find((resource) =>
      resource.status === 'ACTIVE' && resource.resourceType === 'CANONICAL_EVENT' && resource.canonicalKey === event.eventPublicId,
    ) ?? null;
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
    if (provider.code === 'TWELVE_DATA') return resolveFinancialPriceTouchThresholdWithProvider(provider, resource, spec);
    return { kind: 'skipped', code: 'PROVIDER_NOT_COMPATIBLE' };
  }
  if (spec.resolverType === 'FOOTBALL_MATCH_RESULT_V1') {
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
