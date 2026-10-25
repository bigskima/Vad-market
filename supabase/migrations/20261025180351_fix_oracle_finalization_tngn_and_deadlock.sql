-- Prevent the retired TNGN guard from aborting every automatic finalization pass.
-- Serialize consensus evaluation and due finalization per canonical event so the
-- evaluator (event -> resolution) and finalizer (resolution -> event) cannot deadlock.
create or replace function oracle.evaluate_event_consensus(p_event_id bigint)
 returns bigint
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  ev market.canonical_events;
  binding oracle.event_policy_bindings;
  pol oracle.policies;
  quorum integer;
  winning_code text;
  winning_count integer;
  runner_up_count integer;
  resolution_id bigint;
  previous_code text;
  evidence jsonb;
begin
  -- Try the shared event lock before taking row locks. A concurrent finalizer
  -- holds the same lock; this call exits quickly rather than waiting in a
  -- reverse lock order and deadlocking.
  if not pg_try_advisory_xact_lock(
    hashtextextended('vad-oracle-event:' || p_event_id::text, 0)
  ) then
    return null;
  end if;

  select * into ev
  from market.canonical_events
  where id = p_event_id
  for update;

  if ev.id is null then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  if ev.status not in ('AWAITING_ORACLE','PROVISIONALLY_RESOLVED','DISPUTED') then
    return null;
  end if;

  if exists(
    select 1
    from oracle.disputes d
    where d.event_id = ev.id
      and d.status in ('OPEN','UNDER_REVIEW','ESCALATED')
  ) then
    return (
      select id
      from oracle.resolutions
      where event_id = ev.id and status = 'PROVISIONAL'
      limit 1
    );
  end if;

  select * into binding
  from oracle.event_policy_bindings
  where event_id = ev.id;

  select * into pol
  from oracle.policies
  where id = binding.oracle_policy_id;

  if pol.id is null or pol.status <> 'ACTIVE' then
    raise exception 'Active oracle policy required' using errcode = '23514';
  end if;

  quorum := coalesce(
    (pol.consensus_rule->>'min_agreeing_providers')::integer,
    (pol.consensus_rule->>'min_agreeing_sources')::integer,
    (pol.consensus_rule->>'quorum')::integer,
    2
  );

  if quorum < 1 then
    raise exception 'Oracle consensus quorum must be at least one' using errcode = '23514';
  end if;

  with latest as (
    select ranked.*
    from (
      select o.*,
             p.code as provider_code,
             row_number() over(
               partition by o.provider_id
               order by o.observed_at desc, o.received_at desc, o.id desc
             ) as rn
      from oracle.observations o
      join integration.providers p on p.id = o.provider_id
      where o.event_id = ev.id
        and o.verification_status = 'VERIFIED'
        and p.provider_type = 'ORACLE'
        and p.status in ('ACTIVE','DEGRADED')
    ) ranked
    where ranked.rn = 1
  ), counts as (
    select observed_outcome, count(*)::integer provider_count
    from latest
    group by observed_outcome
  ), ranked_counts as (
    select observed_outcome, provider_count,
           row_number() over(order by provider_count desc, observed_outcome) rn
    from counts
  )
  select max(observed_outcome) filter(where rn = 1),
         coalesce(max(provider_count) filter(where rn = 1), 0),
         coalesce(max(provider_count) filter(where rn = 2), 0)
    into winning_code, winning_count, runner_up_count
  from ranked_counts;

  if winning_code is null or winning_count < quorum or winning_count = runner_up_count then
    return null;
  end if;

  with latest as (
    select ranked.*
    from (
      select o.*,
             p.code as provider_code,
             row_number() over(
               partition by o.provider_id
               order by o.observed_at desc, o.received_at desc, o.id desc
             ) as rn
      from oracle.observations o
      join integration.providers p on p.id = o.provider_id
      where o.event_id = ev.id
        and o.verification_status = 'VERIFIED'
        and p.provider_type = 'ORACLE'
        and p.status in ('ACTIVE','DEGRADED')
    ) ranked
    where ranked.rn = 1
  )
  select jsonb_build_object(
    'algorithm','PROVIDER_QUORUM_V2',
    'policy_id', pol.public_id,
    'required_providers', quorum,
    'winning_provider_count', winning_count,
    'observations', coalesce(jsonb_agg(jsonb_build_object(
      'source_code', o.provider_code,
      'provider_id', o.provider_id,
      'outcome', o.observed_outcome,
      'observed_at', o.observed_at,
      'evidence_reference', o.evidence_reference
    ) order by o.received_at), '[]'::jsonb)
  ) into evidence
  from latest o;

  select id, outcome_code
    into resolution_id, previous_code
  from oracle.resolutions
  where event_id = ev.id and status = 'PROVISIONAL'
  for update;

  if resolution_id is null then
    insert into oracle.resolutions(
      event_id, oracle_policy_id, outcome_code, status, consensus_evidence, created_by
    ) values (
      ev.id, pol.id, winning_code, 'PROVISIONAL', coalesce(evidence, '{}'::jsonb), null
    )
    returning id into resolution_id;
  elsif previous_code is distinct from winning_code then
    update oracle.resolutions
       set outcome_code = winning_code,
           consensus_evidence = coalesce(evidence, '{}'::jsonb),
           created_at = statement_timestamp()
     where id = resolution_id;
  else
    update oracle.resolutions
       set consensus_evidence = coalesce(evidence, '{}'::jsonb)
     where id = resolution_id;
  end if;

  update market.canonical_events
     set status = 'PROVISIONALLY_RESOLVED',
         updated_at = statement_timestamp()
   where id = ev.id;

  insert into eventing.domain_events(
    event_type, aggregate_type, aggregate_id, payload, idempotency_key
  ) values (
    'ORACLE_CONSENSUS_REACHED',
    'CANONICAL_EVENT',
    ev.public_id::text,
    jsonb_build_object(
      'resolution_id', resolution_id,
      'outcome_code', winning_code,
      'provider_count', winning_count,
      'quorum', quorum,
      'algorithm', 'PROVIDER_QUORUM_V2'
    ),
    'oracle-consensus-v2:' || ev.public_id::text || ':' || winning_code || ':' || winning_count::text
  ) on conflict(idempotency_key) do nothing;

  return resolution_id;
