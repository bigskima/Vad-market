import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
type RecordValue = Record<string, unknown>;
type DraftProvider = {
  providerCode: string;
  providerName: string;
  adapter: 'OPENAI_COMPATIBLE' | 'GEMINI_GENERATE_CONTENT' | 'ANTHROPIC_MESSAGES' | 'CLOUDFLARE_WORKERS_AI';
  endpoint: string;
  apiVersion?: string | null;
  modelCode: string;
  secretReference: string;
  priority: number;
};
type MarketType = {
  code: string;
  name: string;
  description: string;
  handler: string;
  questionTemplate: string;
  conditionTemplate: string;
  sourceLabel: string;
  sourceRequired: boolean;
  fields: unknown[];
  metadata: RecordValue;
};

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function safeText(value: unknown, max = 1800): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}
function parseJsonText(value: string): unknown {
  const text = value.trim();
  try { return JSON.parse(text); } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error('The configured AI provider returned an invalid JSON draft.');
  }
}
function endpointWithModel(endpoint: string, model: string) {
  return endpoint.replaceAll('{model}', encodeURIComponent(model));
}
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('The configured AI provider timed out.');
    throw error;
  } finally { clearTimeout(timer); }
}
function responseText(payload: unknown): string {
  if (!isRecord(payload)) return '';
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = isRecord(choices[0]) ? choices[0] : {};
  const message = isRecord(first.message) ? first.message : {};
  return typeof message.content === 'string' ? message.content : '';
}
async function invokeProvider(provider: DraftProvider, system: string, userPrompt: string) {
  const secret = provider.secretReference ? Deno.env.get(provider.secretReference)?.trim() : '';
  if (!secret) throw new Error('The selected AI provider credential is not available in the secure Edge Function environment.');
  if (!provider.endpoint.startsWith('https://')) throw new Error('The selected AI provider must use HTTPS.');
  const endpoint = endpointWithModel(provider.endpoint, provider.modelCode);
  const common = { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' } };
  let response: Response;
  if (provider.adapter === 'OPENAI_COMPATIBLE') {
    response = await fetchWithTimeout(endpoint, {
      ...common, headers: { ...common.headers, Authorization: 'Bearer ' + secret },
      body: JSON.stringify({ model: provider.modelCode, temperature: 0.2, max_tokens: 1000, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: userPrompt }] }),
    });
  } else if (provider.adapter === 'GEMINI_GENERATE_CONTENT') {
    response = await fetchWithTimeout(endpoint, {
      ...common, headers: { ...common.headers, 'x-goog-api-key': secret },
      body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: userPrompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 1000, responseMimeType: 'application/json' } }),
    });
  } else if (provider.adapter === 'ANTHROPIC_MESSAGES') {
    if (!provider.apiVersion) throw new Error('The Anthropic API version is not configured.');
    response = await fetchWithTimeout(endpoint, {
      ...common, headers: { ...common.headers, 'x-api-key': secret, 'anthropic-version': provider.apiVersion },
      body: JSON.stringify({ model: provider.modelCode, max_tokens: 1000, temperature: 0.2, system, messages: [{ role: 'user', content: userPrompt }] }),
    });
  } else if (provider.adapter === 'CLOUDFLARE_WORKERS_AI') {
    response = await fetchWithTimeout(endpoint, {
      ...common, headers: { ...common.headers, Authorization: 'Bearer ' + secret },
      body: JSON.stringify({ messages: [{ role: 'system', content: system }, { role: 'user', content: userPrompt }], temperature: 0.2, max_tokens: 1000 }),
    });
  } else {
    throw new Error('The configured AI protocol adapter is not supported.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Configured AI provider returned HTTP ' + response.status + '.');
  let generated = responseText(payload);
  if (!generated && provider.adapter === 'GEMINI_GENERATE_CONTENT' && isRecord(payload)) {
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const first = isRecord(candidates[0]) ? candidates[0] : {};
    const candidateContent = isRecord(first.content) ? first.content : {};
    const parts = Array.isArray(candidateContent.parts) ? candidateContent.parts : [];
    generated = parts.map((part) => isRecord(part) ? safeText(part.text, 6000) : '').join('');
  }
  if (!generated && provider.adapter === 'ANTHROPIC_MESSAGES' && isRecord(payload) && Array.isArray(payload.content)) {
    generated = payload.content.map((part) => isRecord(part) ? safeText(part.text, 6000) : '').join('');
  }
  if (!generated && provider.adapter === 'CLOUDFLARE_WORKERS_AI' && isRecord(payload)) {
    const result = isRecord(payload.result) ? payload.result : {};
    generated = safeText(result.response ?? result.output_text ?? payload.response, 6000);
  }
  if (!generated.trim()) throw new Error('The configured AI provider returned no text.');
  return generated;
}
function fillTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (match, key: string) => values[key] ?? match);
}
function safeDetails(value: unknown): RecordValue {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, value]) => [
    safeText(key, 80),
    typeof value === 'string' ? safeText(value, 500) : '',
  ]).filter(([key, value]) => Boolean(key) && typeof value === 'string'));
}
async function handle(req: Request) {
  const authorization = req.headers.get('authorization') ?? '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = Deno.env.get('SUPABASE_URL')?.trim();
  const anon = (Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY'))?.trim();
  const service = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY'))?.trim();
  if (!token) return json({ error: 'AUTH_REQUIRED', message: 'Sign in with an administrator account to draft a market.' }, 401);
  if (!url || !anon || !service) return json({ error: 'SERVICE_UNAVAILABLE', message: 'The custom market draft service is not configured.' }, 503);

  const user = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await user.auth.getUser(token);
  if (authError || !authData.user) return json({ error: 'AUTH_INVALID', message: 'Your administrator session is invalid or expired.' }, 401);
  const { data: catalog, error: catalogError } = await user.rpc('admin_guided_market_catalog');
  if (catalogError || !isRecord(catalog) || !Array.isArray(catalog.categories)) {
    return json({ error: 'CATALOG_UNAVAILABLE', message: 'The configured market catalog could not be loaded. Check your market-management permission.' }, 403);
  }

  let body: RecordValue;
  try {
    const parsed = await req.json();
    if (!isRecord(parsed)) return json({ error: 'INVALID_BODY', message: 'Request body must be an object.' }, 400);
    body = parsed;
  } catch {
    return json({ error: 'INVALID_BODY', message: 'Request body must be valid JSON.' }, 400);
  }

  const categoryCode = safeText(body.categoryCode, 80).toUpperCase();
  const marketTypeCode = safeText(body.marketTypeCode, 80).toUpperCase();
  const details = safeDetails(body.details);
  const originalTitle = safeText(body.title, 180);
  const description = safeText(body.description, 1000);
  const sourceName = safeText(body.sourceName, 160);
  const sourceUrl = safeText(body.sourceUrl, 1200);
  const condition = safeText(body.condition, 1800);
  const regionScope = safeText(body.regionScope, 60).toUpperCase() || 'GLOBAL';
  const opensAt = safeText(body.opensAt, 80);
  const closesAt = safeText(body.closesAt, 80);
  const resolvesAfter = safeText(body.resolvesAfter, 80);
  if (!categoryCode || !marketTypeCode) return json({ error: 'MARKET_TYPE_REQUIRED', message: 'Select a category and configured market type first.' }, 400);
  if (sourceUrl && (!sourceUrl.startsWith('https://') || sourceUrl.length > 1200)) return json({ error: 'INVALID_SOURCE_URL', message: 'The resolution source URL must use HTTPS.' }, 400);
  if (sourceUrl) {
    try { new URL(sourceUrl); } catch { return json({ error: 'INVALID_SOURCE_URL', message: 'Enter a valid HTTPS source URL.' }, 400); }
  }
  if (!['NIGERIA', 'AFRICA', 'GLOBAL'].includes(regionScope)) return json({ error: 'INVALID_REGION', message: 'Choose Nigeria, Africa or Global for this market.' }, 400);

  let category: RecordValue | null = null;
  let selected: MarketType | null = null;
  for (const rawCategory of catalog.categories) {
    if (!isRecord(rawCategory) || !Array.isArray(rawCategory.marketTypes)) continue;
    const found = (rawCategory.marketTypes as unknown[]).find((rawType) => isRecord(rawType)
      && safeText(rawType.code, 80).toUpperCase() === marketTypeCode);
    if (safeText(rawCategory.code, 80).toUpperCase() === categoryCode && found && isRecord(found)) {
      category = rawCategory;
      selected = {
        code: safeText(found.code, 80),
        name: safeText(found.name, 160),
        description: safeText(found.description, 1000),
        handler: safeText(found.handler, 80).toUpperCase(),
        questionTemplate: safeText(found.questionTemplate, 500),
        conditionTemplate: safeText(found.conditionTemplate, 1800),
        sourceLabel: safeText(found.sourceLabel, 160),
        sourceRequired: found.sourceRequired === true,
        fields: Array.isArray(found.fields) ? found.fields.slice(0, 40) : [],
        metadata: isRecord(found.metadata) ? found.metadata : {},
      };
      break;
    }
  }
  if (!category || !selected) return json({ error: 'UNKNOWN_MARKET_TYPE', message: 'The selected market type is not configured under this category.' }, 400);
  if (selected.sourceRequired && !sourceName) return json({ error: 'SOURCE_REQUIRED', message: 'Add the authoritative source before preparing this market draft.' }, 400);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: context, error: contextError } = await admin.rpc('internal_custom_market_draft_context');
  if (contextError || !isRecord(context) || !isRecord(context.prompt)) {
    return json({ error: 'AI_DRAFT_CONFIG_UNAVAILABLE', message: 'Custom-market AI drafting is not configured. Check the active CUSTOM_MARKET_DRAFT prompt and administrator AI provider settings.' }, 503);
  }
  const providers = Array.isArray(context.providers) ? context.providers.filter(isRecord) as unknown as DraftProvider[] : [];
  if (!providers.length) return json({ error: 'AI_PROVIDER_UNAVAILABLE', message: 'No active free-tier AI provider supports custom-market drafts. Configure an active provider with MARKET_BUILDER_DRAFTING capability.' }, 503);
  const prompt = context.prompt;
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(details)) values[key] = typeof value === 'string' ? value : '';
  values.region = regionScope;
  values.category = safeText(category.name, 120);
  values.market_type = selected.name;
  values.deadline = resolvesAfter || closesAt;
  values.source_name = sourceName;
  values.source_url = sourceUrl;
  const filledQuestion = fillTemplate(selected.questionTemplate, values);
  const configuredCondition = condition || fillTemplate(selected.conditionTemplate, values);
  const task = {
    task: 'Prepare a reviewable custom prediction-market draft; do not publish or resolve it.',
    input: {
      category: { code: categoryCode, name: safeText(category.name, 120), description: safeText(category.description, 800) },
      marketType: { code: selected.code, name: selected.name, description: selected.description, handler: selected.handler, questionTemplate: selected.questionTemplate, configuredCondition: configuredCondition, sourceLabel: selected.sourceLabel, sourceRequired: selected.sourceRequired, parameters: selected.fields, metadata: selected.metadata },
      regionScope,
      userQuestion: originalTitle,
      description,
      parameters: details,
      opensAt: opensAt || null,
      closesAt: closesAt || null,
      resolvesAfter: resolvesAfter || null,
      source: { name: sourceName || null, url: sourceUrl || null },
    },
    requirements: [
      'Do not invent market facts, price targets, event schedules, results, official feeds, source URLs or deadlines.',
      'Use the provided category and market type. Never change the configured handler or resolver type.',
      'If a question needs a numerical threshold, use only a threshold already supplied in the parameters; otherwise note that a real value must be verified before publishing.',
      'Keep the configured resolution condition and authoritative source requirements. You may clarify its wording but must not change its meaning.',
      'Do not claim that automatic resolution is possible if the selected handler or configured source does not support it; explain the gap in riskNotes.',
      'If the question conflicts with the configured type or lacks needed fields, return a cautious draft and specify exactly what must be corrected in riskNotes.',
      'The result is a draft for an administrator to review. Never approve, publish, or settle it.',
    ],
    responseSchema: prompt.outputSchema,
  };
  let generated: RecordValue | null = null;
  let selectedProvider: DraftProvider | null = null;
  let lastFailure = '';
  for (const provider of providers.slice(0, 2)) {
    try {
      const raw = await invokeProvider(provider, safeText(prompt.systemPrompt, 5000), JSON.stringify(task));
      const candidate = parseJsonText(raw);
      if (!isRecord(candidate)) throw new Error('The AI provider returned an invalid structured draft.');
      const title = safeText(candidate.title, 180);
      const generatedDescription = safeText(candidate.description, 1000);
      const resolutionRules = safeText(candidate.resolutionRules, 1800);
      const riskNotes = safeText(candidate.riskNotes, 800);
      if (title.length < 10 || resolutionRules.length < 20) throw new Error('The AI provider omitted the market question or resolution rules.');
      generated = { title, description: generatedDescription, resolutionRules, riskNotes };
      selectedProvider = provider;
      break;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : 'Configured AI provider failed.';
    }
  }
  if (!generated || !selectedProvider) {
    console.warn('Custom-market AI draft provider chain failed:', safeText(lastFailure, 240));
    return json({ error: 'AI_DRAFT_FAILED', message: 'AI could not prepare this draft. Verify the configured provider/model and check required source and market fields.' }, 503);
  }

  const output = generated as { title: string; description: string; resolutionRules: string; riskNotes: string };
  return json({
    ...output,
    categoryCode,
    marketTypeCode,
    configuredHandler: selected.handler,
    sourceName,
    sourceUrl,
    regionScope,
    providerCode: selectedProvider.providerCode,
    providerName: selectedProvider.providerName,
    modelCode: selectedProvider.modelCode,
    promptVersion: Number(prompt.version) || 1,
    requiresAdminReview: true,
  });
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try { return await handle(req); }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Custom market draft generation failed.';
    const status = /sign in|session/i.test(message) ? 401 : /permission|administrator account/i.test(message) ? 403 : 500;
    return json({ error: 'CUSTOM_MARKET_DRAFT_FAILED', message }, status);
  }
});
