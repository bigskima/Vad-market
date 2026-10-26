-- Category-aware deterministic sports resolution using VAD's existing oracle and settlement pipeline.
-- New sports markets use independent match-data sources; policy activation is an explicit
-- one-time governance action, not a manual outcome review for each fixture.

begin;

-- Create an auditable policy draft. It stays inactive until an authorized oracle reviewer
-- approves it through the existing Admin Oracle Policies workflow.
insert into oracle.policies(
  name, capability_id, version, source_hierarchy, consensus_rule, close_rule,
  postponement_rule, cancellation_rule, void_rule, dispute_window_seconds,
  status, effective_at, created_by, approved_by
)
select
  'VAD Football Verified Match Result Policy',
  c.id,
  1,
  jsonb_build_array(
    jsonb_build_object('role','PRIMARY','provider_code','FOOTBALL_DATA','priority',10),
    jsonb_build_object('role','CORROBORATING','provider_code','THESPORTSDB','priority',20)
  ),
  jsonb_build_object(
    'environment','PRODUCTION',
    'tie_behavior','NO_RESOLUTION',
    'finalization_mode','AUTO_AFTER_DISPUTE_WINDOW',
    'distinct_providers',true,
    'min_agreeing_providers',2
  ),
  jsonb_build_object('mode','CLOSE_AT_CONFIGURED_TIME'),
  jsonb_build_object('mode','WAIT_FOR_OFFICIAL_FINAL_RESULT'),
  jsonb_build_object('mode','USE_PUBLISHED_VOID_RULE'),
  jsonb_build_object('mode','EQUAL_SPLIT'),
  120,
  'DRAFT',
  statement_timestamp(),
  null,
  null
from oracle.capabilities c
where c.code='OBJECTIVE_EVENT_RESULT'
  and not exists (
    select 1 from oracle.policies p
    where p.name='VAD Football Verified Match Result Policy' and p.version=1
  );

