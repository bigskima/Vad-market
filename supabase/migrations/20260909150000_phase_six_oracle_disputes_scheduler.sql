-- VAD Phase 6: oracle observations/consensus, user disputes, and database-native scheduled market closing.
-- External provider fetching remains an Edge/provider boundary; deterministic consensus and lifecycle stay in PostgreSQL.

create unique index if not exists oracle_one_active_dispute_per_user_resolution
  on oracle.disputes(resolution_id, opened_by)
  where status in ('OPEN','UNDER_REVIEW','ESCALATED');

create or replace function oracle.record_verified_observation(
  p_event_id bigint,
  p_provider_id bigint,
  p_source_code text,
  p_observed_outcome text,
  p_payload jsonb,
  p_evidence_reference text,
  p_observed_at timestamptz,
  p_idempotency_key text
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  provider integration.providers;
  ev market.canonical_events;
  observation_id bigint;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 then
    raise exception 'Valid observation idempotency key required' using errcode='22023';
  end if;
  select * into provider from integration.providers where id=p_provider_id;
  if provider.id is null or provider.provider_type <> 'ORACLE' or provider.status not in ('ACTIVE','DEGRADED') then
    raise exception 'Eligible oracle provider required' using errcode='23514';
  end if;
  select * into ev from market.canonical_events where id=p_event_id;
  if ev.id is null then raise exception 'Event not found' using errcode='P0002'; end if;
  if ev.status not in ('AWAITING_ORACLE','PROVISIONALLY_RESOLVED','DISPUTED') then
    raise exception 'Event is not accepting oracle observations' using errcode='P0001';
  end if;
  if not exists(
    select 1 from market.instruments i join market.outcomes o on o.instrument_id=i.id
    where i.canonical_event_id=ev.id and o.code=upper(p_observed_outcome)
  ) then
    raise exception 'Observed outcome is invalid for event' using errcode='22023';
  end if;

  insert into oracle.observations(
    event_id,provider_id,source_code,observed_outcome,observation_payload,
    evidence_reference,observed_at,verification_status,idempotency_key
  ) values(
    ev.id,provider.id,upper(trim(p_source_code)),upper(p_observed_outcome),coalesce(p_payload,'{}'::jsonb),
    p_evidence_reference,coalesce(p_observed_at,statement_timestamp()),'VERIFIED',p_idempotency_key
  ) on conflict(idempotency_key) do nothing
  returning id into observation_id;

  if observation_id is null then
    select id into observation_id from oracle.observations where idempotency_key=p_idempotency_key;
  end if;
  return observation_id;
end;
$$;

revoke all on function oracle.record_verified_observation(bigint,bigint,text,text,jsonb,text,timestamptz,text) from public,anon,authenticated;
grant execute on function oracle.record_verified_observation(bigint,bigint,text,text,jsonb,text,timestamptz,text) to service_role;

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
  evidence jsonb;
begin
  select * into ev from market.canonical_events where id=p_event_id for update;
  if ev.id is null then raise exception 'Event not found' using errcode='P0002'; end if;
  if ev.status not in ('AWAITING_ORACLE','PROVISIONALLY_RESOLVED','DISPUTED') then return null; end if;

  select * into binding from oracle.event_policy_bindings where event_id=ev.id;
  select * into pol from oracle.policies where id=binding.oracle_policy_id;
  if pol.id is null or pol.status <> 'ACTIVE' then raise exception 'Active oracle policy required' using errcode='23514'; end if;
  quorum := coalesce((pol.consensus_rule->>'min_agreeing_sources')::integer,(pol.consensus_rule->>'quorum')::integer,2);
  if quorum < 1 then raise exception 'Oracle consensus quorum must be at least one' using errcode='23514'; end if;

  with counts as (
    select observed_outcome, count(distinct source_code)::integer as source_count
    from oracle.observations
    where event_id=ev.id and verification_status='VERIFIED'
    group by observed_outcome
  ), ranked as (
    select observed_outcome,source_count,row_number() over(order by source_count desc, observed_outcome) rn
    from counts
  )
  select
    max(observed_outcome) filter(where rn=1),
    coalesce(max(source_count) filter(where rn=1),0),
    coalesce(max(source_count) filter(where rn=2),0)
  into winning_code,winning_count,runner_up_count
  from ranked;

  if winning_code is null or winning_count < quorum or winning_count = runner_up_count then
    return null;
  end if;

  select jsonb_build_object(
    'algorithm','SOURCE_QUORUM_V1',
    'policy_id',pol.public_id,
    'required_sources',quorum,
    'winning_source_count',winning_count,
    'observations',coalesce(jsonb_agg(jsonb_build_object(
      'source_code',o.source_code,'provider_id',o.provider_id,'outcome',o.observed_outcome,
      'observed_at',o.observed_at,'evidence_reference',o.evidence_reference
    ) order by o.received_at),'[]'::jsonb)
  ) into evidence
  from oracle.observations o
  where o.event_id=ev.id and o.verification_status='VERIFIED';

  select id into resolution_id from oracle.resolutions
  where event_id=ev.id and status='PROVISIONAL' for update;

  if resolution_id is null then
    insert into oracle.resolutions(event_id,oracle_policy_id,outcome_code,status,consensus_evidence,created_by)
    values(ev.id,pol.id,winning_code,'PROVISIONAL',coalesce(evidence,'{}'::jsonb),null)
    returning id into resolution_id;
  else
    update oracle.resolutions
    set outcome_code=winning_code,
        consensus_evidence=coalesce(evidence,'{}'::jsonb),
        created_at=statement_timestamp()
    where id=resolution_id;
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

revoke all on function oracle.evaluate_event_consensus(bigint) from public,anon,authenticated;
grant execute on function oracle.evaluate_event_consensus(bigint) to service_role;

create or replace function oracle.evaluate_pending_events()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare r record; processed integer:=0;
begin
  for r in select id from market.canonical_events where status in ('AWAITING_ORACLE','PROVISIONALLY_RESOLVED','DISPUTED') loop
    perform oracle.evaluate_event_consensus(r.id);
    processed:=processed+1;
  end loop;
  return processed;
end;
$$;
revoke all on function oracle.evaluate_pending_events() from public,anon,authenticated;
grant execute on function oracle.evaluate_pending_events() to service_role;

create or replace function public.open_resolution_dispute(
  p_resolution_id bigint,
  p_reason text,
  p_evidence jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  acct public.user_accounts;
  r oracle.resolutions;
  pol oracle.policies;
  dispute_public_id uuid;
begin
  acct:=private.require_active_account();
  select * into r from oracle.resolutions where id=p_resolution_id for share;
  if r.id is null or r.status<>'PROVISIONAL' then raise exception 'Provisional resolution required' using errcode='P0001'; end if;
  select * into pol from oracle.policies where id=r.oracle_policy_id;
  if statement_timestamp() >= r.created_at + make_interval(secs=>pol.dispute_window_seconds) then
    raise exception 'Dispute window has closed' using errcode='P0001';
  end if;
  if p_reason is null or char_length(trim(p_reason))<5 or char_length(p_reason)>2000 then
    raise exception 'Dispute reason must be 5-2000 characters' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(p_evidence,'[]'::jsonb))<>'array' then raise exception 'Evidence must be an array' using errcode='22023'; end if;

  insert into oracle.disputes(event_id,resolution_id,opened_by,reason,evidence,status)
  values(r.event_id,r.id,auth.uid(),trim(p_reason),coalesce(p_evidence,'[]'::jsonb),'OPEN')
  returning public_id into dispute_public_id;
  update market.canonical_events set status='DISPUTED',updated_at=statement_timestamp() where id=r.event_id;
  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('ORACLE_DISPUTE_OPENED','ORACLE_DISPUTE',dispute_public_id::text,
    jsonb_build_object('resolution_id',r.id,'event_id',r.event_id,'opened_by',auth.uid()),
    'oracle-dispute-opened:'||dispute_public_id::text);
  return dispute_public_id;
end;
$$;

create or replace function public.admin_decide_resolution_dispute(
  p_dispute_public_id uuid,
  p_decision text,
  p_decision_reason text,
  p_replacement_outcome_code text default null
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  d oracle.disputes;
  r oracle.resolutions;
  ev market.canonical_events;
  decision text:=upper(p_decision);
begin
  if not private.has_permission('oracle.review') then raise exception 'Permission required' using errcode='42501'; end if;
  if decision not in ('REJECT','UPHOLD','ESCALATE') then raise exception 'Invalid dispute decision' using errcode='22023'; end if;
  select * into d from oracle.disputes where public_id=p_dispute_public_id for update;
  if d.id is null or d.status not in ('OPEN','UNDER_REVIEW','ESCALATED') then raise exception 'Active dispute required' using errcode='P0001'; end if;
  select * into r from oracle.resolutions where id=d.resolution_id for update;
  select * into ev from market.canonical_events where id=d.event_id for update;

  if decision='ESCALATE' then
    update oracle.disputes set status='ESCALATED',decision_reason=p_decision_reason where id=d.id;
    return true;
  elsif decision='REJECT' then
    update oracle.disputes set status='REJECTED',decision_reason=p_decision_reason,resolved_by=auth.uid(),resolved_at=statement_timestamp() where id=d.id;
  else
    if p_replacement_outcome_code is null or not exists(
      select 1 from market.instruments i join market.outcomes o on o.instrument_id=i.id
      where i.canonical_event_id=d.event_id and o.code=upper(p_replacement_outcome_code)
    ) then raise exception 'Valid replacement outcome required when upholding dispute' using errcode='22023'; end if;
    update oracle.resolutions
      set outcome_code=upper(p_replacement_outcome_code),
          consensus_evidence=consensus_evidence||jsonb_build_object('dispute_override',jsonb_build_object('dispute_id',d.public_id,'reviewer',auth.uid(),'reason',p_decision_reason)),
          created_at=statement_timestamp()
      where id=r.id and status='PROVISIONAL';
    update oracle.disputes set status='UPHELD',decision_reason=p_decision_reason,resolved_by=auth.uid(),resolved_at=statement_timestamp() where id=d.id;
  end if;

  if not exists(select 1 from oracle.disputes x where x.event_id=d.event_id and x.id<>d.id and x.status in ('OPEN','UNDER_REVIEW','ESCALATED')) then
    update market.canonical_events set status='PROVISIONALLY_RESOLVED',updated_at=statement_timestamp() where id=d.event_id;
  end if;
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,after_state)
  values(auth.uid(),'USER','ORACLE_DISPUTE_DECISION','ORACLE_DISPUTE',d.public_id::text,p_decision_reason,
    jsonb_build_object('decision',decision,'replacement_outcome_code',p_replacement_outcome_code));
  return true;
end;
$$;

create or replace function command.close_due_markets()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare rec record; closed_count integer:=0; released_count integer;
begin
  for rec in
    select id,public_id,canonical_event_id from market.instruments
    where status in ('OPEN','SUSPENDED') and closed_at is not null and closed_at<=statement_timestamp()
    order by closed_at,id
    for update skip locked
  loop
    released_count:=command.release_open_orders_for_instrument(rec.id);
    update market.instruments set status='CLOSED',updated_at=statement_timestamp() where id=rec.id;
    if not exists(select 1 from market.instruments i where i.canonical_event_id=rec.canonical_event_id and i.status in ('OPEN','SUSPENDED')) then
      update market.canonical_events set status='AWAITING_ORACLE',updated_at=statement_timestamp() where id=rec.canonical_event_id and status not in ('SETTLED','VOIDED','CANCELLED');
    end if;
    insert into audit.records(actor_type,action,resource_type,resource_id,reason,metadata)
    values('SYSTEM','SCHEDULED_MARKET_CLOSE','MARKET_INSTRUMENT',rec.public_id::text,'Configured market close time reached',jsonb_build_object('released_orders',released_count));
    closed_count:=closed_count+1;
  end loop;
  return closed_count;
end;
$$;
revoke all on function command.close_due_markets() from public,anon,authenticated;
grant execute on function command.close_due_markets() to service_role;

revoke all on function public.open_resolution_dispute(bigint,text,jsonb) from public,anon;
grant execute on function public.open_resolution_dispute(bigint,text,jsonb) to authenticated;
revoke all on function public.admin_decide_resolution_dispute(uuid,text,text,text) from public,anon;
grant execute on function public.admin_decide_resolution_dispute(uuid,text,text,text) to authenticated;

-- Keep lifecycle maintenance in Postgres instead of consuming Edge Function slots.
create extension if not exists pg_cron with schema pg_catalog;
do $$
begin
  if exists(select 1 from cron.job where jobname='vad-close-due-markets') then
    perform cron.unschedule('vad-close-due-markets');
  end if;
  if exists(select 1 from cron.job where jobname='vad-evaluate-oracle-consensus') then
    perform cron.unschedule('vad-evaluate-oracle-consensus');
  end if;
  perform cron.schedule('vad-close-due-markets','* * * * *','select command.close_due_markets();');
  perform cron.schedule('vad-evaluate-oracle-consensus','* * * * *','select oracle.evaluate_pending_events();');
end $$;
