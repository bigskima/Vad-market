-- VAD Phase 9: Nigeria launch capabilities for social participation.
-- Financial trading remains controlled independently and is not enabled by this migration.

insert into public.capability_rules(capability_key,country_code,version,enabled,reason_code,status,effective_at)
select 'create_post','NG',1,true,'NIGERIA_SOCIAL_LAUNCH','ACTIVE',statement_timestamp()
where not exists(select 1 from public.capability_rules where capability_key='create_post' and country_code='NG');

insert into public.capability_rules(capability_key,country_code,version,enabled,reason_code,status,effective_at)
select 'submit_market_proposal','NG',1,true,'NIGERIA_MARKET_PROPOSAL_LAUNCH','ACTIVE',statement_timestamp()
where not exists(select 1 from public.capability_rules where capability_key='submit_market_proposal' and country_code='NG');

-- Phase 9 social command initially used the client capability alias. Keep database policy keys canonical.
create or replace function public.create_conviction_post(
  p_body text,
  p_post_type text default 'ANALYSIS',
  p_instrument_public_id uuid default null,
  p_stance_outcome_code text default null,
  p_confidence numeric default null,
  p_media_path text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  acct public.user_accounts;
  instrument market.instruments;
  event_id bigint;
  outcome_code text;
  post_id uuid;
  kind text:=upper(trim(coalesce(p_post_type,'ANALYSIS')));
begin
  acct:=private.require_active_account();
  if not private.capability_enabled('create_post',acct.country_code) then raise exception 'Posting is not currently enabled' using errcode='P0001'; end if;
  if kind not in ('ANALYSIS','PREDICTION','COMMENTARY','SHORT_VIDEO') then raise exception 'Invalid post type' using errcode='22023'; end if;
  if p_body is null or char_length(trim(p_body))<1 or char_length(p_body)>5000 then raise exception 'Post must be 1-5000 characters' using errcode='22023'; end if;
  if p_confidence is not null and (p_confidence<0 or p_confidence>1) then raise exception 'Confidence must be between 0 and 1' using errcode='22023'; end if;
  if p_instrument_public_id is not null then
    select * into instrument from market.instruments where public_id=p_instrument_public_id;
    if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
    event_id:=instrument.canonical_event_id;
    if p_stance_outcome_code is not null then
      outcome_code:=upper(trim(p_stance_outcome_code));
      if not exists(select 1 from market.outcomes where instrument_id=instrument.id and code=outcome_code) then raise exception 'Stance is not a market outcome' using errcode='22023'; end if;
    end if;
  elsif p_stance_outcome_code is not null then
    raise exception 'A market is required for an outcome stance' using errcode='22023';
  end if;
  if kind='PREDICTION' and outcome_code is null then raise exception 'Prediction posts require a market outcome stance' using errcode='22023'; end if;
  insert into social.posts(author_user_id,post_type,body,media_path,canonical_event_id,instrument_id,stance_outcome_code,confidence,status)
  values(auth.uid(),kind,trim(p_body),nullif(trim(coalesce(p_media_path,'')),''),event_id,instrument.id,outcome_code,p_confidence,'PUBLISHED')
  returning public_id into post_id;
  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('SOCIAL_POST_PUBLISHED','SOCIAL_POST',post_id::text,jsonb_build_object('post_id',post_id,'author_user_id',auth.uid(),'post_type',kind,'instrument_public_id',p_instrument_public_id),'social-post:'||post_id::text);
  return post_id;
end;
$$;

revoke all on function public.create_conviction_post(text,text,uuid,text,numeric,text) from public,anon;
grant execute on function public.create_conviction_post(text,text,uuid,text,numeric,text) to authenticated;
