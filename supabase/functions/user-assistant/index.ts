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
  if (!url || !anon || !service) throw new Error('Runtime credentials unavailable');
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
  if (!token) throw json({ error: 'AUTH_REQUIRED', message: 'Please sign in to use VAD Assistant.' }, 401);
  const { url, anon } = runtimeCredentials();
  const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) throw json({ error: 'AUTH_INVALID', message: 'Your session has expired. Please sign in again.' }, 401);
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

type AssistantContext = {
  thread: { publicId: string; title?: string | null };
  policy: Record<string, unknown>;
  prompt?: {
    id: number;
    version: number;
    systemPrompt: string;
    outputSchema: Record<string, unknown>;
  } | null;
  providers: ProviderConfig[];
  history: { role: 'user' | 'assistant'; content: string; createdAt?: string }[];
  user: Record<string, unknown>;
  context: Record<string, unknown>;
};

type AssistantAction = { label: string; route: string };
type AssistantOutput = { answer: string; actions: AssistantAction[]; notice?: string | null };

const ALLOWED_ROUTES = new Set([
  '/home',
  '/markets',
  '/wallet',
  '/portfolio',
  '/community',
  '/account',
  '/account/verification',
  '/account/funding',
  '/account/policies',
  '/account/app-tour',
  '/assistant',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
    throw new Error('Assistant response was not valid JSON');
  }
}

function validateOutput(value: unknown): AssistantOutput {
  if (!isRecord(value)) throw new Error('Assistant response is invalid');
  const answer = typeof value.answer === 'string' ? value.answer.trim() : '';
  if (!answer || answer.length > 10000) throw new Error('Assistant response has no usable answer');
  const actions = Array.isArray(value.actions)
    ? value.actions
        .filter(isRecord)
        .map((item) => ({
          label: typeof item.label === 'string' ? item.label.trim().slice(0, 60) : '',
          route: typeof item.route === 'string' ? item.route.trim() : '',
        }))
        .filter((item) => item.label && ALLOWED_ROUTES.has(item.route))
        .slice(0, 4)
    : [];
  const notice = typeof value.notice === 'string' && value.notice.trim()
    ? value.notice.trim().slice(0, 500)
    : null;
  return { answer, actions, notice };
}

