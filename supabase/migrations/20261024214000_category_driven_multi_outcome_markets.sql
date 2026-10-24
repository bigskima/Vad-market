-- Category-independent multi-outcome market creation and read models.
-- Existing BINARY instruments and their YES/NO outcome records are not changed.

create or replace function public.admin_create_multi_outcome_market_v1(
  p_title text,
  p_description text,
  p_category text,
  p_outcomes jsonb,
  p_resolution_instructions text,
  p_source_name text,
  p_source_url text,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_resolves_after timestamptz,
  p_country_code text,
  p_asset_code text,
  p_publish_now boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_category text := btrim(coalesce(p_category, ''));
  v_instructions text := btrim(coalesce(p_resolution_instructions, ''));
  v_source_name text := btrim(coalesce(p_source_name, ''));
  v_source_url text := btrim(coalesce(p_source_url, ''));
  v_result jsonb;
  v_event_public_id uuid;
  v_instrument_public_id uuid;
  v_event_id bigint;
  v_instrument_id bigint;
  v_instrument_status text;
  v_asset_code text := upper(btrim(coalesce(p_asset_code, '')));
  v_item record;
  v_label text;
  v_code text;
  v_suffix text;
  v_option_count integer;
  v_option_payload jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode = '42501';
  end if;

  if v_title = '' or char_length(v_title) > 180 then
    raise exception 'Enter a market question between 1 and 180 characters.' using errcode = '22023';
  end if;
  if v_category = '' then
    raise exception 'Choose a category for this market.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_outcomes) is distinct from 'array' then
    raise exception 'Add at least two outcome choices.' using errcode = '22023';
  end if;
  select count(*) into v_option_count from jsonb_array_elements(p_outcomes);
  if v_option_count < 2 or v_option_count > 20 then
    raise exception 'A multiple-outcome market must have between 2 and 20 choices.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(p_outcomes) as choice(value)
    where btrim(coalesce(choice.value, '')) = ''
       or char_length(btrim(choice.value)) > 80
  ) then
    raise exception 'Each choice must have a name between 1 and 80 characters.' using errcode = '22023';
  end if;
  if (
    select count(distinct lower(btrim(choice.value)))
    from jsonb_array_elements_text(p_outcomes) as choice(value)
  ) <> v_option_count then
    raise exception 'Each outcome choice must be unique.' using errcode = '22023';
  end if;
  if char_length(v_instructions) < 10 or char_length(v_instructions) > 3000 then
    raise exception 'Add resolution instructions between 10 and 3000 characters.' using errcode = '22023';
  end if;
  if v_source_name = '' or char_length(v_source_name) > 180 then
    raise exception 'Name the authoritative result source.' using errcode = '22023';
  end if;
  if v_source_url <> '' and v_source_url !~* '^https://' then
    raise exception 'The source link must start with https://.' using errcode = '22023';
  end if;
  if p_opens_at is null or p_closes_at is null or p_resolves_after is null or p_closes_at <= p_opens_at then
    raise exception 'Choose valid opening, closing and result-checking times.' using errcode = '22023';
  end if;
  if p_publish_now and (p_opens_at > statement_timestamp() or p_closes_at <= statement_timestamp()) then
    raise exception 'Publish now is only available after opening time and before closing time. Save this market as a draft instead.' using errcode = '22023';
  end if;
  if v_asset_code not in ('NGN', 'USDC') then
    raise exception 'Choose an enabled NGN or USDC market currency.' using errcode = '22023';
  end if;

  -- Reuse VAD's existing market admission, event identity, jurisdiction, and
  -- publication path. This call is always a draft; publication happens only
  -- after outcomes and the resolution scope have been configured below.
  v_result := public.admin_create_custom_market_v2(
    v_title,
    v_description,
    v_category,
    p_opens_at,
    p_closes_at,
    p_resolves_after,
    upper(btrim(p_country_code)),
    v_asset_code,
    'POOL',
    false
  );

  if coalesce((v_result->>'merged_existing')::boolean, false) then
    raise exception 'A market with this question already exists. Open that market instead of replacing its outcome choices.' using errcode = '22023';
  end if;

  v_event_public_id := nullif(v_result->>'event_id', '')::uuid;
  v_instrument_public_id := nullif(v_result->>'instrument_id', '')::uuid;
  if v_event_public_id is null or v_instrument_public_id is null then
    raise exception 'VAD could not create a market record for these details.' using errcode = 'P0001';
  end if;

  select event.id, instrument.id, instrument.status
    into v_event_id, v_instrument_id, v_instrument_status
  from market.canonical_events event
  join market.instruments instrument on instrument.canonical_event_id = event.id
  join public.assets asset on asset.id = instrument.asset_id
  where event.public_id = v_event_public_id
    and instrument.public_id = v_instrument_public_id
    and asset.code = v_asset_code
  for update of event, instrument;

  if v_instrument_id is null or v_instrument_status <> 'DRAFT' then
    raise exception 'Only a new unpublished draft can be configured as a multiple-outcome market.' using errcode = 'P0001';
  end if;

  if exists (select 1 from trading.pool_stakes where instrument_id = v_instrument_id)
     or exists (select 1 from trading.orders where instrument_id = v_instrument_id)
     or exists (select 1 from trading.positions where instrument_id = v_instrument_id) then
    raise exception 'This market already has trading activity and its outcomes cannot be replaced.' using errcode = 'P0001';
  end if;

  delete from market.outcomes where instrument_id = v_instrument_id;

  for v_item in
    select choice.value as label, choice.ordinality as ordinal
    from jsonb_array_elements_text(p_outcomes) with ordinality as choice(value, ordinality)
    order by choice.ordinality
  loop
    v_label := btrim(v_item.label);
    v_code := trim(both '_' from regexp_replace(upper(v_label), '[^A-Z0-9]+', '_', 'g'));
    if v_code = '' or v_code !~ '^[A-Z]' then
      v_code := 'OPTION_' || v_item.ordinal::text;
    end if;
    v_code := left(v_code, 48);
    if exists (select 1 from market.outcomes where instrument_id = v_instrument_id and code = v_code) then
      v_suffix := '_' || v_item.ordinal::text;
      v_code := left(v_code, 50 - char_length(v_suffix)) || v_suffix;
    end if;
    if exists (select 1 from market.outcomes where instrument_id = v_instrument_id and code = v_code) then
      raise exception 'Two choices produce the same internal identifier. Make the choice names more distinct.' using errcode = '22023';
    end if;

    insert into market.outcomes(instrument_id, code, label, display_order)
    values (v_instrument_id, v_code, v_label, v_item.ordinal - 1);

    v_option_payload := v_option_payload || jsonb_build_array(
      jsonb_build_object('code', v_code, 'label', v_label, 'displayOrder', v_item.ordinal - 1)
    );
  end loop;

  update market.instruments
  set market_type = 'MULTI_OUTCOME',
      liquidity_model = 'POOL',
      updated_at = statement_timestamp()
  where id = v_instrument_id;

  update market.canonical_events
  set resolution_scope = coalesce(resolution_scope, '{}'::jsonb) || jsonb_build_object(
        'resolver_type', 'VAD_REVIEW_V1',
        'market_format', 'MULTI_OUTCOME',
        'outcome_options', v_option_payload,
        'resolution_instructions', v_instructions,
        'source_name', v_source_name,
        'source_url', nullif(v_source_url, ''),
        'verification', 'Manual VAD review against the configured resolution instructions and source. The final result must match one configured outcome.',
        'configured_by', 'ADMIN_MULTI_OUTCOME_V1'
      ),
      updated_at = statement_timestamp()
  where id = v_event_id;

  perform command.refresh_market_catalog(v_instrument_id);

  insert into eventing.domain_events(event_type, aggregate_type, aggregate_id, payload, idempotency_key)
  values (
    'MULTI_OUTCOME_MARKET_CREATED',
    'MARKET_INSTRUMENT',
    v_instrument_public_id::text,
    jsonb_build_object(
      'event_id', v_event_public_id,
      'instrument_id', v_instrument_public_id,
      'asset_code', v_asset_code,
      'category', v_category,
      'outcomes', v_option_payload,
      'configured_by', auth.uid()
    ),
    'multi-outcome-market-created:' || v_instrument_public_id::text
  ) on conflict (idempotency_key) do nothing;

  insert into audit.records(actor_user_id, actor_type, action, resource_type, resource_id, reason, metadata)
  values (
    auth.uid(), 'ADMIN', 'MULTI_OUTCOME_MARKET_CREATED', 'MARKET_INSTRUMENT',
    v_instrument_public_id::text,
    'Created a category-independent multiple-outcome market',
    jsonb_build_object('event_id', v_event_public_id, 'category', v_category, 'asset_code', v_asset_code, 'outcomes', v_option_payload)
  );

  if p_publish_now then
    perform public.admin_publish_market(v_instrument_public_id, 100, 'Published during multiple-outcome market creation');
    v_result := v_result || jsonb_build_object('publication_status', 'PUBLISHED');
  else
    v_result := v_result || jsonb_build_object('publication_status', 'DRAFT');
  end if;

  return v_result || jsonb_build_object(
    'market_format', 'MULTI_OUTCOME',
    'outcomes', v_option_payload,
    'resolution_mode', 'VAD_REVIEW_V1'
  );
