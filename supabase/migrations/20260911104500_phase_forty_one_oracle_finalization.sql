-- VAD Phase 41: policy-driven Oracle finalization and system-draft approval hardening.
--
-- Objective results created from verified provider quorum can finalize automatically
-- after the policy dispute window. Manual reviewer resolutions remain manual. This
-- function does not execute settlement; it only advances a closed instrument to
-- SETTLEMENT_PENDING. Settlement stays behind its independent service/finance gate.

-- System-authored policy drafts use the system as maker and an authorized human as
-- checker. Drafts may also be retired without approval when a newer immutable
-- version supersedes them.
alter table oracle.policies
  drop constraint if exists oracle_policy_dual_control;

alter table oracle.policies
  add constraint oracle_policy_dual_control check (
    (
      created_by is null
      and (
        (status in ('DRAFT','RETIRED') and approved_by is null)
        or (status in ('ACTIVE','RETIRED') and approved_by is not null)
      )
    )
    or (
      created_by is not null
      and approved_by is null
      and status in ('DRAFT','RETIRED')
    )
    or (
      created_by is not null
      and approved_by is not null
      and created_by<>approved_by
    )
  );

-- Oracle policy facts are immutable. Approval is DRAFT -> ACTIVE; supersession is
-- DRAFT -> RETIRED. Neither transition may change the policy facts themselves.
create or replace function oracle.guard_policy_mutation()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if tg_op='DELETE' then
    raise exception 'Oracle policies cannot be deleted' using errcode='55000';
  end if;

  if old.status<>'DRAFT' then
    raise exception 'Activated or retired oracle policies are immutable' using errcode='55000';
  end if;

  if row(
    new.id,new.public_id,new.name,new.capability_id,new.version,
    new.source_hierarchy,new.consensus_rule,new.close_rule,
    new.postponement_rule,new.cancellation_rule,new.void_rule,
    new.dispute_window_seconds,new.effective_at,new.created_by,new.created_at
  ) is distinct from row(
    old.id,old.public_id,old.name,old.capability_id,old.version,
    old.source_hierarchy,old.consensus_rule,old.close_rule,
    old.postponement_rule,old.cancellation_rule,old.void_rule,
    old.dispute_window_seconds,old.effective_at,old.created_by,old.created_at
  ) then
    raise exception 'Oracle policy facts cannot change after draft creation' using errcode='55000';
  end if;

  if new.status='ACTIVE' then
    if new.approved_by is null
       or (old.created_by is not null and new.approved_by=old.created_by) then
      raise exception 'A different authorized reviewer must approve the oracle policy' using errcode='23514';
    end if;
    return new;
  end if;

  if new.status='RETIRED' then
    if new.approved_by is distinct from old.approved_by then
      raise exception 'Retiring a draft cannot add or replace an approver' using errcode='23514';
    end if;
    return new;
  end if;

  raise exception 'The permitted oracle policy transitions are DRAFT to ACTIVE or DRAFT to RETIRED' using errcode='23514';
end;
$$;

-- The original launch draft is immutable, so introduce the automatic-finalization
-- rule as a new policy version instead of mutating version 1.
insert into oracle.policies(
  name,capability_id,version,source_hierarchy,consensus_rule,close_rule,
  postponement_rule,cancellation_rule,void_rule,dispute_window_seconds,
  status,effective_at,created_by,approved_by
)
select
  p.name,
  p.capability_id,
  2,
  p.source_hierarchy,
  p.consensus_rule||jsonb_build_object('finalization_mode','AUTO_AFTER_DISPUTE_WINDOW'),
  p.close_rule,
  p.postponement_rule,
  p.cancellation_rule,
  p.void_rule,
  p.dispute_window_seconds,
  'DRAFT',
  statement_timestamp(),
  null,
  null
from oracle.policies p
where p.name='VAD Crypto Threshold Launch Policy'
  and p.version=1
  and not exists(
    select 1 from oracle.policies existing
    where existing.name=p.name and existing.version=2
  );

update oracle.policies
set status='RETIRED'
where name='VAD Crypto Threshold Launch Policy'
  and version=1
  and status='DRAFT';

