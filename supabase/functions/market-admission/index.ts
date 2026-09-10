import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function env(name: string) {
  return Deno.env.get(name)?.trim() || null;
}

function runtimeCredentials() {
  const url = env('SUPABASE_URL');
  const anon = env('SUPABASE_ANON_KEY') ?? env('SUPABASE_PUBLISHABLE_KEY');
  const service = env('SUPABASE_SERVICE_ROLE_KEY') ?? env('SUPABASE_SECRET_KEY');
  if (!url || !anon || !service) throw new Error('Supabase runtime credentials unavailable');
  return { url, anon, service };
}

function clients(authHeader: string) {
  const { url, anon, service } = runtimeCredentials();
  return {
    user: createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    admin: createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw json({ error: 'AUTH_REQUIRED' }, 401);
  const { url, anon } = runtimeCredentials();
  const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) throw json({ error: 'AUTH_INVALID' }, 401);
  return { user: data.user, authHeader };
}

type ProviderConfig = {
  aiProviderId: number;
  providerCode: string;
  providerName?: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  adapter: 'OPENAI_COMPATIBLE' | 'GEMINI_GENERATE_CONTENT' | 'ANTHROPIC_MESSAGES' | 'CLOUDFLARE_WORKERS_AI';
  endpoint: string;
  apiVersion?: string | null;
  modelCode: string;
  secretReference: string;
  priority: number;
};

type AdmissionContext = {
  proposal: {
    publicId: string;
    question: string;
    context?: string | null;
    submittedCategory?: string | null;
  };
  countryCode: string;
  activeAssetCodes: string[];
  selectedAssetCode?: string | null;
  assetSelectionRequired: boolean;
  policy: Record<string, unknown>;
  prompt?: {
    id: number;
    version: number;
    systemPrompt: string;
    outputSchema: Record<string, unknown>;
  } | null;
  template?: Record<string, unknown> | null;
  oraclePolicy?: Record<string, unknown> | null;
  duplicateCandidates: Record<string, unknown>[];
  providers: ProviderConfig[];
};

type AdmissionOutput = {
  suggestedDecision: 'AUTO_PUBLISH' | 'REVIEW' | 'NEEDS_CLARIFICATION';
  normalizedQuestion: string;
  description?: string | null;
  category: string;
  templateCode: string;
  normalizedParameters: Record<string, unknown>;
  resolutionScope: Record<string, unknown>;
  closesAt: string | null;
  resolvesAfter: string | null;
  confidence: number;
  objectivityScore: number;
  ambiguityScore: number;
  manipulationRiskScore: number;
  oracleAvailabilityScore: number;
  duplicateProbability: number;
  duplicateCandidateEventPublicId?: string | null;
  canonicalizationDecision?: 'EXACT_DUPLICATE' | 'SEMANTIC_DUPLICATE' | 'RELATED_EVENT' | 'DISTINCT_EVENT' | 'UNCERTAIN';
  reasons: string[];
  clarificationQuestions: string[];
  riskFlags: string[];
};

type AdmissionResult = {
  proposalId: string;
  lane: 'AUTO_PUBLISHED' | 'UNDER_REVIEW' | 'NEEDS_CLARIFICATION' | 'MERGED';
  status: string;
  reason: string;
  runId: string;
  published: boolean;
  instrumentId?: string | null;
  eventId?: string | null;
  clarificationQuestions?: string[];
  riskFlags?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedScore(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validateOutput(value: unknown): AdmissionOutput {
  if (!isRecord(value)) throw new Error('AI output is not an object');
  const decision = value.suggestedDecision;
  if (!['AUTO_PUBLISH', 'REVIEW', 'NEEDS_CLARIFICATION'].includes(String(decision))) {
    throw new Error('AI output has an invalid decision');
  }
  if (typeof value.normalizedQuestion !== 'string' || !value.normalizedQuestion.trim()) throw new Error('AI output is missing normalizedQuestion');
  if (typeof value.category !== 'string' || !value.category.trim()) throw new Error('AI output is missing category');
  if (typeof value.templateCode !== 'string' || !value.templateCode.trim()) throw new Error('AI output is missing templateCode');
  if (!isRecord(value.normalizedParameters) || !isRecord(value.resolutionScope)) throw new Error('AI output is missing canonical structure');
  for (const key of ['confidence', 'objectivityScore', 'ambiguityScore', 'manipulationRiskScore', 'oracleAvailabilityScore', 'duplicateProbability']) {
    if (!boundedScore(value[key])) throw new Error(`AI output has invalid ${key}`);
  }
  for (const key of ['reasons', 'clarificationQuestions', 'riskFlags']) {
    if (!Array.isArray(value[key]) || !(value[key] as unknown[]).every((item) => typeof item === 'string')) {
      throw new Error(`AI output has invalid ${key}`);
    }
  }
  if (value.closesAt !== null && typeof value.closesAt !== 'string') throw new Error('AI output has invalid closesAt');
  if (value.resolvesAfter !== null && typeof value.resolvesAfter !== 'string') throw new Error('AI output has invalid resolvesAfter');
  return value as AdmissionOutput;
}

function parseJsonText(text: string) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) return JSON.parse(fenced);
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('AI response was not valid JSON');
  }
}

