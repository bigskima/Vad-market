import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type ProviderReadinessRow = {
  provider_code: string;
  provider_type: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  provider_status: string;
  configured: boolean;
  operation: string | null;
  country_code: string | null;
  asset_code: string | null;
  route_status: string | null;
  priority: number | null;
};

export type ProviderChangeRequest = {
  request_public_id: string;
  provider_code: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  current_status: string;
  requested_status: 'ACTIVE' | 'DISABLED' | 'DEGRADED' | 'UNAVAILABLE';
  reason: string;
  requested_by: string;
  created_at: string;
};

export type OracleProviderResource = {
  provider_code: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  provider_status: string;
  resource_type: 'CRYPTO_PAIR' | 'CANONICAL_EVENT' | 'SPORTS_COMPETITION' | 'PUBLIC_EVENT';
  canonical_key: string;
  external_key: string;
  resource_status: 'ACTIVE' | 'DISABLED';
  metadata: Record<string, unknown>;
  updated_at: string;
};

export type OraclePolicyRow = {
  public_id: string;
  name: string;
  capability_code: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED' | string;
  source_hierarchy: Array<Record<string, unknown> | string>;
  consensus_rule: Record<string, unknown>;
  void_rule: Record<string, unknown>;
  dispute_window_seconds: number;
  effective_at: string;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
};

export type OracleHealthResult = {
  provider: string;
  providerStatus: string;
  health: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' | 'UNKNOWN';
  configured: boolean;
  latencyMs?: number;
  failureCode?: string;
};

export type OracleRuntimeResponse = {
  ok: boolean;
  action: 'health' | 'process';
  generatedAt: string;
  checked?: number;
  dueEvents?: number;
  processedEvents?: number;
  providers?: OracleHealthResult[];
  results?: Array<Record<string, unknown>>;
};

function fail(error: { message: string; code?: string; details?: string; hint?: string } | null, fallback = 'This provider request could not be completed. Please try again.') {
  if (error) throw userFacingError(error, 'admin', fallback);
}

export async function getAdminProviderReadiness() {
  const { data, error } = await supabase.rpc('admin_provider_readiness');
  fail(error, 'We could not load provider status right now. Refresh and try again.');
  return (data ?? []) as ProviderReadinessRow[];
}

export async function getProviderChangeQueue() {
  const { data, error } = await supabase.rpc('admin_provider_change_queue');
  fail(error, 'We could not load pending provider changes right now. Refresh and try again.');
  return (data ?? []) as ProviderChangeRequest[];
}

export async function getOracleProviderResources() {
  const { data, error } = await supabase.rpc('admin_oracle_provider_resources');
  fail(error, 'We could not load oracle resources right now. Refresh and try again.');
  return (data ?? []) as OracleProviderResource[];
}

export async function getOraclePolicyCatalog() {
  const { data, error } = await supabase.rpc('admin_oracle_policy_catalog');
  fail(error, 'We could not load oracle policies right now. Refresh and try again.');
  return (data ?? []) as OraclePolicyRow[];
}

export async function approveOraclePolicy(policyPublicId: string) {
  const { data, error } = await supabase.rpc('admin_approve_oracle_policy', {
    p_policy_public_id: policyPublicId,
  });
  fail(error, 'We could not approve this oracle policy right now. Please try again.');
  return Boolean(data);
}

export async function validateOracleResolutionScope(input: {
  scope: Record<string, unknown>;
  closesAt?: string | null;
  resolvesAfter?: string | null;
}) {
  const { data, error } = await supabase.rpc('admin_validate_oracle_resolution_scope', {
    p_scope: input.scope,
    p_closes_at: input.closesAt ?? null,
    p_resolves_after: input.resolvesAfter ?? null,
  });
  fail(error, 'We could not validate this resolution setup right now. Please try again.');
  return (data ?? {}) as Record<string, unknown>;
}

export async function runOracleProviderHealth(providerCodes?: string[]) {
  const { data, error } = await supabase.functions.invoke<OracleRuntimeResponse>('oracle-runtime', {
    body: {
      action: 'health',
      ...(providerCodes?.length ? { providerCodes } : {}),
    },
  });
  fail(error, 'We could not complete the oracle health check right now. Please try again.');
  if (!data?.ok) throw new Error('The oracle health check did not complete. Please try again.');
  return data;
}

export async function processOracleQueue(input?: {
  eventPublicId?: string | null;
  limit?: number;
  providerCodes?: string[];
}) {
  const { data, error } = await supabase.functions.invoke<OracleRuntimeResponse>('oracle-runtime', {
    body: {
      action: 'process',
      ...(input?.eventPublicId ? { eventPublicId: input.eventPublicId } : {}),
      ...(input?.limit ? { limit: input.limit } : {}),
      ...(input?.providerCodes?.length ? { providerCodes: input.providerCodes } : {}),
    },
  });
  fail(error, 'We could not process the oracle queue right now. Please try again.');
  if (!data?.ok) throw new Error('The oracle queue did not complete. Please try again.');
  return data;
}