create or replace function oracle.finalize_due_automatic_resolutions(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_service_state jsonb;
  v_row record;
  v_quorum integer;
  v_winning_count integer;
  v_distinct_providers integer;
  v_mismatched_outcomes integer;
  v_finalized integer:=0;
begin
  if p_limit is null or p_limit<1 or p_limit>500 then
    raise exception 'Finalization limit must be between 1 and 500' using errcode='22023';
  end if;

  v_service_state:=private.service_control_state('oracle_resolution',null);
  if not coalesce((v_service_state->>'enabled')::boolean,false) then
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
    join oracle.policies p on p.id=r.oracle_policy_id
    join market.canonical_events e on e.id=r.event_id
    where r.status='PROVISIONAL'
      and r.created_by is null
      and r.outcome_code is not null
      and p.status='ACTIVE'
      and p.approved_by is not null
      and upper(coalesce(p.consensus_rule->>'finalization_mode',''))='AUTO_AFTER_DISPUTE_WINDOW'
      and statement_timestamp()>=r.created_at+make_interval(secs=>p.dispute_window_seconds)
      and e.status='PROVISIONALLY_RESOLVED'
      and not exists(
        select 1
        from oracle.disputes d
        where d.resolution_id=r.id
          and d.status in ('OPEN','UNDER_REVIEW','ESCALATED')
      )
    order by r.created_at,r.id
    for update of r skip locked
    limit p_limit
  loop
    if coalesce(v_row.consensus_evidence->>'algorithm','')<>'PROVIDER_QUORUM_V2' then
      continue;
    end if;

    v_quorum:=coalesce(
      (v_row.consensus_rule->>'min_agreeing_providers')::integer,
      (v_row.consensus_rule->>'min_agreeing_sources')::integer,
      (v_row.consensus_rule->>'quorum')::integer,
      2
    );
    v_winning_count:=coalesce((v_row.consensus_evidence->>'winning_provider_count')::integer,0);

    if v_quorum<2 or v_winning_count<v_quorum then
      continue;
    end if;

    if jsonb_typeof(v_row.consensus_evidence->'observations')<>'array' then
      continue;
    end if;

    select
      count(distinct nullif(obs->>'provider_id',''))::integer,
      count(*) filter(
        where upper(coalesce(obs->>'outcome',''))<>upper(v_row.outcome_code)
      )::integer
    into v_distinct_providers,v_mismatched_outcomes
    from jsonb_array_elements(v_row.consensus_evidence->'observations') obs;

    if coalesce(v_distinct_providers,0)<v_quorum
       or coalesce(v_mismatched_outcomes,0)>0 then
      continue;
    end if;

    update oracle.resolutions
       set status='FINAL',
           finalized_at=statement_timestamp(),
           finalized_by=null,
           consensus_evidence=consensus_evidence||jsonb_build_object(
             'auto_finalization',jsonb_build_object(
               'mode','AUTO_AFTER_DISPUTE_WINDOW',
               'finalized_at',statement_timestamp(),
               'policy_id',v_row.policy_public_id,
               'verified_provider_count',v_distinct_providers
             )
           )
     where id=v_row.resolution_id
       and status='PROVISIONAL';

    if not found then
      continue;
    end if;

    update market.canonical_events
       set status='FINALIZED',updated_at=statement_timestamp()
     where id=v_row.event_id
       and status='PROVISIONALLY_RESOLVED';

    update market.instruments
       set status='SETTLEMENT_PENDING',updated_at=statement_timestamp()
     where canonical_event_id=v_row.event_id
       and status='CLOSED';

    insert into eventing.domain_events(
      event_type,aggregate_type,aggregate_id,payload,idempotency_key
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
      'market-finalized:'||v_row.event_public_id::text
    ) on conflict(idempotency_key) do nothing;

    insert into audit.records(
      actor_type,action,resource_type,resource_id,reason,after_state,metadata
    ) values (
      'SYSTEM',
      'ORACLE_RESOLUTION_AUTO_FINALIZED',
      'ORACLE_RESOLUTION',
      v_row.resolution_id::text,
      'Verified provider quorum remained undisputed through the policy dispute window',
      jsonb_build_object('status','FINAL','outcome_code',v_row.outcome_code),
      jsonb_build_object(
        'event_public_id',v_row.event_public_id,
        'policy_public_id',v_row.policy_public_id,
        'provider_count',v_distinct_providers,
        'quorum',v_quorum
      )
    );

    v_finalized:=v_finalized+1;
  end loop;

  return v_finalized;
end;
$$;

revoke all on function oracle.finalize_due_automatic_resolutions(integer) from public,anon,authenticated;
grant execute on function oracle.finalize_due_automatic_resolutions(integer) to service_role;

select cron.schedule(
  'vad-finalize-oracle-resolutions',
  '* * * * *',
  'select oracle.finalize_due_automatic_resolutions(100);'
);

insert into audit.records(
  actor_type,action,resource_type,resource_id,reason,metadata
)
select
  'SYSTEM',
  'ORACLE_POLICY_SUPERSEDED',
  'ORACLE_POLICY',
  retired.public_id::text,
  'Superseded immutable launch policy draft with automatic-finalization version',
  jsonb_build_object(
    'retired_version',retired.version,
    'replacement_version',replacement.version,
    'replacement_policy_id',replacement.public_id
  )
from oracle.policies retired
join oracle.policies replacement
  on replacement.name=retired.name and replacement.version=2
where retired.name='VAD Crypto Threshold Launch Policy'
  and retired.version=1
  and retired.status='RETIRED'
  and not exists(
    select 1 from audit.records a
    where a.action='ORACLE_POLICY_SUPERSEDED'
      and a.resource_type='ORACLE_POLICY'
      and a.resource_id=retired.public_id::text
  );

insert into audit.records(
  actor_type,action,resource_type,resource_id,reason,metadata
)
select
  'SYSTEM',
  'ORACLE_AUTO_FINALIZATION_CONFIGURED',
  'ORACLE_POLICY',
  p.public_id::text,
  'Configured provider-quorum launch policy for automatic finalization after its dispute window',
  jsonb_build_object(
    'policy_name',p.name,
    'version',p.version,
    'finalization_mode',p.consensus_rule->>'finalization_mode',
    'dispute_window_seconds',p.dispute_window_seconds
  )
from oracle.policies p
where p.name='VAD Crypto Threshold Launch Policy'
  and p.version=2
  and p.status='DRAFT'
  and not exists(
    select 1 from audit.records a
    where a.action='ORACLE_AUTO_FINALIZATION_CONFIGURED'
      and a.resource_type='ORACLE_POLICY'
      and a.resource_id=p.public_id::text
  );