end;
$function$;

create or replace function oracle.finalize_due_automatic_resolutions(p_limit integer default 100)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
      p.dispute_window_seconds,
      e.public_id as event_public_id
    from oracle.resolutions r
    join oracle.policies p on p.id = r.oracle_policy_id
    join market.canonical_events e on e.id = r.event_id
    where r.status = 'PROVISIONAL'
      and r.created_by is null
      and r.outcome_code is not null
      and p.status = 'ACTIVE'
      and p.approved_by is not null
      and upper(coalesce(p.consensus_rule->>'finalization_mode','')) = 'AUTO_AFTER_DISPUTE_WINDOW'
      and statement_timestamp() >= r.created_at + make_interval(secs => p.dispute_window_seconds)
      and e.status = 'PROVISIONALLY_RESOLVED'
      and coalesce(r.consensus_evidence->>'policy_id','') = p.public_id::text
      and exists(
        select 1
        from market.instruments i
        join market.outcomes o on o.instrument_id = i.id
        where i.canonical_event_id = r.event_id
          and i.status = 'CLOSED'
          and upper(o.code) = upper(r.outcome_code)
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

    if coalesce(v_row.consensus_evidence->>'algorithm','') <> 'PROVIDER_QUORUM_V2' then
      continue;
    end if;

    v_quorum := coalesce(
      (v_row.consensus_rule->>'min_agreeing_providers')::integer,
      (v_row.consensus_rule->>'min_agreeing_sources')::integer,
      (v_row.consensus_rule->>'quorum')::integer,
      2
    );
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
