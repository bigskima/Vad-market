-- Friendly football setup: admins choose competition, teams and match time.
-- VAD stores provider competition mappings and discovers the fixture with one
-- Football-Data request when the result is due.

insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
select p.id,'SPORTS_COMPETITION',v.canonical_key,v.external_key,'ACTIVE',v.metadata
from integration.providers p
cross join (values
  ('FOOTBALL:CL','CL',jsonb_build_object('display_name','UEFA Champions League','aliases',jsonb_build_array('Champions League','UEFA Champions League','UCL'),'free_tier',true)),
  ('FOOTBALL:PPL','PPL',jsonb_build_object('display_name','Primeira Liga','aliases',jsonb_build_array('Primeira Liga','Liga Portugal'),'free_tier',true)),
  ('FOOTBALL:PL','PL',jsonb_build_object('display_name','Premier League','aliases',jsonb_build_array('Premier League','English Premier League','EPL'),'free_tier',true)),
  ('FOOTBALL:DED','DED',jsonb_build_object('display_name','Eredivisie','aliases',jsonb_build_array('Eredivisie'),'free_tier',true)),
  ('FOOTBALL:BL1','BL1',jsonb_build_object('display_name','Bundesliga','aliases',jsonb_build_array('Bundesliga','German Bundesliga'),'free_tier',true)),
  ('FOOTBALL:FL1','FL1',jsonb_build_object('display_name','Ligue 1','aliases',jsonb_build_array('Ligue 1'),'free_tier',true)),
  ('FOOTBALL:SA','SA',jsonb_build_object('display_name','Serie A (Italy)','aliases',jsonb_build_array('Serie A','Italian Serie A','Serie A Italy'),'free_tier',true)),
  ('FOOTBALL:PD','PD',jsonb_build_object('display_name','La Liga','aliases',jsonb_build_array('La Liga','Primera Division','Primera División'),'free_tier',true)),
  ('FOOTBALL:ELC','ELC',jsonb_build_object('display_name','EFL Championship','aliases',jsonb_build_array('Championship','EFL Championship','English Championship'),'free_tier',true)),
  ('FOOTBALL:BSA','BSA',jsonb_build_object('display_name','Campeonato Brasileiro Série A','aliases',jsonb_build_array('Brasileirao Serie A','Brasileirão Série A','Brazil Serie A','Campeonato Brasileiro Serie A','Campeonato Brasileiro Série A'),'free_tier',true)),
  ('FOOTBALL:WC','WC',jsonb_build_object('display_name','FIFA World Cup','aliases',jsonb_build_array('World Cup','FIFA World Cup'),'free_tier',true)),
  ('FOOTBALL:EC','EC',jsonb_build_object('display_name','European Championship','aliases',jsonb_build_array('European Championship','Euros','UEFA European Championship'),'free_tier',true))
) as v(canonical_key,external_key,metadata)
where p.code='FOOTBALL_DATA' and p.environment='PRODUCTION' and p.provider_type='ORACLE'
on conflict(provider_id,resource_type,canonical_key) do update set
  external_key=excluded.external_key,
  status='ACTIVE',
  metadata=excluded.metadata,
  updated_at=statement_timestamp();

create or replace function public.admin_market_approval_options()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  result jsonb;
  football_sandbox boolean;
  football_production boolean;
