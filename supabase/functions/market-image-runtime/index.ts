import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const cors={ 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json' };
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});

Deno.serve(async(req)=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
 try{
  const supabaseUrl=Deno.env.get('SUPABASE_URL')!; const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth=req.headers.get('Authorization')??''; if(!auth) return json({error:'Authentication required'},401);
  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}}); const token=auth.replace(/^Bearer\s+/i,'');
  const {data:{user}}=await admin.auth.getUser(token); if(!user) return json({error:'Authentication required'},401);
  const {data:allowed,error:permissionError}=await admin.rpc('admin_can_manage_markets',{p_user_id:user.id});
  if(permissionError||allowed!==true) return json({error:'Market management permission required'},403);
  const body=await req.json(); const instrumentId=String(body.instrumentId??''); const title=String(body.title??'').trim(); const category=String(body.category??'General').trim();
  if(!instrumentId||!title) return json({error:'instrumentId and title are required'},400);
  const accountId=Deno.env.get('CLOUDFLARE_ACCOUNT_ID'); const apiToken=Deno.env.get('CLOUDFLARE_API_TOKEN');
  if(!accountId||!apiToken) return json({error:'Cloudflare image generation is not configured',code:'CLOUDFLARE_NOT_CONFIGURED'},503);
  const model=Deno.env.get('CLOUDFLARE_IMAGE_MODEL')||'@cf/black-forest-labs/flux-1-schnell';
  const prompt=`Editorial prediction-market cover image for: "${title}". Category: ${category}. Create one clean, recognizable visual centered on the primary company, person, team, institution, asset, place, or event named in the question. If a famous brand such as Apple is central, evoke its recognizable product/brand context without inventing claims. No odds, no YES/NO buttons, no prices, no misleading news headline, minimal or no text, premium financial-news aesthetic, 16:9 composition.`;
  const ai=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,{method:'POST',headers:{Authorization:`Bearer ${apiToken}`,'Content-Type':'application/json'},body:JSON.stringify({prompt,num_steps:4,width:1024,height:576})});
  if(!ai.ok) return json({error:'Cloudflare image generation failed',providerStatus:ai.status,detail:(await ai.text()).slice(0,800)},502);
  const bytes=new Uint8Array(await ai.arrayBuffer()); const path=`generated/${instrumentId}/cover-${Date.now()}.png`;
  const up=await admin.storage.from('market-media').upload(path,bytes,{contentType:'image/png',upsert:false}); if(up.error) return json({error:'Generated image could not be stored',detail:up.error.message},500);
  const set=await userClient.rpc('admin_set_market_generated_media',{p_instrument_public_id:instrumentId,p_media_path:path,p_provider:'CLOUDFLARE_WORKERS_AI',p_model:model,p_prompt:prompt}); if(set.error) return json({error:'Generated image could not be attached',detail:set.error.message},500);
  return json({ok:true,mediaPath:path,model});
 }catch(error){return json({error:error instanceof Error?error.message:'Unexpected image generation error'},500)}
});
