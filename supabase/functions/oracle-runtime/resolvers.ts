import {
  type DueOracleEvent,
  type JsonRecord,
  type OracleProvider,
  type OracleResource,
  OracleRuntimeError,
  type ProviderResolutionResult,
  type ResolverSpec,
} from './types.ts';
import { resolveCryptoWithProvider } from './providers.ts';
import { resolveFootballFixtureWithProvider } from './football.ts';
import { resolvePublicRecord } from './public-record.ts';

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

  if (resolverType === 'PUBLIC_RECORD_RULE_V1' || resolverType === 'VAD_REVIEW_V1' || resolverType === 'LEGISLATIVE_SESSION_ADJOURNMENT_V1') {
    const rule = isRecord(scope.rule) ? scope.rule : {};
    const legacyCondition = typeof scope.condition === 'string' ? scope.condition : '';
    const operator = stringValue(rule.operator, scope.operator, resolverType === 'LEGISLATIVE_SESSION_ADJOURNMENT_V1' ? 'BEFORE_OR_AT' : null)?.toUpperCase();
    const field = stringValue(rule.field, rule.field_pattern, scope.field_pattern, resolverType === 'LEGISLATIVE_SESSION_ADJOURNMENT_V1' ? 'adjourned\\s+at\\s+(\\d{1,2}:\\d{2}\\s*(?:a\\.?m\\.?|p\\.?m\\.?))' : null);
    const cutoff = stringValue(rule.cutoff, scope.cutoff_local_time, scope.cutoffLocalTime) ?? legacyCondition.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i)?.[1] ?? null;
    if (!['BEFORE_OR_AT','AFTER','EQUALS','CONTAINS','EXISTS'].includes(String(operator))) throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID','Public-record rule requires a supported deterministic operator',422);
    return { resolverType:'PUBLIC_RECORD_RULE_V1', operator:operator as 'BEFORE_OR_AT'|'AFTER'|'EQUALS'|'CONTAINS'|'EXISTS', field, expected:(rule.expected as string|number|boolean|null) ?? null, cutoff, timeZone:stringValue(rule.timezone,scope.timezone,scope.time_zone), recordDate:stringValue(rule.record_date,scope.record_date,scope.legislative_date) };
  }\n\n
