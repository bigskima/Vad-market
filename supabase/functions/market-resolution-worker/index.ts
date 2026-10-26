import { createClient } from 'npm:@supabase/supabase-js@2';

type RecordValue = Record<string, unknown>;
type RpcError = { message?: string; code?: string } | null;
type RpcResult = { data: unknown; error: RpcError };
type RpcClient = {
  rpc: (functionName: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;
};
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

async function authenticate(req: Request, admin: RpcClient) {
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

function extractPublishedAt(raw: string): string | null {
  const patterns = [
    /<meta\b[^>]*(?:property|name)=["'](?:article:published_time|datepublished|pubdate|publication_date|date)["'][^>]*content=["']([^"']+)["']/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:article:published_time|datepublished|pubdate|publication_date|date)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /<time\b[^>]*datetime=["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const candidate = raw.match(pattern)?.[1]?.trim();
    if (!candidate) continue;
    const parsed = new Date(candidate);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }
  return null;
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
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return null;
    const declaredType = response.headers.get('content-type') ?? '';
    if (!/(text\/html|application\/xhtml\+xml|text\/plain|application\/json)/i.test(declaredType)) return null;
    const raw = await response.text();
    if (raw.length > 2_000_000) return null;
    const text = declaredType.includes('html') || declaredType.includes('xhtml') ? stripHtml(raw) : raw.replace(/\s+/g, ' ').trim();
    if (text.length < 80) return null;
    return { url: url.toString(), domain: url.hostname, text: text.slice(0, maxChars), source: 'DIRECT', publishedAt: extractPublishedAt(raw) };
  } catch {
    return null;
  }
}

async function searchEvidence(title: string, scope: RecordValue, oracleProviders: OracleProvider[]): Promise<EvidenceSource[]> {
  const sourceList = Array.isArray(scope.sources) ? [...scope.sources] : [];
  sourceList.push(scope.source_url, scope.sourceUrl);
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
      signal: AbortSignal.timeout(8000),
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
      openedAt: event.openedAt,
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
      signal: AbortSignal.timeout(15000),
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
      signal: AbortSignal.timeout(15000),
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
      signal: AbortSignal.timeout(15000),
    });
  } else if (runtime.adapter === 'CLOUDFLARE_WORKERS_AI') {
    response = await fetch(runtime.endpoint.replaceAll('{model}', encodeURIComponent(runtime.modelCode)), {
      method: 'POST', redirect: 'error',
      headers: { ...commonHeaders, Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        messages: [{ role: 'system', content: runtime.systemPrompt }, { role: 'user', content: userPrompt }],
        temperature: 0, max_tokens: 1400,
      }),
      signal: AbortSignal.timeout(15000),
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
    evidence.push({ url: source.url, quote, publishedAt: source.publishedAt, source });
  }
  const outcomes = Array.isArray(event.outcomes) ? event.outcomes.filter(isRecord) : [];
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1 || !rationale) throw new Error('AI output confidence or rationale was invalid.');
  if ((status === 'RESOLVED' || status === 'VOID') && (confidence < 0.9 || evidence.length === 0)) {
    throw new Error('Financial resolution requires high confidence and at least one source quote verified against fetched evidence.');
  }
  if (status === 'RESOLVED') {
    if (!outcomeCode || !outcomes.some((outcome) => safeText(outcome.code, 80) === outcomeCode)) {
      throw new Error('AI selected an outcome that is not configured for this market.');
    }
    if (confidence < 0.9 || evidence.length === 0) throw new Error('Outcome lacks sufficient confidence or verifiable cited evidence.');
    const scope = isRecord(event.resolutionScope) ? event.resolutionScope : {};
    const rule = safeText(scope.condition ?? scope.rule, 4000);
    if (outcomeCode.toUpperCase() === 'YES' && /after market opening|between market opening|since the market opened/i.test(rule)) {
      const openedAt = new Date(safeText(event.openedAt, 80));
      const deadlineRaw = safeText(scope.resolution_deadline ?? scope.resolutionDeadline, 100);
      const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
      const validTimeEvidence = evidence.some((item) => {
        if (!item.publishedAt) return false;
        const published = new Date(item.publishedAt);
        return Number.isFinite(published.getTime())
          && Number.isFinite(openedAt.getTime())
          && published.getTime() >= openedAt.getTime()
          && (!deadline || !Number.isFinite(deadline.getTime()) || published.getTime() <= deadline.getTime());
      });
      if (!validTimeEvidence) throw new Error('A YES outcome requires independently extracted publication time inside the market window.');
    }
  } else if (outcomeCode !== null) {
    throw new Error('Only a resolved result may contain an outcome code.');
  }
  return { status, outcomeCode, confidence, rationale, evidence };
}

