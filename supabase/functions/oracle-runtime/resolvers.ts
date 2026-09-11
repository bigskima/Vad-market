import {
  type DueOracleEvent,
  type JsonRecord,
  type OracleProvider,
  type OracleResource,
  OracleRuntimeError,
  type ProviderResolutionResult,
  type ResolverSpec,
} from './types.ts';
import { resolveCryptoWithProvider, resolveFootballWithProvider } from './providers.ts';

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

  throw new OracleRuntimeError(
    'RESOLVER_UNSUPPORTED',
    'This market does not yet have a deterministic VAD resolver specification',
    422,
  );
}

function requiredCapability(spec: ResolverSpec) {
  return spec.resolverType === 'CRYPTO_PRICE_THRESHOLD_V1'
    ? 'CRYPTO_PRICE_THRESHOLD'
    : 'FOOTBALL_MATCH_RESULT';
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
  return providers
    .filter((provider) => provider.environment === 'PRODUCTION')
    .filter((provider) => ['ACTIVE','DEGRADED'].includes(provider.status))
    .filter((provider) => provider.capabilities.map((item) => String(item).toUpperCase()).includes(capability))
    .filter((provider) => policyCodes.size === 0 || policyCodes.has(provider.code.toUpperCase()))
    .sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code));
}

export function resourceFor(provider: OracleProvider, event: DueOracleEvent, spec: ResolverSpec): OracleResource | null {
  if (spec.resolverType === 'CRYPTO_PRICE_THRESHOLD_V1') {
    const canonicalKey = `${spec.asset}/${spec.quote}`;
    return provider.resources.find((resource) =>
      resource.status === 'ACTIVE' && resource.resourceType === 'CRYPTO_PAIR' && resource.canonicalKey.toUpperCase() === canonicalKey,
    ) ?? null;
  }
  return provider.resources.find((resource) =>
    resource.status === 'ACTIVE' && resource.resourceType === 'CANONICAL_EVENT' && resource.canonicalKey === event.eventPublicId,
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
  return resolveFootballWithProvider(provider, resource, spec);
}