begin
  if not private.has_permission('markets.manage') then
    raise exception 'Permission required' using errcode='42501';
  end if;

  select exists(
    select 1 from oracle.policies p
    where p.status='ACTIVE' and p.effective_at<=statement_timestamp()
      and upper(coalesce(p.consensus_rule->>'environment',''))='SANDBOX'
      and exists(select 1 from jsonb_array_elements(p.source_hierarchy) h where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='FOOTBALL_DATA')
  ) into football_sandbox;

  select exists(
    select 1 from oracle.policies p
    where p.status='ACTIVE' and p.effective_at<=statement_timestamp()
      and upper(coalesce(p.consensus_rule->>'environment','PRODUCTION'))<>'SANDBOX'
      and exists(select 1 from jsonb_array_elements(p.source_hierarchy) h where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='FOOTBALL_DATA')
  ) into football_production;

  select jsonb_build_object(
    'templates',coalesce((select jsonb_agg(jsonb_build_object('code',t.code,'name',t.name) order by t.code) from market.templates t where t.status='ACTIVE'),'[]'::jsonb),
    'oraclePolicies',coalesce((select jsonb_agg(jsonb_build_object('publicId',p.public_id,'name',p.name,'version',p.version) order by p.name,p.version desc) from oracle.policies p where p.status='ACTIVE' and p.effective_at<=statement_timestamp()),'[]'::jsonb),
    'jurisdictions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'countryCode',j.country_code,
        'name',j.name,
        'assets',coalesce((select jsonb_agg(a.code order by a.code) from public.jurisdiction_assets ja join public.assets a on a.id=ja.asset_id where ja.jurisdiction_id=j.id and ja.status='ACTIVE' and a.status='ACTIVE'),'[]'::jsonb)
      ) order by j.country_code)
      from public.jurisdictions j where j.status='ACTIVE'
    ),'[]'::jsonb),
    'guided',jsonb_build_object(
      'verifiedResultAvailable',true,
      'football',jsonb_build_object(
        'automaticSourceName','Football-Data.org',
        'automaticSandboxAvailable',football_sandbox,
        'automaticProductionAvailable',football_production,
        'competitions',coalesce((
          select jsonb_agg(distinct pr.metadata->>'display_name' order by pr.metadata->>'display_name')
          from oracle.provider_resources pr
          join integration.providers ip on ip.id=pr.provider_id
          where ip.code='FOOTBALL_DATA' and ip.environment='PRODUCTION'
            and pr.resource_type='SPORTS_COMPETITION' and pr.status='ACTIVE'
            and coalesce((pr.metadata->>'free_tier')::boolean,false)
        ),'[]'::jsonb)
      )
    )
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_create_guided_market_v2(
  p_title text,
  p_description text,
  p_category text,
  p_market_setup jsonb,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_resolves_after timestamptz,
  p_country_code text,
  p_asset_code text,
  p_publish_now boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_setup jsonb:=coalesce(p_market_setup,'{}'::jsonb);
  v_kind text:=upper(btrim(coalesce(p_market_setup->>'kind','')));
  v_checking text:=upper(btrim(coalesce(p_market_setup->>'result_checking','VERIFIED')));
  v_title text:=btrim(coalesce(p_title,''));
  v_category text:=upper(btrim(coalesce(p_category,'')));
  v_competition_input text:=btrim(coalesce(p_market_setup->>'competition',''));
  v_competition_name text;
  v_competition_code text;
  v_home_team text:=btrim(coalesce(p_market_setup->>'home_team',''));
  v_away_team text:=btrim(coalesce(p_market_setup->>'away_team',''));
  v_prediction text:=upper(btrim(coalesce(p_market_setup->>'prediction','')));
  v_match_starts_at timestamptz;
  v_asset public.assets;
  v_is_sandbox boolean:=false;
  v_provider_id bigint;
  v_policy_public_id uuid;
  v_template_code text;
  v_scope jsonb;
  v_normalized jsonb;
  v_proposal_public_id uuid;
  v_result jsonb;
  v_event_public_id uuid;
  v_instrument_public_id uuid;
begin
  if v_kind<>'FOOTBALL_MATCH' or v_checking<>'AUTOMATIC' then
    return public.admin_create_guided_market(
      p_title,p_description,p_category,p_market_setup,p_opens_at,p_closes_at,p_resolves_after,
      p_country_code,p_asset_code,p_publish_now
    );
  end if;

  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if v_title='' or v_category<>'SPORTS' then
    raise exception 'Add a clear football market question and choose Sports.' using errcode='22023';
  end if;
  if v_competition_input='' or v_home_team='' or v_away_team='' then
    raise exception 'Competition, home team and away team are required.' using errcode='22023';
  end if;
  if v_prediction not in ('HOME_WIN','DRAW','AWAY_WIN') then
    raise exception 'Choose Home team wins, Draw or Away team wins.' using errcode='22023';
  end if;
  begin
    v_match_starts_at:=(v_setup->>'match_starts_at')::timestamptz;
  exception when others then
    v_match_starts_at:=null;
  end;
  if v_match_starts_at is null then
    raise exception 'Choose the match start time.' using errcode='22023';
  end if;
  if p_opens_at is null or p_closes_at is null or p_resolves_after is null or p_closes_at<=p_opens_at then
    raise exception 'Choose valid opening, closing and result-checking times.' using errcode='22023';
  end if;
  if p_closes_at>v_match_starts_at then
    raise exception 'For a match-result market, trading must close no later than the match start.' using errcode='22023';
  end if;
  if p_resolves_after < v_match_starts_at + interval '2 hours' then
    raise exception 'Choose a result-checking time at least two hours after the match starts so VAD does not check before the final result is likely available.' using errcode='22023';
  end if;
  if coalesce(p_publish_now,false) and p_opens_at>statement_timestamp() then
    raise exception 'Publish now is only available when the opening time has started. Choose Save as draft for a future opening time.' using errcode='22023';
  end if;

  select * into v_asset from public.assets where code=upper(btrim(p_asset_code)) and status='ACTIVE';
  if v_asset.id is null then raise exception 'Selected market currency is unavailable' using errcode='P0002'; end if;
  v_is_sandbox:=coalesce((v_asset.metadata->>'sandbox_only')::boolean,false);

  select pr.provider_id,pr.external_key,pr.metadata->>'display_name'
  into v_provider_id,v_competition_code,v_competition_name
  from oracle.provider_resources pr
  join integration.providers ip on ip.id=pr.provider_id
  where ip.code='FOOTBALL_DATA' and ip.environment='PRODUCTION' and ip.provider_type='ORACLE'
    and ip.status in ('ACTIVE','DEGRADED')
    and pr.resource_type='SPORTS_COMPETITION' and pr.status='ACTIVE'
    and (
      upper(pr.external_key)=upper(v_competition_input)
      or lower(coalesce(pr.metadata->>'display_name',''))=lower(v_competition_input)
      or exists(
        select 1 from jsonb_array_elements_text(coalesce(pr.metadata->'aliases','[]'::jsonb)) a
        where lower(a)=lower(v_competition_input)
      )
    )
  order by case when lower(coalesce(pr.metadata->>'display_name',''))=lower(v_competition_input) then 0 else 1 end,pr.id
  limit 1;

  if v_provider_id is null then
    raise exception 'Automatic results are not available for that competition on the connected football plan. Choose one of the suggested competitions or use Verified result.' using errcode='P0001';
  end if;

  select p.public_id into v_policy_public_id
  from oracle.policies p
  where p.status='ACTIVE' and p.effective_at<=statement_timestamp()
    and exists(select 1 from jsonb_array_elements(p.source_hierarchy) h where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='FOOTBALL_DATA')
    and ((v_is_sandbox and upper(coalesce(p.consensus_rule->>'environment',''))='SANDBOX')
      or (not v_is_sandbox and upper(coalesce(p.consensus_rule->>'environment','PRODUCTION'))<>'SANDBOX'))
  order by p.effective_at desc,p.version desc limit 1;
  if v_policy_public_id is null then
    raise exception 'Automatic football results are not enabled for this market currency yet. Choose Verified result instead.' using errcode='P0001';
  end if;

  select t.code into v_template_code from market.templates t where t.status='ACTIVE' and t.code='BINARY_EVENT' limit 1;
  if v_template_code is null then
    select t.code into v_template_code from market.templates t where t.status='ACTIVE' order by t.id limit 1;
  end if;
  if v_template_code is null then raise exception 'No active market format is available' using errcode='P0001'; end if;

  v_scope:=jsonb_build_object(
    'resolver_type','FOOTBALL_MATCH_RESULT_V1',
    'condition',v_prediction,
    'event_type','FOOTBALL_MATCH',
    'subject',jsonb_build_object(
      'sport','FOOTBALL','competition',v_competition_name,'home_team',v_home_team,
      'away_team',v_away_team,'match_starts_at',v_match_starts_at
    ),
    'verification','Automatic final match result',
    'source_name','Football-Data.org',
    'market_question',v_title,
    'configured_by','ADMIN_GUIDED'
  );

  insert into market.proposals(
    proposer_user_id,raw_question,raw_context,normalized_payload,status,admission_lane,
    admission_confidence,decision_reason,admission_evaluated_at
  ) values(
    auth.uid(),v_title,nullif(btrim(coalesce(p_description,'')),''),
    jsonb_build_object(
      'submitted_category',v_category,'requested_asset_code',upper(btrim(p_asset_code)),
      'admin_created',true,'guided_creation',true,'guided_setup',v_setup,
      'ai_admission',jsonb_build_object('resolutionScope',v_scope)
    ),
    'UNDER_REVIEW','UNDER_REVIEW',1,'Created from guided VAD admin market setup',statement_timestamp()
  ) returning public_id into v_proposal_public_id;

  v_normalized:=jsonb_build_object(
    'subject',v_title,'time_scope',p_closes_at,'category',v_category,
    'configured_by','ADMIN_GUIDED','guided_setup',v_setup
  );

  v_result:=public.admin_approve_market_proposal(
    v_proposal_public_id,v_template_code,v_title,coalesce(p_description,''),v_category,
    v_normalized,v_scope,p_opens_at,p_closes_at,p_resolves_after,v_policy_public_id,
    upper(btrim(p_country_code)),upper(btrim(p_asset_code)),100::numeric,4::smallint
  );

  v_event_public_id:=nullif(v_result->>'event_id','')::uuid;
  v_instrument_public_id:=nullif(v_result->>'instrument_id','')::uuid;
  if v_event_public_id is null or v_instrument_public_id is null then
    raise exception 'The market was created without a usable market record' using errcode='P0001';
  end if;

  insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
  values(
    v_provider_id,'CANONICAL_EVENT',v_event_public_id::text,'AUTO','ACTIVE',
    jsonb_build_object(
      'lookup_mode','COMPETITION_DAY_TEAMS','competition_code',v_competition_code,
      'competition_name',v_competition_name,'home_team',v_home_team,'away_team',v_away_team,
      'match_starts_at',v_match_starts_at,'result_source','Football-Data.org',
      'configured_by','ADMIN_GUIDED','updated_by',auth.uid()
    )
  )
  on conflict(provider_id,resource_type,canonical_key) do update set
    external_key=excluded.external_key,status='ACTIVE',metadata=excluded.metadata,updated_at=statement_timestamp();

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(
    auth.uid(),'ADMIN','MARKET_RESULT_SOURCE_CONFIGURED','CANONICAL_EVENT',v_event_public_id::text,
    'Automatic football result checking configured from guided market creation',
    jsonb_build_object('source','Football-Data.org','competition',v_competition_name,'fixture_lookup','COMPETITION_DAY_TEAMS')
  );

  if coalesce(p_publish_now,false) then
    perform public.admin_publish_market(v_instrument_public_id,100,'Published during guided admin market creation');
    v_result:=v_result||jsonb_build_object('publication_status','PUBLISHED');
  else
    v_result:=v_result||jsonb_build_object('publication_status','DRAFT');
  end if;

  return v_result||jsonb_build_object(
    'proposal_id',v_proposal_public_id,'admin_created',true,'creation_style','GUIDED',
    'market_kind','FOOTBALL_MATCH','result_checking','AUTOMATIC','result_source','Football-Data.org',
    'competition',v_competition_name
  );
end;
$$;

revoke all on function public.admin_create_guided_market_v2(text,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,text,boolean) from public,anon;
grant execute on function public.admin_create_guided_market_v2(text,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,text,boolean) to authenticated;
