-- Harden automated oracle consensus: active disputes freeze automatic outcome mutation,
-- and repeated observations supporting the same provisional result must not reset the dispute clock.

create or replace function oracle.evaluate_event_consensus(p_event_id bigint)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
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
  select * into ev from market.canonical_events where id=p_event_id for update;
  if ev.id is null then raise exception 'Event not found' using errcode='P0002'; end if;
  if ev.status not in ('AWAITING_ORACLE','PROVISIONALLY_RESOLVED','DISPUTED') then return null; end if;

  -- Once challenged, automated ingestion may continue but cannot mutate the provisional result.
  if exists(select 1 from oracle.disputes d where d.event_id=ev.id and d.status in ('OPEN','UNDER_REVIEW','ESCALATED')) then
    return (select id from oracle.resolutions where event_id=ev.id and status='PROVISIONAL' limit 1);
  end if;

  select * into binding from oracle.event_policy_bindings where event_id=ev.id;
  select * into pol from oracle.policies where id=binding.oracle_policy_id;
  if pol.id is null or pol.status<>'ACTIVE' then raise exception 'Active oracle policy required' using errcode='23514'; end if;
  quorum:=coalesce((pol.consensus_rule->>'min_agreeing_sources')::integer,(pol.consensus_rule->>'quorum')::integer,2);
  if quorum<1 then raise exception 'Oracle consensus quorum must be at least one' using errcode='23514'; end if;

  with counts as (
    select observed_outcome,count(distinct source_code)::integer source_count
    from oracle.observations where event_id=ev.id and verification_status='VERIFIED'
    group by observed_outcome
  ), ranked as (
    select observed_outcome,source_count,row_number() over(order by source_count desc,observed_outcome) rn from counts
  )
  select max(observed_outcome) filter(where rn=1),coalesce(max(source_count) filter(where rn=1),0),coalesce(max(source_count) filter(where rn=2),0)
  into winning_code,winning_count,runner_up_count from ranked;

  if winning_code is null or winning_count<quorum or winning_count=runner_up_count then return null; end if;

  select jsonb_build_object(
    'algorithm','SOURCE_QUORUM_V1','policy_id',pol.public_id,'required_sources',quorum,'winning_source_count',winning_count,
    'observations',coalesce(jsonb_agg(jsonb_build_object('source_code',o.source_code,'provider_id',o.provider_id,'outcome',o.observed_outcome,'observed_at',o.observed_at,'evidence_reference',o.evidence_reference) order by o.received_at),'[]'::jsonb)
  ) into evidence from oracle.observations o where o.event_id=ev.id and o.verification_status='VERIFIED';

  select id,outcome_code into resolution_id,previous_code from oracle.resolutions where event_id=ev.id and status='PROVISIONAL' for update;
  if resolution_id is null then
    insert into oracle.resolutions(event_id,oracle_policy_id,outcome_code,status,consensus_evidence,created_by)
    values(ev.id,pol.id,winning_code,'PROVISIONAL',coalesce(evidence,'{}'::jsonb),null) returning id into resolution_id;
  elsif previous_code is distinct from winning_code then
    -- Material outcome change restarts the challenge period.
    update oracle.resolutions set outcome_code=winning_code,consensus_evidence=coalesce(evidence,'{}'::jsonb),created_at=statement_timestamp() where id=resolution_id;
  else
    -- Same outcome: enrich evidence without moving the original provisional timestamp.
    update oracle.resolutions set consensus_evidence=coalesce(evidence,'{}'::jsonb) where id=resolution_id;
  end if;

  update market.canonical_events set status='PROVISIONALLY_RESOLVED',updated_at=statement_timestamp() where id=ev.id;
  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('ORACLE_CONSENSUS_REACHED','CANONICAL_EVENT',ev.public_id::text,
    jsonb_build_object('resolution_id',resolution_id,'outcome_code',winning_code,'source_count',winning_count,'quorum',quorum),
    'oracle-consensus:'||ev.public_id::text||':'||winning_code||':'||winning_count::text)
  on conflict(idempotency_key) do nothing;
  return resolution_id;
end;
$$;

create or replace function oracle.evaluate_pending_events()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare r record; processed integer:=0;
begin
  for r in
    select e.id from market.canonical_events e
    where e.status in ('AWAITING_ORACLE','PROVISIONALLY_RESOLVED')
      and not exists(select 1 from oracle.disputes d where d.event_id=e.id and d.status in ('OPEN','UNDER_REVIEW','ESCALATED'))
  loop
    perform oracle.evaluate_event_consensus(r.id);
    processed:=processed+1;
  end loop;
  return processed;
end;
$$;
