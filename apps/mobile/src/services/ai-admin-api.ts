import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type AiProviderAdapter =
  | 'OPENAI_COMPATIBLE'
  | 'GEMINI_GENERATE_CONTENT'
  | 'ANTHROPIC_MESSAGES'
  | 'CLOUDFLARE_WORKERS_AI';

export type AiCapability = 'MARKET_ADMISSION' | 'USER_ASSISTANT';

export type AiProviderModelRow = {
  ai_provider_id: number;
  provider_code: string;
  provider_name: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  provider_status: string;
  model_code: string;
  model_status: string;
  adapter: AiProviderAdapter | null;
  endpoint: string | null;
  secret_reference: string | null;
  priority: number;
  capabilities: string[] | null;
  cost_policy: Record<string, unknown> | null;
};

function fail(error: { message: string; code?: string; details?: string; hint?: string } | null, fallback: string) {
  if (error) throw userFacingError(error, 'admin', fallback);
}

export async function getAdminAiProviderCatalog() {
  const { data, error } = await supabase.rpc('admin_ai_provider_catalog');
  fail(error, 'We could not load AI service settings right now. Refresh and try again.');
  return (data ?? []) as AiProviderModelRow[];
}

export async function setAdminAiModelCapabilities(
  aiProviderId: number,
  capabilities: AiCapability[],
) {
  const { data, error } = await supabase.rpc('admin_set_ai_model_capabilities', {
    p_ai_provider_id: aiProviderId,
    p_capabilities: capabilities,
  });
  fail(error, 'We could not update what this AI model can be used for. Please try again.');
  return (data ?? []) as AiCapability[];
}

export async function upsertAdminAiProviderModel(input: {
  providerCode: string;
  providerName: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  adapter: AiProviderAdapter;
  endpoint: string;
  modelCode: string;
  secretReference: string;
  priority: number;
  apiVersion?: string | null;
  costPolicy?: Record<string, unknown>;
  capabilities?: AiCapability[];
}) {
  const { data, error } = await supabase.rpc('admin_upsert_ai_provider_model', {
    p_provider_code: input.providerCode.trim().toUpperCase(),
    p_provider_name: input.providerName.trim(),
    p_environment: input.environment,
    p_adapter: input.adapter,
    p_endpoint: input.endpoint.trim(),
    p_model_code: input.modelCode.trim(),
    p_secret_reference: input.secretReference.trim().toUpperCase(),
    p_priority: input.priority,
    p_cost_policy: input.costPolicy ?? {},
    p_api_version: input.apiVersion?.trim() || null,
  });
  fail(error, 'We could not save these AI service settings right now. Please try again.');

  const aiProviderId = Number(data);
  await setAdminAiModelCapabilities(
    aiProviderId,
    input.capabilities?.length
      ? input.capabilities
      : ['MARKET_ADMISSION', 'USER_ASSISTANT'],
  );
  return aiProviderId;
}
