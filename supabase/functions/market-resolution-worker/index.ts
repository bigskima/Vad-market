import { createClient } from 'npm:@supabase/supabase-js@2';

type RecordValue = Record<string, unknown>;
type EvidenceSource = {
  url: string;
  domain: string;
  text: string;
  source: 'DIRECT' | 'SEARCH';
  publishedAt: string | null;
};
type AiRuntime = {
  aiProviderId: number;
  providerCode: string;
  providerName: string;
  environment: string;
  adapter: string;
  endpoint: string;
  apiVersion?: string | null;
  secretReference: string;
  modelCode: string;
  priority: number;
  systemPrompt: string;
  promptVersionId: number;
};
type OracleProvider = {
  id: number;
  code: string;
  name: string;
  environment: string;
  status: string;
  capabilities: string[];
  secretReference?: string | null;
  publicMetadata?: RecordValue;
};

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-vad-scheduler-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const isRecord = (value: unknown): value is RecordValue => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const safeText = (value: unknown, max = 2000) => typeof value === 'string'
  ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max)
  : '';
const sha256 = async (value: string) => {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

function credentials() {
  const url = Deno.env.get('SUPABASE_URL')?.trim();
  const service = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY'))?.trim();
  if (!url || !service) throw new Error('Resolution worker runtime credentials are missing.');
  return { url, service };
}

async function authenticate(req: Request, admin: ReturnType<typeof createClient>) {
  const schedulerSecret = req.headers.get('x-vad-scheduler-secret')?.trim() ?? '';
  if (!schedulerSecret) throw new Error('SCHEDULER_AUTH_REQUIRED');
  const { data, error } = await admin.rpc('internal_validate_oracle_scheduler_secret', { p_secret: schedulerSecret });
  if (error || data !== true) throw new Error('SCHEDULER_AUTH_INVALID');
}

function validatePublicHttpsUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase();
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')
      || hostname.endsWith('.local') || hostname === 'metadata.google.internal'
      || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
      || hostname.startsWith('[')) return null;
    return url;
  } catch {
    return null;
  }
}

function stripHtml(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchText(url: URL, maxChars = 7000): Promise<EvidenceSource | null> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      headers: { Accept: 'text/html,application/xhtml+xml,text/plain,application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const declaredType = response.headers.get('content-type') ?? '';
    if (!/(text\/html|application\/xhtml\+xml|text\/plain|application\/json)/i.test(declaredType)) return null;
    const raw = await response.text();
    if (raw.length > 2_000_000) return null;
    const text = declaredType.includes('html') || declaredType.includes('xhtml') ? stripHtml(raw) : raw.replace(/\s+/g, ' ').trim();
    if (text.length < 80) return null;
    return { url: url.toString(), domain: url.hostname, text: text.slice(0, maxChars), source: 'DIRECT', publishedAt: null };
  } catch {
    return null;
  }
}

async function searchEvidence(title: string, scope: RecordValue, oracleProviders: OracleProvider[]): Promise<EvidenceSource[]> {
  const sourceList = Array.isArray(scope.sources) ? scope.sources : [];
  const allowedDomains = Array.from(new Set(sourceList.map((item) => validatePublicHttpsUrl(item)?.hostname).filter((x): x is string => Boolean(x))));
  const tavily = oracleProviders.find((p) => p.code === 'TAVILY' && p.environment === 'PRODUCTION'
    && p.status === 'ACTIVE' && p.capabilities?.some((c) => c.toUpperCase() === 'PUBLIC_RECORD_EVIDENCE'));
  if (!tavily?.secretReference || allowedDomains.length === 0) return [];
  const apiKey = Deno.env.get(tavily.secretReference)?.trim();
  if (!apiKey) return [];

  const rule = safeText(scope.condition ?? scope.rule ?? scope.resolution_rule, 2000);
  const query = [title, rule, 'official result announcement date'].filter(Boolean).join(' ');
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        max_results: 5,
        include_answer: false,
        include_raw_content: false,
        include_domains: allowedDomains,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => ({}));
    if (!isRecord(payload) || !Array.isArray(payload.results)) return [];
    const result: EvidenceSource[] = [];
    for (const item of payload.results.slice(0, 5)) {
      if (!isRecord(item)) continue;
      const url = validatePublicHttpsUrl(item.url);
      const text = safeText(item.content ?? item.raw_content, 7000);
      if (!url || !text || !allowedDomains.some((host) => url.hostname === host || url.hostname.endsWith('.' + host))) continue;
      result.push({
        url: url.toString(),
        domain: url.hostname,
        text,
        source: 'SEARCH',
        publishedAt: safeText(item.published_date ?? item.publishedAt, 80) || null,
      });
    }
    return result;
  } catch {
    return [];
  }
}

