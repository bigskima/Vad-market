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

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function getAdminProviderReadiness() {
  const { data, error } = await supabase.rpc('admin_provider_readiness');
  fail(error);
  return (data ?? []) as ProviderReadinessRow[];
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

export async function setProviderStatus(providerCode: string, environment: 'SANDBOX' | 'PRODUCTION', status: 'ACTIVE' | 'DISABLED' | 'DEGRADED' | 'UNAVAILABLE') {
  const { error } = await supabase.rpc('admin_set_provider_status', { p_provider_code: providerCode, p_environment: environment, p_status: status });
  fail(error);
}