CREATE OR REPLACE FUNCTION private.derive_market_resolution_scope(p_proposal market.proposals, p_title text, p_category text, p_resolves_after timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_scope jsonb;
  v_category text:=upper(btrim(coalesce(p_category,'')));
  v_resolver text;
  v_title text:=btrim(coalesce(p_title,''));
  v_asset_match text[];
  v_threshold_match text[];
  v_asset text;
  v_operator text;
  v_threshold numeric;
begin
  v_scope:=p_proposal.normalized_payload->'ai_admission'->'resolutionScope';

  if v_scope is null or jsonb_typeof(v_scope) <> 'object' or v_scope='{}'::jsonb then
    if v_category='CRYPTO' then
      v_asset_match:=regexp_match(upper(v_title),'\m(BTC|ETH|USDC)\M');
      v_asset:=case when v_asset_match is not null then v_asset_match[1] else null end;

      if v_title ~* '(at or above|at least)' then
        v_operator:='GTE';
        v_threshold_match:=regexp_match(v_title,'(?:at or above|at least)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)','i');
      elsif v_title ~* '(above|over|greater than)' then
        v_operator:='GT';
        v_threshold_match:=regexp_match(v_title,'(?:above|over|greater than)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)','i');
      elsif v_title ~* '(at or below|at most)' then
        v_operator:='LTE';
        v_threshold_match:=regexp_match(v_title,'(?:at or below|at most)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)','i');
      elsif v_title ~* '(below|under|less than)' then
        v_operator:='LT';
        v_threshold_match:=regexp_match(v_title,'(?:below|under|less than)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)','i');
      end if;

      if v_threshold_match is not null then
        begin
          v_threshold:=replace(v_threshold_match[1],',','')::numeric;
        exception when others then
          v_threshold:=null;
        end;
      end if;

      if v_asset is not null and v_operator is not null and v_threshold is not null and v_threshold>0 then
        return jsonb_build_object(
          'resolver_type','CRYPTO_PRICE_THRESHOLD_V1',
          'asset',v_asset,
          'quote','USD',
          'operator',v_operator,
          'threshold',v_threshold,
          'observation_time',p_resolves_after,
          'category',v_category,
          'market_question',v_title,
          'configured_by','VAD_AUTO'
        );
      end if;
    end if;

    return jsonb_build_object(
      'resolver_type','VAD_REVIEW_V1',
      'condition',format('Resolve YES when authoritative evidence confirms the market proposition: %s',v_title),
      'verification','VAD oracle review using approved authoritative evidence sources.',
      'category',v_category,
      'market_question',v_title,
      'resolution_time',p_resolves_after,
      'configured_by','VAD_AUTO'
    );
  end if;

  v_resolver:=upper(coalesce(v_scope->>'resolver_type',v_scope->>'resolverType',''));
  if v_resolver not in ('CRYPTO_PRICE_THRESHOLD_V1','FOOTBALL_MATCH_RESULT_V1','FOOTBALL_TOTAL_GOALS_THRESHOLD_V1') then
    v_scope:=v_scope || jsonb_build_object(
      'resolver_type','VAD_REVIEW_V1',
      'resolution_time',p_resolves_after,
      'category',v_category
    );
  else
    v_scope:=v_scope || jsonb_build_object(
      'resolution_time',p_resolves_after,
      'category',v_category
    );
  end if;
  return v_scope;
end;
$function$;

-- Validate the policy's data sources and quorum when an administrator approves this draft.
create or replace function private.guard_football_policy_approval()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_min_text text;
begin
  if old.status <> 'DRAFT'
     or new.status <> 'ACTIVE'
     or new.name <> 'VAD Football Verified Match Result Policy' then
    return new;
  end if;

  if upper(coalesce(new.consensus_rule->>'environment','')) <> 'PRODUCTION'
     or upper(coalesce(new.consensus_rule->>'finalization_mode','')) <> 'AUTO_AFTER_DISPUTE_WINDOW'
     or coalesce(new.consensus_rule->>'distinct_providers','false') <> 'true'
     or coalesce(new.void_rule->>'mode','') <> 'EQUAL_SPLIT' then
    raise exception 'Football resolution policy needs production mode, distinct-source consensus, automatic dispute-window finalization, and equal-split voids.' using errcode='22023';
  end if;
  v_min_text := coalesce(new.consensus_rule->>'min_agreeing_providers','');
  if v_min_text !~ '^[0-9]+$' or v_min_text::integer < 2 then
    raise exception 'Football resolution policy must require at least two independent providers.' using errcode='22023';
  end if;
  if jsonb_typeof(new.source_hierarchy) is distinct from 'array'
     or jsonb_array_length(new.source_hierarchy) <> 2
     or not exists (
       select 1 from jsonb_array_elements(new.source_hierarchy) item
       where upper(coalesce(item->>'provider_code',item->>'providerCode',''))='FOOTBALL_DATA'
         and upper(coalesce(item->>'role',''))='PRIMARY'
     )
     or not exists (
       select 1 from jsonb_array_elements(new.source_hierarchy) item
       where upper(coalesce(item->>'provider_code',item->>'providerCode',''))='THESPORTSDB'
         and upper(coalesce(item->>'role',''))='CORROBORATING'
     ) then
    raise exception 'Football policy must use Football-Data.org as primary and TheSportsDB as the independent corroborating source.' using errcode='22023';
  end if;

  if not exists (
    select 1 from integration.providers p
    where p.code='FOOTBALL_DATA'
      and p.provider_type='ORACLE'
      and p.environment='PRODUCTION'
      and p.status='ACTIVE'
      and p.public_metadata->>'base_url'='https://api.football-data.org/v4'
      and coalesce((p.public_metadata->>'configured')::boolean,false)
      and p.secret_reference is not null
      and p.capabilities @> '["FOOTBALL_MATCH_RESULT"]'::jsonb
  ) then
    raise exception 'Football-Data.org must be active and configured before the football resolution policy can be approved.' using errcode='P0001';
  end if;
  if not exists (
    select 1 from integration.providers p
    where p.code='THESPORTSDB'
      and p.provider_type='ORACLE'
      and p.environment='PRODUCTION'
      and p.status='ACTIVE'
      and p.public_metadata->>'base_url'='https://www.thesportsdb.com/api/v1/json/123'
      and coalesce((p.public_metadata->>'configured')::boolean,false)
      and p.capabilities @> '["FOOTBALL_MATCH_RESULT"]'::jsonb
  ) then
    raise exception 'The configured secondary sports result provider must be active before this policy can be approved.' using errcode='P0001';
  end if;

  return new;
end;
$function$;

drop trigger if exists vad_sports_policy_approval_guard on oracle.policies;
create trigger vad_sports_policy_approval_guard
before update on oracle.policies
for each row execute function private.guard_football_policy_approval();

-- Route objective sports bindings to the approved two-source policy. If the policy is still
-- a draft, new real-asset markets cannot be published with a disconnected settlement route.
create or replace function private.route_vad_sports_resolution_policy()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_scope jsonb;
  v_event_public_id uuid;
  v_has_real_asset boolean;
  v_policy_id bigint;
  v_before_policy_id bigint := new.oracle_policy_id;
begin
  select e.resolution_scope,e.public_id
    into v_scope,v_event_public_id
  from market.canonical_events e
  where e.id=new.event_id;

  if upper(coalesce(v_scope->>'resolver_type','')) not in (
    'FOOTBALL_MATCH_RESULT_V1','FOOTBALL_TOTAL_GOALS_THRESHOLD_V1'
  ) then
    return new;
  end if;

  select exists (
    select 1
    from market.instruments i
    join public.assets a on a.id=i.asset_id
    where i.canonical_event_id=new.event_id
      and upper(a.code)<>'TNGN'
      and not coalesce((a.metadata->>'sandbox_only')::boolean,false)
  ) into v_has_real_asset;

  if not coalesce(v_has_real_asset,false) then
    return new;
  end if;

  select p.id into v_policy_id
  from oracle.policies p
  where p.status='ACTIVE'
    and p.approved_by is not null
    and p.effective_at<=statement_timestamp()
    and upper(coalesce(p.consensus_rule->>'environment','PRODUCTION'))='PRODUCTION'
    and upper(coalesce(p.consensus_rule->>'finalization_mode',''))='AUTO_AFTER_DISPUTE_WINDOW'
    and coalesce(p.void_rule->>'mode','')='EQUAL_SPLIT'
    and coalesce(p.consensus_rule->>'distinct_providers','false')='true'
    and coalesce(p.consensus_rule->>'min_agreeing_providers','') ~ '^[0-9]+$'
    and (p.consensus_rule->>'min_agreeing_providers')::integer>=2
    and exists (
      select 1 from jsonb_array_elements(p.source_hierarchy) h
      where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='FOOTBALL_DATA'
        and upper(coalesce(h->>'role',''))='PRIMARY'
    )
    and exists (
      select 1 from jsonb_array_elements(p.source_hierarchy) h
      where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='THESPORTSDB'
        and upper(coalesce(h->>'role',''))='CORROBORATING'
    )
  order by p.version desc,p.effective_at desc,p.id desc
  limit 1;

  if v_policy_id is null then
    if tg_op='INSERT' then
      raise exception 'Approve the VAD Football Verified Match Result Policy before publishing real-asset automatic sports markets.' using errcode='23514';
    end if;
    return new;
  end if;

  if new.oracle_policy_id is distinct from v_policy_id then
    new.oracle_policy_id:=v_policy_id;
    new.bound_at:=statement_timestamp();
    new.bound_by:=null;
  end if;

  if v_before_policy_id is distinct from v_policy_id then
    insert into audit.records(actor_type,action,resource_type,resource_id,reason,after_state,metadata)
    values(
      'SYSTEM','ORACLE_POLICY_ROUTED_BY_SPORTS_RESOLVER','CANONICAL_EVENT',
      coalesce(v_event_public_id::text,new.event_id::text),
      'Bound an objective football market to the approved independent sports-result policy.',
      jsonb_build_object('oracle_policy_id',v_policy_id),
      jsonb_build_object(
        'previous_policy_id',v_before_policy_id,
        'new_policy_id',v_policy_id,
        'resolver_type',v_scope->>'resolver_type',
        'category',v_scope->>'category'
      )
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists vad_sports_resolution_policy_routing on oracle.event_policy_bindings;
create trigger vad_sports_resolution_policy_routing
before insert or update on oracle.event_policy_bindings
for each row execute function private.route_vad_sports_resolution_policy();

-- An explicit, authorized policy approval activates the route for already-created structured
-- sports markets. Event outcomes are still decided by two source observations, never this trigger.
create or replace function private.bind_approved_sports_resolution_policy()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if old.status<>'DRAFT'
     or new.status<>'ACTIVE'
     or new.approved_by is null
     or new.name<>'VAD Football Verified Match Result Policy' then
    return new;
  end if;

  update oracle.event_policy_bindings b
  set oracle_policy_id=new.id,
      bound_at=statement_timestamp(),
      bound_by=null
  from market.canonical_events e
  where b.event_id=e.id
    and upper(coalesce(e.resolution_scope->>'resolver_type','')) in (
      'FOOTBALL_MATCH_RESULT_V1','FOOTBALL_TOTAL_GOALS_THRESHOLD_V1'
    )
    and e.status in ('OPEN','AWAITING_ORACLE')
    and not exists (
      select 1 from oracle.resolutions r
      where r.event_id=e.id and r.status in ('PROVISIONAL','CONFLICT','FINAL','VOID')
    )
    and exists (
      select 1 from market.instruments i
      join public.assets a on a.id=i.asset_id
      where i.canonical_event_id=e.id
        and upper(a.code)<>'TNGN'
        and not coalesce((a.metadata->>'sandbox_only')::boolean,false)
    )
    and b.oracle_policy_id is distinct from new.id;

  insert into oracle.event_policy_bindings(event_id,oracle_policy_id,bound_by)
  select e.id,new.id,null
  from market.canonical_events e
  where upper(coalesce(e.resolution_scope->>'resolver_type','')) in (
      'FOOTBALL_MATCH_RESULT_V1','FOOTBALL_TOTAL_GOALS_THRESHOLD_V1'
    )
    and e.status in ('OPEN','AWAITING_ORACLE')
    and not exists (
      select 1 from oracle.resolutions r
      where r.event_id=e.id and r.status in ('PROVISIONAL','CONFLICT','FINAL','VOID')
    )
    and exists (
      select 1 from market.instruments i
      join public.assets a on a.id=i.asset_id
      where i.canonical_event_id=e.id
        and upper(a.code)<>'TNGN'
        and not coalesce((a.metadata->>'sandbox_only')::boolean,false)
    )
    and not exists (
      select 1 from oracle.event_policy_bindings b where b.event_id=e.id
    );

  return new;
end;
$function$;

drop trigger if exists vad_sports_policy_activation_rebind on oracle.policies;
create trigger vad_sports_policy_activation_rebind
after update of status on oracle.policies
for each row execute function private.bind_approved_sports_resolution_policy();

-- The runtime proposes a void only when both configured data sources are reachable and both
-- still report a non-final match after a published void deadline. The dispute-window finalizer
-- completes the actual VOID and equal-split ledger settlement.
create or replace function public.internal_queue_deterministic_sports_void_event(
  p_event_id bigint,
  p_evidence jsonb
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_event market.canonical_events;
  v_policy oracle.policies;
  v_deadline timestamptz;
  v_service_state jsonb;
  v_source_count integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if jsonb_typeof(coalesce(p_evidence,'{}'::jsonb))<>'object'
     or jsonb_typeof(coalesce(p_evidence->'source_results','null'::jsonb))<>'array' then
    raise exception 'Deterministic sports void evidence must contain source results.' using errcode='22023';
  end if;

  select * into v_event
  from market.canonical_events
  where id=p_event_id
  for update;
  if v_event.id is null or v_event.status<>'AWAITING_ORACLE' then
    raise exception 'An awaiting-oracle sports event is required.' using errcode='P0001';
  end if;
  if upper(coalesce(v_event.resolution_scope->>'resolver_type','')) not in (
    'FOOTBALL_MATCH_RESULT_V1','FOOTBALL_TOTAL_GOALS_THRESHOLD_V1'
  ) then
    raise exception 'The deterministic sports void path does not apply to this resolver.' using errcode='42501';
  end if;
  if upper(coalesce(v_event.resolution_scope->'void_rule'->>'mode',''))<>'EQUAL_SPLIT' then
    raise exception 'The market has no explicit equal-split void rule.' using errcode='42501';
  end if;

  v_deadline:=coalesce(
    nullif(v_event.resolution_scope->'void_rule'->>'deadline','')::timestamptz,
    nullif(v_event.resolution_scope->>'resolution_deadline','')::timestamptz
  );
  if v_deadline is null or statement_timestamp()<v_deadline then
    raise exception 'The published void deadline has not passed.' using errcode='P0001';
  end if;

  select count(distinct upper(coalesce(source_row.item->>'provider_code','')))::integer
    into v_source_count
  from jsonb_array_elements(p_evidence->'source_results') as source_row(item)
  where upper(coalesce(source_row.item->>'status',''))='SKIPPED'
    and upper(coalesce(source_row.item->>'reason','')) in (
      'MATCH_NOT_FINAL','MATCH_SCHEDULED','MATCH_IN_PLAY','MATCH_PAUSED',
      'MATCH_POSTPONED','MATCH_SUSPENDED','MATCH_DELAYED','MATCH_CANCELLED',
      'MATCH_CANCELED','MATCH_ABANDONED'
    )
    and upper(coalesce(source_row.item->>'provider_code','')) in ('FOOTBALL_DATA','THESPORTSDB');
  if coalesce(v_source_count,0)<2 then
    raise exception 'Two independent configured sports sources must confirm no final result.' using errcode='23514';
  end if;

  if exists (
    select 1 from oracle.disputes d
    where d.event_id=v_event.id and d.status in ('OPEN','UNDER_REVIEW','ESCALATED')
  ) then
    raise exception 'An open dispute prevents automatic void.' using errcode='P0001';
  end if;
  select p.* into v_policy
  from oracle.event_policy_bindings b
  join oracle.policies p on p.id=b.oracle_policy_id
  where b.event_id=v_event.id
    and p.status='ACTIVE' and p.approved_by is not null
    and upper(coalesce(p.consensus_rule->>'environment','PRODUCTION'))='PRODUCTION'
    and upper(coalesce(p.consensus_rule->>'finalization_mode',''))='AUTO_AFTER_DISPUTE_WINDOW'
    and coalesce(p.void_rule->>'mode','')='EQUAL_SPLIT'
    and upper(coalesce(p.consensus_rule->>'distinct_providers','false'))='TRUE'
    and coalesce(p.consensus_rule->>'min_agreeing_providers','') ~ '^[0-9]+$'
    and (p.consensus_rule->>'min_agreeing_providers')::integer>=2
    and exists (
      select 1 from jsonb_array_elements(p.source_hierarchy) h
      where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='FOOTBALL_DATA'
    )
    and exists (
      select 1 from jsonb_array_elements(p.source_hierarchy) h
      where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='THESPORTSDB'
    )
  for update of p;
  if v_policy.id is null then
    raise exception 'An approved two-source production football policy is required.' using errcode='23514';
  end if;

  v_service_state:=private.service_control_state('oracle_resolution',null);
  if not coalesce((v_service_state->>'enabled')::boolean,false) then
    raise exception 'Oracle resolution service is disabled.' using errcode='55000';
  end if;
  if exists (
    select 1 from oracle.resolutions r
    where r.event_id=v_event.id and r.status in ('PROVISIONAL','CONFLICT','FINAL','VOID')
  ) then
    raise exception 'The event already has a resolution.' using errcode='P0001';
  end if;
  if not exists (
    select 1 from market.instruments i
    where i.canonical_event_id=v_event.id and i.status='CLOSED'
      and not exists (select 1 from public.assets a where a.id=i.asset_id and a.code='TNGN')
  ) then
    raise exception 'No eligible closed real-asset instrument is available to void.' using errcode='P0001';
  end if;
  if exists (
    select 1 from market.instruments i
    where i.canonical_event_id=v_event.id
      and i.status in ('DRAFT','OPEN','SUSPENDED')
      and not exists (select 1 from public.assets a where a.id=i.asset_id and a.code='TNGN')
  ) then
    raise exception 'An eligible real-asset instrument is still open.' using errcode='P0001';
  end if;

  insert into oracle.resolutions(
    event_id,oracle_policy_id,outcome_code,status,consensus_evidence,created_by,finalized_at,finalized_by
  ) values (
    v_event.id,v_policy.id,null,'PROVISIONAL',
    coalesce(p_evidence,'{}'::jsonb) || jsonb_build_object(
      'algorithm','DETERMINISTIC_SPORTS_VOID_V1',
      'policy_id',v_policy.public_id,
      'automatic_void',true,
      'void_rule','EQUAL_SPLIT',
      'void_proposed_at',statement_timestamp(),
      'resolution_deadline',v_deadline
    ),
    null,null,null
  );

  update market.canonical_events
  set status='PROVISIONALLY_RESOLVED',updated_at=statement_timestamp()
  where id=v_event.id and status='AWAITING_ORACLE';

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values(
    'ORACLE_VOID_PROPOSED','CANONICAL_EVENT',v_event.public_id::text,
    jsonb_build_object(
      'resolution_status','PROVISIONAL','outcome_code',null,'automatic_void',true,
      'resolution_deadline',v_deadline
    ),
    'oracle-void-proposed:'||v_event.public_id::text
  ) on conflict(idempotency_key) do nothing;

  insert into audit.records(actor_type,action,resource_type,resource_id,reason,after_state,metadata)
  values(
    'SYSTEM','DETERMINISTIC_SPORTS_VOID_PROPOSED','ORACLE_RESOLUTION',v_event.public_id::text,
    'Both independent sports sources reported no final result after the market''s published void deadline; finalization remains subject to the policy dispute window.',
    jsonb_build_object('status','PROVISIONAL','outcome_code',null),
    jsonb_build_object('event_id',v_event.id,'resolution_deadline',v_deadline,'policy_id',v_policy.public_id,'provider_count',v_source_count)
  );
  return true;
end;
$function$;

revoke all on function public.internal_queue_deterministic_sports_void_event(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.internal_queue_deterministic_sports_void_event(bigint,jsonb) to service_role;

-- Existing structured sports markets have explicit fixture metadata. Keep their original
-- resolution prose and outcomes, but store the machine-readable condition needed by the oracle.
update market.canonical_events
set resolution_scope = resolution_scope || jsonb_build_object(
  'resolver_type','FOOTBALL_TOTAL_GOALS_THRESHOLD_V1',
  'condition_code','TOTAL_GOALS_THRESHOLD',
  'target_metric','TOTAL_GOALS',
  'operator','GTE',
  'threshold',3,
  'void_rule',jsonb_build_object(
    'mode','EQUAL_SPLIT',
    'deadline',resolution_scope->>'resolution_deadline'
  )
),
updated_at=statement_timestamp()
where public_id='26ee2166-a915-4fde-bda2-1661fbc456b7'::uuid
  and upper(coalesce(resolution_scope->>'resolver_type',''))='VAD_REVIEW_V1'
  and title ilike '%Inter Milan vs Fiorentina%';

update market.canonical_events
set resolution_scope = resolution_scope || jsonb_build_object(
  'resolver_type','FOOTBALL_MATCH_RESULT_V1',
  'condition_code','TEAM_WIN',
  'target_team','FC Barcelona'
),
updated_at=statement_timestamp()
where public_id='84b9810d-84e0-466c-9f40-561cbaaa9665'::uuid
  and upper(coalesce(resolution_scope->>'resolver_type',''))='VAD_REVIEW_V1';

update market.canonical_events
set resolution_scope = resolution_scope || jsonb_build_object(
  'resolver_type','FOOTBALL_MATCH_RESULT_V1',
  'condition_code','DRAW'
),
updated_at=statement_timestamp()
where public_id='d00e0ecb-5294-448c-8b3b-6690aa71f2cb'::uuid
  and upper(coalesce(resolution_scope->>'resolver_type',''))='VAD_REVIEW_V1';

update market.canonical_events
set resolution_scope = resolution_scope || jsonb_build_object(
  'resolver_type','FOOTBALL_MATCH_RESULT_V1',
  'condition_code','TEAM_WIN',
  'target_team','Manchester United FC'
),
updated_at=statement_timestamp()
where public_id='afafca6d-1afb-404a-9d5f-50618b5cc32f'::uuid
  and upper(coalesce(resolution_scope->>'resolver_type',''))='VAD_REVIEW_V1';

update market.canonical_events
set resolution_scope = resolution_scope || jsonb_build_object(
  'resolver_type','FOOTBALL_MATCH_RESULT_V1',
  'condition_code','TEAM_WIN',
  'target_team','Borussia Mönchengladbach',
  'allow_home_away_flip',true
),
updated_at=statement_timestamp()
where public_id='dccb6a84-d3a9-4d09-ae60-1580965a79bc'::uuid
  and upper(coalesce(resolution_scope->>'resolver_type',''))='VAD_REVIEW_V1';

update market.canonical_events
set resolution_scope = resolution_scope || jsonb_build_object(
  'resolver_type','FOOTBALL_MATCH_RESULT_V1',
  'condition_code','DRAW'
),
updated_at=statement_timestamp()
where public_id='7af64bd2-b954-484f-9a31-0a93e28b3089'::uuid
  and upper(coalesce(resolution_scope->>'resolver_type',''))='VAD_REVIEW_V1';

update market.canonical_events
set resolution_scope = resolution_scope || jsonb_build_object(
  'resolver_type','FOOTBALL_MATCH_RESULT_V1',
  'condition_code','TEAM_WIN',
  'target_team','Aston Villa FC'
),
updated_at=statement_timestamp()
where public_id='05b472d0-2396-4bda-8fee-53c2a043bb26'::uuid
  and upper(coalesce(resolution_scope->>'resolver_type',''))='VAD_REVIEW_V1';

CREATE OR REPLACE FUNCTION oracle.finalize_due_automatic_resolutions(p_limit integer DEFAULT 100)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_service_state jsonb;
  v_row record;
  v_quorum integer;
  v_winning_count integer;
  v_distinct_providers integer;
  v_mismatched_outcomes integer;
  v_finalized integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Finalization limit must be between 1 and 500' using errcode = '22023';
  end if;

  v_service_state := private.service_control_state('oracle_resolution', null);
  if not coalesce((v_service_state->>'enabled')::boolean, false) then
    return 0;
  end if;

  for v_row in
    select
      r.id as resolution_id,
      r.event_id,
      r.outcome_code,
      r.consensus_evidence,
      r.created_at as provisional_at,
      p.id as policy_id,
      p.public_id as policy_public_id,
      p.consensus_rule,
      p.void_rule as policy_void_rule,
      p.dispute_window_seconds,
      e.public_id as event_public_id
    from oracle.resolutions r
    join oracle.policies p on p.id = r.oracle_policy_id
    join market.canonical_events e on e.id = r.event_id
    where r.status = 'PROVISIONAL'
      and r.created_by is null
      and (
        r.outcome_code is not null
        or (
          r.outcome_code is null
          and coalesce(r.consensus_evidence->>'automatic_void','false')='true'
        )
      )
      and p.status = 'ACTIVE'
      and p.approved_by is not null
      and upper(coalesce(p.consensus_rule->>'finalization_mode','')) = 'AUTO_AFTER_DISPUTE_WINDOW'
      and statement_timestamp() >= r.created_at + make_interval(secs => p.dispute_window_seconds)
      and e.status = 'PROVISIONALLY_RESOLVED'
      and coalesce(r.consensus_evidence->>'policy_id','') = p.public_id::text
      and (
        (
          r.outcome_code is not null
          and exists(
            select 1
            from market.instruments i
            join market.outcomes o on o.instrument_id = i.id
            where i.canonical_event_id = r.event_id
              and i.status = 'CLOSED'
              and upper(o.code) = upper(r.outcome_code)
          )
        )
        or (
          r.outcome_code is null
          and coalesce(r.consensus_evidence->>'automatic_void','false')='true'
          and coalesce(p.void_rule->>'mode','')='EQUAL_SPLIT'
          and exists(
            select 1 from market.instruments i
            where i.canonical_event_id=r.event_id and i.status='CLOSED'
              and not exists(select 1 from public.assets a where a.id=i.asset_id and a.code='TNGN')
          )
        )
      )
      and not exists(
        select 1
        from market.instruments i
        where i.canonical_event_id = r.event_id
          and i.status in ('DRAFT','OPEN','SUSPENDED')
      )
      and not exists(
        select 1
        from oracle.disputes d
        where d.resolution_id = r.id
          and d.status in ('OPEN','UNDER_REVIEW','ESCALATED')
      )
    order by r.created_at, r.id
    for update of r skip locked
    limit p_limit
  loop
    -- The event lock is shared with consensus evaluation. Because this is a
    -- try-lock, a finalizer holding a resolution row never waits while holding
    -- it; that breaks the previous event/resolution lock-order deadlock.
    if not pg_try_advisory_xact_lock(
      hashtextextended('vad-oracle-event:' || v_row.event_id::text, 0)
    ) then
      continue;
    end if;

    -- AI-proposed voids remain provisional through the same policy dispute
    -- window as ordinary outcomes. They are finalized here, never by the AI worker.
    if v_row.outcome_code is null
       and coalesce(v_row.consensus_evidence->>'automatic_void','false')='true' then
      if coalesce(v_row.policy_void_rule->>'mode','') <> 'EQUAL_SPLIT' then
        continue;
      end if;

      if coalesce(v_row.consensus_evidence->>'algorithm','') = 'DETERMINISTIC_SPORTS_VOID_V1' then
        if jsonb_typeof(v_row.consensus_evidence->'source_results') <> 'array' then
          continue;
        end if;
        select count(distinct upper(coalesce(source_row.item->>'provider_code','')))::integer
          into v_distinct_providers
        from jsonb_array_elements(v_row.consensus_evidence->'source_results') as source_row(item)
        where upper(coalesce(source_row.item->>'status','')) = 'SKIPPED'
          and upper(coalesce(source_row.item->>'reason','')) in (
            'MATCH_NOT_FINAL','MATCH_SCHEDULED','MATCH_IN_PLAY','MATCH_PAUSED',
            'MATCH_POSTPONED','MATCH_SUSPENDED','MATCH_DELAYED','MATCH_CANCELLED',
            'MATCH_CANCELED','MATCH_ABANDONED'
          )
          and upper(coalesce(source_row.item->>'provider_code','')) in ('FOOTBALL_DATA','THESPORTSDB');
        if coalesce(v_distinct_providers,0) < 2 then
          continue;
        end if;
      elsif coalesce(v_row.consensus_evidence->>'algorithm','') <> 'AI_EVIDENCE_POLICY_V1' then
        continue;
      end if;

      update oracle.resolutions
         set status='VOID',
             finalized_at=statement_timestamp(),
             finalized_by=null,
             consensus_evidence=consensus_evidence || jsonb_build_object(
               'auto_finalization',jsonb_build_object(
                 'mode','AUTO_AFTER_DISPUTE_WINDOW',
                 'finalized_at',statement_timestamp(),
                 'policy_id',v_row.policy_public_id,
                 'void_rule','EQUAL_SPLIT'
               )
             )
       where id=v_row.resolution_id
         and status='PROVISIONAL'
         and outcome_code is null;
      if not found then
        continue;
      end if;

      update market.canonical_events
         set status='FINALIZED',updated_at=statement_timestamp()
       where id=v_row.event_id and status='PROVISIONALLY_RESOLVED';

      update market.instruments as i
         set status='SETTLEMENT_PENDING',updated_at=statement_timestamp()
       where i.canonical_event_id=v_row.event_id
         and i.status='CLOSED'
         and not exists(select 1 from public.assets a where a.id=i.asset_id and a.code='TNGN');

      insert into eventing.domain_events(
        event_type,aggregate_type,aggregate_id,payload,idempotency_key
      ) values (
        'MARKET_FINALIZED',
        'CANONICAL_EVENT',
        v_row.event_public_id::text,
        jsonb_build_object(
          'resolution_status','VOID',
          'outcome_code',null,
          'resolution_id',v_row.resolution_id,
          'finalization_mode','AUTO_AFTER_DISPUTE_WINDOW',
          'automatic_void',true
        ),
        'market-finalized-void:'||v_row.event_public_id::text
      ) on conflict(idempotency_key) do nothing;

      insert into audit.records(
        actor_type,action,resource_type,resource_id,reason,after_state,metadata
      ) values (
        'SYSTEM',
        'ORACLE_RESOLUTION_AUTO_VOID_FINALIZED',
        'ORACLE_RESOLUTION',
        v_row.resolution_id::text,
        'The published void rule remained supported and undisputed through the configured dispute window.',
        jsonb_build_object('status','VOID','outcome_code',null),
        jsonb_build_object(
          'event_public_id',v_row.event_public_id,
          'policy_public_id',v_row.policy_public_id,
          'dispute_window_seconds',v_row.dispute_window_seconds,
          'void_rule','EQUAL_SPLIT'
        )
      );
      v_finalized := v_finalized + 1;
      continue;
    end if;

    if coalesce(v_row.consensus_evidence->>'algorithm','') <> 'PROVIDER_QUORUM_V2' then
      continue;
    end if;

    v_quorum := greatest(2, coalesce(
      (v_row.consensus_rule->>'min_agreeing_providers')::integer,
      (v_row.consensus_rule->>'min_agreeing_sources')::integer,
      (v_row.consensus_rule->>'quorum')::integer,
      2
    ));
    v_winning_count := coalesce(
      (v_row.consensus_evidence->>'winning_provider_count')::integer, 0
    );

    if v_quorum < 2 or v_winning_count < v_quorum then
      continue;
    end if;

    if jsonb_typeof(v_row.consensus_evidence->'observations') <> 'array' then
      continue;
    end if;

    select
      count(distinct nullif(obs->>'provider_id',''))::integer,
      count(*) filter(
        where upper(coalesce(obs->>'outcome','')) <> upper(v_row.outcome_code)
      )::integer
    into v_distinct_providers, v_mismatched_outcomes
    from jsonb_array_elements(v_row.consensus_evidence->'observations') obs;

    -- Any provider disagreement remains in human review.
    if coalesce(v_distinct_providers, 0) < v_quorum
       or coalesce(v_mismatched_outcomes, 0) > 0 then
      continue;
    end if;

    update oracle.resolutions
       set status = 'FINAL',
           finalized_at = statement_timestamp(),
           finalized_by = null,
           consensus_evidence = consensus_evidence || jsonb_build_object(
             'auto_finalization', jsonb_build_object(
               'mode','AUTO_AFTER_DISPUTE_WINDOW',
               'finalized_at',statement_timestamp(),
               'policy_id',v_row.policy_public_id,
               'verified_provider_count',v_distinct_providers
             )
           )
     where id = v_row.resolution_id
       and status = 'PROVISIONAL';

    if not found then
      continue;
    end if;

    update market.canonical_events
       set status = 'FINALIZED',
           updated_at = statement_timestamp()
     where id = v_row.event_id
       and status = 'PROVISIONALLY_RESOLVED';

    -- TNGN is retired and guarded against SETTLEMENT_PENDING. Leave its legacy
    -- records closed; settle any eligible real-asset sibling instruments only.
    update market.instruments as i
       set status = 'SETTLEMENT_PENDING',
           updated_at = statement_timestamp()
     where i.canonical_event_id = v_row.event_id
       and i.status = 'CLOSED'
       and not exists(
         select 1
         from public.assets a
         where a.id = i.asset_id and a.code = 'TNGN'
       );

    insert into eventing.domain_events(
      event_type, aggregate_type, aggregate_id, payload, idempotency_key
    ) values (
      'MARKET_FINALIZED',
      'CANONICAL_EVENT',
      v_row.event_public_id::text,
      jsonb_build_object(
        'outcome_code',v_row.outcome_code,
        'resolution_id',v_row.resolution_id,
        'finalization_mode','AUTO_AFTER_DISPUTE_WINDOW',
        'provider_count',v_distinct_providers
      ),
      'market-finalized:' || v_row.event_public_id::text
    ) on conflict(idempotency_key) do nothing;

    insert into audit.records(
      actor_type, action, resource_type, resource_id, reason, after_state, metadata
    ) values (
      'SYSTEM',
      'ORACLE_RESOLUTION_AUTO_FINALIZED',
      'ORACLE_RESOLUTION',
      v_row.resolution_id::text,
      'Verified provider quorum remained unanimous and undisputed through the policy dispute window',
      jsonb_build_object('status','FINAL','outcome_code',v_row.outcome_code),
      jsonb_build_object(
        'event_public_id',v_row.event_public_id,
        'policy_public_id',v_row.policy_public_id,
        'provider_count',v_distinct_providers,
        'quorum',v_quorum
      )
    );

    v_finalized := v_finalized + 1;
  end loop;

  return v_finalized;
end;
$function$;

commit;
