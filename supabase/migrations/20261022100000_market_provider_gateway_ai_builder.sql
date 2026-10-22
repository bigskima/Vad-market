begin;

-- Separate discovery mapping from outcome-provider mapping. Fixture imports are
-- market-building context only; Oracle result providers continue to live in
-- oracle.provider_resources and oracle.event_policy_bindings.
alter table market.sports_competitions
  add column if not exists fixture_provider_code text,
  add column if not exists fixture_competition_code text,
  add column if not exists fixture_config jsonb not null default '{}'::jsonb;

alter table market.sports_competitions
  drop constraint if exists sports_competitions_fixture_config_object_check;
alter table market.sports_competitions
  add constraint sports_competitions_fixture_config_object_check
  check (jsonb_typeof(fixture_config)='object');

update market.sports_competitions
set fixture_provider_code=provider_code,
    fixture_competition_code=provider_competition_code,
    fixture_config=coalesce(fixture_config,'{}'::jsonb)||
      case when provider_code='FOOTBALL_DATA'
        then jsonb_build_object('adapter','FOOTBALL_DATA_V4','api_path','/competitions/'||provider_competition_code||'/matches')
        else '{}'::jsonb end,
    updated_at=statement_timestamp()
where fixture_provider_code is null
  and provider_code is not null
  and provider_competition_code is not null;

-- Existing free football fixture connector becomes explicitly discoverable;
-- this is independent of its already-existing Oracle result capability.
update integration.providers
set capabilities=case
      when capabilities @> '["SPORTS_FIXTURE_DISCOVERY"]'::jsonb then capabilities
      else capabilities||'["SPORTS_FIXTURE_DISCOVERY"]'::jsonb end,
    public_metadata=coalesce(public_metadata,'{}'::jsonb)||
      jsonb_build_object('fixture_adapter','FOOTBALL_DATA_V4','fixture_discovery_enabled',true),
    updated_at=statement_timestamp()
where code='FOOTBALL_DATA' and environment='PRODUCTION' and provider_type='ORACLE';

-- Optional multi-sport provider connector. It is deliberately disabled until
-- an API_SPORTS_KEY is configured on the Edge Functions runtime and an admin
-- maps each competition/season to the correct provider IDs and API path.
insert into integration.providers(
  code,name,provider_type,environment,status,priority,capabilities,
  public_metadata,secret_reference
)
values(
  'API_SPORTS','API-Sports multi-sport fixtures','ORACLE','PRODUCTION','DISABLED',150,
  '["SPORTS_FIXTURE_DISCOVERY"]'::jsonb,
  '{"base_url":"https://v3.football.api-sports.io","fixture_adapter":"API_SPORTS_V3","configured":false,"credential_mode":"X_APISPORTS_KEY","discovery_note":"Map sport-specific base URL, API path, query parameter names and season in market.sports_competitions.fixture_config before enabling."}'::jsonb,
  'API_SPORTS_KEY'
)
on conflict(code,environment) do nothing;

create table if not exists market.provider_events (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  provider_code text not null,
  external_event_id text not null,
  sport_code text not null,
  competition_code text not null,
  competition_name text not null,
  event_name text,
  participant_a text not null,
  participant_b text not null,
  starts_at timestamptz not null,
  status text not null default 'SCHEDULED',
  score_a integer,
  score_b integer,
  season text,
  round_label text,
  venue text,
  source_url text,
  normalized_payload jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint provider_events_external_identity unique(provider_code,external_event_id),
  constraint provider_events_normalized_payload_object check(jsonb_typeof(normalized_payload)='object'),
  constraint provider_events_raw_payload_object check(jsonb_typeof(raw_payload)='object'),
  constraint provider_events_event_text_limits check(
    length(btrim(provider_code)) between 2 and 80
    and length(btrim(external_event_id)) between 1 and 160
    and length(btrim(sport_code)) between 2 and 80
    and length(btrim(competition_code)) between 1 and 100
    and length(btrim(competition_name)) between 2 and 180
    and length(btrim(participant_a)) between 1 and 180
    and length(btrim(participant_b)) between 1 and 180
  )
);

create index if not exists provider_events_competition_starts_idx
  on market.provider_events(sport_code,competition_code,starts_at,status);
