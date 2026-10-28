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
type Row = Record<string, unknown>;
type Provider = {
  providerCode: string;
  providerName: string;
  adapter: 'OPENAI_COMPATIBLE' | 'GEMINI_GENERATE_CONTENT' | 'ANTHROPIC_MESSAGES' | 'CLOUDFLARE_WORKERS_AI';
  endpoint: string;
  apiVersion?: string | null;
  modelCode: string;
  secretReference: string;
  priority: number;
};
const isRecord = (value: unknown): value is Row => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value: unknown, max = 1600) => typeof value === 'string'
  ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  : '';
function parseJson(value: string): unknown {
  try { return JSON.parse(value); } catch {
    const start = value.indexOf('{');
    const end = value.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(value.slice(start, end + 1));
    throw new Error('The configured AI provider returned an invalid game draft.');
  }
}
function responseText(payload: unknown) {
  if (!isRecord(payload)) return '';
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = isRecord(choices[0]) ? choices[0] : {};
  const message = isRecord(first.message) ? first.message : {};
  return typeof message.content === 'string' ? message.content : '';
}
async function timedFetch(url: string, init: RequestInit, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('The configured AI provider timed out.');
    throw error;
  } finally { clearTimeout(timer); }
}
async function invoke(provider: Provider, system: string, prompt: string) {
  const secret = provider.secretReference ? Deno.env.get(provider.secretReference)?.trim() : '';
  if (!secret) throw new Error('A configured AI provider credential is missing from the secure Edge Function environment.');
  if (!provider.endpoint.startsWith('https://')) throw new Error('The AI provider endpoint must use HTTPS.');
  const endpoint = provider.endpoint.replaceAll('{model}', encodeURIComponent(provider.modelCode));
  const common = { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' } };
  let response: Response;
  if (provider.adapter === 'OPENAI_COMPATIBLE') {
    response = await timedFetch(endpoint, {
      ...common,
      headers: { ...common.headers, Authorization: 'Bearer ' + secret },
      body: JSON.stringify({ model: provider.modelCode, temperature: 0.25, max_tokens: 1300, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
    });
  } else if (provider.adapter === 'GEMINI_GENERATE_CONTENT') {
    response = await timedFetch(endpoint, {
      ...common, headers: { ...common.headers, 'x-goog-api-key': secret },
      body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.25, maxOutputTokens: 1300, responseMimeType: 'application/json' } }),
    });
  } else if (provider.adapter === 'ANTHROPIC_MESSAGES') {
    if (!provider.apiVersion) throw new Error('The configured Anthropic provider has no API version.');
    response = await timedFetch(endpoint, {
      ...common, headers: { ...common.headers, 'x-api-key': secret, 'anthropic-version': provider.apiVersion },
      body: JSON.stringify({ model: provider.modelCode, max_tokens: 1300, temperature: 0.25, system, messages: [{ role: 'user', content: prompt }] }),
    });
  } else {
    response = await timedFetch(endpoint, {
      ...common, headers: { ...common.headers, Authorization: 'Bearer ' + secret },
      body: JSON.stringify({ messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], temperature: 0.25, max_tokens: 1300 }),
    });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('The configured AI provider returned HTTP ' + response.status + '.');
  let output = responseText(payload);
  if (!output && provider.adapter === 'GEMINI_GENERATE_CONTENT' && isRecord(payload)) {
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const first = isRecord(candidates[0]) ? candidates[0] : {};
    const candidateContent = isRecord(first.content) ? first.content : {};
    output = (Array.isArray(candidateContent.parts) ? candidateContent.parts : [])
      .map((part) => isRecord(part) ? clean(part.text, 7000) : '').join('');
  }
  if (!output && provider.adapter === 'ANTHROPIC_MESSAGES' && isRecord(payload) && Array.isArray(payload.content)) {
    output = payload.content.map((part) => isRecord(part) ? clean(part.text, 7000) : '').join('');
  }
  if (!output && provider.adapter === 'CLOUDFLARE_WORKERS_AI' && isRecord(payload)) {
    const result = isRecord(payload.result) ? payload.result : {};
    output = clean(result.response ?? result.output_text ?? payload.response, 7000);
  }
  if (!output.trim()) throw new Error('The configured AI provider returned no text.');
  return output;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const authorization = req.headers.get('Authorization') ?? '';
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    const url = Deno.env.get('SUPABASE_URL')?.trim();
    const service = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY'))?.trim();
    const anon = (Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY'))?.trim();
    if (!url || !service || !anon) return json({ error: 'SERVICE_UNAVAILABLE', message: 'The game-draft service is not configured.' }, 503);
    if (!token) return json({ error: 'AUTH_REQUIRED', message: 'Sign in as an authorized VAD Play administrator.' }, 401);

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: 'AUTH_INVALID', message: 'Your sign-in session is invalid or expired.' }, 401);
    const actor = createClient(url, anon, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: access, error: accessError } = await actor.rpc('admin_my_access');
    const permissions = Array.isArray(access?.permissions) ? access.permissions : [];
    if (accessError || !(permissions.includes('play.manage') || access?.isSuperAdmin === true)) {
      return json({ error: 'PLAY_PERMISSION_REQUIRED', message: 'The play.manage permission is required to draft games.' }, 403);
    }

    const length = Number(req.headers.get('content-length') ?? 0);
    if (length > 10000) return json({ error: 'REQUEST_TOO_LARGE', message: 'Keep the game idea under 10 KB.' }, 413);
    const body = await req.json().catch(() => null);
    if (!isRecord(body)) return json({ error: 'INVALID_BODY', message: 'Enter a short idea for the game.' }, 400);
    const idea = clean(body.idea, 1800);
    const engineKey = clean(body.engineKey, 80).toUpperCase();
    const currency = clean(body.currency, 8).toUpperCase();
    if (idea.length < 5) return json({ error: 'IDEA_REQUIRED', message: 'Describe the game in at least five characters.' }, 400);
    if (!['PRIZE_DRAW', 'SPIN_AND_WIN', 'SCRATCH_AND_REVEAL'].includes(engineKey)) {
      return json({ error: 'ENGINE_UNSUPPORTED', message: 'Choose one of the registered VAD Play engines.' }, 400);
    }
    if (currency && !['NGN', 'USDC'].includes(currency)) return json({ error: 'CURRENCY_INVALID', message: 'Choose a configured campaign currency.' }, 400);

    const { data: context, error: contextError } = await admin.rpc('internal_custom_market_draft_context');
    if (contextError || !isRecord(context)) {
      return json({ error: 'AI_DRAFT_CONFIG_UNAVAILABLE', message: 'The shared AI provider configuration could not be loaded. Check the active administrator AI providers.' }, 503);
    }
    const providers = Array.isArray(context.providers) ? context.providers.filter(isRecord) as unknown as Provider[] : [];
    if (!providers.length) return json({ error: 'AI_PROVIDER_UNAVAILABLE', message: 'No configured AI provider is available for drafting. Configure an approved provider in VAD AI settings.' }, 503);

    const system = [
      'You help an administrator create a clear, safe, reviewable VAD Play experience and campaign draft.',
      'Return exactly one JSON object with keys: title, description, prizeTitle, campaignTitle, terms, refundPolicy, imagePrompt, riskNotes.',
      'Do not publish, activate, approve, or resolve anything. Do not output numeric financial values or infer an entry price, prize cost, profit target, campaign cost, funding target, cap, or currency.',
      'Keep terms and refundPolicy concise draft text only; note that admin/legal review is required. Do not claim legal compliance, guaranteed returns, certain winners, or an available runtime.',
      'Image prompt must describe a text-free 16:9 image: no text, numbers, logos or watermarks. Keep text fields usable in a compact mobile UI.',
    ].join(' ');
    const userPrompt = JSON.stringify({
      task: 'Prepare draft wording only. Financial fields are entered and verified by the admin.',
      idea,
      engineKey,
      selectedCurrencyForContextOnly: currency || null,
      outputRules: {
        title: 'A concise game/experience title.',
        description: 'A short description with no unsupported promises.',
        prizeTitle: engineKey === 'PRIZE_DRAW' ? 'A plain description of the prize implied by the input; do not invent its price or availability.' : '',
        campaignTitle: engineKey === 'PRIZE_DRAW' ? 'A short campaign title.' : '',
        terms: 'Short draft terms with clear eligibility and draw review caveats; not legal advice.',
        refundPolicy: 'Short draft refund wording that must be reviewed against the real payment and applicable law.',
        imagePrompt: 'A single subject, premium editorial 16:9 visual with an absolute no-text/no-logo requirement.',
        riskNotes: 'List missing facts, legal/operational checks, and required admin reviews.',
      },
    });
    let generated: Row | null = null;
    let lastError = '';
    for (const provider of providers.slice(0, 2)) {
      try {
        const candidate = parseJson(await invoke(provider, system, userPrompt));
        if (!isRecord(candidate)) throw new Error('The AI response was not an object.');
        const title = clean(candidate.title, 120);
        const description = clean(candidate.description, 500);
        const imagePrompt = clean(candidate.imagePrompt, 1000);
        const riskNotes = clean(candidate.riskNotes, 700);
        if (title.length < 3 || description.length < 5 || imagePrompt.length < 12) throw new Error('The AI response omitted required draft text.');
        generated = {
          title,
          description,
          prizeTitle: clean(candidate.prizeTitle, 180),
          campaignTitle: clean(candidate.campaignTitle, 120),
          terms: clean(candidate.terms, 800),
          refundPolicy: clean(candidate.refundPolicy, 800),
          imagePrompt,
          riskNotes: riskNotes || 'Review the game rules, prize availability, economic amounts, operational runtime and applicable legal requirements before publishing.',
        };
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'The AI provider failed.';
      }
    }
    if (!generated) {
      console.warn('VAD Play AI draft provider chain failed:', clean(lastError, 250));
      return json({ error: 'AI_DRAFT_FAILED', message: 'AI could not prepare this draft. Check the configured provider/model and retry.' }, 503);
    }
    return json({ ...generated, engineKey, requiresAdminReview: true, financialFieldsAutofilled: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Game drafting failed unexpectedly.';
    return json({ error: 'PLAY_DRAFT_FAILED', message }, 500);
  }
});