function parseModelJson(text: string): RecordValue {
  const source = text.trim().replace(/^\x60{3}(?:json)?/i, '').replace(/\x60{3}$/i, '').trim();
  const first = source.indexOf('{');
  const last = source.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('AI output did not contain a JSON object.');
  const result: unknown = JSON.parse(source.slice(first, last + 1));
  if (!isRecord(result)) throw new Error('AI output was not a JSON object.');
  return result;
}

function modelText(payload: unknown, adapter: string) {
  if (!isRecord(payload)) return '';
  if (adapter === 'OPENAI_COMPATIBLE') {
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const choice = isRecord(choices[0]) ? choices[0] : {};
    const message = isRecord(choice.message) ? choice.message : {};
    return safeText(message.content, 20000);
  }
  if (adapter === 'GEMINI_GENERATE_CONTENT') {
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const candidate = isRecord(candidates[0]) ? candidates[0] : {};
    const content = isRecord(candidate.content) ? candidate.content : {};
    const parts = Array.isArray(content.parts) ? content.parts : [];
    return parts.map((part) => isRecord(part) ? safeText(part.text, 8000) : '').join('');
  }
  if (adapter === 'ANTHROPIC_MESSAGES') {
    const content = Array.isArray(payload.content) ? payload.content : [];
    return content.map((part) => isRecord(part) ? safeText(part.text, 8000) : '').join('');
  }
  if (adapter === 'CLOUDFLARE_WORKERS_AI') {
    const result = isRecord(payload.result) ? payload.result : {};
    return safeText(result.response ?? result.output_text ?? payload.response, 20000);
  }
  return '';
}

