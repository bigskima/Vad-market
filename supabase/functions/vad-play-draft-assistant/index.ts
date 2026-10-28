import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
type Rec = Record<string, unknown>;
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
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const isRecord = (value: unknown): value is Rec => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const safeText = (value: unknown, max = 1600) => typeof value === 'string'
  ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max)
  : '';
function parseJsonText(value: string): unknown {
  const text = value.trim();
  try { return JSON.parse(text); } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error('The configured AI provider returned an invalid structured draft.');
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
function responseText(payload: unknown) {
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
      body: JSON.stringify({ model: provider.modelCode, temperature: 0.25, max_tokens: 1600, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: userPrompt }] }),
    });
  } else if (provider.adapter === 'GEMINI_GENERATE_CONTENT') {
    response = await fetchWithTimeout(endpoint, {
      ...common, headers: { ...common.headers, 'x-goog-api-key': secret },
      body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: userPrompt }] }], generationConfig: { temperature: 0.25, maxOutputTokens: 1600, responseMimeType: 'application/json' } }),
    });
  } else if (provider.adapter === 'ANTHROPIC_MESSAGES') {
    if (!provider.apiVersion) throw new Error('The Anthropic API version is not configured.');
    response = await fetchWithTimeout(endpoint, {
      ...common, headers: { ...common.headers, 'x-api-key': secret, 'anthropic-version': provider.apiVersion },
      body: JSON.stringify({ model: provider.modelCode, max_tokens: 1600, temperature: 0.25, system, messages: [{ role: 'user', content: userPrompt }] }),
    });
  } else if (provider.adapter === 'CLOUDFLARE_WORKERS_AI') {
    response = await fetchWithTimeout(endpoint, {
      ...common, headers: { ...common.headers, Authorization: 'Bearer ' + secret },
      body: JSON.stringify({ messages: [{ role: 'system', content: system }, { role: 'user', content: userPrompt }], temperature: 0.25, max_tokens: 1600 }),
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
    const content = isRecord(first.content) ? first.content : {};
    const parts = Array.isArray(content.parts) ? content.parts : [];
    generated = parts.map((part) => isRecord(part) ? safeText(part.text, 8000) : '').join('');
  }
  if (!generated && provider.adapter === 'ANTHROPIC_MESSAGES' && isRecord(payload) && Array.isArray(payload.content)) {
    generated = payload.content.map((part) => isRecord(part) ? safeText(part.text, 8000) : '').join('');
  }
  if (!generated && provider.adapter === 'CLOUDFLARE_WORKERS_AI' && isRecord(payload)) {
    const result = isRecord(payload.result) ? payload.result : {};
    generated = safeText(result.response ?? result.output_text ?? payload.response, 8000);
  }
  if (!generated.trim()) throw new Error('The configured AI provider returned no text.');
  return generated;
}
function slug(value: string, fallback: string) {
  const output = value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
  return output || fallback;
}
function typeKey(value: string) {
  const output = value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return /^[A-Z][A-Z0-9_]{1,59}$/.test(output) ? output : 'PRIZE_DRAWS';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')?.trim();
    const anon = (Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY'))?.trim();
    const service = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY'))?.trim();
    const authorization = req.headers.get('Authorization') ?? '';
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!url || !anon || !service) return json({ error: 'AI draft service is not configured.' }, 503);
    if (!token) return json({ error: 'Sign in with an authorized Play admin account.' }, 401);

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: 'Your sign-in session is invalid or expired.' }, 401);
    const actor = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: access, error: accessError } = await actor.rpc('admin_my_access');
    const permissions = Array.isArray(access?.permissions) ? access.permissions : [];
    if (accessError || !(permissions.includes('play.manage') || access?.isSuperAdmin === true)) {
      return json({ error: 'The play.manage permission is required to draft a game.' }, 403);
    }

    const length = Number(req.headers.get('content-length') ?? 0);
    if (length > 16_384) return json({ error: 'Game-draft instructions are too long.' }, 413);
    const body = await req.json().catch(() => null);
    if (!isRecord(body)) return json({ error: 'Describe the game idea first.' }, 400);
    const idea = safeText(body.idea, 1800);
    const titleHint = safeText(body.title, 180);
    const engineKey = safeText(body.engineKey, 80).toUpperCase() || 'PRIZE_DRAW';
    if (idea.length < 8) return json({ error: 'Enter at least a short sentence about the game.' }, 400);
    if (engineKey !== 'PRIZE_DRAW') {
      return json({ error: 'This builder currently drafts Prize Draw campaigns only. Other registered engines remain review-gated until their server runtime is ready.' }, 400);
    }

    const { data: context, error: contextError } = await admin.rpc('internal_custom_market_draft_context');
    if (contextError || !isRecord(context)) return json({ error: 'The configured AI provider catalogue could not be loaded.' }, 503);
    const providers = Array.isArray(context.providers) ? context.providers.filter(isRecord) as unknown as DraftProvider[] : [];
    if (!providers.length) return json({ error: 'No active AI provider is configured for administrator drafting. Check the provider catalogue and secure function secrets.' }, 503);

    const system = [
      'You are VAD Play’s campaign-drafting assistant for administrators.',
      'Return only one JSON object with keys: experienceTitle, experienceSlug, experienceType, experienceDescription, campaignTitle, campaignSlug, prizeTitle, terms, refundPolicy, imagePrompt, riskNotes.',
      'Never calculate or invent prize cost, profit target, campaign cost budget, entry price, currency, entry caps, funding threshold, expected revenue, or odds. Do not return economics fields. The admin must provide all campaign-specific amounts and currency explicitly.',
      'Do not claim a campaign is legally approved or ready to publish. Draft terms and refund wording for review only; flag missing legal, eligibility, timing, prize-delivery and refund details in riskNotes.',
      'Use only the game idea and optional title hint. Do not invent a specific prize model, brand, model number, or real-world fact that the administrator did not supply. If the prize is unclear, return prizeTitle as an empty string and ask for it in riskNotes.',
      'Keep public copy brief and plain-language. Slugs must be URL-safe lowercase kebab-case. experienceType must be an uppercase identifier such as PRIZE_DRAWS.',
      'imagePrompt should describe the visual style and subject only, never include text to render. Avoid symbols, words, logos and promises of guaranteed winnings.',
    ].join(' ');
    const userPrompt = JSON.stringify({
      task: 'Prepare an editable, unpublished VAD Play Prize Draw draft. Do not save or publish anything.',
      gameIdea: idea,
      titleHint: titleHint || null,
      outputRequirements: {
        experienceTitle: '2-80 characters',
        experienceSlug: 'lowercase-kebab-case',
        experienceType: 'uppercase database identifier',
        experienceDescription: 'short description up to 500 characters',
        campaignTitle: '2-100 characters',
        campaignSlug: 'lowercase-kebab-case',
        prizeTitle: 'explicit prize description only if supplied by the admin',
        terms: 'draft terms up to 1200 characters, require human/legal review',
        refundPolicy: 'draft policy up to 900 characters, require human/legal review',
        imagePrompt: 'concise visual prompt up to 900 characters for text-free 16:9 art',
        riskNotes: 'what must be manually confirmed before publication',
      },
    });
    let generated: Rec | null = null;
    let failure = '';
    for (const provider of providers.slice(0, 2)) {
      try {
        const raw = await invokeProvider(provider, system, userPrompt);
        const candidate = parseJsonText(raw);
        if (!isRecord(candidate)) throw new Error('The AI provider returned a malformed game draft.');
        const experienceTitle = safeText(candidate.experienceTitle, 160);
        const campaignTitle = safeText(candidate.campaignTitle, 160);
        const terms = safeText(candidate.terms, 1200);
        const refundPolicy = safeText(candidate.refundPolicy, 900);
        const imagePrompt = safeText(candidate.imagePrompt, 1000);
        if (experienceTitle.length < 2 || campaignTitle.length < 2 || terms.length < 20 || refundPolicy.length < 10 || imagePrompt.length < 10) {
          throw new Error('The AI provider omitted required draft copy.');
        }
        generated = {
          experienceTitle,
          experienceSlug: slug(safeText(candidate.experienceSlug, 100) || experienceTitle, 'play-draft'),
          experienceType: typeKey(safeText(candidate.experienceType, 80)),
          experienceDescription: safeText(candidate.experienceDescription, 800),
          campaignTitle,
          campaignSlug: slug(safeText(candidate.campaignSlug, 100) || campaignTitle, 'campaign-draft'),
          prizeTitle: safeText(candidate.prizeTitle, 240),
          terms,
          refundPolicy,
          imagePrompt,
          riskNotes: safeText(candidate.riskNotes, 1000) || 'Review prize, eligibility, official rules, timing, delivery and refund terms before publishing.',
        };
        break;
      } catch (error) {
        failure = error instanceof Error ? error.message : 'AI draft failed.';
      }
    }
    if (!generated) {
      console.warn('VAD Play AI draft provider chain failed:', safeText(failure, 240));
      return json({ error: 'AI could not prepare this draft. Check the configured provider and try again.' }, 503);
    }
    return json({
      ok: true,
      ...generated,
      engineKey: 'PRIZE_DRAW',
      requiresHumanReview: true,
      economicsFieldsIntentionallyBlank: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Game drafting failed unexpectedly.';
    return json({ error: message.slice(0, 500) }, 500);
  }
});