function endpointWithModel(endpoint: string, model: string) {
  return endpoint.replaceAll('{model}', encodeURIComponent(model));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAiCompatible(provider: ProviderConfig, secret: string, system: string, userPrompt: string) {
  const response = await fetchWithTimeout(endpointWithModel(provider.endpoint, provider.modelCode), {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      model: provider.modelCode,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`);
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('AI provider returned no text content');
  return content;
}

async function callGemini(provider: ProviderConfig, secret: string, system: string, userPrompt: string) {
  const response = await fetchWithTimeout(endpointWithModel(provider.endpoint, provider.modelCode), {
    method: 'POST',
    headers: { 'x-goog-api-key': secret, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`);
  const content = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: unknown }) => part?.text).filter((part: unknown) => typeof part === 'string').join('');
  if (typeof content !== 'string' || !content.trim()) throw new Error('AI provider returned no text content');
  return content;
}

async function callAnthropic(provider: ProviderConfig, secret: string, system: string, userPrompt: string) {
  if (!provider.apiVersion) throw new Error('Anthropic-compatible adapter requires apiVersion configuration');
  const response = await fetchWithTimeout(endpointWithModel(provider.endpoint, provider.modelCode), {
    method: 'POST',
    headers: {
      'x-api-key': secret,
      'anthropic-version': provider.apiVersion,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: provider.modelCode,
      max_tokens: 1800,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`);
  const content = Array.isArray(payload?.content)
    ? payload.content.map((item: { text?: unknown }) => item?.text).filter((item: unknown) => typeof item === 'string').join('')
    : null;
  if (typeof content !== 'string' || !content.trim()) throw new Error('AI provider returned no text content');
  return content;
}

async function callCloudflareWorkersAi(provider: ProviderConfig, secret: string, system: string, userPrompt: string) {
  const response = await fetchWithTimeout(endpointWithModel(provider.endpoint, provider.modelCode), {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      model: provider.modelCode,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`);
  const content = payload?.result?.response ?? payload?.result?.output_text ?? payload?.response;
  if (typeof content !== 'string' || !content.trim()) throw new Error('AI provider returned no text content');
  return content;
}

async function invokeProvider(provider: ProviderConfig, system: string, userPrompt: string) {
  if (!provider.secretReference) throw new Error('AI provider has no secret reference');
  const secret = env(provider.secretReference);
  if (!secret) throw new Error(`AI credential ${provider.secretReference} is not configured`);
  switch (provider.adapter) {
    case 'OPENAI_COMPATIBLE':
      return callOpenAiCompatible(provider, secret, system, userPrompt);
    case 'GEMINI_GENERATE_CONTENT':
      return callGemini(provider, secret, system, userPrompt);
    case 'ANTHROPIC_MESSAGES':
      return callAnthropic(provider, secret, system, userPrompt);
    case 'CLOUDFLARE_WORKERS_AI':
      return callCloudflareWorkersAi(provider, secret, system, userPrompt);
    default:
      throw new Error('Unsupported AI adapter');
  }
}

function buildUserPrompt(context: AdmissionContext) {
  return JSON.stringify({
    task: 'Assess this proposal for automated VAD market admission.',
    currentTime: new Date().toISOString(),
    proposal: context.proposal,
    jurisdiction: { countryCode: context.countryCode, assetCode: context.selectedAssetCode },
    canonicalTemplate: context.template,
    oraclePolicyAvailable: Boolean(context.oraclePolicy),
    duplicateCandidates: context.duplicateCandidates,
    admissionPolicy: context.policy,
    outputSchema: context.prompt?.outputSchema,
    instructions: [
      'Do not decide the future outcome of the market.',
      'Do not invent a closing date or resolution date when the proposal does not state or clearly imply one.',
      'Do not invent official sources. Describe source requirements generically in resolutionScope when exact sources are not established.',
      'normalizedParameters must include the template-required subject and time_scope when present in the proposal.',
      'resolutionScope must state the exact YES condition and how a neutral resolver can verify it.',
      'Use NEEDS_CLARIFICATION when essential timing, subject, criterion, or evidence basis is missing.',
      'Use REVIEW for semantic duplicates, manipulation risk, sensitive/uncertain categories, or any case that is not confidently objective.',
      'Use AUTO_PUBLISH only when every required field is grounded in the proposal and the market is clearly binary and objectively resolvable.',
    ],
  });
}

function fallbackClarification(context: AdmissionContext): AdmissionOutput {
  return {
    suggestedDecision: 'NEEDS_CLARIFICATION',
    normalizedQuestion: context.proposal.question,
    description: context.proposal.context ?? null,
    category: context.proposal.submittedCategory ?? 'GENERAL',
    templateCode: String(context.template?.code ?? 'BINARY_EVENT'),
    normalizedParameters: {},
    resolutionScope: {},
    closesAt: null,
    resolvesAfter: null,
    confidence: 1,
    objectivityScore: 0,
    ambiguityScore: 1,
    manipulationRiskScore: 0,
    oracleAvailabilityScore: 0,
    duplicateProbability: 0,
    canonicalizationDecision: 'UNCERTAIN',
    reasons: ['A settlement asset must be selected before automated admission can continue.'],
    clarificationQuestions: ['Which active settlement asset should this market use?'],
    riskFlags: ['ASSET_SELECTION_REQUIRED'],
  };
}

async function applyResult(
  admin: ReturnType<typeof createClient>,
  context: AdmissionContext,
  userId: string,
  providerId: number | null,
  output: AdmissionOutput | null,
  failureReason?: string,
) {
  const { data, error } = await admin.rpc('internal_apply_market_admission_result', {
    p_proposal_public_id: context.proposal.publicId,
    p_user_id: userId,
    p_asset_code: context.selectedAssetCode ?? '',
    p_ai_provider_id: providerId,
    p_prompt_version_id: context.prompt?.id ?? null,
    p_output: output,
    p_failure_reason: failureReason ?? null,
  });
  if (error) throw new Error(error.message);
  return data as AdmissionResult;
}

async function submit(req: Request) {
  const { user, authHeader } = await requireUser(req);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const contextText = typeof body.context === 'string' ? body.context.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const assetCode = typeof body.assetCode === 'string' ? body.assetCode.trim().toUpperCase() : '';
  if (!question) return json({ error: 'QUESTION_REQUIRED' }, 400);

  const { user: userClient, admin } = clients(authHeader);
  const { data: proposalId, error: proposalError } = await userClient.rpc('submit_market_proposal', {
    p_question: question,
    p_context: contextText || null,
    p_category: category || null,
    p_confidence: null,
  });
  if (proposalError || !proposalId) {
    return json({ error: 'PROPOSAL_REJECTED', message: proposalError?.message ?? 'Proposal could not be submitted.' }, 422);
  }

  const { data: contextData, error: contextError } = await admin.rpc('internal_market_admission_context', {
    p_proposal_public_id: proposalId,
    p_user_id: user.id,
    p_asset_code: assetCode || null,
  });
  if (contextError || !contextData) {
    return json({ error: 'ADMISSION_CONTEXT_FAILED', proposalId, message: contextError?.message ?? 'Admission context unavailable.' }, 500);
  }
  const admissionContext = contextData as AdmissionContext;

  if (admissionContext.assetSelectionRequired) {
    const result = await applyResult(admin, admissionContext, user.id, null, fallbackClarification(admissionContext));
    return json({ proposalId, admission: result, ai: { attempted: false, reason: 'ASSET_SELECTION_REQUIRED' } });
  }

  if (!admissionContext.prompt) {
    const result = await applyResult(admin, admissionContext, user.id, null, null, 'No active MARKET_ADMISSION prompt is configured.');
    return json({ proposalId, admission: result, ai: { attempted: false, reason: 'PROMPT_UNAVAILABLE' } });
  }
  if (!admissionContext.template) {
    const result = await applyResult(admin, admissionContext, user.id, null, null, 'No active market template is available for automated admission.');
    return json({ proposalId, admission: result, ai: { attempted: false, reason: 'TEMPLATE_UNAVAILABLE' } });
  }
  if (!admissionContext.oraclePolicy) {
    const result = await applyResult(admin, admissionContext, user.id, null, null, 'No active objective-event oracle policy is available; proposal queued for review.');
    return json({ proposalId, admission: result, ai: { attempted: false, reason: 'ORACLE_POLICY_UNAVAILABLE' } });
  }
  if (!admissionContext.providers.length) {
    const result = await applyResult(admin, admissionContext, user.id, null, null, 'No active AI model is configured for MARKET_ADMISSION; proposal queued for review.');
    return json({ proposalId, admission: result, ai: { attempted: false, reason: 'AI_PROVIDER_UNAVAILABLE' } });
  }

  const prompt = buildUserPrompt(admissionContext);
  const failures: string[] = [];
  for (const provider of admissionContext.providers) {
    try {
      const responseText = await invokeProvider(provider, admissionContext.prompt.systemPrompt, prompt);
      const output = validateOutput(parseJsonText(responseText));
      const result = await applyResult(admin, admissionContext, user.id, provider.aiProviderId, output);
      return json({
        proposalId,
        admission: result,
        ai: { attempted: true, providerCode: provider.providerCode, modelCode: provider.modelCode, failoverCount: failures.length },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown provider failure';
      console.error('market admission provider failed', { providerCode: provider.providerCode, message });
      failures.push(`${provider.providerCode}: ${message}`);
    }
  }

  const result = await applyResult(
    admin,
    admissionContext,
    user.id,
    null,
    null,
    `All configured MARKET_ADMISSION providers failed. ${failures.slice(0, 3).join(' | ')}`.slice(0, 900),
  );
  return json({ proposalId, admission: result, ai: { attempted: true, reason: 'ALL_PROVIDERS_FAILED', failoverCount: failures.length } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    return await submit(req);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('market-admission failure', { message: error instanceof Error ? error.message : 'unknown' });
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
