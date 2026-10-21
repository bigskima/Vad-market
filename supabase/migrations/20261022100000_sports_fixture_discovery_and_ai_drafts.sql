begin;

-- Cached provider fixture responses prevent repeated catalogue browsing from
-- consuming limited API quotas. Raw provider secrets never enter this cache.
create table if not exists market.sports_fixture_cache (
  request_key text primary key check (char_length(request_key) between 8 and 420),
  provider_code text not null check (provider_code ~ '^[A-Z][A-Z0-9_]*$'),
  sport_code text not null,
  competition_code text not null,
  date_from date not null,
  date_to date not null,
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  fetched_at timestamptz not null,
  expires_at timestamptz not null,
  stale_until timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (date_to>=date_from),
  check (expires_at>=fetched_at),
  check (stale_until>=expires_at)
);
create index if not exists sports_fixture_cache_expiry_idx
  on market.sports_fixture_cache(expires_at,stale_until);

alter table market.sports_fixture_cache enable row level security;
revoke all on market.sports_fixture_cache from public,anon,authenticated;
grant select,insert,update,delete on market.sports_fixture_cache to service_role;

create table if not exists market.sports_fixture_usage (
  provider_code text not null check (provider_code ~ '^[A-Z][A-Z0-9_]*$'),
  usage_day date not null,
  request_count integer not null default 0 check (request_count>=0),
  daily_limit integer not null check (daily_limit between 1 and 10000),
  updated_at timestamptz not null default statement_timestamp(),
  primary key(provider_code,usage_day)
);
alter table market.sports_fixture_usage enable row level security;
revoke all on market.sports_fixture_usage from public,anon,authenticated;
grant select,insert,update,delete on market.sports_fixture_usage to service_role;

