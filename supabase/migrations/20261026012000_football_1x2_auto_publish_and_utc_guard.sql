-- Canonical UTC scheduling and competition-wide automatic 1X2 publishing.
-- The production oracle policy is deliberately created as DRAFT. A separate
-- authorized reviewer must approve it once; each match result is then resolved
-- by two independent provider observations and the existing consensus/finalizer/
-- settlement pipeline. No per-match manual result review is introduced.

begin;

-- Propose (but do not silently approve) the production 2-source football policy.
insert into oracle.policies(
  name, capability_id, version, source_hierarchy, consensus_rule,
  close_rule, postponement_rule, cancellation_rule, void_rule,
  dispute_window_seconds, status, effective_at, created_by
)
select
  'VAD Football Match Result Production Policy',
  capability.id,
  coalesce((select max(existing.version) + 1
            from oracle.policies existing
            where existing.name = 'VAD Football Match Result Production Policy'), 1),
  jsonb_build_array(
    jsonb_build_object('role','PRIMARY','priority',10,'provider_code','FOOTBALL_DATA'),
    jsonb_build_object('role','CORROBORATING','priority',20,'provider_code','THESPORTSDB')
  ),
  jsonb_build_object(
    'environment','PRODUCTION',
    'tie_behavior','NO_RESOLUTION',
    'finalization_mode','AUTO_AFTER_DISPUTE_WINDOW',
    'distinct_providers',true,
    'min_agreeing_providers',2
  ),
  jsonb_build_object('mode','SCHEDULED_CLOSE'),
  jsonb_build_object('mode','RETRY_PROVIDER_UNTIL_FINAL'),
  jsonb_build_object('mode','VOID_ON_CONFIRMED_CANCELLATION'),
  jsonb_build_object('mode','EQUAL_SPLIT'),
  120,
  'DRAFT',
  statement_timestamp(),
  null
from oracle.capabilities capability
where capability.code = 'OBJECTIVE_EVENT_RESULT'
  and not exists (
    select 1 from oracle.policies existing
    where existing.name = 'VAD Football Match Result Production Policy'
      and existing.status in ('DRAFT','ACTIVE')
  );

-- Report production automatic publishing as ready only when the correct,
-- approved two-provider policy and both mapped providers are actually available.
create or replace function public.admin_market_approval_options_v2()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v jsonb;
  v_tavily boolean;
  v_public boolean;
  v_football_competitions jsonb;
  v_football_production_ready boolean := false;
begin
  v := public.admin_market_approval_options();

  select coalesce(jsonb_agg(s.competition_name order by s.display_order,s.competition_name),'[]'::jsonb)
  into v_football_competitions
  from market.sports_competitions s
  join integration.providers p
    on p.code=s.provider_code
   and p.provider_type='ORACLE'
   and p.environment='PRODUCTION'
   and p.status in ('ACTIVE','DEGRADED')
  join oracle.provider_resources r
    on r.provider_id=p.id
   and r.resource_type='SPORTS_COMPETITION'
   and r.status='ACTIVE'
   and r.canonical_key=s.sport_code||':'||s.provider_competition_code
  where s.sport_code='FOOTBALL'
    and s.status='ACTIVE'
    and s.result_mode='AUTOMATIC';

  select exists (
    select 1
    from oracle.policies policy
    where policy.name='VAD Football Match Result Production Policy'
      and policy.status='ACTIVE'
      and policy.approved_by is not null
      and policy.effective_at <= statement_timestamp()
      and policy.consensus_rule @> '{
        "environment":"PRODUCTION",
        "finalization_mode":"AUTO_AFTER_DISPUTE_WINDOW",
        "distinct_providers":true,
        "min_agreeing_providers":2
      }'::jsonb
      and exists (
        select 1 from jsonb_array_elements(policy.source_hierarchy) source
        where upper(coalesce(source->>'provider_code',source->>'providerCode',''))='FOOTBALL_DATA'
      )
      and exists (
        select 1 from jsonb_array_elements(policy.source_hierarchy) source
        where upper(coalesce(source->>'provider_code',source->>'providerCode',''))='THESPORTSDB'
      )
      and not exists (
        select 1
        from (values ('FOOTBALL_DATA'),('THESPORTSDB')) required(code)
        left join integration.providers provider
          on provider.code=required.code
         and provider.provider_type='ORACLE'
         and provider.environment='PRODUCTION'
        where provider.id is null
           or provider.status not in ('ACTIVE','DEGRADED')
           or coalesce((provider.public_metadata->>'configured')::boolean,false) is not true
           or not (provider.capabilities @> '["FOOTBALL_MATCH_RESULT"]'::jsonb)
           or coalesce((
             select health.status
             from integration.provider_health health
             where health.provider_id=provider.id
             order by health.checked_at desc nulls last
             limit 1
           ),'UNKNOWN')='UNAVAILABLE'
      )
  ) into v_football_production_ready;

  v := jsonb_set(v,'{guided,football,competitions}',coalesce(v_football_competitions,'[]'::jsonb),true);
  v := jsonb_set(v,'{guided,football,automaticProductionAvailable}',to_jsonb(v_football_production_ready),true);
  v := jsonb_set(v,'{guided,football,automaticSourceName}',
    to_jsonb('Football-Data.org + TheSportsDB'::text),true);

  select exists(select 1 from integration.providers where code='TAVILY' and environment='PRODUCTION' and status in('ACTIVE','DEGRADED')) into v_tavily;
  select exists(select 1 from integration.providers where code='PUBLIC_RECORD' and environment='PRODUCTION' and status in('ACTIVE','DEGRADED')) into v_public;
  return jsonb_set(v,'{guided,evidence}',jsonb_build_object(
    'automaticAvailable',v_tavily or v_public,
    'broadSearchAvailable',v_tavily,
    'directPublicRecordAvailable',v_public,
    'automaticSourceName','VAD Evidence Gateway',
    'secretName','TAVILY_API_KEY'
  ),true);
