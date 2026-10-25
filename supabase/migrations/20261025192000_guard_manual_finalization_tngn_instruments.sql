-- Manual review finalizers must also skip instruments on the retired TNGN asset.
-- The canonical event may still be reviewed, but settlement-pending status must
-- never be assigned to a retired TNGN instrument.

create or replace function public.admin_finalize_resolution(
  p_resolution_id bigint,
  p_evidence jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r oracle.resolutions;
  pol oracle.policies;
  ev market.canonical_events;
begin
  if not private.has_permission('oracle.review') then
    raise exception 'Permission required' using errcode='42501';
  end if;
  perform private.assert_service_available('oracle_resolution',auth.uid());

  select * into r
  from oracle.resolutions
  where id=p_resolution_id
  for update;
  if r.id is null then
    raise exception 'Resolution not found' using errcode='P0002';
  end if;
  if r.status<>'PROVISIONAL' then
    raise exception 'Only provisional resolutions can be finalized' using errcode='P0001';
  end if;
  if r.created_by=auth.uid() then
    raise exception 'A different oracle reviewer must finalize the result' using errcode='42501';
  end if;

  select * into pol from oracle.policies where id=r.oracle_policy_id;
  if statement_timestamp()<r.created_at+make_interval(secs=>pol.dispute_window_seconds) then
    raise exception 'Dispute window is still open' using errcode='P0001';
  end if;
  if exists(
    select 1 from oracle.disputes d
    where d.resolution_id=r.id
      and d.status in ('OPEN','UNDER_REVIEW','ESCALATED')
  ) then
    raise exception 'Open dispute prevents finalization' using errcode='P0001';
  end if;

  update oracle.resolutions
     set status='FINAL',
         consensus_evidence=consensus_evidence||coalesce(p_evidence,'{}'::jsonb),
         finalized_at=statement_timestamp(),
         finalized_by=auth.uid()
   where id=r.id;

  select * into ev
  from market.canonical_events
  where id=r.event_id
  for update;

  update market.canonical_events
     set status='FINALIZED',
         updated_at=statement_timestamp()
   where id=ev.id;

  update market.instruments as i
     set status='SETTLEMENT_PENDING',
         updated_at=statement_timestamp()
   where i.canonical_event_id=ev.id
     and i.status='CLOSED'
     and not exists(
       select 1
       from public.assets a
       where a.id=i.asset_id and a.code='TNGN'
     );

  insert into eventing.domain_events(
    event_type,aggregate_type,aggregate_id,payload,idempotency_key
  ) values(
    'MARKET_FINALIZED',
    'CANONICAL_EVENT',
    ev.public_id::text,
    jsonb_build_object('outcome_code',r.outcome_code,'resolution_id',r.id),
    'market-finalized:'||ev.public_id::text
  ) on conflict(idempotency_key) do nothing;

  return true;
end;
$function$;

create or replace function public.admin_finalize_void(
  p_resolution_id bigint,
  p_evidence jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r oracle.resolutions;
  pol oracle.policies;
  ev market.canonical_events;
  mode text;
begin
  if not private.has_permission('oracle.review') then
    raise exception 'Permission required' using errcode='42501';
  end if;
  perform private.assert_service_available('oracle_resolution',auth.uid());

  select * into r
  from oracle.resolutions
  where id=p_resolution_id
  for update;
  if r.id is null or r.status<>'PROVISIONAL' then
    raise exception 'Provisional resolution required' using errcode='P0001';
  end if;
  if r.created_by=auth.uid() then
    raise exception 'A different reviewer must finalize' using errcode='42501';
  end if;

  select * into pol from oracle.policies where id=r.oracle_policy_id;
  mode:=coalesce(pol.void_rule->>'mode','');
  if mode<>'EQUAL_SPLIT' then
    raise exception 'This VAD runtime currently supports only EQUAL_SPLIT void policy' using errcode='0A000';
  end if;
  if statement_timestamp()<r.created_at+make_interval(secs=>pol.dispute_window_seconds) then
    raise exception 'Dispute window is still open' using errcode='P0001';
  end if;
  if exists(
    select 1 from oracle.disputes d
    where d.resolution_id=r.id
      and d.status in ('OPEN','UNDER_REVIEW','ESCALATED')
  ) then
    raise exception 'Open dispute prevents finalization' using errcode='P0001';
  end if;

  update oracle.resolutions
     set status='VOID',
         outcome_code=null,
         consensus_evidence=consensus_evidence||coalesce(p_evidence,'{}'::jsonb),
         finalized_at=statement_timestamp(),
         finalized_by=auth.uid()
   where id=r.id;

  select * into ev
  from market.canonical_events
  where id=r.event_id
  for update;

  update market.canonical_events
     set status='FINALIZED',
         updated_at=statement_timestamp()
   where id=ev.id;

  update market.instruments as i
     set status='SETTLEMENT_PENDING',
         updated_at=statement_timestamp()
   where i.canonical_event_id=ev.id
     and i.status='CLOSED'
     and not exists(
       select 1
       from public.assets a
       where a.id=i.asset_id and a.code='TNGN'
     );

  return true;
end;
$function$;
