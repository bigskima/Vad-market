import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const arr = (v: unknown): Obj[] => Array.isArray(v) ? v.filter(isObj) : [];
const score = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;
const outcome = (v: unknown) => ['HOME_WIN','DRAW','AWAY_WIN','MATCH_WINNER'].includes(str(v).toUpperCase()) ? str(v).toUpperCase() : '';
function parseJson(s: string): unknown {
  try { return JSON.parse(s); } catch {
    const f = s.match(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/i)?.[1];
    if (f) return JSON.parse(f.trim());
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
    throw new Error('AI returned invalid JSON.');
  }
}
async function fetchTimed(url: string, init: RequestInit) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 20000);
  try { return await fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); }
}
function config() {
  const url = Deno.env.get('SUPABASE_URL')?.trim();
  const anon = (Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY'))?.trim();
  const service = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY'))?.trim();
  if (!url || !anon || !service) throw new Error('Supabase runtime configuration is missing.');
  return { url, anon, service };
}
async function clients(req: Request) {
  const token = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw json({ error:'AUTH_REQUIRED', message:'Sign in with a VAD admin account.' }, 401);
  const c = config();
  const auth = createClient(c.url, c.anon, { auth:{persistSession:false,autoRefreshToken:false} });
  const got = await auth.auth.getUser(token);
  if (got.error || !got.data.user) throw json({ error:'AUTH_INVALID', message:'Your session is not valid.' }, 401);
  const user = createClient(c.url,c.anon,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const service = createClient(c.url,c.service,{auth:{persistSession:false,autoRefreshToken:false}});
  const perm = await user.rpc('admin_guided_market_catalog');
  if (perm.error) throw json({error:'MARKET_MANAGEMENT_PERMISSION_REQUIRED',message:'Market management permission is required.'},403);
  return { userId:got.data.user.id, user, service };
}
async function askAI(p: Obj, system: string, prompt: string): Promise<string> {
  const adapter = str(p.adapter).toUpperCase(), endpoint = str(p.endpoint).replaceAll('{model}',encodeURIComponent(str(p.modelCode)));
  const keyRef = str(p.secretReference), key = keyRef ? Deno.env.get(keyRef)?.trim() : '';
  if (!endpoint || !key || !str(p.modelCode)) throw new Error('AI provider endpoint, model or server-side API key is not configured.');
  let init: RequestInit;
  if (adapter === 'GEMINI_GENERATE_CONTENT') init = {method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({system_instruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0,responseMimeType:'application/json'}})};
  else if (adapter === 'OPENAI_COMPATIBLE') init = {method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:p.modelCode,temperature:0,response_format:{type:'json_object'},messages:[{role:'system',content:system},{role:'user',content:prompt}]})};
  else if (adapter === 'CLOUDFLARE_WORKERS_AI') init = {method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'system',content:system},{role:'user',content:prompt}],temperature:0})};
  else if (adapter === 'ANTHROPIC_MESSAGES') init = {method:'POST',headers:{'x-api-key':key,'anthropic-version':str(p.apiVersion),'Content-Type':'application/json'},body:JSON.stringify({model:p.modelCode,max_tokens:3000,temperature:0,system,messages:[{role:'user',content:prompt}]})};
  else throw new Error('Unsupported AI adapter: '+adapter);
  const response = await fetchTimed(endpoint,init);
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error('AI provider returned HTTP '+response.status+'. Check its configured credential and quota.');
  let content: unknown = null;
  if (adapter === 'GEMINI_GENERATE_CONTENT') content = data?.candidates?.[0]?.content?.parts?.map((v: Obj)=>v.text).filter((v: unknown)=>typeof v==='string').join('');
  else if (adapter === 'OPENAI_COMPATIBLE') content = data?.choices?.[0]?.message?.content;
  else if (adapter === 'CLOUDFLARE_WORKERS_AI') content = data?.result?.response ?? data?.result?.output_text ?? data?.response;
  else content = Array.isArray(data?.content) ? data.content.map((v: Obj)=>v.text).filter((v: unknown)=>typeof v==='string').join('') : null;
  if (typeof content !== 'string' || !content.trim()) throw new Error('AI provider returned no text.');
  return content;
}
function condition(e: Obj, pred: string, automatic: boolean) {
  const a=str(e.participantA), b=str(e.participantB), comp=str(e.competitionName), start=str(e.startsAt), url=str(e.sourceUrl);
  const win = pred==='HOME_WIN' ? a+' is officially recorded as winner against '+b
    : pred==='AWAY_WIN' ? b+' is officially recorded as winner against '+a
    : pred==='DRAW' ? a+' and '+b+' are officially recorded as a draw'
    : 'the official source records the winner of '+a+' vs '+b;
  const authority = automatic ? ' VAD will use its existing Oracle outcome policy; the fixture feed is discovery-only.'
    : ' An admin must verify and configure an authoritative result source before publication.';
  return 'Resolve YES only if '+win+' in '+comp+' for the fixture at '+start+'. Resolve NO for another official outcome.'+authority+(url?' Fixture reference: '+url:'');
}
function validate(raw: unknown, events: Obj[]) {
  if (!isObj(raw) || !Array.isArray(raw.suggestions)) throw new Error('AI output has no suggestions list.');
  const map = new Map(events.map(e=>[str(e.publicId),e])); const seen = new Set<string>(); const out: Obj[]=[];
  for (const s of arr(raw.suggestions).slice(0,30)) {
    const id=str(s.eventPublicId), e=map.get(id), pred=outcome(s.prediction);
    if (!e || !pred) continue;
    const key=id+':'+pred; if (seen.has(key)) continue; seen.add(key);
    const a=str(e.participantA), b=str(e.participantB), comp=str(e.competitionName);
    const automatic = str(e.resultMode).toUpperCase()==='AUTOMATIC' && str(e.oracleProviderCode).toUpperCase()==='FOOTBALL_DATA' && Boolean(str(e.oracleProviderCompetitionCode)) && pred!=='MATCH_WINNER';
    let title=str(s.title);
    if (!title.toLowerCase().includes(a.toLowerCase()) || !title.toLowerCase().includes(b.toLowerCase())) {
      title = pred==='DRAW' ? 'Will '+a+' and '+b+' draw in '+comp+'?'
        : pred==='AWAY_WIN' ? 'Will '+b+' beat '+a+' in '+comp+'?'
        : 'Will '+a+' beat '+b+' in '+comp+'?';
    }
    if (title.length>200) title=title.slice(0,197).trimEnd()+'...';
    const risks=Array.isArray(s.riskFlags)?s.riskFlags.filter((v: unknown)=>typeof v==='string').map((v:string)=>v.slice(0,180)).slice(0,8):[];
    if (!automatic) risks.push('Verify an authoritative result source before publication.');
    out.push({eventPublicId:id,providerCode:e.providerCode,externalEventId:e.externalEventId,sportCode:e.sportCode,competitionCode:e.competitionCode,competition:comp,participantA:a,participantB:b,startsAt:e.startsAt,prediction:pred,title,description:str(s.description).slice(0,1200)||'Draft generated from an imported fixture. Confirm facts and resolution criteria.',condition:condition(e,pred,automatic),resultChecking:automatic?'AUTOMATIC':'VERIFIED',confidence:score(s.confidence),riskFlags:[...new Set(risks)],sourceUrl:e.sourceUrl,status:'DRAFT_ONLY',publicationAllowed:false});
  }
  if (!out.length) throw new Error('No valid draft suggestions matched the selected fixtures.');
  return out;
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers});
  if(req.method!=='POST') return json({error:'METHOD_NOT_ALLOWED'},405);
  let auth;
  try { auth=await clients(req); } catch(e) { if(e instanceof Response) return e; return json({error:e instanceof Error?e.message:'Authentication failed.'},500); }
  let ids:string[]=[], fixtureProvider='', aiProvider='', aiModel='';
  try {
    const body:unknown=await req.json();
    if(!isObj(body)||!Array.isArray(body.eventPublicIds)) return json({error:'INVALID_BODY',message:'Select fixture rows first.'},400);
    ids=[...new Set(body.eventPublicIds.filter((v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v)))];
    if(ids.length<1||ids.length>10) return json({error:'INVALID_SELECTION',message:'Select 1–10 fixtures per AI drafting run.'},400);
    const fixtureResponse=await auth.service.rpc('get_market_builder_events_for_ai',{p_event_public_ids:ids});
    if(fixtureResponse.error) return json({error:'FIXTURE_SNAPSHOT_FAILED',message:'Could not load selected fixtures from VAD’s verified provider cache.'},502);
    const events=arr(fixtureResponse.data);
    if(events.length!==ids.length||events.some(e=>!str(e.participantA)||!str(e.participantB)||!str(e.startsAt))) return json({error:'FIXTURE_SELECTION_STALE',message:'One or more selected fixtures are missing required fields.'},409);
    fixtureProvider=str(events[0].providerCode);
    if(events.some(e=>str(e.providerCode)!==fixtureProvider)) return json({error:'MIXED_FIXTURE_PROVIDERS',message:'Run AI drafting for one provider at a time.'},400);
    const runtimeResponse=await auth.service.rpc('get_market_builder_ai_runtime');
    if(runtimeResponse.error||!isObj(runtimeResponse.data)) return json({error:'AI_PROVIDER_UNAVAILABLE',message:'No active free AI provider and prompt are configured for market drafting.'},409);
    const p=runtimeResponse.data; aiProvider=str(p.providerCode); aiModel=str(p.modelCode);
    if(!str(p.systemPrompt)||!isObj(p.outputSchema)) return json({error:'AI_PROMPT_UNAVAILABLE',message:'The market drafting prompt is not configured.'},409);
    const system=str(p.systemPrompt)+'\n\nReturn JSON only matching this schema: '+JSON.stringify(p.outputSchema);
    const prompt=JSON.stringify({task:'Draft questions for human review from imported fixtures.',rules:['Never predict results or resolve outcomes.','Use only supplied fixture facts. Do not invent names, dates, standings, results, source URLs or odds.','Return HOME_WIN, DRAW and AWAY_WIN suggestions only for fixtures configured for automatic football result checking; otherwise return one MATCH_WINNER suggestion.','Each title must mention both supplied participants and the competition.','All suggestions are drafts and must never auto-publish.'],fixtures:events});
    const raw=parseJson(await askAI(p,system,prompt)); const suggestions=validate(raw,events);
    const audit={suggestionCount:suggestions.length,selectedFixtureCount:events.length,suggestions:suggestions.map(s=>({eventPublicId:s.eventPublicId,prediction:s.prediction,confidence:s.confidence,status:'DRAFT_ONLY'}))};
    const logged=await auth.service.rpc('record_market_builder_run',{p_requested_by:auth.userId,p_fixture_provider_code:fixtureProvider,p_ai_provider_code:aiProvider,p_ai_model_code:aiModel,p_event_public_ids:ids,p_status:'SUCCEEDED',p_input_snapshot:{eventPublicIds:ids,fixtureProviderCode:fixtureProvider,requestedAt:new Date().toISOString()},p_output_payload:audit,p_failure_reason:null});
    if(logged.error) return json({error:'AI_AUDIT_WRITE_FAILED',message:'Required audit record failed. Draft suggestions were withheld.'},502);
    return json({ok:true,runPublicId:logged.data,fixtureProviderCode:fixtureProvider,aiProvider,aiModel,fixtureCount:events.length,suggestionCount:suggestions.length,status:'DRAFT_ONLY',publicationAllowed:false,suggestions});
  } catch(e) {
    const reason=e instanceof Error?e.message:'AI market draft creation failed.';
    try {
      const c=config(), service=createClient(c.url,c.service,{auth:{persistSession:false,autoRefreshToken:false}});
      await service.rpc('record_market_builder_run',{p_requested_by:auth.userId,p_fixture_provider_code:fixtureProvider||'UNKNOWN',p_ai_provider_code:aiProvider||null,p_ai_model_code:aiModel||null,p_event_public_ids:ids,p_status:'FAILED',p_input_snapshot:{eventPublicIds:ids,requestedAt:new Date().toISOString()},p_output_payload:{},p_failure_reason:reason.slice(0,1900)});
    } catch { /* Keep the originating error response. */ }
    return json({error:'AI_MARKET_DRAFT_FAILED',message:reason},502);
  }
});