end;
$function$;

grant execute on function public.admin_create_multi_outcome_market_v1(
  text, text, text, jsonb, text, text, text,
  timestamptz, timestamptz, timestamptz, text, text, boolean
) to authenticated;

create or replace function public.market_outcome_summary_v1(p_instrument_public_id uuid)
returns table (
  outcome_id bigint,
  outcome_code text,
  outcome_label text,
  display_order smallint,
  total_stake numeric,
  pool_share numeric,
  participant_count bigint
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  account public.user_accounts;
begin
  account := private.require_active_account();
  return query
  with instrument_scope as (
    select instrument.id, instrument.asset_id
    from market.instruments instrument
    where instrument.public_id = p_instrument_public_id
      and instrument.market_type = 'MULTI_OUTCOME'
      and instrument.liquidity_model = 'POOL'
  ),
  pool_totals as (
    select coalesce(sum(stake.amount), 0)::numeric as total_amount
    from trading.pool_stakes stake
    join instrument_scope instrument on instrument.id = stake.instrument_id
  ),
  per_outcome as (
    select
      outcome.id,
      outcome.code,
      outcome.label,
      outcome.display_order,
      coalesce(sum(stake.amount), 0)::numeric as outcome_amount,
      count(distinct stake.user_id)::bigint as participants
    from instrument_scope instrument
    join market.outcomes outcome on outcome.instrument_id = instrument.id
    left join trading.pool_stakes stake
      on stake.instrument_id = instrument.id
     and stake.outcome_id = outcome.id
    group by outcome.id, outcome.code, outcome.label, outcome.display_order
  )
  select
    result.id,
    result.code,
    result.label,
    result.display_order,
    result.outcome_amount,
    case when totals.total_amount > 0
      then result.outcome_amount / totals.total_amount
      else null
    end,
    result.participants
  from per_outcome result
  cross join pool_totals totals
  order by result.display_order, result.id;
end;
$function$;

grant execute on function public.market_outcome_summary_v1(uuid) to authenticated;

create or replace function public.my_pool_stakes_v2()
returns table (
  stake_id uuid,
  market_id uuid,
  market_title text,
  outcome_code text,
  asset_code text,
  amount numeric,
  trading_fee numeric,
  market_status text,
  final_outcome text,
  created_at timestamptz,
  outcome_label text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    stake.public_id,
    instrument.public_id,
    event.title,
    outcome.code,
    asset.code,
    stake.amount,
    stake.trading_fee_amount,
    instrument.status,
    case when resolution.status in ('FINAL', 'VOID') then resolution.outcome_code else null end,
    stake.created_at,
    outcome.label
  from trading.pool_stakes stake
  join market.instruments instrument on instrument.id = stake.instrument_id
  join market.canonical_events event on event.id = instrument.canonical_event_id
  join market.outcomes outcome on outcome.id = stake.outcome_id
  join public.assets asset on asset.id = instrument.asset_id
  left join lateral (
    select candidate.*
    from oracle.resolutions candidate
    where candidate.event_id = event.id
    order by coalesce(candidate.finalized_at, candidate.created_at) desc, candidate.id desc
    limit 1
  ) resolution on true
  where stake.user_id = auth.uid()
  order by stake.created_at desc;
$function$;

grant execute on function public.my_pool_stakes_v2() to authenticated;


create or replace function public.admin_oracle_outcomes_for_event_v1(p_event_public_id uuid)
returns table (
  outcome_code text,
  outcome_label text,
  display_order smallint
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_event_id bigint;
begin
  if auth.uid() is null or not private.has_permission('oracle.review') then
    raise exception 'Oracle review permission required' using errcode='42501';
  end if;

  select event.id into v_event_id
  from market.canonical_events event
  where event.public_id=p_event_public_id;

  if v_event_id is null then
    raise exception 'Market event not found' using errcode='P0002';
  end if;

  return query
  select distinct outcome.code, outcome.label, outcome.display_order
  from market.instruments instrument
  join market.outcomes outcome on outcome.instrument_id=instrument.id
  where instrument.canonical_event_id=v_event_id
  order by outcome.display_order, outcome.code;
end;
$function$;

grant execute on function public.admin_oracle_outcomes_for_event_v1(uuid) to authenticated;

-- Expose the category-independent manual-review format through the same
-- validation RPC used by Admin. It is intentionally never marked auto-ready:
-- an authorized Oracle reviewer must choose one configured outcome.
create or replace function public.admin_validate_oracle_resolution_scope(
  p_scope jsonb,
  p_closes_at timestamptz default null,
  p_resolves_after timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_choices jsonb;
  v_choice_count integer;
  v_instruction text;
  v_source_name text;
  v_source_url text;
begin
  if not private.has_permission('oracle.review') and not private.has_permission('markets.manage') then
    raise exception 'Permission required' using errcode='42501';
  end if;

  if p_scope is not null
     and upper(btrim(coalesce(p_scope->>'resolver_type','')))='VAD_REVIEW_V1'
     and upper(btrim(coalesce(p_scope->>'market_format','')))='MULTI_OUTCOME' then
    if jsonb_typeof(p_scope)<>'object' or private.resolution_scope_has_forbidden_keys(p_scope) then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType','VAD_REVIEW_V1',
        'reason','This review configuration contains invalid or restricted fields.','riskFlag','RESOLUTION_SCOPE_INVALID');
    end if;

    v_choices := p_scope->'outcome_options';
    v_instruction := btrim(coalesce(p_scope->>'resolution_instructions',''));
    v_source_name := btrim(coalesce(p_scope->>'source_name',''));
    v_source_url := btrim(coalesce(p_scope->>'source_url',''));

    if jsonb_typeof(v_choices) is distinct from 'array' then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType','VAD_REVIEW_V1',
        'reason','Configure at least two named outcome choices.','riskFlag','OUTCOME_OPTIONS_REQUIRED');
    end if;

    select count(*) into v_choice_count from jsonb_array_elements(v_choices);
    if v_choice_count < 2 or v_choice_count > 20
       or exists (
         select 1
         from jsonb_array_elements(v_choices) as item(value)
         where jsonb_typeof(item.value)<>'object'
            or nullif(btrim(coalesce(item.value->>'code','')),'') is null
            or nullif(btrim(coalesce(item.value->>'label','')),'') is null
            or char_length(btrim(coalesce(item.value->>'label',''))) > 80
       )
       or (
         select count(distinct lower(btrim(item.value->>'label')))
         from jsonb_array_elements(v_choices) as item(value)
       ) <> v_choice_count then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType','VAD_REVIEW_V1',
        'reason','Use 2–20 unique, named choices, each no longer than 80 characters.','riskFlag','OUTCOME_OPTIONS_INVALID');
    end if;

    if char_length(v_instruction)<10 or char_length(v_instruction)>3000 then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType','VAD_REVIEW_V1',
        'reason','Add clear resolution instructions between 10 and 3000 characters.','riskFlag','RESOLUTION_INSTRUCTIONS_REQUIRED');
    end if;

    if v_source_name='' or char_length(v_source_name)>180
       or (v_source_url<>'' and v_source_url !~* '^https://') then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType','VAD_REVIEW_V1',
        'reason','Provide a result source name and, if supplied, a secure https:// source link.','riskFlag','RESOLUTION_SOURCE_INVALID');
    end if;

    if p_closes_at is null or p_resolves_after is null or p_resolves_after<p_closes_at then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType','VAD_REVIEW_V1',
        'reason','The result-checking time must be at or after market close.','riskFlag','RESOLUTION_TIMING_INVALID');
    end if;

    return jsonb_build_object(
      'valid',true,
      'autoPublishReady',false,
      'resolverType','VAD_REVIEW_V1',
      'marketFormat','MULTI_OUTCOME',
      'outcomeCount',v_choice_count,
      'requiredIndependentProviders',0,
      'reason','Market configuration is valid. An authorized Oracle reviewer must verify the official source and select one configured outcome; automatic finalization is disabled.',
      'riskFlag','MANUAL_REVIEW_REQUIRED'
    );
  end if;

  return private.validate_oracle_resolution_scope(p_scope,p_closes_at,p_resolves_after);
