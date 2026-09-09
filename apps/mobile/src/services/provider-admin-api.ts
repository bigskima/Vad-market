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

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function getAdminProviderReadiness() {
  const { data, error } = await supabase.rpc('admin_provider_readiness');
  fail(error);
  return (data ?? []) as ProviderReadinessRow[];
}

export async function getProviderChangeQueue() {
  const { data, error } = await supabase.rpc('admin_provider_change_queue');
  fail(error);
  return (data ?? []) as ProviderChangeRequest[];
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
  fail(error);
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
  fail(error);
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
  fail(error);
  return data as string;
}

export async function decideProviderStatusRequest(requestPublicId: string, decision: 'APPROVE' | 'REJECT', decisionReason: string) {
  const { error } = await supabase.rpc('admin_decide_provider_status_request', {
    p_request_public_id: requestPublicId,
    p_decision: decision,
    p_decision_reason: decisionReason,
  });
  fail(error);
}

// Safety-only direct action. ACTIVE/DEGRADED transitions are intentionally rejected server-side.
export async function setProviderSafetyStatus(providerCode: string, environment: 'SANDBOX' | 'PRODUCTION', status: 'DISABLED' | 'UNAVAILABLE') {
  const { error } = await supabase.rpc('admin_set_provider_status', { p_provider_code: providerCode, p_environment: environment, p_status: status });
  fail(error);
}
