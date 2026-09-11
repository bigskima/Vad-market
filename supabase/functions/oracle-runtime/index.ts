import {
  eligibleProviders,
  parseResolverSpec,
  resourceFor,
  resolveWithProvider,
} from './resolvers.ts';
import { probeProvider, providerSecret } from './providers.ts';
import { requireRuntimeAccess } from './runtime.ts';
import {
  type DueOracleEvent,
  type JsonRecord,
  type OracleProvider,
  OracleRuntimeError,
} from './types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeProviderFilter(value: unknown) {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map((item) => item.trim().toUpperCase());
  return normalized.length ? new Set(normalized) : null;
}

function safeError(error: unknown) {
  if (error instanceof OracleRuntimeError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  if (error instanceof Error) {
    return { code: 'ORACLE_RUNTIME_FAILED', message: error.message || 'Oracle runtime failed', status: 500 };
  }
  return { code: 'ORACLE_RUNTIME_FAILED', message: 'Oracle runtime failed', status: 500 };
}

async function providerCatalog(admin: ReturnType<typeof import('@supabase/supabase-js')['createClient']>) {
  const { data, error } = await admin.rpc('internal_oracle_provider_catalog');
  if (error) throw new OracleRuntimeError('PROVIDER_CATALOG_FAILED', 'Could not load oracle provider catalog', 500);
  return (Array.isArray(data) ? data : []) as OracleProvider[];
}

async function dueEvents(
  admin: ReturnType<typeof import('@supabase/supabase-js')['createClient']>,
  eventPublicId: string | null,
  limit: number,
) {
  const { data, error } = await admin.rpc('internal_oracle_due_events', {
    p_event_public_id: eventPublicId,
    p_limit: limit,
  });
  if (error) throw new OracleRuntimeError('ORACLE_QUEUE_FAILED', 'Could not load due oracle events', 500);
  return (Array.isArray(data) ? data : []) as DueOracleEvent[];
}

async function recordHealth(
  admin: ReturnType<typeof import('@supabase/supabase-js')['createClient']>,
  provider: OracleProvider,
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' | 'UNKNOWN',
  configured: boolean,
  latencyMs: number | null,
  metadata: JsonRecord,
) {
  const { error } = await admin.rpc('internal_record_oracle_provider_health', {
    p_provider_code: provider.code,
    p_environment: provider.environment,
    p_health_status: healthStatus,
    p_configured: configured,
    p_latency_ms: latencyMs,
    p_metadata: metadata,
  });
  if (error) throw new OracleRuntimeError('PROVIDER_HEALTH_WRITE_FAILED', `Could not record ${provider.code} health`, 500);
}

async function recordAttempt(
  admin: ReturnType<typeof import('@supabase/supabase-js')['createClient']>,
  input: {
    eventId: number;
    provider: OracleProvider;
    resolverType: string;
    attemptKey: string;
    status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
    requestMetadata?: JsonRecord;
    responseMetadata?: JsonRecord;
    failureCode?: string | null;
    latencyMs?: number | null;
    startedAt: Date;
  },
) {
  const { error } = await admin.rpc('internal_record_oracle_attempt', {
    p_event_id: input.eventId,
    p_provider_code: input.provider.code,
    p_environment: input.provider.environment,
    p_resolver_type: input.resolverType,
    p_attempt_key: input.attemptKey,
    p_status: input.status,
    p_request_metadata: input.requestMetadata ?? {},
    p_response_metadata: input.responseMetadata ?? {},
    p_failure_code: input.failureCode ?? null,
    p_latency_ms: input.latencyMs ?? null,
    p_started_at: input.startedAt.toISOString(),
  });
  if (error) throw new OracleRuntimeError('ORACLE_ATTEMPT_WRITE_FAILED', 'Could not record oracle ingestion attempt', 500);
}

async function recordObservation(
  admin: ReturnType<typeof import('@supabase/supabase-js')['createClient']>,
  event: DueOracleEvent,
  provider: OracleProvider,
  resolverType: string,
  observation: {
    observedOutcome: 'YES' | 'NO';
    observedAt: Date;
    evidenceReference: string;
    payload: JsonRecord;
  },
) {
  const idempotencyKey = [
    'oracle-v1',
    event.eventPublicId,
    provider.code,
    resolverType,
    observation.observedAt.toISOString(),
  ].join(':');
  const { data, error } = await admin.rpc('internal_record_verified_oracle_observation', {
    p_event_id: event.eventId,
    p_provider_id: provider.id,
    p_source_code: provider.code,
    p_observed_outcome: observation.observedOutcome,
    p_payload: observation.payload,
    p_evidence_reference: observation.evidenceReference,
    p_observed_at: observation.observedAt.toISOString(),
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw new OracleRuntimeError('ORACLE_OBSERVATION_WRITE_FAILED', 'Verified oracle observation could not be recorded', 500);
  return Number(data);
}

function configuredFor(provider: OracleProvider) {
  return provider.secretReference ? Boolean(providerSecret(provider)) : true;
}

function providerFailureHealth(error: unknown, configured: boolean) {
  const runtimeError = error instanceof OracleRuntimeError ? error : null;
  if (runtimeError?.code === 'SECRET_MISSING' || runtimeError?.code === 'PROVIDER_HTTP_401' || runtimeError?.code === 'PROVIDER_HTTP_403') {
    return { status: 'UNAVAILABLE' as const, configured: false };
  }
  if (runtimeError?.code === 'PROVIDER_TIMEOUT' || runtimeError?.code === 'PROVIDER_NETWORK_ERROR' || runtimeError?.code.startsWith('PROVIDER_HTTP_5')) {
    return { status: 'DEGRADED' as const, configured };
  }
  return null;
}

async function runHealth(
  admin: ReturnType<typeof import('@supabase/supabase-js')['createClient']>,
  providers: OracleProvider[],
  filter: Set<string> | null,
) {
  const selected = providers.filter((provider) => !filter || filter.has(provider.code.toUpperCase()));
  const results: JsonRecord[] = [];
  for (const provider of selected) {
    const started = Date.now();
    const credentialPresent = configuredFor(provider);
    try {
      const probe = await probeProvider(provider);
      await recordHealth(admin, provider, 'HEALTHY', true, probe.latencyMs, {
        ...probe.metadata,
        credential_present: credentialPresent,
        checked_by: 'oracle-runtime',
      });
      results.push({
        provider: provider.code,
        providerStatus: provider.status,
        health: 'HEALTHY',
        configured: true,
        latencyMs: probe.latencyMs,
      });
    } catch (error) {
      const safe = safeError(error);
      const failure = providerFailureHealth(error, credentialPresent);
      const health = failure?.status ?? 'UNAVAILABLE';
      const configured = failure?.configured ?? credentialPresent;
      await recordHealth(admin, provider, health, configured, Date.now() - started, {
        checked_by: 'oracle-runtime',
        failure_code: safe.code,
      });
      results.push({
        provider: provider.code,
        providerStatus: provider.status,
        health,
        configured,
        failureCode: safe.code,
      });
    }
  }
  return results;
}

async function processEvent(
  admin: ReturnType<typeof import('@supabase/supabase-js')['createClient']>,
  event: DueOracleEvent,
  providers: OracleProvider[],
  providerFilter: Set<string> | null,
) {
  let spec;
  try {
    spec = parseResolverSpec(event);
  } catch (error) {
    const safe = safeError(error);
    return {
      eventPublicId: event.eventPublicId,
      status: 'SKIPPED',
      reason: safe.code,
      detail: safe.message,
      observationsRecorded: 0,
    };
  }

  const providerPool = eligibleProviders(event, spec, providers)
    .filter((provider) => !providerFilter || providerFilter.has(provider.code.toUpperCase()));
  if (!providerPool.length) {
    return {
      eventPublicId: event.eventPublicId,
      resolverType: spec.resolverType,
      status: 'WAITING_FOR_PROVIDER',
      observationsRecorded: 0,
    };
  }

  const providerResults: JsonRecord[] = [];
  let observationsRecorded = 0;

  for (const provider of providerPool) {
    const startedAt = new Date();
    const startedMs = Date.now();
    const resource = resourceFor(provider, event, spec);
    const attemptKey = ['oracle-attempt-v1', event.eventPublicId, provider.code, spec.resolverType].join(':');
    const requestMetadata: JsonRecord = {
      event_public_id: event.eventPublicId,
      resolver_type: spec.resolverType,
      canonical_resource: spec.resolverType === 'CRYPTO_PRICE_THRESHOLD_V1'
        ? `${spec.asset}/${spec.quote}`
        : event.eventPublicId,
    };

    if (!resource) {
      await recordAttempt(admin, {
        eventId: event.eventId,
        provider,
        resolverType: spec.resolverType,
        attemptKey,
        status: 'SKIPPED',
        requestMetadata,
        responseMetadata: {},
        failureCode: 'RESOURCE_NOT_BOUND',
        latencyMs: 0,
        startedAt,
      });
      providerResults.push({ provider: provider.code, status: 'SKIPPED', reason: 'RESOURCE_NOT_BOUND' });
      continue;
    }

    try {
      const result = await resolveWithProvider(provider, resource, spec);
      const latencyMs = Date.now() - startedMs;
      if (result.kind === 'skipped') {
        await recordAttempt(admin, {
          eventId: event.eventId,
          provider,
          resolverType: spec.resolverType,
          attemptKey,
          status: 'SKIPPED',
          requestMetadata,
          responseMetadata: { detail: result.detail ?? null },
          failureCode: result.code,
          latencyMs,
          startedAt,
        });
        providerResults.push({ provider: provider.code, status: 'SKIPPED', reason: result.code });
        continue;
      }

      const observationId = await recordObservation(admin, event, provider, spec.resolverType, result.observation);
      observationsRecorded += 1;
      await recordAttempt(admin, {
        eventId: event.eventId,
        provider,
        resolverType: spec.resolverType,
        attemptKey,
        status: 'SUCCEEDED',
        requestMetadata,
        responseMetadata: {
          observation_id: observationId,
          outcome: result.observation.observedOutcome,
          observed_at: result.observation.observedAt.toISOString(),
        },
        latencyMs,
        startedAt,
      });
      await recordHealth(admin, provider, 'HEALTHY', configuredFor(provider), latencyMs, {
        checked_by: 'oracle-runtime',
        source: 'resolution_fetch',
      });
      providerResults.push({
        provider: provider.code,
        status: 'RECORDED',
        observationId,
        outcome: result.observation.observedOutcome,
        observedAt: result.observation.observedAt.toISOString(),
      });
    } catch (error) {
      const safe = safeError(error);
      const latencyMs = Date.now() - startedMs;
      await recordAttempt(admin, {
        eventId: event.eventId,
        provider,
        resolverType: spec.resolverType,
        attemptKey,
        status: 'FAILED',
        requestMetadata,
        responseMetadata: {},
        failureCode: safe.code,
        latencyMs,
        startedAt,
      });
      const healthFailure = providerFailureHealth(error, configuredFor(provider));
      if (healthFailure) {
        await recordHealth(admin, provider, healthFailure.status, healthFailure.configured, latencyMs, {
          checked_by: 'oracle-runtime',
          source: 'resolution_fetch',
          failure_code: safe.code,
        });
      }
      providerResults.push({ provider: provider.code, status: 'FAILED', reason: safe.code });
    }
  }

  return {
    eventPublicId: event.eventPublicId,
    resolverType: spec.resolverType,
    status: observationsRecorded > 0 ? 'PROCESSED' : 'WAITING_FOR_EVIDENCE',
    observationsRecorded,
    providers: providerResults,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    if (!isRecord(body)) throw new OracleRuntimeError('INVALID_BODY', 'Request body must be an object', 400);
    const action = String(body.action ?? '').toLowerCase();
    if (action !== 'health' && action !== 'process') {
      throw new OracleRuntimeError('INVALID_ACTION', 'Action must be health or process', 400);
    }

    const actor = await requireRuntimeAccess(req, action);
    const providers = await providerCatalog(actor.admin);
    const providerFilter = normalizeProviderFilter(body.providerCodes);

    if (action === 'health') {
      const results = await runHealth(actor.admin, providers, providerFilter);
      return json({
        ok: true,
        action: 'health',
        checked: results.length,
        providers: results,
        generatedAt: new Date().toISOString(),
      });
    }

    const eventPublicId = typeof body.eventPublicId === 'string' && body.eventPublicId.trim()
      ? body.eventPublicId.trim()
      : null;
    const requestedLimit = Number(body.limit ?? 20);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(Math.trunc(requestedLimit), 100)) : 20;
    const events = await dueEvents(actor.admin, eventPublicId, limit);
    const results = [];
    for (const event of events) {
      results.push(await processEvent(actor.admin, event, providers, providerFilter));
    }

    return json({
      ok: true,
      action: 'process',
      dueEvents: events.length,
      processedEvents: results.length,
      results,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const safe = safeError(error);
    return json({ error: safe.code, message: safe.message }, safe.status);
  }
});