create index if not exists provider_events_starts_idx
  on market.provider_events(starts_at,status);
create index if not exists provider_events_provider_last_seen_idx
  on market.provider_events(provider_code,last_seen_at desc);

alter table market.provider_events enable row level security;
revoke all on market.provider_events from public,anon,authenticated;
grant select,insert,update on market.provider_events to service_role;

create table if not exists market.market_builder_runs (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  requested_by uuid not null,
  fixture_provider_code text not null,
  ai_provider_code text,
  ai_model_code text,
  event_public_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'PENDING'
    check(status in ('PENDING','SUCCEEDED','FAILED')),
  input_snapshot jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  failure_reason text,
  created_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  constraint market_builder_runs_event_ids_limit check(cardinality(event_public_ids)<=10),
  constraint market_builder_runs_input_object check(jsonb_typeof(input_snapshot)='object'),
  constraint market_builder_runs_output_object check(jsonb_typeof(output_payload)='object')
);
create index if not exists market_builder_runs_requested_idx
  on market.market_builder_runs(requested_by,created_at desc);
alter table market.market_builder_runs enable row level security;
revoke all on market.market_builder_runs from public,anon,authenticated;
grant select,insert on market.market_builder_runs to service_role;

-- Admin-facing competition catalog exposes discovery mapping separately from
-- the provider mapping that is authoritative for Oracle outcome resolution.
create or replace function public.get_sports_market_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'sports',coalesce((
      select jsonb_agg(jsonb_build_object(
        'code',s.sport_code,'name',s.sport_name,'status',s.sport_status
      ) order by s.sport_code,s.sport_name)
      from (
        select sport_code,sport_name,
          case when bool_or(status='ACTIVE') then 'ACTIVE' else 'DISABLED' end as sport_status
        from market.sports_competitions
        group by sport_code,sport_name
      ) s
    ),'[]'::jsonb),
    'competitions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'sportCode',s.sport_code,'code',s.competition_code,'name',s.competition_name,
        'region',s.region,'resultMode',s.result_mode,'providerCode',s.provider_code,
        'providerCompetitionCode',s.provider_competition_code,'aliases',s.aliases,
        'fixtureProviderCode',s.fixture_provider_code,
        'fixtureCompetitionCode',s.fixture_competition_code,
        'fixtureConfig',s.fixture_config,
        'status',s.status
      ) order by s.sport_code,s.display_order,s.competition_name)
      from market.sports_competitions s
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.get_sports_market_catalog() from public,anon;
grant execute on function public.get_sports_market_catalog() to authenticated;

create or replace function public.get_market_builder_competition_runtime(
  p_sport_code text,
  p_competition_code text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'sportCode',s.sport_code,
    'sportName',s.sport_name,
    'competitionCode',s.competition_code,
    'competitionName',s.competition_name,
    'region',s.region,
    'resultMode',s.result_mode,
    'fixtureProviderCode',s.fixture_provider_code,
    'fixtureCompetitionCode',s.fixture_competition_code,
    'fixtureConfig',s.fixture_config,
    'providerCode',p.code,
    'providerName',p.name,
    'providerType',p.provider_type,
    'providerStatus',p.status,
    'providerEnvironment',p.environment,
    'providerBaseUrl',p.public_metadata->>'base_url',
    'fixtureAdapter',coalesce(
      s.fixture_config->>'adapter',
      p.public_metadata->>'fixture_adapter'
    ),
    'secretReference',p.secret_reference,
    'providerCapabilities',p.capabilities,
    'providerMetadata',p.public_metadata
  ) into v_result
  from market.sports_competitions s
  left join integration.providers p
    on p.code=s.fixture_provider_code and p.environment='PRODUCTION'
  where s.sport_code=upper(btrim(coalesce(p_sport_code,'')))
    and s.competition_code=upper(btrim(coalesce(p_competition_code,'')))
    and s.status='ACTIVE';
  return v_result;
end;
$function$;
revoke all on function public.get_market_builder_competition_runtime(text,text) from public,anon,authenticated;
grant execute on function public.get_market_builder_competition_runtime(text,text) to service_role;