function endpointWithModel(endpoint: string, model: string) {
  return endpoint.replaceAll('{model}', encodeURIComponent(model));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function numberPolicy(policy: Record<string, unknown>, key: string, fallback: number) {
  const value = Number(policy[key]);
  return Number.isFinite(value) ? value : fallback;
}

async function callOpenAiCompatible(
  provider: ProviderConfig,
  secret: string,
  system: string,
  userPrompt: string,
  policy: Record<string, unknown>,
) {
  const response = await fetchWithTimeout(endpointWithModel(provider.endpoint, provider.modelCode), {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      model: provider.modelCode,
      temperature: numberPolicy(policy, 'temperature', 0.2),
      max_tokens: numberPolicy(policy, 'max_output_tokens', 1200),
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
  if (typeof content !== 'string' || !content.trim()) throw new Error('AI provider returned no text');
  return content;
}

async function callGemini(
  provider: ProviderConfig,
  secret: string,
  system: string,
  userPrompt: string,
  policy: Record<string, unknown>,
) {
  const response = await fetchWithTimeout(endpointWithModel(provider.endpoint, provider.modelCode), {
    method: 'POST',
    headers: { 'x-goog-api-key': secret, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: numberPolicy(policy, 'temperature', 0.2),
        maxOutputTokens: numberPolicy(policy, 'max_output_tokens', 1200),
        responseMimeType: 'application/json',
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`);
  const content = payload?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: unknown }) => part?.text)
    .filter((part: unknown) => typeof part === 'string')
    .join('');
  if (typeof content !== 'string' || !content.trim()) throw new Error('AI provider returned no text');
  return content;
}

async function callAnthropic(
  provider: ProviderConfig,
  secret: string,
  system: string,
  userPrompt: string,
  policy: Record<string, unknown>,
) {
  if (!provider.apiVersion) throw new Error('AI provider version is not configured');
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
      max_tokens: numberPolicy(policy, 'max_output_tokens', 1200),
      temperature: numberPolicy(policy, 'temperature', 0.2),
      system,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`);
  const content = Array.isArray(payload?.content)
    ? payload.content.map((item: { text?: unknown }) => item?.text).filter((item: unknown) => typeof item === 'string').join('')
    : null;
  if (typeof content !== 'string' || !content.trim()) throw new Error('AI provider returned no text');
  return content;
}

async function callCloudflareWorkersAi(
  provider: ProviderConfig,
  secret: string,
  system: string,
  userPrompt: string,
  policy: Record<string, unknown>,
) {
  const response = await fetchWithTimeout(endpointWithModel(provider.endpoint, provider.modelCode), {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
      temperature: numberPolicy(policy, 'temperature', 0.2),
      max_tokens: numberPolicy(policy, 'max_output_tokens', 1200),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`);
  const content = payload?.result?.response ?? payload?.result?.output_text ?? payload?.response;
  if (typeof content !== 'string' || !content.trim()) throw new Error('AI provider returned no text');
  return content;
}

async function invokeProvider(
  provider: ProviderConfig,
  system: string,
  userPrompt: string,
  policy: Record<string, unknown>,
) {
  if (!provider.secretReference) throw new Error('AI provider is not ready');
  const secret = env(provider.secretReference);
  if (!secret) throw new Error('AI provider credential is unavailable');
  switch (provider.adapter) {
    case 'OPENAI_COMPATIBLE':
      return callOpenAiCompatible(provider, secret, system, userPrompt, policy);
    case 'GEMINI_GENERATE_CONTENT':
      return callGemini(provider, secret, system, userPrompt, policy);
    case 'ANTHROPIC_MESSAGES':
      return callAnthropic(provider, secret, system, userPrompt, policy);
    case 'CLOUDFLARE_WORKERS_AI':
      return callCloudflareWorkersAi(provider, secret, system, userPrompt, policy);
    default:
      throw new Error('Unsupported AI adapter');
  }
}

function buildUserPrompt(context: AssistantContext, message: string) {
  return JSON.stringify({
    task: 'Answer this signed-in VAD user as the dedicated VAD Assistant.',
    currentTime: new Date().toISOString(),
    userMessage: message,
    conversationHistory: context.history,
    user: context.user,
    vadContext: context.context,
    allowedRoutes: [...ALLOWED_ROUTES],
    outputSchema: context.prompt?.outputSchema,
    instructions: [
      'Use supplied VAD account and market context when the question relates to it.',
      'Do not claim that an unresolved outcome is final. Market prices and probabilities are not facts or guarantees.',
      'Do not act as VAD oracle or final outcome authority.',
      'Do not promise profit or guaranteed returns and do not encourage reckless financial behaviour.',
      'When explaining potential profit or loss, show it as a scenario based on the supplied quantities/prices and state the assumptions.',
      'If the answer needs current account or market data that is absent, say that the information is not available in this conversation.',
      'Keep answers clear and useful. Use product language rather than internal architecture terms.',
      'Only return action routes from allowedRoutes.',
    ],
  });
}

async function handleRequest(req: Request) {
  const { user, authHeader } = await requireUser(req);
  const { admin } = clients(authHeader);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'INVALID_REQUEST', message: 'Please enter a message and try again.' }, 400);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const threadId = typeof body.threadId === 'string' && body.threadId.trim() ? body.threadId.trim() : null;
  const marketId = typeof body.marketId === 'string' && body.marketId.trim() ? body.marketId.trim() : null;
  const route = typeof body.route === 'string' ? body.route.trim().slice(0, 160) : '/assistant';
  const requestId = typeof body.requestId === 'string' && /^[0-9a-f-]{36}$/i.test(body.requestId)
    ? body.requestId
    : crypto.randomUUID();

  if (!message) return json({ error: 'MESSAGE_REQUIRED', message: 'Ask VAD Assistant a question to continue.' }, 400);

  const { data: prepared, error: prepareError } = await admin.rpc('internal_prepare_user_ai_assistant', {
    p_user_id: user.id,
    p_thread_public_id: threadId,
    p_market_public_id: marketId,
    p_route: route,
  });
  if (prepareError) {
    const rateLimited = prepareError.details === 'RATE_LIMITED' || /too many assistant requests/i.test(prepareError.message);
    return json({
      error: rateLimited ? 'RATE_LIMITED' : 'ASSISTANT_UNAVAILABLE',
      message: rateLimited
        ? 'You have sent several messages quickly. Please wait a moment and try again.'
        : 'VAD Assistant is temporarily unavailable. Please try again shortly.',
    }, rateLimited ? 429 : 503);
  }

  const context = prepared as AssistantContext;
  const maxCharacters = numberPolicy(context.policy, 'max_message_characters', 2000);
  if (message.length > maxCharacters) {
    return json({ error: 'MESSAGE_TOO_LONG', message: `Please shorten your message to ${maxCharacters} characters or fewer.` }, 400);
  }
  if (!context.prompt?.systemPrompt) {
    return json({ error: 'ASSISTANT_UNAVAILABLE', message: 'VAD Assistant is temporarily unavailable. Please try again shortly.' }, 503);
  }
  if (!Array.isArray(context.providers) || !context.providers.length) {
    return json({ error: 'ASSISTANT_UNAVAILABLE', message: 'VAD Assistant is temporarily unavailable. Please try again shortly.' }, 503);
  }

  const userPrompt = buildUserPrompt(context, message);
  let output: AssistantOutput | null = null;
  let providerId: number | null = null;
  let lastFailure = 'No eligible AI service completed the request.';

  for (const provider of context.providers) {
    try {
      const raw = await invokeProvider(provider, context.prompt.systemPrompt, userPrompt, context.policy);
      output = validateOutput(parseJsonText(raw));
      providerId = provider.aiProviderId;
      break;
    } catch (reason) {
      lastFailure = reason instanceof Error ? reason.message : 'AI service failed';
    }
  }

  if (!output) {
    console.error('VAD user assistant provider chain failed', lastFailure);
    return json({
      error: 'ASSISTANT_UNAVAILABLE',
      message: 'VAD Assistant could not answer right now. Please try again shortly.',
    }, 503);
  }

  const contextSnapshot = {
    route,
    marketId,
    used: [
      isRecord(context.context) && context.context.market ? 'MARKET' : null,
      isRecord(context.context) && Array.isArray(context.context.wallet) ? 'WALLET' : null,
      isRecord(context.context) && Array.isArray(context.context.positions) ? 'POSITIONS' : null,
      'NAVIGATION',
    ].filter(Boolean),
  };

  const { data: recorded, error: recordError } = await admin.rpc('internal_record_user_ai_assistant_exchange', {
    p_user_id: user.id,
    p_thread_public_id: context.thread.publicId,
    p_client_request_id: requestId,
    p_user_message: message,
    p_assistant_message: output.answer,
    p_context_snapshot: contextSnapshot,
    p_ai_provider_id: providerId,
    p_prompt_version_id: context.prompt.id,
    p_output: output,
    p_failure_reason: null,
  });
  if (recordError) {
    console.error('VAD user assistant persistence failed', recordError.message);
    return json({ error: 'SAVE_FAILED', message: 'VAD Assistant answered, but the conversation could not be saved. Please try again.' }, 503);
  }

  const saved = recorded as { threadId: string; messageId: string };
  return json({
    threadId: saved.threadId,
    messageId: saved.messageId,
    answer: output.answer,
    actions: output.actions,
    notice: output.notice ?? null,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    return await handleRequest(req);
  } catch (reason) {
    if (reason instanceof Response) return reason;
    console.error('VAD user assistant request failed', reason);
    return json({ error: 'ASSISTANT_UNAVAILABLE', message: 'VAD Assistant is temporarily unavailable. Please try again shortly.' }, 503);
  }
});