-- Football-Data's free tier permits 10 calls/minute. Keep VAD under that cap
-- across all admins and competitions, not just per individual browser session.
create table if not exists market.sports_fixture_minute_usage (
  provider_code text not null check (provider_code ~ '^[A-Z][A-Z0-9_]*
create or replace function public.internal_get_sports_fixture_cache(p_request_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'requestKey',c.request_key,
    'providerCode',c.provider_code,
    'sportCode',c.sport_code,
    'competitionCode',c.competition_code,
    'dateFrom',c.date_from,
    'dateTo',c.date_to,
    'payload',c.payload,
    'fetchedAt',c.fetched_at,
    'expiresAt',c.expires_at,
    'staleUntil',c.stale_until
  ) into v_result
  from market.sports_fixture_cache c
  where c.request_key=left(btrim(coalesce(p_request_key,'')),420);
  return v_result;
end;
$function$;
revoke all on function public.internal_get_sports_fixture_cache(text) from public,anon,authenticated;
grant execute on function public.internal_get_sports_fixture_cache(text) to service_role;

create or replace function public.internal_upsert_sports_fixture_cache(
  p_request_key text,
  p_provider_code text,
  p_sport_code text,
  p_competition_code text,
  p_date_from date,
  p_date_to date,
  p_payload jsonb,
  p_ttl_seconds integer default 900,
  p_stale_seconds integer default 21600
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_key text:=left(btrim(coalesce(p_request_key,'')),420);
  v_provider text:=upper(btrim(coalesce(p_provider_code,'')));
  v_ttl integer:=least(greatest(coalesce(p_ttl_seconds,900),30),3600);
  v_stale integer:=least(greatest(coalesce(p_stale_seconds,21600),0),86400);
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if v_key !~ '^[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*:[A-Z0-9_]+:[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or v_provider !~ '^[A-Z][A-Z0-9_]*$'
     or nullif(btrim(coalesce(p_sport_code,'')),'') is null
     or nullif(btrim(coalesce(p_competition_code,'')),'') is null
     or p_date_from is null or p_date_to is null or p_date_to<p_date_from
     or jsonb_typeof(coalesce(p_payload,'null'::jsonb))<>'object' then
    raise exception 'Invalid sports fixture cache record' using errcode='22023';
  end if;
  insert into market.sports_fixture_cache(
    request_key,provider_code,sport_code,competition_code,date_from,date_to,
    payload,fetched_at,expires_at,stale_until,updated_at
  ) values (
    v_key,v_provider,upper(btrim(p_sport_code)),upper(btrim(p_competition_code)),
    p_date_from,p_date_to,p_payload,statement_timestamp(),
    statement_timestamp()+make_interval(secs=>v_ttl),
    statement_timestamp()+make_interval(secs=>v_ttl+v_stale),
    statement_timestamp()
  )
  on conflict(request_key) do update set
    provider_code=excluded.provider_code,
    sport_code=excluded.sport_code,
    competition_code=excluded.competition_code,
    date_from=excluded.date_from,
    date_to=excluded.date_to,
    payload=excluded.payload,
    fetched_at=excluded.fetched_at,
    expires_at=excluded.expires_at,
    stale_until=excluded.stale_until,
    updated_at=statement_timestamp();
  return true;
end;
$function$;
revoke all on function public.internal_upsert_sports_fixture_cache(text,text,text,text,date,date,jsonb,integer,integer) from public,anon,authenticated;
grant execute on function public.internal_upsert_sports_fixture_cache(text,text,text,text,date,date,jsonb,integer,integer) to service_role;

create or replace function public.internal_reserve_sports_fixture_request(
  p_provider_code text,
  p_daily_limit integer default 100,
  p_minute_limit integer default 8
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_provider text:=upper(btrim(coalesce(p_provider_code,'')));
  v_daily_limit integer:=least(greatest(coalesce(p_daily_limit,100),1),10000);
  v_minute_limit integer:=least(greatest(coalesce(p_minute_limit,8),1),9);
  v_day date:=(statement_timestamp() at time zone 'UTC')::date;
  v_minute timestamptz:=date_trunc('minute',statement_timestamp());
  v_daily_count integer;
  v_minute_count integer;
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if v_provider !~ '^[A-Z][A-Z0-9_]*
insert into ai.prompt_versions(capability_key,version,system_prompt,output_schema,status)
values(
  'SPORTS_MARKET_DRAFT',
  1,
  'You are VAD Sports Market Draft Assistant. Draft reviewable copy for a prediction market from one verified provider fixture and a database-configured market template. Do not predict the actual event result, create odds, invent statistics, alter fixture details, invent a source, invent or change the closing/kickoff time, or claim that a market is automatically resolved unless the supplied template says so. Follow the supplied result choice exactly. Keep the question objective and binary. The output is a draft for a human administrator: do not publish or approve it. Any resolution wording must be consistent with the supplied template and fixture; when the source or condition is not fully supported, state the uncertainty in riskNotes.',
  '{"type":"object","required":["title","description","resolutionRules","riskNotes"],"properties":{"title":{"type":"string","minLength":10,"maxLength":180},"description":{"type":"string","maxLength":1000},"resolutionRules":{"type":"string","minLength":20,"maxLength":1800},"riskNotes":{"type":"string","maxLength":500}}}'::jsonb,
  'ACTIVE'
)
-- Prompt versions are immutable by design; change the version number for future prompt edits.
on conflict(capability_key,version) do nothing;

create or replace function public.internal_sports_market_draft_context()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_prompt record;
  v_providers jsonb;
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  select pv.id,pv.version,pv.system_prompt,pv.output_schema
  into v_prompt
  from ai.prompt_versions pv
  where pv.capability_key='SPORTS_MARKET_DRAFT' and pv.status='ACTIVE'
  order by pv.version desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'aiProviderId',ap.id,
    'providerCode',ip.code,
    'providerName',ip.name,
    'environment',ip.environment,
    'adapter',ip.public_metadata->>'ai_adapter',
    'endpoint',ip.public_metadata->>'endpoint',
    'apiVersion',ip.public_metadata->>'api_version',
    'modelCode',ap.model_code,
    'secretReference',ip.secret_reference,
    'priority',ap.priority
  ) order by ap.priority,ip.priority,ap.id),'[]'::jsonb)
  into v_providers
  from ai.providers ap
  join integration.providers ip on ip.id=ap.integration_provider_id
  where ap.status in ('ACTIVE','DEGRADED')
    and ip.status in ('ACTIVE','DEGRADED')
    and ip.provider_type='AI'
    and (
      ap.capabilities @> '["SPORTS_MARKET_DRAFT"]'::jsonb
      or ap.capabilities @> '["MARKET_ADMISSION"]'::jsonb
    )
    and coalesce(ip.public_metadata->>'ai_adapter','') in (
      'OPENAI_COMPATIBLE','GEMINI_GENERATE_CONTENT','ANTHROPIC_MESSAGES','CLOUDFLARE_WORKERS_AI'
    )
    and coalesce(ip.public_metadata->>'endpoint','') like 'https://%';

  return jsonb_build_object(
    'prompt',case when v_prompt.id is null then null else jsonb_build_object(
      'id',v_prompt.id,'version',v_prompt.version,
      'systemPrompt',v_prompt.system_prompt,'outputSchema',v_prompt.output_schema
    ) end,
    'providers',v_providers
  );
end;
$function$;
revoke all on function public.internal_sports_market_draft_context() from public,anon,authenticated;
grant execute on function public.internal_sports_market_draft_context() to service_role;

create or replace function public.internal_record_sports_market_draft_audit(
  p_actor_user_id uuid,
  p_provider_code text,
  p_fixture_id text,
  p_market_type_code text,
  p_selected_result text,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_actor_user_id is null
     or nullif(btrim(coalesce(p_provider_code,'')),'') is null
     or nullif(btrim(coalesce(p_fixture_id,'')),'') is null
     or nullif(btrim(coalesce(p_market_type_code,'')),'') is null
     or jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object' then
    raise exception 'Invalid sports draft audit record' using errcode='22023';
  end if;
  insert into audit.records(
    actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata
  ) values (
    p_actor_user_id,'ADMIN','SPORTS_MARKET_DRAFT_GENERATED','SPORTS_FIXTURE',
    left(btrim(p_fixture_id),180),
    'Generated an AI-assisted draft from an imported sports fixture.',
    jsonb_build_object(
      'provider_code',upper(left(btrim(p_provider_code),80)),
      'fixture_id',left(btrim(p_fixture_id),180),
      'market_type_code',upper(left(btrim(p_market_type_code),80)),
      'selected_result',upper(left(btrim(coalesce(p_selected_result,'')),40))
    ) || coalesce(p_metadata,'{}'::jsonb)
  );
  return true;
end;
$function$;
revoke all on function public.internal_record_sports_market_draft_audit(uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.internal_record_sports_market_draft_audit(uuid,text,text,text,text,jsonb) to service_role;

commit;
),
  usage_minute timestamptz not null,
  request_count integer not null default 0 check (request_count>=0),
  minute_limit integer not null check (minute_limit between 1 and 9),
  updated_at timestamptz not null default statement_timestamp(),
  primary key(provider_code,usage_minute)
);
alter table market.sports_fixture_minute_usage enable row level security;
revoke all on market.sports_fixture_minute_usage from public,anon,authenticated;
grant select,insert,update,delete on market.sports_fixture_minute_usage to service_role;

create or replace function public.internal_get_sports_fixture_cache(p_request_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'requestKey',c.request_key,
    'providerCode',c.provider_code,
    'sportCode',c.sport_code,
    'competitionCode',c.competition_code,
    'dateFrom',c.date_from,
    'dateTo',c.date_to,
    'payload',c.payload,
    'fetchedAt',c.fetched_at,
    'expiresAt',c.expires_at,
    'staleUntil',c.stale_until
  ) into v_result
  from market.sports_fixture_cache c
  where c.request_key=left(btrim(coalesce(p_request_key,'')),420);
  return v_result;
end;
$function$;
revoke all on function public.internal_get_sports_fixture_cache(text) from public,anon,authenticated;
grant execute on function public.internal_get_sports_fixture_cache(text) to service_role;

create or replace function public.internal_upsert_sports_fixture_cache(
  p_request_key text,
  p_provider_code text,
  p_sport_code text,
  p_competition_code text,
  p_date_from date,
  p_date_to date,
  p_payload jsonb,
  p_ttl_seconds integer default 900,
  p_stale_seconds integer default 21600
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_key text:=left(btrim(coalesce(p_request_key,'')),420);
  v_provider text:=upper(btrim(coalesce(p_provider_code,'')));
  v_ttl integer:=least(greatest(coalesce(p_ttl_seconds,900),30),3600);
  v_stale integer:=least(greatest(coalesce(p_stale_seconds,21600),0),86400);
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if v_key !~ '^[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*:[A-Z0-9_]+:[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or v_provider !~ '^[A-Z][A-Z0-9_]*$'
     or nullif(btrim(coalesce(p_sport_code,'')),'') is null
     or nullif(btrim(coalesce(p_competition_code,'')),'') is null
     or p_date_from is null or p_date_to is null or p_date_to<p_date_from
     or jsonb_typeof(coalesce(p_payload,'null'::jsonb))<>'object' then
    raise exception 'Invalid sports fixture cache record' using errcode='22023';
  end if;
  insert into market.sports_fixture_cache(
    request_key,provider_code,sport_code,competition_code,date_from,date_to,
    payload,fetched_at,expires_at,stale_until,updated_at
  ) values (
    v_key,v_provider,upper(btrim(p_sport_code)),upper(btrim(p_competition_code)),
    p_date_from,p_date_to,p_payload,statement_timestamp(),
    statement_timestamp()+make_interval(secs=>v_ttl),
    statement_timestamp()+make_interval(secs=>v_ttl+v_stale),
    statement_timestamp()
  )
  on conflict(request_key) do update set
    provider_code=excluded.provider_code,
    sport_code=excluded.sport_code,
    competition_code=excluded.competition_code,
    date_from=excluded.date_from,
    date_to=excluded.date_to,
    payload=excluded.payload,
    fetched_at=excluded.fetched_at,
    expires_at=excluded.expires_at,
    stale_until=excluded.stale_until,
    updated_at=statement_timestamp();
  return true;
end;
$function$;
revoke all on function public.internal_upsert_sports_fixture_cache(text,text,text,text,date,date,jsonb,integer,integer) from public,anon,authenticated;
grant execute on function public.internal_upsert_sports_fixture_cache(text,text,text,text,date,date,jsonb,integer,integer) to service_role;

create or replace function public.internal_reserve_sports_fixture_request(
  p_provider_code text,
  p_daily_limit integer default 100
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_provider text:=upper(btrim(coalesce(p_provider_code,'')));
  v_limit integer:=least(greatest(coalesce(p_daily_limit,100),1),10000);
  v_day date:=(statement_timestamp() at time zone 'UTC')::date;
  v_count integer;
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if v_provider !~ '^[A-Z][A-Z0-9_]*$' then
    raise exception 'Invalid provider code' using errcode='22023';
  end if;
  insert into market.sports_fixture_usage(provider_code,usage_day,request_count,daily_limit,updated_at)
  values(v_provider,v_day,1,v_limit,statement_timestamp())
  on conflict(provider_code,usage_day) do update set
    request_count=market.sports_fixture_usage.request_count+1,
    daily_limit=excluded.daily_limit,
    updated_at=statement_timestamp()
  where market.sports_fixture_usage.request_count<least(greatest(excluded.daily_limit,1),10000)
  returning request_count into v_count;
  return v_count is not null;
end;
$function$;
revoke all on function public.internal_reserve_sports_fixture_request(text,integer) from public,anon,authenticated;
grant execute on function public.internal_reserve_sports_fixture_request(text,integer) to service_role;

insert into ai.prompt_versions(capability_key,version,system_prompt,output_schema,status)
values(
  'SPORTS_MARKET_DRAFT',
  1,
  'You are VAD Sports Market Draft Assistant. Draft reviewable copy for a prediction market from one verified provider fixture and a database-configured market template. Do not predict the actual event result, create odds, invent statistics, alter fixture details, invent a source, invent or change the closing/kickoff time, or claim that a market is automatically resolved unless the supplied template says so. Follow the supplied result choice exactly. Keep the question objective and binary. The output is a draft for a human administrator: do not publish or approve it. Any resolution wording must be consistent with the supplied template and fixture; when the source or condition is not fully supported, state the uncertainty in riskNotes.',
  '{"type":"object","required":["title","description","resolutionRules","riskNotes"],"properties":{"title":{"type":"string","minLength":10,"maxLength":180},"description":{"type":"string","maxLength":1000},"resolutionRules":{"type":"string","minLength":20,"maxLength":1800},"riskNotes":{"type":"string","maxLength":500}}}'::jsonb,
  'ACTIVE'
)
-- Prompt versions are immutable by design; change the version number for future prompt edits.
on conflict(capability_key,version) do nothing;

create or replace function public.internal_sports_market_draft_context()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_prompt record;
  v_providers jsonb;
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  select pv.id,pv.version,pv.system_prompt,pv.output_schema
  into v_prompt
  from ai.prompt_versions pv
  where pv.capability_key='SPORTS_MARKET_DRAFT' and pv.status='ACTIVE'
  order by pv.version desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'aiProviderId',ap.id,
    'providerCode',ip.code,
    'providerName',ip.name,
    'environment',ip.environment,
    'adapter',ip.public_metadata->>'ai_adapter',
    'endpoint',ip.public_metadata->>'endpoint',
    'apiVersion',ip.public_metadata->>'api_version',
    'modelCode',ap.model_code,
    'secretReference',ip.secret_reference,
    'priority',ap.priority
  ) order by ap.priority,ip.priority,ap.id),'[]'::jsonb)
  into v_providers
  from ai.providers ap
  join integration.providers ip on ip.id=ap.integration_provider_id
  where ap.status in ('ACTIVE','DEGRADED')
    and ip.status in ('ACTIVE','DEGRADED')
    and ip.provider_type='AI'
    and (
      ap.capabilities @> '["SPORTS_MARKET_DRAFT"]'::jsonb
      or ap.capabilities @> '["MARKET_ADMISSION"]'::jsonb
    )
    and coalesce(ip.public_metadata->>'ai_adapter','') in (
      'OPENAI_COMPATIBLE','GEMINI_GENERATE_CONTENT','ANTHROPIC_MESSAGES','CLOUDFLARE_WORKERS_AI'
    )
    and coalesce(ip.public_metadata->>'endpoint','') like 'https://%';

  return jsonb_build_object(
    'prompt',case when v_prompt.id is null then null else jsonb_build_object(
      'id',v_prompt.id,'version',v_prompt.version,
      'systemPrompt',v_prompt.system_prompt,'outputSchema',v_prompt.output_schema
    ) end,
    'providers',v_providers
  );