end;
$function$;

create or replace function public.admin_create_football_1x2_market_v1(
  p_sport_code text,
  p_competition_code text,
  p_competition_name text,
  p_provider_competition_code text,
  p_fixture_id text,
  p_home_team text,
  p_away_team text,
  p_match_starts_at timestamptz,
  p_country_code text,
  p_asset_code text,
  p_publish_now boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_sport_code text := upper(btrim(coalesce(p_sport_code,'')));
  v_competition_code text := upper(btrim(coalesce(p_competition_code,'')));
  v_provider_competition_code text := upper(btrim(coalesce(p_provider_competition_code,'')));
  v_fixture_id text := btrim(coalesce(p_fixture_id,''));
  v_home_team text := btrim(coalesce(p_home_team,''));
  v_away_team text := btrim(coalesce(p_away_team,''));
  v_country_code text := upper(btrim(coalesce(p_country_code,'')));
  v_asset_code text := upper(btrim(coalesce(p_asset_code,'')));
  v_competition_name text;
  v_now timestamptz := statement_timestamp();
  v_kickoff timestamptz := p_match_starts_at;
  v_resolves_after timestamptz;
  v_fixture_key text;
  v_title text;
  v_description text;
  v_resolution_instructions text;
  v_asset public.assets;
  v_policy oracle.policies;
  v_football_provider_id bigint;
  v_thesportsdb_provider_id bigint;
  v_result jsonb;
  v_event_public_id uuid;
  v_instrument_public_id uuid;
  v_event_id bigint;
  v_instrument_id bigint;
  v_existing_status text;
  v_existing_event_status text;
  v_existing_resolver text;
  v_outcomes jsonb;
  v_event_public_id_existing uuid;
  v_instrument_public_id_existing uuid;
  v_existing_title text;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;

  if v_sport_code <> 'FOOTBALL' then
    raise exception 'This automatic market template is currently configured for football fixtures only.' using errcode='22023';
  end if;
  if v_competition_code = '' or v_provider_competition_code = '' or v_fixture_id = ''
     or v_home_team = '' or v_away_team = '' or lower(v_home_team)=lower(v_away_team) then
    raise exception 'A mapped competition, provider fixture ID, home team and away team are required.' using errcode='22023';
  end if;
  if v_fixture_id !~ '^[0-9]+$' then
    raise exception 'The fixture ID does not match the configured Football-Data provider.' using errcode='22023';
  end if;
  if v_kickoff is null or v_kickoff <= v_now + interval '5 minutes' then
    raise exception 'This fixture is too close to kickoff or has already started. Only upcoming fixtures with at least five minutes of trading time can be published.' using errcode='22023';
  end if;
  if v_country_code = '' or v_asset_code not in ('NGN','USDC') then
    raise exception 'Choose an eligible jurisdiction and NGN or USDC market currency.' using errcode='22023';
  end if;

  select * into v_asset
  from public.assets
  where code=v_asset_code and status='ACTIVE';
  if v_asset.id is null or coalesce(v_asset.metadata->>'sandbox_only','false')='true' then
    raise exception 'This asset is not enabled for production automatic football markets.' using errcode='22023';
  end if;

  select competition.competition_name
    into v_competition_name
  from market.sports_competitions competition
  where competition.sport_code=v_sport_code
    and competition.competition_code=v_competition_code
    and competition.status='ACTIVE'
    and competition.result_mode='AUTOMATIC'
    and competition.provider_code='FOOTBALL_DATA'
    and upper(competition.provider_competition_code)=v_provider_competition_code;
  if v_competition_name is null then
    raise exception 'This competition is not mapped to the active automatic Football-Data fixture source.' using errcode='P0001';
  end if;

  select * into v_policy
  from oracle.policies policy
  where policy.name='VAD Football Match Result Production Policy'
    and policy.status='ACTIVE'
    and policy.approved_by is not null
    and policy.effective_at<=v_now
    and policy.consensus_rule @> '{
      "environment":"PRODUCTION",
      "finalization_mode":"AUTO_AFTER_DISPUTE_WINDOW",
      "distinct_providers":true,
      "min_agreeing_providers":2
    }'::jsonb
    and exists (
      select 1 from jsonb_array_elements(policy.source_hierarchy) source
      where upper(coalesce(source->>'provider_code',source->>'providerCode',''))='FOOTBALL_DATA'
    )
    and exists (
      select 1 from jsonb_array_elements(policy.source_hierarchy) source
      where upper(coalesce(source->>'provider_code',source->>'providerCode',''))='THESPORTSDB'
    )
  order by policy.version desc,policy.effective_at desc
  limit 1
  for share;
  if v_policy.id is null then
    raise exception 'Automatic football publishing needs the one-time production policy approval. Open Admin → Oracle Policies and approve “VAD Football Match Result Production Policy”; individual match results will then resolve automatically from two sources.' using errcode='P0001';
  end if;

  select provider.id into v_football_provider_id
  from integration.providers provider
  where provider.code='FOOTBALL_DATA'
    and provider.provider_type='ORACLE'
    and provider.environment='PRODUCTION'
    and provider.status in ('ACTIVE','DEGRADED')
    and coalesce((provider.public_metadata->>'configured')::boolean,false)
    and provider.capabilities @> '["FOOTBALL_MATCH_RESULT"]'::jsonb
    and coalesce((
      select health.status from integration.provider_health health
      where health.provider_id=provider.id
      order by health.checked_at desc nulls last limit 1
    ),'UNKNOWN')<>'UNAVAILABLE'
  order by provider.priority,provider.id
  limit 1;

  select provider.id into v_thesportsdb_provider_id
  from integration.providers provider
  where provider.code='THESPORTSDB'
    and provider.provider_type='ORACLE'
    and provider.environment='PRODUCTION'
    and provider.status in ('ACTIVE','DEGRADED')
    and coalesce((provider.public_metadata->>'configured')::boolean,false)
    and provider.capabilities @> '["FOOTBALL_MATCH_RESULT"]'::jsonb
    and coalesce((
      select health.status from integration.provider_health health
      where health.provider_id=provider.id
      order by health.checked_at desc nulls last limit 1
    ),'UNKNOWN')<>'UNAVAILABLE'
  order by provider.priority,provider.id
  limit 1;

  if v_football_provider_id is null or v_thesportsdb_provider_id is null then
    raise exception 'Both configured result providers must be active before VAD can publish an automatically resolved real-money football market.' using errcode='P0001';
  end if;

  v_resolves_after := v_kickoff + interval '3 hours';
  v_fixture_key := v_sport_code || '|' || v_competition_code || '|' || v_fixture_id || '|'
    || v_asset_code || '|' || to_char(v_kickoff at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_title := 'What will be the full-time result of ' || v_home_team || ' vs ' || v_away_team
    || ' in ' || v_competition_name || '?';
  v_description := 'Automatically generated from the mapped ' || v_competition_name
    || ' fixture. Kickoff is stored as a UTC instant and displayed in the device time zone. '
    || 'Trading closes at the scheduled kickoff; result evaluation begins after full time.';
  v_resolution_instructions := 'Use the official full-time match result including stoppage time. '
    || 'HOME means ' || v_home_team || ' wins; DRAW means the teams finish level; AWAY means '
    || v_away_team || ' wins. Two independent configured result providers must agree on one '
    || 'configured outcome. A non-final, postponed or conflicting source response is not a result; '
    || 'leave settlement pending until the configured resolution/cancellation rule is satisfied.';

  -- Idempotency is keyed to provider fixture, competition, kickoff instant and asset.
  select event.public_id,instrument.public_id,instrument.status,event.status,
         event.resolution_scope->>'resolver_type',event.title
    into v_event_public_id_existing,v_instrument_public_id_existing,
         v_existing_status,v_existing_event_status,v_existing_resolver,v_existing_title
  from market.canonical_events event
  join market.instruments instrument on instrument.canonical_event_id=event.id
  join public.assets asset on asset.id=instrument.asset_id
  where event.normalized_parameters->>'fixture_key'=v_fixture_key
    and asset.code=v_asset_code
  for update of event,instrument;

  if v_event_public_id_existing is not null then
    if v_existing_resolver is distinct from 'FOOTBALL_MATCH_RESULT_V1' then
      raise exception 'A market already exists for this fixture but is not on the automatic result resolver. Do not publish a duplicate; migrate or close the existing market first.' using errcode='P0001';
    end if;
    if v_existing_status='OPEN' and v_existing_event_status='OPEN' then
      return jsonb_build_object(
        'status','ALREADY_PUBLISHED',
        'eventId',v_event_public_id_existing,
        'instrumentId',v_instrument_public_id_existing,
        'title',v_existing_title,
        'opensAt',v_now,
        'closesAt',v_kickoff,
        'resolvesAfter',v_resolves_after,
        'outcomes',coalesce((
          select jsonb_agg(jsonb_build_object('code',outcome.code,'label',outcome.label) order by outcome.display_order)
          from market.instruments instrument join market.outcomes outcome on outcome.instrument_id=instrument.id
          where instrument.public_id=v_instrument_public_id_existing
        ),'[]'::jsonb)
      );
    end if;
    raise exception 'A scheduled market already exists for this fixture. Open it to check its current publication status.' using errcode='P0001';
  end if;

  v_result := public.admin_create_multi_outcome_market_v1(
    v_title,
    v_description,
    'SPORTS',
    jsonb_build_array(v_home_team,'Draw',v_away_team),
    v_resolution_instructions,
    'Football-Data.org + TheSportsDB',
    'https://www.football-data.org/',
    v_now,
    v_kickoff,
    v_resolves_after,
    v_country_code,
    v_asset_code,
    false
  );

  v_event_public_id := nullif(v_result->>'event_id','')::uuid;
  v_instrument_public_id := nullif(v_result->>'instrument_id','')::uuid;
  if v_event_public_id is null or v_instrument_public_id is null then
    raise exception 'VAD returned an incomplete draft while creating the automatic football market.' using errcode='P0001';
  end if;

  select event.id,instrument.id
    into v_event_id,v_instrument_id
  from market.canonical_events event
  join market.instruments instrument on instrument.canonical_event_id=event.id
  where event.public_id=v_event_public_id
    and instrument.public_id=v_instrument_public_id
  for update of event,instrument;
  if v_event_id is null or v_instrument_id is null then
    raise exception 'The created fixture market could not be found.' using errcode='P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code',outcome.code,'label',outcome.label,'displayOrder',outcome.display_order
  ) order by outcome.display_order),'[]'::jsonb)
  into v_outcomes
  from market.outcomes outcome
  where outcome.instrument_id=v_instrument_id;
  if jsonb_array_length(v_outcomes)<>3 then
    raise exception 'A football 1X2 market must have exactly Home, Draw and Away outcomes.' using errcode='23514';
  end if;

  update market.canonical_events event
  set resolution_scope = coalesce(event.resolution_scope,'{}'::jsonb) || jsonb_build_object(
        'resolver_type','FOOTBALL_MATCH_RESULT_V1',
        'condition','THREE_WAY',
        'event_type','FOOTBALL_MATCH',
        'market_format','MULTI_OUTCOME',
        'subject',jsonb_build_object(
          'sport','FOOTBALL',
          'competition',v_competition_name,
          'home_team',v_home_team,
          'away_team',v_away_team,
          'match_starts_at',v_kickoff
        ),
        'match_starts_at',v_kickoff,
        'source_name','Football-Data.org + TheSportsDB',
        'source_url','https://www.football-data.org/',
        'outcome_options',v_outcomes,
        'verification','Two independent provider results must agree on the configured full-time outcome.',
        'market_question',v_title,
        'configured_by','ADMIN_COMPETITION_AUTOPUBLISH'
      ),
      normalized_parameters = coalesce(event.normalized_parameters,'{}'::jsonb) || jsonb_build_object(
        'fixture_key',v_fixture_key,
        'fixture_id',v_fixture_id,
        'time_scope',v_kickoff,
        'category','SPORTS',
        'fixture_provider','FOOTBALL_DATA',
        'timezone_contract','UTC_INSTANT'
      ),
      resolves_after=v_resolves_after,
      updated_at=statement_timestamp()
  where event.id=v_event_id;

  insert into oracle.event_policy_bindings(event_id,oracle_policy_id,bound_at,bound_by)
  values(v_event_id,v_policy.id,statement_timestamp(),auth.uid())
  on conflict(event_id) do update set
    oracle_policy_id=excluded.oracle_policy_id,
    bound_at=excluded.bound_at,
    bound_by=excluded.bound_by;

  insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
  values(
    v_football_provider_id,'CANONICAL_EVENT',v_event_public_id::text,'AUTO','ACTIVE',
    jsonb_build_object(
      'lookup_mode','COMPETITION_DAY_TEAMS',
      'competition_code',v_provider_competition_code,
      'competition_name',v_competition_name,
      'home_team',v_home_team,
      'away_team',v_away_team,
      'match_starts_at',v_kickoff,
      'football_data_fixture_id',v_fixture_id,
      'result_source','Football-Data.org',
      'configured_by','ADMIN_COMPETITION_AUTOPUBLISH',
      'updated_by',auth.uid()
    )
  )
  on conflict(provider_id,resource_type,canonical_key) do update set
    external_key=excluded.external_key,status='ACTIVE',metadata=excluded.metadata,updated_at=statement_timestamp();

  insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
  values(
    v_thesportsdb_provider_id,'CANONICAL_EVENT',v_event_public_id::text,'AUTO','ACTIVE',
    jsonb_build_object(
      'lookup_mode','TEAM_DATE_LOOKUP',
      'competition_code',v_provider_competition_code,
      'competition_name',v_competition_name,
      'home_team',v_home_team,
      'away_team',v_away_team,
      'match_starts_at',v_kickoff,
      'result_source','TheSportsDB',
      'configured_by','ADMIN_COMPETITION_AUTOPUBLISH',
      'updated_by',auth.uid()
    )
  )
  on conflict(provider_id,resource_type,canonical_key) do update set
    external_key=excluded.external_key,status='ACTIVE',metadata=excluded.metadata,updated_at=statement_timestamp();

  perform command.refresh_market_catalog(v_instrument_id);

  if coalesce(p_publish_now,true) then
    if v_kickoff <= statement_timestamp() then
      raise exception 'The fixture kickoff has passed; the market was not published.' using errcode='22023';
    end if;
    perform public.admin_publish_market(
      v_instrument_public_id,
      100,
      'Automatically published from the configured football competition and verified fixture feed'
    );
  end if;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(
    auth.uid(),'ADMIN','FOOTBALL_1X2_AUTOMATIC_MARKET_CREATED','MARKET_INSTRUMENT',
    v_instrument_public_id::text,
    'Published a fixed-template Home/Draw/Away market from the configured competition fixture feed.',
    jsonb_build_object(
      'event_id',v_event_public_id,
      'fixture_id',v_fixture_id,
      'competition_code',v_competition_code,
      'provider_competition_code',v_provider_competition_code,
      'kickoff_utc',v_kickoff,
      'resolution_policy',v_policy.public_id,
      'result_sources',jsonb_build_array('FOOTBALL_DATA','THESPORTSDB'),
      'asset_code',v_asset_code,
      'country_code',v_country_code
    )
  );

  return jsonb_build_object(
    'status',case when coalesce(p_publish_now,true) then 'PUBLISHED' else 'ALREADY_EXISTS' end,
    'eventId',v_event_public_id,
    'instrumentId',v_instrument_public_id,
    'title',v_title,
    'opensAt',v_now,
    'closesAt',v_kickoff,
    'resolvesAfter',v_resolves_after,
    'outcomes',v_outcomes,
    'resultSources',jsonb_build_array('FOOTBALL_DATA','THESPORTSDB')
  );
end;
$function$;

revoke all on function public.admin_create_football_1x2_market_v1(text,text,text,text,text,text,text,timestamptz,text,text,boolean) from public,anon;
grant execute on function public.admin_create_football_1x2_market_v1(text,text,text,text,text,text,text,timestamptz,text,text,boolean) to authenticated;

commit;