create or replace function public.upsert_market_provider_events(
  p_provider_code text,
  p_sport_code text,
  p_competition_code text,
  p_events jsonb
)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_provider_code text:=upper(btrim(coalesce(p_provider_code,'')));
  v_sport_code text:=upper(btrim(coalesce(p_sport_code,'')));
  v_competition_code text:=upper(btrim(coalesce(p_competition_code,'')));
  v_event jsonb;
  v_count integer:=0;
  v_starts_at timestamptz;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if jsonb_typeof(coalesce(p_events,'null'::jsonb))<>'array' or jsonb_array_length(p_events)>200 then
    raise exception 'Event batch must be an array of at most 200 fixtures.' using errcode='22023';
  end if;
  if not exists(
    select 1 from integration.providers p
    where p.code=v_provider_code
      and p.environment='PRODUCTION'
      and p.provider_type='ORACLE'
      and p.status in('ACTIVE','DEGRADED')
      and p.capabilities @> '["SPORTS_FIXTURE_DISCOVERY"]'::jsonb
  ) then
    raise exception 'Configured fixture provider is not active for event discovery.' using errcode='42501';
  end if;

  for v_event in select value from jsonb_array_elements(p_events)
  loop
    if upper(btrim(coalesce(v_event->>'sportCode','')))<>v_sport_code
       or upper(btrim(coalesce(v_event->>'competitionCode','')))<>v_competition_code then
      raise exception 'Imported event does not match the selected sport and competition.' using errcode='22023';
    end if;
    begin
      v_starts_at:=(v_event->>'startsAt')::timestamptz;
    exception when others then
      v_starts_at:=null;
    end;
    if v_starts_at is null
       or nullif(btrim(coalesce(v_event->>'externalEventId','')),'') is null
       or nullif(btrim(coalesce(v_event->>'participantA','')),'') is null
       or nullif(btrim(coalesce(v_event->>'participantB','')),'') is null then
      raise exception 'Imported event is missing a stable ID, kickoff time or participants.' using errcode='22023';
    end if;

    insert into market.provider_events(
      provider_code,external_event_id,sport_code,competition_code,competition_name,
      event_name,participant_a,participant_b,starts_at,status,score_a,score_b,
      season,round_label,venue,source_url,normalized_payload,raw_payload,last_seen_at,updated_at
    ) values(
      v_provider_code,
      left(btrim(v_event->>'externalEventId'),160),
      v_sport_code,
      v_competition_code,
      left(btrim(coalesce(v_event->>'competitionName','')),180),
      left(nullif(btrim(coalesce(v_event->>'eventName','')),''),300),
      left(btrim(v_event->>'participantA'),180),
      left(btrim(v_event->>'participantB'),180),
      v_starts_at,
      left(upper(btrim(coalesce(v_event->>'status','SCHEDULED'))),32),
      case when coalesce(v_event->>'scoreA','')~'^-?[0-9]{1,4}$' then (v_event->>'scoreA')::integer else null end,
      case when coalesce(v_event->>'scoreB','')~'^-?[0-9]{1,4}$' then (v_event->>'scoreB')::integer else null end,
      left(nullif(btrim(coalesce(v_event->>'season','')),''),80),
      left(nullif(btrim(coalesce(v_event->>'roundLabel','')),''),120),
      left(nullif(btrim(coalesce(v_event->>'venue','')),''),180),
      left(nullif(btrim(coalesce(v_event->>'sourceUrl','')),''),1000),
      case when jsonb_typeof(v_event->'normalizedPayload')='object' then v_event->'normalizedPayload' else '{}'::jsonb end,
      case when jsonb_typeof(v_event->'rawPayload')='object' then v_event->'rawPayload' else '{}'::jsonb end,
      statement_timestamp(),statement_timestamp()
    )
    on conflict(provider_code,external_event_id) do update set
      sport_code=excluded.sport_code,
      competition_code=excluded.competition_code,
      competition_name=excluded.competition_name,
      event_name=excluded.event_name,
      participant_a=excluded.participant_a,
      participant_b=excluded.participant_b,
      starts_at=excluded.starts_at,
      status=excluded.status,
      score_a=excluded.score_a,
      score_b=excluded.score_b,
      season=excluded.season,
      round_label=excluded.round_label,
      venue=excluded.venue,
      source_url=excluded.source_url,
      normalized_payload=excluded.normalized_payload,
      raw_payload=excluded.raw_payload,
      last_seen_at=statement_timestamp(),
      updated_at=statement_timestamp();
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$function$;
revoke all on function public.upsert_market_provider_events(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.upsert_market_provider_events(text,text,text,jsonb) to service_role;

create or replace function public.admin_list_market_provider_events(
  p_sport_code text,
  p_competition_code text,
  p_from_date date,
  p_to_date date,
  p_search text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_result jsonb; v_limit integer:=least(greatest(coalesce(p_limit,100),1),200);
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if p_from_date is null or p_to_date is null or p_to_date<p_from_date or p_to_date>p_from_date+60 then
    raise exception 'Choose a date range no longer than 60 days.' using errcode='22023';
  end if;
  select jsonb_build_object(
    'sportCode',upper(btrim(coalesce(p_sport_code,''))),
    'competitionCode',upper(btrim(coalesce(p_competition_code,''))),
    'fromDate',p_from_date,
    'toDate',p_to_date,
    'events',coalesce((
      select jsonb_agg(jsonb_build_object(
        'publicId',e.public_id,
        'providerCode',e.provider_code,
        'externalEventId',e.external_event_id,
        'sportCode',e.sport_code,
        'competitionCode',e.competition_code,
        'competitionName',e.competition_name,
        'eventName',e.event_name,
        'participantA',e.participant_a,
        'participantB',e.participant_b,
        'startsAt',e.starts_at,
        'status',e.status,
        'scoreA',e.score_a,
        'scoreB',e.score_b,
        'season',e.season,
        'roundLabel',e.round_label,
        'venue',e.venue,
        'sourceUrl',e.source_url,
        'lastSeenAt',e.last_seen_at,
        'normalizedPayload',e.normalized_payload
      ) order by e.starts_at,e.participant_a,e.participant_b)
      from (
        select e.*
        from market.provider_events e
        where e.sport_code=upper(btrim(coalesce(p_sport_code,'')))
          and e.competition_code=upper(btrim(coalesce(p_competition_code,'')))
          and e.starts_at>=p_from_date::timestamptz
          and e.starts_at<(p_to_date+1)::timestamptz
          and (nullif(btrim(coalesce(p_search,'')),'') is null
            or e.participant_a ilike '%'||btrim(p_search)||'%'
            or e.participant_b ilike '%'||btrim(p_search)||'%'
            or e.event_name ilike '%'||btrim(p_search)||'%')
        order by e.starts_at,e.participant_a,e.participant_b
        limit v_limit
      ) e
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.admin_list_market_provider_events(text,text,date,date,text,integer) from public,anon;
grant execute on function public.admin_list_market_provider_events(text,text,date,date,text,integer) to authenticated;

create or replace function public.get_market_builder_events_for_ai(p_event_public_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if coalesce(cardinality(p_event_public_ids),0)<1 or cardinality(p_event_public_ids)>10 then
    raise exception 'Select between one and ten fixtures for AI drafting.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'publicId',e.public_id,
    'providerCode',e.provider_code,
    'externalEventId',e.external_event_id,
    'sportCode',e.sport_code,
    'competitionCode',e.competition_code,
    'competitionName',e.competition_name,
    'eventName',e.event_name,
    'participantA',e.participant_a,
    'participantB',e.participant_b,
    'startsAt',e.starts_at,
    'status',e.status,
    'season',e.season,
    'roundLabel',e.round_label,
    'venue',e.venue,
    'sourceUrl',e.source_url,
    'normalizedPayload',e.normalized_payload,
    'fixtureConfig',s.fixture_config,
    'resultMode',s.result_mode,
    'oracleProviderCode',s.provider_code,
    'oracleProviderCompetitionCode',s.provider_competition_code
  ) order by e.starts_at),'[]'::jsonb) into v_result
  from market.provider_events e
  left join market.sports_competitions s
    on s.sport_code=e.sport_code and s.competition_code=e.competition_code
  where e.public_id=any(p_event_public_ids);
  if jsonb_array_length(v_result)<>cardinality(p_event_public_ids) then
    raise exception 'One or more selected fixtures no longer exist in the provider cache.' using errcode='P0002';
  end if;
  return v_result;
end;
$function$;
revoke all on function public.get_market_builder_events_for_ai(uuid[]) from public,anon,authenticated;
grant execute on function public.get_market_builder_events_for_ai(uuid[]) to service_role;

create or replace function public.get_market_builder_ai_runtime()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'aiProviderId',ap.id,
    'providerCode',ip.code,
    'providerName',ip.name,
    'environment',ip.environment,
    'adapter',ip.public_metadata->>'ai_adapter',
    'endpoint',ip.public_metadata->>'endpoint',
    'apiVersion',ip.public_metadata->>'api_version',
    'secretReference',ip.secret_reference,
    'modelCode',ap.model_code,
    'priority',ap.priority,
    'costPolicy',ap.cost_policy,
    'promptVersionId',pv.id,
    'promptVersion',pv.version,
    'systemPrompt',pv.system_prompt,
    'outputSchema',pv.output_schema
  ) into v_result
  from ai.providers ap
  join integration.providers ip on ip.id=ap.integration_provider_id
  join lateral (
    select pvi.id,pvi.version,pvi.system_prompt,pvi.output_schema
    from ai.prompt_versions pvi
    where pvi.capability_key='MARKET_BUILDER_DRAFTING' and pvi.status='ACTIVE'
    order by pvi.version desc limit 1
  ) pv on true
  where ap.status='ACTIVE'
    and ip.status='ACTIVE'
    and ip.environment='PRODUCTION'
    and ap.capabilities @> '["MARKET_BUILDER_DRAFTING"]'::jsonb
    and upper(coalesce(ap.cost_policy->>'billing_mode','FREE_ONLY'))='FREE_ONLY'
    and coalesce((ap.cost_policy->>'paid_spend_limit')::numeric,0)=0
  order by ap.priority,ip.priority,ap.id
  limit 1;
  return v_result;
end;
$function$;
revoke all on function public.get_market_builder_ai_runtime() from public,anon,authenticated;
grant execute on function public.get_market_builder_ai_runtime() to service_role;

create or replace function public.record_market_builder_run(
  p_requested_by uuid,
  p_fixture_provider_code text,
  p_ai_provider_code text,
  p_ai_model_code text,
  p_event_public_ids uuid[],
  p_status text,
  p_input_snapshot jsonb,
  p_output_payload jsonb,
  p_failure_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare v_id bigint; v_public_id uuid; v_status text:=upper(btrim(coalesce(p_status,'')));
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if v_status not in ('SUCCEEDED','FAILED') then
    raise exception 'Invalid market builder run status.' using errcode='22023';
  end if;
  if p_requested_by is null
     or not exists(select 1 from auth.users u where u.id=p_requested_by) then
    raise exception 'Valid requesting user is required.' using errcode='22023';
  end if;
  if coalesce(cardinality(p_event_public_ids),0)>10
     or jsonb_typeof(coalesce(p_input_snapshot,'{}'::jsonb))<>'object'
     or jsonb_typeof(coalesce(p_output_payload,'{}'::jsonb))<>'object' then
    raise exception 'Invalid market builder audit payload.' using errcode='22023';
  end if;

  insert into market.market_builder_runs(
    requested_by,fixture_provider_code,ai_provider_code,ai_model_code,
    event_public_ids,status,input_snapshot,output_payload,failure_reason,completed_at
  ) values(
    p_requested_by,
    left(btrim(coalesce(p_fixture_provider_code,'')),80),
    left(nullif(btrim(coalesce(p_ai_provider_code,'')),''),80),
    left(nullif(btrim(coalesce(p_ai_model_code,'')),''),180),
    coalesce(p_event_public_ids,'{}'::uuid[]),
    v_status,
    coalesce(p_input_snapshot,'{}'::jsonb),
    coalesce(p_output_payload,'{}'::jsonb),
    left(nullif(btrim(coalesce(p_failure_reason,'')),''),2000),
    statement_timestamp()
  )
  returning id,public_id into v_id,v_public_id;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(
    p_requested_by,'ADMIN','MARKET_BUILDER_AI_RUN','MARKET_BUILDER_RUN',
    v_public_id::text,
    case when v_status='SUCCEEDED' then 'AI generated market drafts from cached provider events; drafts require admin review.'
      else 'AI market draft generation failed; failure details stored in the builder audit record.' end,
    jsonb_build_object(
      'status',v_status,
      'fixture_provider_code',p_fixture_provider_code,
      'ai_provider_code',p_ai_provider_code,
      'ai_model_code',p_ai_model_code,
      'selected_event_count',coalesce(cardinality(p_event_public_ids),0),
      'suggestion_count',coalesce(jsonb_array_length(coalesce(p_output_payload,'{}'::jsonb)->'suggestions'),0)
    )
  );
  return v_public_id;
end;
$function$;
revoke all on function public.record_market_builder_run(uuid,text,text,text,uuid[],text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_market_builder_run(uuid,text,text,text,uuid[],text,jsonb,jsonb,text) to service_role;

-- Free-only provider capability: an AI drafter is allowed to use an existing
-- model only when its configured provider is active and explicitly opted in.
update ai.providers ap
set capabilities=case
      when ap.capabilities @> '["MARKET_BUILDER_DRAFTING"]'::jsonb then ap.capabilities
      else ap.capabilities||'["MARKET_BUILDER_DRAFTING"]'::jsonb end,
    updated_at=statement_timestamp()
from integration.providers ip
where ip.id=ap.integration_provider_id
  and ip.environment='PRODUCTION'
  and ip.status='ACTIVE'
  and ap.status='ACTIVE'
  and upper(coalesce(ap.cost_policy->>'billing_mode','FREE_ONLY'))='FREE_ONLY'
  and coalesce((ap.cost_policy->>'paid_spend_limit')::numeric,0)=0
  and ap.capabilities @> '["MARKET_ADMISSION"]'::jsonb;

insert into ai.prompt_versions(capability_key,version,system_prompt,output_schema,status)
select
  'MARKET_BUILDER_DRAFTING',
  1,
  $prompt$
You are VAD's market-draft assistant. Turn already-imported provider fixture data into clear prediction-market question drafts for a human administrator to review.

Important safety and evidence rules:
- Use only the supplied fixture facts. Do not invent team names, player names, kickoff times, competitions, results, injuries, rankings, odds or URLs.
- Each draft must reference an eventPublicId exactly as supplied.
- A draft is a question proposal, not a result prediction and not an Oracle decision.
- Never recommend auto-publishing. VAD admins will review and create drafts; Oracle policies remain the only outcome-resolution authority.
- For football fixtures whose resultMode is AUTOMATIC and whose provider is FOOTBALL_DATA, suggest independent binary questions for HOME_WIN, DRAW and AWAY_WIN, each phrased as a question and each condition tied to the specific competition, participants, kickoff and official match result.
- For all other sports or any event without an approved automatic resolver mapping, suggest only a generic MATCH_WINNER draft, mark the workflow VERIFIED, and state that an admin must confirm an authoritative result source before publication.
- Keep the question concise (prefer less than 140 characters), avoid misleading certainty, and include risks if the event metadata is ambiguous.
- Return valid JSON matching the provided output schema. No markdown, no extra keys.
$prompt$,
  '{
    "type":"object",
    "required":["suggestions"],
    "properties":{
      "suggestions":{
        "type":"array",
        "maxItems":30,
        "items":{
          "type":"object",
          "required":["eventPublicId","prediction","title","description","condition","confidence","riskFlags"],
          "properties":{
            "eventPublicId":{"type":"string"},
            "prediction":{"enum":["HOME_WIN","DRAW","AWAY_WIN","MATCH_WINNER"]},
            "title":{"type":"string"},
            "description":{"type":"string"},
            "condition":{"type":"string"},
            "confidence":{"type":"number","minimum":0,"maximum":1},
            "riskFlags":{"type":"array","items":{"type":"string"},"maxItems":8}
          }
        }
      }
    }
  }'::jsonb,
  'ACTIVE'
where not exists(
  select 1 from ai.prompt_versions where capability_key='MARKET_BUILDER_DRAFTING' and version=1
);

commit;