end;
$function$;
revoke all on function public.internal_sports_market_draft_context() from public,anon,authenticated;
grant execute on function public.internal_sports_market_draft_context() to service_role;

create or replace function public.internal_record_sports_market_draft_audit(
  p_actor_user_id uuid,
  p_provider_code text,
  p_fixture_id text,
  p_market_type_code text,
  p_selected_result text,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_actor_user_id is null
     or nullif(btrim(coalesce(p_provider_code,'')),'') is null
     or nullif(btrim(coalesce(p_fixture_id,'')),'') is null
     or nullif(btrim(coalesce(p_market_type_code,'')),'') is null
     or jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object' then
    raise exception 'Invalid sports draft audit record' using errcode='22023';
  end if;
  insert into audit.records(
    actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata
  ) values (
    p_actor_user_id,'ADMIN','SPORTS_MARKET_DRAFT_GENERATED','SPORTS_FIXTURE',
    left(btrim(p_fixture_id),180),
    'Generated an AI-assisted draft from an imported sports fixture.',
    jsonb_build_object(
      'provider_code',upper(left(btrim(p_provider_code),80)),
      'fixture_id',left(btrim(p_fixture_id),180),
      'market_type_code',upper(left(btrim(p_market_type_code),80)),
      'selected_result',upper(left(btrim(coalesce(p_selected_result,'')),40))
    ) || coalesce(p_metadata,'{}'::jsonb)
  );
  return true;
end;
$function$;
revoke all on function public.internal_record_sports_market_draft_audit(uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.internal_record_sports_market_draft_audit(uuid,text,text,text,text,jsonb) to service_role;

commit;
 then
    raise exception 'Invalid provider code' using errcode='22023';
  end if;

  insert into market.sports_fixture_usage(provider_code,usage_day,request_count,daily_limit,updated_at)
  values(v_provider,v_day,1,v_daily_limit,statement_timestamp())
  on conflict(provider_code,usage_day) do update set
    request_count=market.sports_fixture_usage.request_count+1,
    daily_limit=excluded.daily_limit,
    updated_at=statement_timestamp()
  where market.sports_fixture_usage.request_count<least(greatest(excluded.daily_limit,1),10000)
  returning request_count into v_daily_count;
  if v_daily_count is null then
    return false;
  end if;

  insert into market.sports_fixture_minute_usage(provider_code,usage_minute,request_count,minute_limit,updated_at)
  values(v_provider,v_minute,1,v_minute_limit,statement_timestamp())
  on conflict(provider_code,usage_minute) do update set
    request_count=market.sports_fixture_minute_usage.request_count+1,
    minute_limit=excluded.minute_limit,
    updated_at=statement_timestamp()
  where market.sports_fixture_minute_usage.request_count<least(greatest(excluded.minute_limit,1),9)
  returning request_count into v_minute_count;

  if v_minute_count is null then
    -- Release this call's daily reservation when the minute window is full.
    update market.sports_fixture_usage
    set request_count=request_count-1, updated_at=statement_timestamp()
    where provider_code=v_provider and usage_day=v_day and request_count>0;
    return false;
  end if;

  return true;
end;
$function$;
revoke all on function public.internal_reserve_sports_fixture_request(text,integer,integer) from public,anon,authenticated;
grant execute on function public.internal_reserve_sports_fixture_request(text,integer,integer) to service_role;

insert into ai.prompt_versions(capability_key,version,system_prompt,output_schema,status)
values(
  'SPORTS_MARKET_DRAFT',
  1,
  'You are VAD Sports Market Draft Assistant. Draft reviewable copy for a prediction market from one verified provider fixture and a database-configured market template. Do not predict the actual event result, create odds, invent statistics, alter fixture details, invent a source, invent or change the closing/kickoff time, or claim that a market is automatically resolved unless the supplied template says so. Follow the supplied result choice exactly. Keep the question objective and binary. The output is a draft for a human administrator: do not publish or approve it. Any resolution wording must be consistent with the supplied template and fixture; when the source or condition is not fully supported, state the uncertainty in riskNotes.',
  '{"type":"object","required":["title","description","resolutionRules","riskNotes"],"properties":{"title":{"type":"string","minLength":10,"maxLength":180},"description":{"type":"string","maxLength":1000},"resolutionRules":{"type":"string","minLength":20,"maxLength":1800},"riskNotes":{"type":"string","maxLength":500}}}'::jsonb,
  'ACTIVE'
)
-- Prompt versions are immutable by design; change the version number for future prompt edits.
on conflict(capability_key,version) do nothing;

create or replace function public.internal_sports_market_draft_context()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_prompt record;
  v_providers jsonb;
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  select pv.id,pv.version,pv.system_prompt,pv.output_schema
  into v_prompt
  from ai.prompt_versions pv
  where pv.capability_key='SPORTS_MARKET_DRAFT' and pv.status='ACTIVE'
  order by pv.version desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'aiProviderId',ap.id,
    'providerCode',ip.code,
    'providerName',ip.name,
    'environment',ip.environment,
    'adapter',ip.public_metadata->>'ai_adapter',
    'endpoint',ip.public_metadata->>'endpoint',
    'apiVersion',ip.public_metadata->>'api_version',
    'modelCode',ap.model_code,
    'secretReference',ip.secret_reference,
    'priority',ap.priority
  ) order by ap.priority,ip.priority,ap.id),'[]'::jsonb)
  into v_providers
  from ai.providers ap
  join integration.providers ip on ip.id=ap.integration_provider_id
  where ap.status in ('ACTIVE','DEGRADED')
    and ip.status in ('ACTIVE','DEGRADED')
    and ip.provider_type='AI'
    and (
      ap.capabilities @> '["SPORTS_MARKET_DRAFT"]'::jsonb
      or ap.capabilities @> '["MARKET_ADMISSION"]'::jsonb
    )
    and coalesce(ip.public_metadata->>'ai_adapter','') in (
      'OPENAI_COMPATIBLE','GEMINI_GENERATE_CONTENT','ANTHROPIC_MESSAGES','CLOUDFLARE_WORKERS_AI'
    )
    and coalesce(ip.public_metadata->>'endpoint','') like 'https://%';

  return jsonb_build_object(
    'prompt',case when v_prompt.id is null then null else jsonb_build_object(
      'id',v_prompt.id,'version',v_prompt.version,
      'systemPrompt',v_prompt.system_prompt,'outputSchema',v_prompt.output_schema
    ) end,
    'providers',v_providers
  );