async function callModel(runtime: AiRuntime, event: RecordValue, packet: EvidenceSource[]) {
  const key = Deno.env.get(runtime.secretReference)?.trim();
  if (!key || !runtime.endpoint || !runtime.adapter || !runtime.modelCode) {
    throw new Error('AI provider endpoint, model or server-side credential is unavailable.');
  }
  const userPrompt = JSON.stringify({
    task: 'Determine the configured VAD market outcome using only the published resolution rule and evidence packet.',
    market: {
      id: event.eventPublicId,
      title: event.title,
      category: event.category,
      resolutionScope: event.resolutionScope,
      normalizedParameters: event.normalizedParameters,
      closesAt: event.closesAt,
      resolvesAfter: event.resolvesAfter,
      allowedOutcomes: event.outcomes,
    },
    sourceHierarchy: event.sourceHierarchy,
    evidencePacket: packet.map((source) => ({
      url: source.url,
      domain: source.domain,
      sourceType: source.source,
      publishedAt: source.publishedAt,
      content: source.text,
    })),
    requiredOutput: {
      status: 'RESOLVED | VOID | INCONCLUSIVE',
      outcomeCode: 'one exact configured outcome code, or null',
      confidence: '0..1',
      rationale: 'explicitly apply rule, cutoff and source hierarchy',
      evidence: [{ url: 'exact packet URL', quote: 'short exact quote in packet', publishedAt: 'ISO date or null' }],
    },
  });

  const commonHeaders = { 'Content-Type': 'application/json', Accept: 'application/json' };
  let response: Response;
  if (runtime.adapter === 'OPENAI_COMPATIBLE') {
    response = await fetch(runtime.endpoint.replaceAll('{model}', encodeURIComponent(runtime.modelCode)), {
      method: 'POST', redirect: 'error',
      headers: { ...commonHeaders, Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: runtime.modelCode, temperature: 0, max_tokens: 1400,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: runtime.systemPrompt }, { role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });
  } else if (runtime.adapter === 'GEMINI_GENERATE_CONTENT') {
    response = await fetch(runtime.endpoint.replaceAll('{model}', encodeURIComponent(runtime.modelCode)), {
      method: 'POST', redirect: 'error',
      headers: { ...commonHeaders, 'x-goog-api-key': key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: runtime.systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 1400, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(20000),
    });
  } else if (runtime.adapter === 'ANTHROPIC_MESSAGES') {
    if (!runtime.apiVersion) throw new Error('Anthropic API version is not configured.');
    response = await fetch(runtime.endpoint.replaceAll('{model}', encodeURIComponent(runtime.modelCode)), {
      method: 'POST', redirect: 'error',
      headers: { ...commonHeaders, 'x-api-key': key, 'anthropic-version': runtime.apiVersion },
      body: JSON.stringify({
        model: runtime.modelCode, temperature: 0, max_tokens: 1400, system: runtime.systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });
  } else if (runtime.adapter === 'CLOUDFLARE_WORKERS_AI') {
    response = await fetch(runtime.endpoint.replaceAll('{model}', encodeURIComponent(runtime.modelCode)), {
      method: 'POST', redirect: 'error',
      headers: { ...commonHeaders, Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        messages: [{ role: 'system', content: runtime.systemPrompt }, { role: 'user', content: userPrompt }],
        temperature: 0, max_tokens: 1400,
      }),
      signal: AbortSignal.timeout(20000),
    });
  } else {
    throw new Error('Unsupported configured AI adapter.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('AI provider returned HTTP ' + response.status + '.');
  const text = modelText(payload, runtime.adapter);
  if (!text) throw new Error('AI provider returned no usable JSON text.');
  return parseModelJson(text);
}

function validateOutput(raw: RecordValue, event: RecordValue, packet: EvidenceSource[]) {
  const status = safeText(raw.status, 32).toUpperCase();
  if (!['RESOLVED', 'VOID', 'INCONCLUSIVE'].includes(status)) throw new Error('AI output status was invalid.');
  const outcomeCode = raw.outcomeCode == null ? null : safeText(raw.outcomeCode, 80);
  const confidence = Number(raw.confidence);
  const rationale = safeText(raw.rationale, 1600);
  const evidenceRaw = Array.isArray(raw.evidence) ? raw.evidence : [];
  const evidence: Array<{ url: string; quote: string; publishedAt: string | null; source: EvidenceSource }> = [];
  for (const item of evidenceRaw.slice(0, 5)) {
    if (!isRecord(item)) continue;
    const url = validatePublicHttpsUrl(item.url);
    const quote = safeText(item.quote, 600);
    if (!url || !quote) continue;
    const source = packet.find((p) => p.url === url.toString());
    if (!source || !normalize(source.text).includes(normalize(quote))) continue;
    evidence.push({ url: source.url, quote, publishedAt: safeText(item.publishedAt, 80) || source.publishedAt, source });
  }
  const outcomes = Array.isArray(event.outcomes) ? event.outcomes.filter(isRecord) : [];
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1 || !rationale) throw new Error('AI output confidence or rationale was invalid.');
  if (status === 'RESOLVED') {
    if (!outcomeCode || !outcomes.some((outcome) => safeText(outcome.code, 80) === outcomeCode)) {
      throw new Error('AI selected an outcome that is not configured for this market.');
    }
    if (confidence < 0.9 || evidence.length === 0) throw new Error('Outcome lacks sufficient confidence or verifiable cited evidence.');
  } else if (outcomeCode !== null) {
    throw new Error('Only a resolved result may contain an outcome code.');
  }
  return { status, outcomeCode, confidence, rationale, evidence };
}

async function recordAttempt(admin: ReturnType<typeof createClient>, event: RecordValue, runtime: AiRuntime | null, status: string, output: RecordValue, evidence: RecordValue, failureReason: string | null) {
  const unique = [safeText(event.eventPublicId, 80), String(runtime?.aiProviderId ?? 'NO_MODEL'), new Date().toISOString(), status].join(':');
  await admin.rpc('internal_record_market_resolution_attempt', {
    p_event_id: event.eventId,
    p_ai_provider_id: runtime?.aiProviderId ?? null,
    p_model_code: runtime?.modelCode ?? null,
    p_status: status,
    p_output_payload: output,
    p_evidence_payload: evidence,
    p_failure_reason: failureReason,
    p_attempt_key: 'ai-resolution-v1:' + (await sha256(unique)),
  });
}

async function processEvent(admin: ReturnType<typeof createClient>, event: RecordValue, runtimes: AiRuntime[], oracleProviders: OracleProvider[]) {
  const scope = isRecord(event.resolutionScope) ? event.resolutionScope : {};
  const sourcesRaw = Array.isArray(scope.sources) ? scope.sources : [];
  const primaryUrls = sourcesRaw.slice(0, 8).map((item) => validatePublicHttpsUrl(item)).filter((x): x is URL => Boolean(x));
  for (const field of ['source_url', 'sourceUrl']) {
    const candidate = validatePublicHttpsUrl(scope[field]);
    if (candidate && !primaryUrls.some((existing) => existing.toString() === candidate.toString())) primaryUrls.push(candidate);
  }
  const directResults = await Promise.all(primaryUrls.map((url) => fetchText(url)));
  const directPacket = directResults.filter((value): value is EvidenceSource => Boolean(value));
  const searchPacket = await searchEvidence(safeText(event.title, 500), scope, oracleProviders);
  const seen = new Set<string>();
  const packet = [...directPacket, ...searchPacket].filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).slice(0, 10);

  if (packet.length === 0) {
    await recordAttempt(admin, event, null, 'INCONCLUSIVE', {}, { sourceUrlsTried: primaryUrls.map((url) => url.toString()) }, 'No allowed public source returned readable evidence.');
    return { eventPublicId: event.eventPublicId, status: 'INCONCLUSIVE', reason: 'NO_READABLE_EVIDENCE' };
  }

  const resultErrors: string[] = [];
  for (const runtime of runtimes) {
    const startedAt = new Date();
    try {
      const output = await callModel(runtime, event, packet);
      const validated = validateOutput(output, event, packet);
      const evidenceSummary = validated.evidence.map((item) => ({
        url: item.url, quote: item.quote, publishedAt: item.publishedAt, sourceType: item.source.source,
      }));
      if (validated.status === 'INCONCLUSIVE') {
        await recordAttempt(admin, event, runtime, 'INCONCLUSIVE', {
          status: validated.status, confidence: validated.confidence, rationale: validated.rationale,
        }, { citations: evidenceSummary }, null);
        resultErrors.push(runtime.providerCode + ': inconclusive');
        continue;
      }

      if (validated.status === 'VOID') {
        const condition = safeText(scope.condition, 4000);
        const explicitVoid = /\bvoid\b/i.test(condition) || Boolean(scope.void_rule) || Boolean(scope.voidRule);
        const deadlineRaw = safeText(scope.resolution_deadline ?? scope.resolutionDeadline, 100);
        const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
        if (!explicitVoid || !deadline || !Number.isFinite(deadline.getTime()) || deadline.getTime() > Date.now()) {
          await recordAttempt(admin, event, runtime, 'INCONCLUSIVE', {
            status: 'VOID_REJECTED', confidence: validated.confidence, rationale: validated.rationale,
          }, { citations: evidenceSummary }, 'Published void rule or deadline not satisfied.');
          resultErrors.push(runtime.providerCode + ': void condition not satisfied');
          continue;
        }
        const { data: voided, error: voidError } = await admin.rpc('internal_auto_void_vad_review_event', {
          p_event_id: event.eventId,
          p_evidence: {
            ai_provider: runtime.providerCode, model_code: runtime.modelCode,
            prompt_version_id: runtime.promptVersionId, confidence: validated.confidence,
            rationale: validated.rationale, citations: evidenceSummary, evidence_packet_hash: await sha256(JSON.stringify(packet)),
          },
        });
        if (voidError || voided !== true) throw new Error('Automatic void policy guard rejected the void.');
        await recordAttempt(admin, event, runtime, 'VOIDED', {
          status: 'VOID', rationale: validated.rationale, confidence: validated.confidence,
        }, { citations: evidenceSummary }, null);
        return { eventPublicId: event.eventPublicId, status: 'VOIDED', provider: runtime.providerCode };
      }

      const chosenEvidence = validated.evidence[0];
      const oracleCode = chosenEvidence.source.source === 'SEARCH' ? 'TAVILY' : 'PUBLIC_RECORD';
      const oracleProvider = oracleProviders.find((provider) =>
        provider.code === oracleCode && provider.environment === 'PRODUCTION'
        && provider.status === 'ACTIVE' && provider.capabilities?.some((value) => value.toUpperCase() === 'PUBLIC_RECORD_EVIDENCE')
      );
      if (!oracleProvider) throw new Error('Evidence source is not backed by an active configured oracle provider.');
      const idempotencyKey = 'ai-resolution-observation-v1:' + (await sha256([
        event.eventPublicId, oracleCode, chosenEvidence.url, validated.outcomeCode ?? '', safeText(scope.condition, 1000),
      ].join('|')));
      const { data: observationId, error: observationError } = await admin.rpc('internal_record_verified_oracle_observation', {
        p_event_id: event.eventId,
        p_provider_id: oracleProvider.id,
        p_source_code: oracleProvider.code,
        p_observed_outcome: validated.outcomeCode,
        p_payload: {
          resolver_type: 'AI_EVIDENCE_RULE_V1',
          ai_provider: runtime.providerCode,
          model_code: runtime.modelCode,
          prompt_version_id: runtime.promptVersionId,
          confidence: validated.confidence,
          rationale: validated.rationale,
          resolution_condition: scope.condition ?? null,
          evidence: evidenceSummary,
          evidence_packet_hash: await sha256(JSON.stringify(packet)),
          started_at: startedAt.toISOString(),
        },
        p_evidence_reference: chosenEvidence.url,
        p_observed_at: new Date().toISOString(),
        p_idempotency_key: idempotencyKey,
      });
      if (observationError || observationId == null) throw new Error('Oracle consensus rejected the evidence observation.');
      await recordAttempt(admin, event, runtime, 'RESOLVED', {
        status: 'RESOLVED', outcomeCode: validated.outcomeCode, confidence: validated.confidence,
        rationale: validated.rationale, observationId,
      }, { citations: evidenceSummary }, null);
      return { eventPublicId: event.eventPublicId, status: 'RESOLVED', provider: runtime.providerCode, oracleProvider: oracleCode, observationId };
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 350) : 'AI resolution failed.';
      resultErrors.push(runtime.providerCode + ': ' + message);
      await recordAttempt(admin, event, runtime, 'FAILED', {}, { evidenceCount: packet.length }, message);
    }
  }

  if (resultErrors.length === 0) {
    await recordAttempt(admin, event, null, 'INCONCLUSIVE', {}, { evidenceCount: packet.length }, 'No active free-only AI model is configured for resolution.');
  }
  return { eventPublicId: event.eventPublicId, status: 'INCONCLUSIVE', reasons: resultErrors.slice(0, 4) };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const { url, service } = credentials();
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    await authenticate(req, admin);

    const body = await req.json().catch(() => ({}));
    const limitRaw = isRecord(body) ? Number(body.limit ?? 15) : 15;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(Math.trunc(limitRaw), 40)) : 15;
    const [eventsResult, runtimesResult, providersResult] = await Promise.all([
      admin.rpc('internal_market_resolution_due_events', { p_limit: limit }),
      admin.rpc('get_market_resolution_ai_runtimes'),
      admin.rpc('internal_oracle_provider_catalog'),
    ]);
    if (eventsResult.error || runtimesResult.error || providersResult.error) {
      console.error('resolution worker catalog failure', {
        events: eventsResult.error?.message ?? null,
        runtimes: runtimesResult.error?.message ?? null,
        providers: providersResult.error?.message ?? null,
      });
      return json({ ok: false, error: 'RESOLUTION_CATALOG_FAILED' }, 502);
    }

    const events = Array.isArray(eventsResult.data) ? eventsResult.data as RecordValue[] : [];
    const runtimes = Array.isArray(runtimesResult.data) ? runtimesResult.data as unknown as AiRuntime[] : [];
    const oracleProviders = Array.isArray(providersResult.data) ? providersResult.data as unknown as OracleProvider[] : [];
    const results = [];
    for (const event of events) {
      results.push(await processEvent(admin, event, runtimes, oracleProviders));
    }
    return json({
      ok: true, action: 'resolve',
      dueEvents: events.length, configuredAiProviders: runtimes.length,
      results, generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Resolution worker failed.';
    const status = message === 'SCHEDULER_AUTH_REQUIRED' ? 401
      : message === 'SCHEDULER_AUTH_INVALID' ? 403 : 500;
    return json({ ok: false, error: message }, status);
  }
});
