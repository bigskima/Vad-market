import { type PublicRecordSpec, type OracleResource, OracleRuntimeError, type ProviderResolutionResult } from './types.ts';

function cleanHtml(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
}
function minutes(value: string) {
  const m=value.match(/(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)/i);
  if(!m) return null;
  let h=Number(m[1])%12; if(m[3].toLowerCase().startsWith('p')) h+=12;
  return h*60+Number(m[2]);
}
function hostAllowed(url: URL, resource: OracleResource) {
  const configured=Array.isArray(resource.metadata?.host_allowlist) ? resource.metadata.host_allowlist.map(String) : [];
  return configured.length>0 && configured.some(h=>url.hostname===h || url.hostname.endsWith('.'+h));
}
export async function resolvePublicRecord(resource: OracleResource,spec: PublicRecordSpec): Promise<ProviderResolutionResult>{
  let url: URL; try{url=new URL(resource.externalKey);}catch{throw new OracleRuntimeError('PUBLIC_RECORD_URL_INVALID','Configured evidence URL is invalid',422);}
  if(url.protocol!=='https:' || !hostAllowed(url,resource)) throw new OracleRuntimeError('PUBLIC_RECORD_HOST_NOT_ALLOWED','Evidence source is outside the configured authority allowlist',422);
  let response:Response; try{response=await fetch(url,{headers:{'User-Agent':'VAD-Oracle/1.0 (+public-record-verification)'}});}catch{throw new OracleRuntimeError('PROVIDER_NETWORK_ERROR','Evidence source could not be reached',503);}
  if(!response.ok) throw new OracleRuntimeError(`PROVIDER_HTTP_${response.status}`,'Evidence source request failed',response.status>=500?503:422);
  const contentType=response.headers.get('content-type')||'';
  const raw=await response.text();
  const text=contentType.includes('html')?cleanHtml(raw):raw.replace(/\s+/g,' ').trim();
  if(!text) return {kind:'skipped',code:'OFFICIAL_RECORD_NOT_PUBLISHED',detail:'Evidence source returned no usable record'};

  const field=(spec.field||resource.metadata?.field_pattern||'').toString();
  const pattern=field ? new RegExp(field,'i') : null;
  const match=pattern?.exec(text) ?? null;
  let outcome:'YES'|'NO'|null=null; let observedValue:unknown=null;

  if(spec.operator==='EXISTS'){outcome=match?'YES':'NO'; observedValue=Boolean(match);}
  else if(spec.operator==='CONTAINS'){const needle=String(spec.expected??''); if(!needle) throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID','Expected public-record text is missing',422); outcome=text.toLowerCase().includes(needle.toLowerCase())?'YES':'NO'; observedValue=needle;}
  else if(spec.operator==='EQUALS'){if(!match) return {kind:'skipped',code:'OFFICIAL_RECORD_INCONCLUSIVE',detail:'Configured evidence field was not found'}; observedValue=match[1]??match[0]; outcome=String(observedValue).trim().toLowerCase()===String(spec.expected??'').trim().toLowerCase()?'YES':'NO';}
  else {
    if(!match) return {kind:'skipped',code:'OFFICIAL_RECORD_INCONCLUSIVE',detail:'Configured evidence field was not found'};
    const observed=minutes(match[1]??match[0]); const cutoff=minutes(String(spec.cutoff??spec.expected??''));
    if(observed===null||cutoff===null) return {kind:'skipped',code:'OFFICIAL_RECORD_INCONCLUSIVE',detail:'Comparable time could not be extracted'};
    observedValue=match[1]??match[0];
    outcome=spec.operator==='BEFORE_OR_AT'?(observed<=cutoff?'YES':'NO'):(observed>cutoff?'YES':'NO');
  }
  return {kind:'observation',observation:{observedOutcome:outcome,observedAt:new Date(),evidenceReference:url.toString(),payload:{resolver:'PUBLIC_RECORD_RULE_V1',operator:spec.operator,field_pattern:field||null,expected:spec.expected??null,cutoff:spec.cutoff??null,record_date:spec.recordDate??null,timezone:spec.timeZone??null,observed_value:observedValue,authority:resource.metadata?.authority??null}}};
}