end;
$function$;
revoke all on function public.internal_sports_market_draft_context() from public,anon,authenticated;
grant execute on function public.internal_sports_market_draft_context() to service_role;

create or replace function public.internal_record_sports_market_draft_audit(
  p_actor_user_id uuid,
  p_provider_code text,
  p_fixture_id text,
  p_market_type_code text,
  p_selected_result text,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_actor_user_id is null
     or nullif(btrim(coalesce(p_provider_code,'')),'') is null
     or nullif(btrim(coalesce(p_fixture_id,'')),'') is null
     or nullif(btrim(coalesce(p_market_type_code,'')),'') is null
     or jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object' then
    raise exception 'Invalid sports draft audit record' using errcode='22023';
  end if;
  insert into audit.records(
    actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata
  ) values (
    p_actor_user_id,'ADMIN','SPORTS_MARKET_DRAFT_GENERATED','SPORTS_FIXTURE',
    left(btrim(p_fixture_id),180),
    'Generated an AI-assisted draft from an imported sports fixture.',
    jsonb_build_object(
      'provider_code',upper(left(btrim(p_provider_code),80)),
      'fixture_id',left(btrim(p_fixture_id),180),
      'market_type_code',upper(left(btrim(p_market_type_code),80)),
      'selected_result',upper(left(btrim(coalesce(p_selected_result,'')),40))
    ) || coalesce(p_metadata,'{}'::jsonb)
  );
  return true;
end;
$function$;
revoke all on function public.internal_record_sports_market_draft_audit(uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.internal_record_sports_market_draft_audit(uuid,text,text,text,text,jsonb) to service_role;

commit;
),
  usage_minute timestamptz not null,
  request_count integer not null default 0 check (request_count>=0),
  minute_limit integer not null check (minute_limit between 1 and 9),
  updated_at timestamptz not null default statement_timestamp(),
  primary key(provider_code,usage_minute)
);
alter table market.sports_fixture_minute_usage enable row level security;
revoke all on market.sports_fixture_minute_usage from public,anon,authenticated;
grant select,insert,update,delete on market.sports_fixture_minute_usage to service_role;

