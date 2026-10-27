import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-vad-agent-key, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function textValue(value: unknown, max = 1000): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max)
    : '';
}
function dateValue(value: unknown, label: string): string {
  const raw = textValue(value, 100);
  const time = Date.parse(raw);
  if (!raw || !Number.isFinite(time)) throw new Error('Provide a valid ' + label + ' date and time.');
  return new Date(time).toISOString();
}
function amountValue(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000_000_000_000) {
    throw new Error('Provide a valid positive ' + label + ' amount.');
  }
  return parsed;
}
function fillTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (match, key: string) => values[key] ?? match);
}
function sanitizedDetails(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const rows = Object.entries(value).slice(0, 50).map(([key, value]) => [textValue(key, 80), textValue(value, 1000)] as const);
  return Object.fromEntries(rows.filter(([key]) => Boolean(key)));
}
function hasScope(scopes: unknown, scope: string) {
  return Array.isArray(scopes) && scopes.includes(scope);
}
function safeProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return message.slice(0, 600) || 'The requested market operation could not be completed.';
}

async function handle(req: Request) {
  const apiKey = (req.headers.get('x-vad-agent-key') ?? '').trim();
  const url = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY'))?.trim();
  if (!apiKey) return json({ error: 'AGENT_KEY_REQUIRED', message: 'Send the agent API key in the x-vad-agent-key header.' }, 401);
  if (!url || !serviceKey) return json({ error: 'SERVICE_UNAVAILABLE', message: 'The VAD market-agent endpoint is not configured.' }, 503);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: Rec;
  try {
    const parsed = await req.json();
    if (!isRecord(parsed)) return json({ error: 'INVALID_BODY', message: 'The request body must be a JSON object.' }, 400);
    body = parsed;
  } catch {
    return json({ error: 'INVALID_BODY', message: 'The request body must be valid JSON.' }, 400);
  }

  const { data: context, error: contextError } = await admin.rpc('internal_market_agent_context', { p_api_key: apiKey });
  if (contextError || !isRecord(context)) return json({ error: 'AGENT_UNAUTHORIZED', message: safeProviderError(contextError ?? new Error('Invalid agent key.')) }, 401);
  const scopes = context.scopes;
  const action = textValue(body.action, 80).toLowerCase() || 'create_market';

  if (action === 'catalog') {
    if (!hasScope(scopes, 'market:read')) return json({ error: 'SCOPE_REQUIRED', message: 'This key requires market:read.' }, 403);
    const { data, error } = await admin.rpc('agent_market_creation_options', { p_api_key: apiKey });
    if (error) return json({ error: 'CATALOG_UNAVAILABLE', message: safeProviderError(error) }, 503);
    return json({ ok: true, ...((isRecord(data) ? data : {}) as Rec) });
  }

  if (action === 'trade_limits') {
    if (!hasScope(scopes, 'market:read')) return json({ error: 'SCOPE_REQUIRED', message: 'This key requires market:read.' }, 403);
    const asset = textValue(body.assetCode, 12).toUpperCase();
    const method = textValue(body.liquidityModel, 24).toUpperCase();
    const { data, error } = await admin.rpc('agent_get_market_trade_limit_defaults', {
      p_api_key: apiKey, p_asset_code: asset, p_liquidity_model: method,
    });
    if (error) return json({ error: 'TRADE_LIMITS_UNAVAILABLE', message: safeProviderError(error) }, 400);
    return json({ ok: true, defaults: data });
  }

  if (!['create_market', 'create_and_publish', 'draft_and_publish'].includes(action)) {
    return json({ error: 'UNKNOWN_ACTION', message: 'Supported actions are catalog, trade_limits, create_market, create_and_publish and draft_and_publish.' }, 400);
  }
  if (!hasScope(scopes, 'market:read') || !hasScope(scopes, 'market:create')) {
    return json({ error: 'SCOPE_REQUIRED', message: 'Creating a market requires both market:read and market:create.' }, 403);
  }

  const format = textValue(body.marketFormat, 30).toUpperCase() === 'MULTI_OUTCOME' ? 'MULTI_OUTCOME' : 'BINARY';
  const categoryCode = textValue(body.categoryCode, 80).toUpperCase();
  const marketTypeCode = textValue(body.marketTypeCode, 100).toUpperCase();
  const assetCode = textValue(body.assetCode, 12).toUpperCase();
  const countryCode = textValue(body.countryCode, 12).toUpperCase();
  const liquidityModel = format === 'MULTI_OUTCOME' ? 'POOL' : textValue(body.liquidityModel, 30).toUpperCase();
  if (!categoryCode) return json({ error: 'CATEGORY_REQUIRED', message: 'Provide categoryCode from the VAD database catalogue.' }, 400);
  if (!['NGN', 'USDC'].includes(assetCode)) return json({ error: 'CURRENCY_UNSUPPORTED', message: 'Only active NGN and USDC markets can be created.' }, 400);
  if (!['POOL', 'ORDER_BOOK'].includes(liquidityModel)) return json({ error: 'TRADING_METHOD_REQUIRED', message: 'Choose POOL or ORDER_BOOK.' }, 400);
  if (format === 'BINARY' && !marketTypeCode) return json({ error: 'MARKET_TYPE_REQUIRED', message: 'Provide a configured database marketTypeCode.' }, 400);

  const { data: optionsPayload, error: optionsError } = await admin.rpc('agent_market_creation_options', { p_api_key: apiKey });
  if (optionsError || !isRecord(optionsPayload)) return json({ error: 'MARKET_OPTIONS_UNAVAILABLE', message: safeProviderError(optionsError ?? new Error('Market options are unavailable.')) }, 503);
  const catalog = isRecord(optionsPayload.catalog) ? optionsPayload.catalog : {};
  const options = isRecord(optionsPayload.options) ? optionsPayload.options : {};
  const categories = Array.isArray(catalog.categories) ? catalog.categories.filter(isRecord) : [];
  const category = categories.find((item) => textValue(item.code, 80).toUpperCase() === categoryCode);
  if (!category) return json({ error: 'UNKNOWN_CATEGORY', message: 'The requested category is not an active category in the database.' }, 400);
  const jurisdictionRows = Array.isArray(options.jurisdictions) ? options.jurisdictions.filter(isRecord) : [];
  const jurisdiction = jurisdictionRows.find((item) => textValue(item.countryCode, 12).toUpperCase() === countryCode);
  if (!jurisdiction) return json({ error: 'JURISDICTION_UNAVAILABLE', message: 'Choose an active jurisdiction from the catalogue options.' }, 400);
  const availableAssets = Array.isArray(jurisdiction.assets) ? jurisdiction.assets.map((value) => textValue(value, 12).toUpperCase()) : [];
  if (!availableAssets.includes(assetCode)) return json({ error: 'CURRENCY_NOT_ALLOWED', message: assetCode + ' is not enabled for ' + countryCode + '.' }, 400);
  const configuredMethods = Array.isArray(options.tradingMethods) ? options.tradingMethods.filter(isRecord).map((item) => textValue(item.code, 30).toUpperCase()) : ['POOL', 'ORDER_BOOK'];
  if (!configuredMethods.includes(liquidityModel)) return json({ error: 'TRADING_METHOD_UNAVAILABLE', message: liquidityModel + ' is not enabled by the market creation policy.' }, 400);

  const rawDetails = sanitizedDetails(body.details);
  const marketTypes = Array.isArray(category.marketTypes) ? category.marketTypes.filter(isRecord) : [];
  const marketType = format === 'BINARY'
    ? marketTypes.find((item) => textValue(item.code, 100).toUpperCase() === marketTypeCode)
    : null;
  if (format === 'BINARY' && !marketType) return json({ error: 'UNKNOWN_MARKET_TYPE', message: 'The requested market type is not configured under this category.' }, 400);
  const handler = textValue(marketType?.handler, 80).toUpperCase();
  const fields = Array.isArray(marketType?.fields) ? marketType.fields.filter(isRecord) : [];
  const missing = fields.find((field) => field.required === true && !textValue(rawDetails[textValue(field.key, 80)], 1000));
  if (missing) return json({ error: 'MARKET_FIELDS_REQUIRED', message: 'Provide the required market detail: ' + textValue(missing.label, 100) + '.' }, 400);

  if (handler === 'FOOTBALL_MATCH') {
    for (const key of ['competition', 'home_team', 'away_team', 'match_starts_at']) {
      if (!textValue(rawDetails[key], 200)) return json({ error: 'FOOTBALL_DETAILS_REQUIRED', message: 'Football markets need details.' + key + ' from the configured football market type.' }, 400);
    }
  }

  const sourceName = textValue(body.sourceName ?? rawDetails.source_name, 180);
  const sourceUrl = textValue(body.sourceUrl ?? rawDetails.source_url, 1200);
  if (format === 'BINARY' && marketType?.sourceRequired === true && !sourceName) {
    return json({ error: 'SOURCE_REQUIRED', message: 'This market type requires a named authoritative result source.' }, 400);
  }
  if (sourceUrl && (!sourceUrl.startsWith('https://') || (() => { try { new URL(sourceUrl); return false; } catch { return true; } })())) {
    return json({ error: 'INVALID_SOURCE_URL', message: 'sourceUrl must be a valid HTTPS URL.' }, 400);
  }

  let opensAt: string;
  let closesAt: string;
  let resolvesAfter: string;
  try {
    opensAt = dateValue(body.opensAt, 'opening');
    closesAt = dateValue(body.closesAt, 'closing');
    resolvesAfter = dateValue(body.resolvesAfter, 'result-checking');
  } catch (error) {
    return json({ error: 'INVALID_SCHEDULE', message: safeProviderError(error) }, 400);
  }
  if (Date.parse(closesAt) <= Date.parse(opensAt) || Date.parse(resolvesAfter) < Date.parse(closesAt)) {
    return json({ error: 'INVALID_SCHEDULE', message: 'Closing time must be after opening, and result-checking time must be at or after closing.' }, 400);
  }
  const publishNow = body.publishNow === undefined ? action !== 'create_market' : body.publishNow === true;
  if (publishNow && !hasScope(scopes, 'market:publish')) return json({ error: 'SCOPE_REQUIRED', message: 'Publishing requires market:publish.' }, 403);
  if (publishNow && Date.parse(opensAt) > Date.now()) return json({ error: 'FUTURE_OPEN', message: 'The VAD publication RPC only publishes after the opening time begins. Send publishNow=false to create a draft for a future opening.' }, 400);
  if (Date.parse(closesAt) <= Date.now() && publishNow) return json({ error: 'MARKET_EXPIRED', message: 'A market cannot be published after its closing time.' }, 400);

  let defaults: Rec | null = null;
  const defaultResult = await admin.rpc('agent_get_market_trade_limit_defaults', {
    p_api_key: apiKey, p_asset_code: assetCode, p_liquidity_model: liquidityModel,
  });
  if (!defaultResult.error && isRecord(defaultResult.data)) defaults = defaultResult.data;
  let minTradeAmount: number;
  let maxTradeAmount: number;
  try {
    minTradeAmount = amountValue(body.minTradeAmount ?? defaults?.minTradeAmount, 'minimum trade');
    maxTradeAmount = amountValue(body.maxTradeAmount ?? defaults?.maxTradeAmount, 'maximum trade');
  } catch (error) {
    return json({ error: 'TRADE_LIMITS_REQUIRED', message: safeProviderError(error) }, 400);
  }
  if (maxTradeAmount <= minTradeAmount) return json({ error: 'TRADE_LIMITS_INVALID', message: 'Maximum trade amount must be greater than the minimum.' }, 400);

  const regionScope = textValue(body.regionScope, 30).toUpperCase() || 'NIGERIA';
  if (!['NIGERIA', 'AFRICA', 'GLOBAL'].includes(regionScope)) return json({ error: 'INVALID_REGION', message: 'regionScope must be NIGERIA, AFRICA or GLOBAL.' }, 400);
  const values = { ...rawDetails, region: regionScope, category: textValue(category.name, 120), market_type: textValue(marketType?.name, 120), source_name: sourceName, source_url: sourceUrl, deadline: resolvesAfter };
  const questionTemplate = textValue(marketType?.questionTemplate, 500);
  const configuredQuestion = fillTemplate(questionTemplate, values);
  const title = textValue(body.title, 180) || configuredQuestion;
  if (title.length < 10) return json({ error: 'QUESTION_REQUIRED', message: 'Provide a clear market question or enough details to fill the configured question template.' }, 400);
  const description = textValue(body.description, 1000);
  const configuredCondition = textValue(body.condition, 1800)
    || fillTemplate(textValue(marketType?.conditionTemplate, 1800), values);
  if (format === 'BINARY' && /\{\{[A-Za-z0-9_]+\}\}/.test(configuredCondition)) {
    return json({ error: 'RESOLUTION_FIELDS_MISSING', message: 'The configured resolution condition still has empty fields. Supply the required database-backed market details.' }, 400);
  }
  const geographicCondition = (configuredCondition ? configuredCondition + '\n\n' : '')
    + 'Outcome geography: ' + regionScope + '. Only events within this published geographic scope are eligible.';
  const publishReason = textValue(body.publicationReason, 500) || 'Published through the authorized VAD Market Agent API';
  let aiDraft: Rec | null = null;
  if (format === 'MULTI_OUTCOME' && (body.aiAssist === true || action === 'draft_and_publish')) {
    return json({ error: 'AI_DRAFT_FORMAT_UNSUPPORTED', message: 'For multiple-outcome markets, provide outcomes and resolutionInstructions explicitly. The configured AI draft helper is currently bound to a database-backed binary market type.' }, 400);
  }
  if (format === 'MULTI_OUTCOME' && !sourceName) return json({ error: 'SOURCE_REQUIRED', message: 'Multi-outcome markets require a named authoritative source.' }, 400);
  if (body.aiAssist === true || action === 'draft_and_publish') {
    const draftResponse = await fetch(url + '/functions/v1/custom-market-draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey,
        'x-vad-agent-key': apiKey,
      },
      body: JSON.stringify({
        categoryCode,
        marketTypeCode,
        title,
        description,
        details: rawDetails,
        condition: configuredCondition,
        sourceName,
        sourceUrl,
        regionScope,
        opensAt,
        closesAt,
        resolvesAfter,
      }),
    });
    const draftPayload: unknown = await draftResponse.json().catch(() => null);
    if (!draftResponse.ok || !isRecord(draftPayload) || textValue(draftPayload.title, 180).length < 10) {
      const message = isRecord(draftPayload) ? textValue(draftPayload.message, 600) : '';
      return json({ error: 'AI_DRAFT_FAILED', message: message || 'The configured AI provider could not prepare the market draft. No market was created.' }, 503);
    }
    aiDraft = draftPayload;
  }

  const finalTitle = aiDraft ? textValue(aiDraft.title, 180) : title;
  const finalDescription = aiDraft ? textValue(aiDraft.description, 1000) || description : description;
  let result: unknown;
  let createError: unknown = null;
  if (format === 'MULTI_OUTCOME') {
    const outcomes = Array.isArray(body.outcomes) ? body.outcomes.map((value) => textValue(value, 80)).filter(Boolean) : [];
    if (outcomes.length < 2 || outcomes.length > 20 || new Set(outcomes.map((value) => value.toLowerCase())).size !== outcomes.length) {
      return json({ error: 'OUTCOMES_INVALID', message: 'A multi-outcome market requires between 2 and 20 unique named outcomes.' }, 400);
    }
    const resolutionInstructions = aiDraft ? textValue(aiDraft.resolutionRules, 1800) : (configuredCondition || textValue(body.resolutionInstructions, 1800));
    if (resolutionInstructions.length < 10) return json({ error: 'RESOLUTION_REQUIRED', message: 'Provide resolution instructions for the multi-outcome market.' }, 400);
    const response = await admin.rpc('agent_create_multi_outcome_market_v1', {
      p_api_key: apiKey,
      p_title: finalTitle,
      p_description: finalDescription,
      p_category_code: categoryCode,
      p_outcomes: outcomes,
      p_resolution_instructions: resolutionInstructions + '\n\nOutcome geography: ' + regionScope + '.',
      p_source_name: sourceName,
      p_source_url: sourceUrl || null,
      p_opens_at: opensAt,
      p_closes_at: closesAt,
      p_resolves_after: resolvesAfter,
      p_country_code: countryCode,
      p_asset_code: assetCode,
      p_min_trade_amount: minTradeAmount,
      p_max_trade_amount: maxTradeAmount,
      p_publish_now: publishNow,
      p_feature_rank: Number.isFinite(Number(body.featureRank)) ? Math.max(0, Math.min(10000, Math.floor(Number(body.featureRank)))) : 100,
      p_publication_reason: publishReason,
    });
    result = response.data; createError = response.error;
  } else {
    const response = await admin.rpc('agent_create_market_v1', {
      p_api_key: apiKey,
      p_title: finalTitle,
      p_description: finalDescription,
      p_market_type_code: marketTypeCode,
      p_category_code: categoryCode,
      p_details: rawDetails,
      p_condition: geographicCondition,
      p_source_name: sourceName,
      p_source_url: sourceUrl || null,
      p_opens_at: opensAt,
      p_closes_at: closesAt,
      p_resolves_after: resolvesAfter,
      p_country_code: countryCode,
      p_asset_code: assetCode,
      p_liquidity_model: liquidityModel,
      p_min_trade_amount: minTradeAmount,
      p_max_trade_amount: maxTradeAmount,
      p_publish_now: publishNow,
      p_feature_rank: Number.isFinite(Number(body.featureRank)) ? Math.max(0, Math.min(10000, Math.floor(Number(body.featureRank)))) : 100,
      p_publication_reason: publishReason,
    });
    result = response.data; createError = response.error;
  }

  if (createError) return json({ error: 'MARKET_CREATE_FAILED', message: safeProviderError(createError), aiDraft }, 400);
  return json({ ok: true, operation: publishNow ? 'PUBLISHED' : 'DRAFT_CREATED', market: result, aiDraft, currency: assetCode, liquidityModel, minTradeAmount, maxTradeAmount }, 200);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED', message: 'Use POST.' }, 405);
  try {
    return await handle(req);
  } catch (error) {
    return json({ error: 'MARKET_AGENT_REQUEST_FAILED', message: safeProviderError(error) }, 500);
  }
});