export async function bindOracleEventResource(input: {
  eventPublicId: string;
  providerCode: string;
  environment?: 'SANDBOX' | 'PRODUCTION';
  externalKey: string;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await supabase.rpc('admin_bind_oracle_event_resource', {
    p_event_public_id: input.eventPublicId,
    p_provider_code: input.providerCode,
    p_environment: input.environment ?? 'PRODUCTION',
    p_external_key: input.externalKey,
    p_metadata: input.metadata ?? {},
  });
  fail(error, 'We could not link this event resource right now. Please try again.');
  return Number(data);
}

export async function upsertOracleProviderResource(input: {
  providerCode: string;
  environment?: 'SANDBOX' | 'PRODUCTION';
  resourceType: OracleProviderResource['resource_type'];
  canonicalKey: string;
  externalKey: string;
  status?: 'ACTIVE' | 'DISABLED';
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await supabase.rpc('admin_upsert_oracle_provider_resource', {
    p_provider_code: input.providerCode,
    p_environment: input.environment ?? 'PRODUCTION',
    p_resource_type: input.resourceType,
    p_canonical_key: input.canonicalKey,
    p_external_key: input.externalKey,
    p_status: input.status ?? 'ACTIVE',
    p_metadata: input.metadata ?? {},
  });
  fail(error, 'We could not save this oracle resource right now. Please try again.');
  return Number(data);
}

export async function registerProvider(input: {
  code: string;
  name: string;
  providerType: 'PAYMENT' | 'IDENTITY_VERIFICATION' | 'ORACLE' | 'AI' | 'NOTIFICATION';
  environment: 'SANDBOX' | 'PRODUCTION';
  capabilities?: string[];
  priority?: number;
  secretReference?: string | null;
}) {
  const { data, error } = await supabase.rpc('admin_register_provider', {
    p_code: input.code,
    p_name: input.name,
    p_provider_type: input.providerType,
    p_environment: input.environment,
    p_capabilities: input.capabilities ?? [],
    p_priority: input.priority ?? 100,
    p_secret_reference: input.secretReference ?? null,
  });
  fail(error, 'We could not register this provider right now. Please try again.');
  return Number(data);
}

export async function upsertProviderRoute(input: {
  providerCode: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  operation: 'KYC' | 'DEPOSIT' | 'WITHDRAWAL' | 'REFUND' | 'ORACLE_OBSERVATION';
  countryCode: string;
  assetCode?: string | null;
  priority?: number;
  minAmount?: number | null;
  maxAmount?: number | null;
  enabled?: boolean;
}) {
  const { data, error } = await supabase.rpc('admin_upsert_provider_route', {
    p_provider_code: input.providerCode,
    p_environment: input.environment,
    p_operation: input.operation,
    p_country_code: input.countryCode,
    p_asset_code: input.assetCode ?? null,
    p_priority: input.priority ?? 100,
    p_min_amount: input.minAmount ?? null,
    p_max_amount: input.maxAmount ?? null,
    p_enabled: input.enabled ?? false,
  });
  fail(error, 'We could not save this provider route right now. Please try again.');
  return Number(data);
}

export async function requestProviderStatus(input: {
  providerCode: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  requestedStatus: 'ACTIVE' | 'DISABLED' | 'DEGRADED' | 'UNAVAILABLE';
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_request_provider_status', {
    p_provider_code: input.providerCode,
    p_environment: input.environment,
    p_requested_status: input.requestedStatus,
    p_reason: input.reason,
  });
  fail(error, 'We could not submit this provider status change right now. Please try again.');
  return data as string;
}

export async function decideProviderStatusRequest(
  requestPublicId: string,
  decision: 'APPROVE' | 'REJECT',
  decisionReason: string,
) {
  const { error } = await supabase.rpc('admin_decide_provider_status_request', {
    p_request_public_id: requestPublicId,
    p_decision: decision,
    p_decision_reason: decisionReason,
  });
  fail(error, 'We could not save this provider decision right now. Please try again.');
}

// Safety-only direct action. ACTIVE/DEGRADED transitions are intentionally rejected server-side.
export async function setProviderSafetyStatus(
  providerCode: string,
  environment: 'SANDBOX' | 'PRODUCTION',
  status: 'DISABLED' | 'UNAVAILABLE',
) {
  const { error } = await supabase.rpc('admin_set_provider_status', {
    p_provider_code: providerCode,
    p_environment: environment,
    p_status: status,
  });
  fail(error, 'We could not update this provider safety status right now. Please try again.');
}