async function recordAttempt(admin: RpcClient, event: RecordValue, runtime: AiRuntime | null, status: string, output: RecordValue, evidence: RecordValue, failureReason: string | null) {
  const unique = [safeText(event.eventPublicId, 80), String(runtime?.aiProviderId ?? 'NO_MODEL'), new Date().toISOString(), status].join(':');
  const { error } = await admin.rpc('internal_record_market_resolution_attempt', {
    p_event_id: event.eventId,
    p_ai_provider_id: runtime?.aiProviderId ?? null,
    p_model_code: runtime?.modelCode ?? null,
    p_status: status,
    p_output_payload: output,
    p_evidence_payload: evidence,
    p_failure_reason: failureReason,
    p_attempt_key: 'ai-resolution-v1:' + (await sha256(unique)),
  });
  if (error) console.error('Could not persist AI resolution attempt', {
    eventPublicId: event.eventPublicId,
    status,
    code: error.code ?? null,
  });
}

async function processEvent(admin: RpcClient, event: RecordValue, runtimes: AiRuntime[], oracleProviders: OracleProvider[]) {
  const scope = isRecord(event.resolutionScope) ? event.resolutionScope : {};
  const sourcesRaw = Array.isArray(scope.sources) ? scope.sources : [];
  const primaryUrls = sourcesRaw.slice(0, 8).map((item) => validatePublicHttpsUrl(item)).filter((x): x is URL => Boolean(x));
  for (const field of ['source_url', 'sourceUrl']) {
    const candidate = validatePublicHttpsUrl(scope[field]);
    if (candidate && !primaryUrls.some((existing) => existing.toString() === candidate.toString())) primaryUrls.push(candidate);
  }

  const [directResults, searchPacket] = await Promise.all([
    Promise.all(primaryUrls.map((url) => fetchText(url))),
    searchEvidence(safeText(event.title, 500), scope, oracleProviders),
  ]);
  const directPacket = directResults.filter((value): value is EvidenceSource => Boolean(value));
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

  // Use only models whose server-side credentials are available. When two or
  // more models are configured, require two independent model decisions to agree
  // before writing a financial oracle observation or invoking a void.
  const configuredRuntimes = runtimes.filter((runtime) =>
    Boolean(Deno.env.get(runtime.secretReference)?.trim())
    && Boolean(runtime.endpoint && runtime.adapter && runtime.modelCode)
  );
  if (configuredRuntimes.length === 0) {
    await recordAttempt(admin, event, null, 'INCONCLUSIVE', {}, { evidenceCount: packet.length }, 'No active free-only AI model has an available server-side credential.');
    return { eventPublicId: event.eventPublicId, status: 'INCONCLUSIVE', reason: 'NO_CONFIGURED_AI_MODEL' };
  }

  const evaluations = await Promise.all(configuredRuntimes.map(async (runtime) => {
    const startedAt = new Date();
    try {
      const output = await callModel(runtime, event, packet);
      const validated = validateOutput(output, event, packet);
      const evidenceSummary = validated.evidence.map((item) => ({
        url: item.url, quote: item.quote, publishedAt: item.publishedAt, sourceType: item.source.source,
      }));
      if (validated.status === 'INCONCLUSIVE') {
        await recordAttempt(admin, event, runtime, 'INCONCLUSIVE', {
          proposedStatus: validated.status, confidence: validated.confidence, rationale: validated.rationale,
        }, { citations: evidenceSummary }, 'Model could not establish a result from the provided evidence.');
        return { kind: 'INCONCLUSIVE' as const, runtime, reason: 'MODEL_INCONCLUSIVE' };
      }
      return { kind: 'CANDIDATE' as const, runtime, startedAt, validated, evidenceSummary };
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 350) : 'AI resolution failed.';
      await recordAttempt(admin, event, runtime, 'FAILED', {}, { evidenceCount: packet.length }, message);
      return { kind: 'FAILED' as const, runtime, reason: message };
    }
  }));

  const candidates = evaluations.filter((evaluation) => evaluation.kind === 'CANDIDATE');
  if (candidates.length === 0) {
    const reasons = evaluations.map((evaluation) =>
      evaluation.kind === 'FAILED' ? evaluation.runtime.providerCode + ': ' + evaluation.reason
        : evaluation.kind === 'INCONCLUSIVE' ? evaluation.runtime.providerCode + ': inconclusive'
          : ''
    ).filter(Boolean);
    return { eventPublicId: event.eventPublicId, status: 'INCONCLUSIVE', reasons: reasons.slice(0, 4) };
  }

  const requiredAgreement = Math.min(2, configuredRuntimes.length);
  const groups = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const key = candidate.validated.status + ':' + (candidate.validated.outcomeCode ?? '');
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  const winningGroup = [...groups.values()].sort((a, b) => b.length - a.length)[0];
  if (!winningGroup || winningGroup.length < requiredAgreement) {
    for (const candidate of candidates) {
      await recordAttempt(admin, event, candidate.runtime, 'INCONCLUSIVE', {
        proposedStatus: candidate.validated.status,
        proposedOutcomeCode: candidate.validated.outcomeCode,
        confidence: candidate.validated.confidence,
        rationale: candidate.validated.rationale,
      }, { citations: candidate.evidenceSummary }, 'AI_MODEL_DISAGREEMENT: independent model agreement was not reached.');
    }
    return {
      eventPublicId: event.eventPublicId,
      status: 'INCONCLUSIVE',
      reason: 'AI_MODEL_DISAGREEMENT',
      modelDecisions: candidates.map((candidate) => ({
        provider: candidate.runtime.providerCode,
        status: candidate.validated.status,
        outcomeCode: candidate.validated.outcomeCode,
      })),
    };
  }

  // Preserve the disagreement in the audit trail even when a majority exists.
  const dissenters = candidates.filter((candidate) => !winningGroup.includes(candidate));
  for (const candidate of dissenters) {
    await recordAttempt(admin, event, candidate.runtime, 'INCONCLUSIVE', {
      proposedStatus: candidate.validated.status,
      proposedOutcomeCode: candidate.validated.outcomeCode,
      confidence: candidate.validated.confidence,
      rationale: candidate.validated.rationale,
    }, { citations: candidate.evidenceSummary }, 'AI_MODEL_DISAGREEMENT: candidate differed from the agreed outcome.');
  }

  const agreedStatus = winningGroup[0].validated.status;
  const agreementEvidence = winningGroup.flatMap((candidate) => candidate.validated.evidence);
  const evidenceByKey = new Map<string, (typeof agreementEvidence)[number]>();
  for (const evidence of agreementEvidence) evidenceByKey.set(evidence.source.source + '|' + evidence.url + '|' + evidence.quote, evidence);
  const agreedEvidence = [...evidenceByKey.values()].sort((a, b) => {
    const aPrimary = primaryUrls.some((url) => url.toString() === a.url) ? 0 : 1;
    const bPrimary = primaryUrls.some((url) => url.toString() === b.url) ? 0 : 1;
    const aDirect = a.source.source === 'DIRECT' ? 0 : 1;
    const bDirect = b.source.source === 'DIRECT' ? 0 : 1;
    return aPrimary - bPrimary || aDirect - bDirect || a.url.localeCompare(b.url);
  });
  const evidenceSummary = agreedEvidence.map((item) => ({
    url: item.url, quote: item.quote, publishedAt: item.publishedAt, sourceType: item.source.source,
  }));
  const directEvidence = agreedEvidence.find((item) => item.source.source === 'DIRECT');
  const searchResultEvidence = agreedEvidence.find((item) => item.source.source === 'SEARCH');
  const sourceCodes = new Set<string>();
  const hierarchy = Array.isArray(event.sourceHierarchy) ? event.sourceHierarchy : [];
  for (const entry of hierarchy) {
    const value = typeof entry === 'string'
      ? entry
      : isRecord(entry) ? safeText(entry.provider_code ?? entry.providerCode ?? entry.code, 80) : '';
    if (value) sourceCodes.add(value.toUpperCase());
  }
  const sourceEvidence = [
    { code: 'PUBLIC_RECORD', evidence: directEvidence },
    { code: 'TAVILY', evidence: searchResultEvidence },
  ] as const;
  const missingSource = sourceEvidence.find(({ code, evidence }) => !evidence || !sourceCodes.has(code));

  if (agreedStatus === 'VOID') {
    if (winningGroup.length < 2 || missingSource) {
      const reason = winningGroup.length < 2
        ? 'AUTOMATIC_VOID_REQUIRES_TWO_AI_MODELS'
        : 'TWO_SOURCE_ORACLE_QUORUM_REQUIRED';
      for (const candidate of winningGroup) {
        await recordAttempt(admin, event, candidate.runtime, 'INCONCLUSIVE', {
          proposedStatus: 'VOID',
          confidence: candidate.validated.confidence,
          rationale: candidate.validated.rationale,
        }, { citations: candidate.evidenceSummary }, reason);
      }
      return { eventPublicId: event.eventPublicId, status: 'INCONCLUSIVE', reason };
    }
    const condition = safeText(scope.condition, 4000);
    const explicitVoid = /\bvoid\b/i.test(condition) || Boolean(scope.void_rule) || Boolean(scope.voidRule);
    const deadlineRaw = safeText(scope.resolution_deadline ?? scope.resolutionDeadline, 100);
    const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
    if (!explicitVoid || !deadline || !Number.isFinite(deadline.getTime()) || deadline.getTime() > Date.now()) {
      for (const candidate of winningGroup) {
        await recordAttempt(admin, event, candidate.runtime, 'INCONCLUSIVE', {
          proposedStatus: 'VOID_REJECTED', confidence: candidate.validated.confidence, rationale: candidate.validated.rationale,
        }, { citations: candidate.evidenceSummary }, 'Published void rule or deadline not satisfied.');
      }
      return { eventPublicId: event.eventPublicId, status: 'INCONCLUSIVE', reason: 'VOID_POLICY_GUARD_REJECTED' };
    }

    const { data: voided, error: voidError } = await admin.rpc('internal_queue_vad_review_void_event', {
      p_event_id: event.eventId,
      p_evidence: {
        ai_reviews: winningGroup.map((candidate) => ({
          provider: candidate.runtime.providerCode,
          model_code: candidate.runtime.modelCode,
          prompt_version_id: candidate.runtime.promptVersionId,
          confidence: candidate.validated.confidence,
          rationale: candidate.validated.rationale,
          citations: candidate.evidenceSummary,
        })),
        agreement_count: winningGroup.length,
        required_agreement: requiredAgreement,
        citations: evidenceSummary,
        evidence_packet_hash: await sha256(JSON.stringify(packet)),
      },
    });
    if (voidError || voided !== true) {
      const reason = 'Automatic void policy guard rejected the void.';
      for (const candidate of winningGroup) {
        await recordAttempt(admin, event, candidate.runtime, 'FAILED', {}, { citations: candidate.evidenceSummary }, reason);
      }
      throw new Error(reason);
    }
    for (const candidate of winningGroup) {
      await recordAttempt(admin, event, candidate.runtime, 'VOID_PROPOSED', {
        status: 'VOID_PROPOSED', rationale: candidate.validated.rationale, confidence: candidate.validated.confidence,
        agreementCount: winningGroup.length,
      }, { citations: candidate.evidenceSummary }, null);
    }
    return {
      eventPublicId: event.eventPublicId,
      status: 'VOID_PROPOSED',
      providers: winningGroup.map((candidate) => candidate.runtime.providerCode),
      agreementCount: winningGroup.length,
    };
  }

  const agreedOutcome = winningGroup[0].validated.outcomeCode;
  if (!agreedOutcome || agreedEvidence.length === 0) {
    throw new Error('The agreed AI result lacks a configured outcome or verified evidence.');
  }

  // Source quorum was computed once above so both YES/NO outcomes and VOID require the same evidence paths.
  if (missingSource) {
    for (const candidate of winningGroup) {
      await recordAttempt(admin, event, candidate.runtime, 'INCONCLUSIVE', {
        proposedStatus: 'RESOLVED',
        proposedOutcomeCode: agreedOutcome,
        confidence: candidate.validated.confidence,
        rationale: candidate.validated.rationale,
      }, { citations: candidate.evidenceSummary }, 'The approved oracle policy requires both configured primary and corroborating evidence paths before financial settlement.');
    }
    return {
      eventPublicId: event.eventPublicId,
      status: 'INCONCLUSIVE',
      reason: 'TWO_SOURCE_ORACLE_QUORUM_REQUIRED',
      availableEvidencePaths: agreedEvidence.map((item) => item.source.source),
    };
  }

  const observationRecords: Array<{ providerCode: string; observationId: number; evidenceUrl: string }> = [];
  try {
    for (const source of sourceEvidence) {
      const chosenEvidence = source.evidence!;
      const oracleProvider = oracleProviders.find((provider) =>
        provider.code === source.code
        && provider.environment === 'PRODUCTION'
        && provider.status === 'ACTIVE'
        && provider.capabilities?.some((value) => value.toUpperCase() === 'PUBLIC_RECORD_EVIDENCE')
        && (source.code !== 'TAVILY' || Boolean(provider.secretReference && Deno.env.get(provider.secretReference)?.trim()))
      );
      if (!oracleProvider) throw new Error('The approved oracle source ' + source.code + ' is not active and configured.');
  
      const idempotencyKey = 'ai-resolution-observation-v1:' + (await sha256([
        event.eventPublicId, oracleProvider.code, chosenEvidence.url, agreedOutcome, safeText(scope.condition, 1000),
      ].join('|')));
      const { data: observationId, error: observationError } = await admin.rpc('internal_record_verified_oracle_observation', {
        p_event_id: event.eventId,
        p_provider_id: oracleProvider.id,
        p_source_code: oracleProvider.code,
        p_observed_outcome: agreedOutcome,
        p_payload: {
          resolver_type: 'AI_EVIDENCE_RULE_V1',
          oracle_source_path: chosenEvidence.source.source,
          ai_agreement_count: winningGroup.length,
          ai_required_agreement: requiredAgreement,
          ai_reviews: winningGroup.map((candidate) => ({
            provider: candidate.runtime.providerCode,
            model_code: candidate.runtime.modelCode,
            prompt_version_id: candidate.runtime.promptVersionId,
            confidence: candidate.validated.confidence,
            rationale: candidate.validated.rationale,
            citations: candidate.evidenceSummary,
          })),
          resolution_condition: scope.condition ?? null,
          source_evidence: {
            url: chosenEvidence.url,
            quote: chosenEvidence.quote,
            published_at: chosenEvidence.publishedAt,
            source_type: chosenEvidence.source.source,
          },
          evidence: evidenceSummary,
          evidence_packet_hash: await sha256(JSON.stringify(packet)),
        },
        p_evidence_reference: chosenEvidence.url,
        p_observed_at: new Date().toISOString(),
        p_idempotency_key: idempotencyKey,
      });
      if (observationError || observationId == null) {
        throw new Error('Oracle consensus rejected the ' + oracleProvider.code + ' evidence observation.');
      }
      observationRecords.push({
        providerCode: oracleProvider.code,
        observationId: Number(observationId),
        evidenceUrl: chosenEvidence.url,
      });
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 350) : 'Oracle evidence write failed.';
    for (const candidate of winningGroup) {
      await recordAttempt(admin, event, candidate.runtime, 'FAILED', {}, { evidenceCount: packet.length }, reason);
    }
    throw error;
  }

  // The database consensus routine runs after each provider observation. Its
  // new two-provider minimum prevents the first observation from becoming
  // provisional; only matching evidence from both sources can enter the
  // dispute window and later be finalized by the existing cron worker.
  for (const candidate of winningGroup) {
    await recordAttempt(admin, event, candidate.runtime, 'RESOLVED', {
      status: 'RESOLVED',
      outcomeCode: agreedOutcome,
      confidence: candidate.validated.confidence,
      rationale: candidate.validated.rationale,
      observationRecords,
      agreementCount: winningGroup.length,
      requiredAgreement,
    }, { citations: candidate.evidenceSummary }, null);
  }
  return {
    eventPublicId: event.eventPublicId,
    status: 'RESOLVED',
    outcomeCode: agreedOutcome,
    aiProviders: winningGroup.map((candidate) => candidate.runtime.providerCode),
    oracleProviders: observationRecords.map((record) => record.providerCode),
    observationRecords,
    agreementCount: winningGroup.length,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const { url, service } = credentials();
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as RpcClient;
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
      let processingError: string | null = null;
      try {
        results.push(await processEvent(admin, event, runtimes, oracleProviders));
      } catch (error) {
        processingError = error instanceof Error ? error.message.slice(0, 350) : 'Unexpected worker error.';
        results.push({ eventPublicId: event.eventPublicId, status: 'FAILED', reason: processingError });
        console.error('AI resolution event failed', { eventPublicId: event.eventPublicId, error: processingError });
      } finally {
        if (typeof event.claimToken === 'string') {
          const { error } = await admin.rpc('internal_finish_market_resolution_claim', {
            p_event_id: event.eventId,
            p_claim_token: event.claimToken,
            p_error: processingError,
          });
          if (error) console.error('Could not release AI resolution claim', {
            eventPublicId: event.eventPublicId,
            code: error.code ?? null,
          });
        }
      }
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
