-- VAD Phase 41: policy-driven Oracle finalization and system-draft approval hardening.
--
-- Objective results created from verified provider quorum can finalize automatically
-- after the policy dispute window. Manual reviewer resolutions remain manual. This
-- function does not execute settlement; it only advances a closed instrument to
-- SETTLEMENT_PENDING. Settlement stays behind its independent service/finance gate.

-- A system-authored DRAFT is a valid maker/checker workflow: the system is the
-- maker and an authorized human reviewer is the checker. Active system-authored
-- policy versions therefore require a human approver rather than remaining
-- permanently unapprovable.
alter table oracle.policies
  drop constraint if exists oracle_policy_dual_control;

alter table oracle.policies
  add constraint oracle_policy_dual_control check (
    (
      created_by is null
      and (
        (status='DRAFT' and approved_by is null)
        or (status in ('ACTIVE','RETIRED') and approved_by is not null)
      )
    )
    or (
      created_by is not null
      and approved_by is null
      and status='DRAFT'
    )
    or (
      created_by is not null
      and approved_by is not null
      and created_by<>approved_by
    )
  );

-- Configure the launch policy draft to use automated finalization only after its
-- dispute window. Existing ACTIVE policy versions are never mutated in place.
update oracle.policies
set consensus_rule = consensus_rule || jsonb_build_object(
  'finalization_mode','AUTO_AFTER_DISPUTE_WINDOW'
)
where name='VAD Crypto Threshold Launch Policy'
  and status='DRAFT'
  and approved_by is null;

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
    -- Automatic finalization is restricted to the deterministic provider-quorum
    -- evidence created by oracle.evaluate_event_consensus().
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
      jsonb_build_object(
        'status','FINAL',
        'outcome_code',v_row.outcome_code
      ),
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
  and p.status='DRAFT'
  and not exists(
    select 1 from audit.records a
    where a.action='ORACLE_AUTO_FINALIZATION_CONFIGURED'
      and a.resource_type='ORACLE_POLICY'
      and a.resource_id=p.public_id::text
  );