create or replace function public.internal_get_sports_fixture_cache(p_request_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'requestKey',c.request_key,
    'providerCode',c.provider_code,
    'sportCode',c.sport_code,
    'competitionCode',c.competition_code,
    'dateFrom',c.date_from,
    'dateTo',c.date_to,
    'payload',c.payload,
    'fetchedAt',c.fetched_at,
    'expiresAt',c.expires_at,
    'staleUntil',c.stale_until
  ) into v_result
  from market.sports_fixture_cache c
  where c.request_key=left(btrim(coalesce(p_request_key,'')),420);
  return v_result;
end;
$function$;
revoke all on function public.internal_get_sports_fixture_cache(text) from public,anon,authenticated;
grant execute on function public.internal_get_sports_fixture_cache(text) to service_role;

create or replace function public.internal_upsert_sports_fixture_cache(
  p_request_key text,
  p_provider_code text,
  p_sport_code text,
  p_competition_code text,
  p_date_from date,
  p_date_to date,
  p_payload jsonb,
  p_ttl_seconds integer default 900,
  p_stale_seconds integer default 21600
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_key text:=left(btrim(coalesce(p_request_key,'')),420);
  v_provider text:=upper(btrim(coalesce(p_provider_code,'')));
  v_ttl integer:=least(greatest(coalesce(p_ttl_seconds,900),30),3600);
  v_stale integer:=least(greatest(coalesce(p_stale_seconds,21600),0),86400);
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if v_key !~ '^[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*:[A-Z0-9_]+:[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or v_provider !~ '^[A-Z][A-Z0-9_]*$'
     or nullif(btrim(coalesce(p_sport_code,'')),'') is null
     or nullif(btrim(coalesce(p_competition_code,'')),'') is null
     or p_date_from is null or p_date_to is null or p_date_to<p_date_from
     or jsonb_typeof(coalesce(p_payload,'null'::jsonb))<>'object' then
    raise exception 'Invalid sports fixture cache record' using errcode='22023';
  end if;
  insert into market.sports_fixture_cache(
    request_key,provider_code,sport_code,competition_code,date_from,date_to,
    payload,fetched_at,expires_at,stale_until,updated_at
  ) values (
    v_key,v_provider,upper(btrim(p_sport_code)),upper(btrim(p_competition_code)),
    p_date_from,p_date_to,p_payload,statement_timestamp(),
    statement_timestamp()+make_interval(secs=>v_ttl),
    statement_timestamp()+make_interval(secs=>v_ttl+v_stale),
    statement_timestamp()
  )
  on conflict(request_key) do update set
    provider_code=excluded.provider_code,
    sport_code=excluded.sport_code,
    competition_code=excluded.competition_code,
    date_from=excluded.date_from,
    date_to=excluded.date_to,
    payload=excluded.payload,
    fetched_at=excluded.fetched_at,
    expires_at=excluded.expires_at,
    stale_until=excluded.stale_until,
    updated_at=statement_timestamp();
  return true;
end;
$function$;
revoke all on function public.internal_upsert_sports_fixture_cache(text,text,text,text,date,date,jsonb,integer,integer) from public,anon,authenticated;
grant execute on function public.internal_upsert_sports_fixture_cache(text,text,text,text,date,date,jsonb,integer,integer) to service_role;

create or replace function public.internal_reserve_sports_fixture_request(
  p_provider_code text,
  p_daily_limit integer default 100
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_provider text:=upper(btrim(coalesce(p_provider_code,'')));
  v_limit integer:=least(greatest(coalesce(p_daily_limit,100),1),10000);
  v_day date:=(statement_timestamp() at time zone 'UTC')::date;
  v_count integer;
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if v_provider !~ '^[A-Z][A-Z0-9_]*$' then
    raise exception 'Invalid provider code' using errcode='22023';
  end if;
  insert into market.sports_fixture_usage(provider_code,usage_day,request_count,daily_limit,updated_at)
  values(v_provider,v_day,1,v_limit,statement_timestamp())
  on conflict(provider_code,usage_day) do update set
    request_count=market.sports_fixture_usage.request_count+1,
    daily_limit=excluded.daily_limit,
    updated_at=statement_timestamp()
  where market.sports_fixture_usage.request_count<least(greatest(excluded.daily_limit,1),10000)
  returning request_count into v_count;
  return v_count is not null;
end;
$function$;
revoke all on function public.internal_reserve_sports_fixture_request(text,integer) from public,anon,authenticated;
grant execute on function public.internal_reserve_sports_fixture_request(text,integer) to service_role;

insert into ai.prompt_versions(capability_key,version,system_prompt,output_schema,status)
values(
  'SPORTS_MARKET_DRAFT',
  1,
  'You are VAD Sports Market Draft Assistant. Draft reviewable copy for a prediction market from one verified provider fixture and a database-configured market template. Do not predict the actual event result, create odds, invent statistics, alter fixture details, invent a source, invent or change the closing/kickoff time, or claim that a market is automatically resolved unless the supplied template says so. Follow the supplied result choice exactly. Keep the question objective and binary. The output is a draft for a human administrator: do not publish or approve it. Any resolution wording must be consistent with the supplied template and fixture; when the source or condition is not fully supported, state the uncertainty in riskNotes.',
  '{"type":"object","required":["title","description","resolutionRules","riskNotes"],"properties":{"title":{"type":"string","minLength":10,"maxLength":180},"description":{"type":"string","maxLength":1000},"resolutionRules":{"type":"string","minLength":20,"maxLength":1800},"riskNotes":{"type":"string","maxLength":500}}}'::jsonb,
  'ACTIVE'
)
-- Prompt versions are immutable by design; change the version number for future prompt edits.
on conflict(capability_key,version) do nothing;

create or replace function public.internal_sports_market_draft_context()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_prompt record;
  v_providers jsonb;
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  select pv.id,pv.version,pv.system_prompt,pv.output_schema
  into v_prompt
  from ai.prompt_versions pv
  where pv.capability_key='SPORTS_MARKET_DRAFT' and pv.status='ACTIVE'
  order by pv.version desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'aiProviderId',ap.id,
    'providerCode',ip.code,
    'providerName',ip.name,
    'environment',ip.environment,
    'adapter',ip.public_metadata->>'ai_adapter',
    'endpoint',ip.public_metadata->>'endpoint',
    'apiVersion',ip.public_metadata->>'api_version',
    'modelCode',ap.model_code,
    'secretReference',ip.secret_reference,
    'priority',ap.priority
  ) order by ap.priority,ip.priority,ap.id),'[]'::jsonb)
  into v_providers
  from ai.providers ap
  join integration.providers ip on ip.id=ap.integration_provider_id
  where ap.status in ('ACTIVE','DEGRADED')
    and ip.status in ('ACTIVE','DEGRADED')
    and ip.provider_type='AI'
    and (
      ap.capabilities @> '["SPORTS_MARKET_DRAFT"]'::jsonb
      or ap.capabilities @> '["MARKET_ADMISSION"]'::jsonb
    )
    and coalesce(ip.public_metadata->>'ai_adapter','') in (
      'OPENAI_COMPATIBLE','GEMINI_GENERATE_CONTENT','ANTHROPIC_MESSAGES','CLOUDFLARE_WORKERS_AI'
    )
    and coalesce(ip.public_metadata->>'endpoint','') like 'https://%';

  return jsonb_build_object(
    'prompt',case when v_prompt.id is null then null else jsonb_build_object(
      'id',v_prompt.id,'version',v_prompt.version,
      'systemPrompt',v_prompt.system_prompt,'outputSchema',v_prompt.output_schema
    ) end,
    'providers',v_providers
  );