end;
$function$;

grant execute on function public.admin_validate_oracle_resolution_scope(jsonb,timestamptz,timestamptz) to authenticated;

-- Preserve configured outcome labels in historical result cards as well as open positions.
-- Keep the original my_market_history contract unchanged for older clients.
create or replace function public.my_market_history_v2()
returns table (
  market_id uuid,
  market_title text,
  selected_outcome text,
  selected_outcome_label text,
  final_outcome text,
  final_outcome_label text,
  asset_code text,
  matched_quantity numeric,
  stake_amount numeric,
  trading_fee numeric,
  gross_payout numeric,
  settlement_fee numeric,
  net_payout numeric,
  realized_pnl numeric,
  result text,
  settled_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
  with pool_base as (
    select
      stake.user_id,
      stake.instrument_id,
      stake.outcome_id,
      sum(stake.amount)::numeric as stake_amount,
      sum(stake.amount)::numeric as matched_quantity,
      sum(stake.trading_fee_amount)::numeric as trading_fee
    from trading.pool_stakes stake
    where stake.user_id=auth.uid()
    group by stake.user_id,stake.instrument_id,stake.outcome_id
  ),
  order_base as (
    select
      order_row.user_id,
      order_row.instrument_id,
      order_row.outcome_id,
      sum(fill.quantity)::numeric as matched_quantity,
      sum(fill.notional)::numeric as stake_amount,
      coalesce(sum(execution_fee.fee_amount),0)::numeric as trading_fee
    from trading.fills fill
    join trading.orders order_row on order_row.id=fill.order_id
    left join trading.execution_fees execution_fee
      on execution_fee.order_id=order_row.id
     and execution_fee.execution_reference=fill.match_id::text
    where order_row.user_id=auth.uid()
    group by order_row.user_id,order_row.instrument_id,order_row.outcome_id
  ),
  base as (
    select * from pool_base
    union all
    select * from order_base
  )
  select
    instrument.public_id,
    event.title,
    selected_outcome.code,
    selected_outcome.label,
    resolution.outcome_code,
    final_outcome.label,
    asset.code,
    position.matched_quantity,
    position.stake_amount,
    position.trading_fee,
    coalesce(entitlement.gross_amount,0),
    coalesce(entitlement.fee_amount,0),
    coalesce(entitlement.net_amount,0),
    (coalesce(entitlement.net_amount,0)-position.stake_amount-position.trading_fee)::numeric,
    case
      when resolution.status='VOID' then 'VOID'
      when run.status='SETTLED' and entitlement.net_amount>0 and resolution.outcome_code=selected_outcome.code then 'WON'
      when run.status='SETTLED' and resolution.outcome_code<>selected_outcome.code and entitlement.net_amount>=position.stake_amount then 'REFUNDED'
      when run.status='SETTLED' and resolution.outcome_code<>selected_outcome.code then 'LOST'
      when resolution.status='FINAL' then 'SETTLING'
      else 'PENDING'
    end,
    run.settled_at
  from base position
  join market.instruments instrument on instrument.id=position.instrument_id
  join market.canonical_events event on event.id=instrument.canonical_event_id
  join market.outcomes selected_outcome on selected_outcome.id=position.outcome_id
  join public.assets asset on asset.id=instrument.asset_id
  left join lateral (
    select candidate.*
    from oracle.resolutions candidate
    where candidate.event_id=event.id
      and candidate.status in ('FINAL','VOID')
    order by candidate.finalized_at desc nulls last,candidate.id desc
    limit 1
  ) resolution on true
  left join market.outcomes final_outcome
    on final_outcome.instrument_id=instrument.id
   and final_outcome.code=resolution.outcome_code
  left join lateral (
    select candidate.*
    from settlement.runs candidate
    where candidate.instrument_id=instrument.id
      and candidate.status='SETTLED'
    order by candidate.settled_at desc nulls last,candidate.id desc
    limit 1
  ) run on true
  left join settlement.entitlements entitlement
    on entitlement.run_id=run.id
   and entitlement.user_id=position.user_id
   and entitlement.outcome_id=position.outcome_id
  order by coalesce(run.settled_at,event.closes_at) desc;
$function$;

grant execute on function public.my_market_history_v2() to authenticated;


-- These markets must go through the existing two-reviewer Oracle governance flow,
-- not through provider adapters that currently resolve only deterministic binary events.
create or replace function public.internal_oracle_due_events(
  p_event_public_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  result jsonb;
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  with due as (
    select
      event.id,
      event.public_id,
      event.title,
      event.category,
      event.status,
      event.normalized_parameters,
      event.resolution_scope,
      event.closes_at,
      event.resolves_after,
      policy.id as oracle_policy_id,
      policy.public_id as oracle_policy_public_id,
      policy.source_hierarchy,
      policy.consensus_rule,
      capability.code as capability_code
    from market.canonical_events event
    join oracle.event_policy_bindings binding on binding.event_id=event.id
    join oracle.policies policy on policy.id=binding.oracle_policy_id and policy.status='ACTIVE'
    join oracle.capabilities capability on capability.id=policy.capability_id
    where event.status in ('AWAITING_ORACLE','PROVISIONALLY_RESOLVED')
      and upper(btrim(coalesce(event.resolution_scope->>'resolver_type',''))) <> 'VAD_REVIEW_V1'
      and coalesce(event.resolves_after,event.closes_at)<=statement_timestamp()
      and (p_event_public_id is null or event.public_id=p_event_public_id)
      and not exists (
        select 1
        from oracle.disputes dispute
        where dispute.event_id=event.id
          and dispute.status in ('OPEN','UNDER_REVIEW','ESCALATED')
      )
    order by coalesce(event.resolves_after,event.closes_at),event.id
    limit greatest(1,least(coalesce(p_limit,20),100))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId',due.id,
    'eventPublicId',due.public_id,
    'title',due.title,
    'category',due.category,
    'status',due.status,
    'normalizedParameters',due.normalized_parameters,
    'resolutionScope',due.resolution_scope,
    'closesAt',due.closes_at,
    'resolvesAfter',due.resolves_after,
    'oraclePolicyId',due.oracle_policy_id,
    'oraclePolicyPublicId',due.oracle_policy_public_id,
    'capabilityCode',due.capability_code,
    'sourceHierarchy',due.source_hierarchy,
    'consensusRule',due.consensus_rule,
    'outcomes',coalesce((
      select jsonb_agg(jsonb_build_object('code',outcome.code,'label',outcome.label) order by instrument.id,outcome.display_order)
      from market.instruments instrument
      join market.outcomes outcome on outcome.instrument_id=instrument.id
      where instrument.canonical_event_id=due.id
    ),'[]'::jsonb)
  ) order by coalesce(due.resolves_after,due.closes_at),due.id),'[]'::jsonb)
  into result
  from due;

  return result;
end;
$function$;