end;
$function$;
revoke all on function public.internal_sports_market_draft_context() from public,anon,authenticated;
grant execute on function public.internal_sports_market_draft_context() to service_role;

create or replace function public.internal_record_sports_market_draft_audit(
  p_actor_user_id uuid,
  p_provider_code text,
  p_fixture_id text,
  p_market_type_code text,
  p_selected_result text,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_actor_user_id is null
     or nullif(btrim(coalesce(p_provider_code,'')),'') is null
     or nullif(btrim(coalesce(p_fixture_id,'')),'') is null
     or nullif(btrim(coalesce(p_market_type_code,'')),'') is null
     or jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object' then
    raise exception 'Invalid sports draft audit record' using errcode='22023';
  end if;
  insert into audit.records(
    actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata
  ) values (
    p_actor_user_id,'ADMIN','SPORTS_MARKET_DRAFT_GENERATED','SPORTS_FIXTURE',
    left(btrim(p_fixture_id),180),
    'Generated an AI-assisted draft from an imported sports fixture.',
    jsonb_build_object(
      'provider_code',upper(left(btrim(p_provider_code),80)),
      'fixture_id',left(btrim(p_fixture_id),180),
      'market_type_code',upper(left(btrim(p_market_type_code),80)),
      'selected_result',upper(left(btrim(coalesce(p_selected_result,'')),40))
    ) || coalesce(p_metadata,'{}'::jsonb)
  );
  return true;
end;
$function$;
revoke all on function public.internal_record_sports_market_draft_audit(uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.internal_record_sports_market_draft_audit(uuid,text,text,text,text,jsonb) to service_role;

commit;
