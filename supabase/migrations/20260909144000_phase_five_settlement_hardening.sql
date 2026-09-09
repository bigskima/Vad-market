-- VAD Phase 5B: settlement retry safety, fee policy snapshots and immutable final truth.

alter table settlement.entitlements
  add column if not exists fee_policy_version_id bigint references policy.policy_versions(id);

create or replace function oracle.guard_resolution_mutation()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if tg_op='DELETE' then
    if old.status in ('FINAL','VOID') then raise exception 'Final oracle resolutions are immutable' using errcode='55000'; end if;
    return old;
  end if;
  if old.status in ('FINAL','VOID') then raise exception 'Final oracle resolutions are immutable' using errcode='55000'; end if;
  if old.status='PROVISIONAL' and new.status not in ('PROVISIONAL','FINAL','VOID') then
    raise exception 'Invalid oracle resolution transition' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists oracle_resolutions_guard on oracle.resolutions;
create trigger oracle_resolutions_guard
before update or delete on oracle.resolutions
for each row execute function oracle.guard_resolution_mutation();

create or replace function public.admin_create_provisional_resolution(
  p_event_public_id uuid,p_outcome_code text,p_evidence jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  ev market.canonical_events; binding oracle.event_policy_bindings; pol oracle.policies;
  resolution_id bigint; existing oracle.resolutions;
begin
  if not private.has_permission('oracle.review') then raise exception 'Permission required' using errcode='42501'; end if;
  select * into ev from market.canonical_events where public_id=p_event_public_id for update;
  if ev.id is null then raise exception 'Event not found' using errcode='P0002'; end if;
  if ev.status not in ('AWAITING_ORACLE','CLOSED','PROVISIONALLY_RESOLVED') then raise exception 'Event is not awaiting resolution' using errcode='P0001'; end if;
  select * into binding from oracle.event_policy_bindings where event_id=ev.id;
  select * into pol from oracle.policies where id=binding.oracle_policy_id;
  if pol.id is null or pol.status<>'ACTIVE' then raise exception 'Active oracle policy is required' using errcode='23514'; end if;
  if not exists(select 1 from market.instruments i join market.outcomes o on o.instrument_id=i.id where i.canonical_event_id=ev.id and o.code=upper(p_outcome_code)) then
    raise exception 'Outcome is not valid for this event' using errcode='22023';
  end if;
  select * into existing from oracle.resolutions where event_id=ev.id and status='PROVISIONAL' for update;
  if existing.id is not null then
    if existing.created_by is distinct from auth.uid() then raise exception 'A provisional resolution already exists under another reviewer' using errcode='P0001'; end if;
    update oracle.resolutions set outcome_code=upper(p_outcome_code),consensus_evidence=coalesce(p_evidence,'{}'::jsonb) where id=existing.id;
    resolution_id:=existing.id;
  else
    insert into oracle.resolutions(event_id,oracle_policy_id,outcome_code,status,consensus_evidence,created_by)
    values(ev.id,pol.id,upper(p_outcome_code),'PROVISIONAL',coalesce(p_evidence,'{}'::jsonb),auth.uid())
    returning id into resolution_id;
  end if;
  update market.canonical_events set status='PROVISIONALLY_RESOLVED',updated_at=statement_timestamp() where id=ev.id;
  return resolution_id;
end;
$$;

create or replace function settlement.finalize_accounting_state(p_run_id bigint)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare run settlement.runs; instrument market.instruments; ev market.canonical_events; r oracle.resolutions;
begin
  select * into run from settlement.runs where id=p_run_id for update;
  select * into instrument from market.instruments where id=run.instrument_id for update;
  select * into r from oracle.resolutions where id=run.resolution_id;
  select * into ev from market.canonical_events where id=instrument.canonical_event_id for update;

  update trading.positions p set
    realized_pnl=p.realized_pnl
      + coalesce((select e.net_amount from settlement.entitlements e where e.run_id=run.id and e.user_id=p.user_id and e.outcome_id=p.outcome_id),0)
      - p.total_cost_basis,
    fees_paid=p.fees_paid
      + coalesce((select e.fee_amount from settlement.entitlements e where e.run_id=run.id and e.user_id=p.user_id and e.outcome_id=p.outcome_id),0),
    quantity=0,total_cost_basis=0,updated_at=statement_timestamp()
  where p.instrument_id=instrument.id and (p.quantity<>0 or p.total_cost_basis<>0);

  update settlement.runs set status='SETTLED',settled_at=coalesce(settled_at,statement_timestamp()) where id=run.id;
  update market.instruments set status=case when r.status='VOID' then 'VOIDED' else 'SETTLED' end,updated_at=statement_timestamp() where id=instrument.id;
  if not exists(select 1 from market.instruments i where i.canonical_event_id=ev.id and i.status not in ('SETTLED','VOIDED','CANCELLED')) then
    update market.canonical_events set status=case when r.status='VOID' then 'VOIDED' else 'SETTLED' end,updated_at=statement_timestamp() where id=ev.id;
  end if;
end;
$$;

revoke all on function settlement.finalize_accounting_state(bigint) from public,anon,authenticated;
grant execute on function settlement.finalize_accounting_state(bigint) to service_role;

create or replace function settlement.execute_instrument(p_instrument_id bigint)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  instrument market.instruments; ev market.canonical_events; r oracle.resolutions; pol oracle.policies;
  collateral_account bigint; collateral numeric(38,18); gross numeric(38,18); total_fee numeric(38,18);
  v_run_id bigint; run_public_id uuid; winning_outcome bigint; outcome_count integer; void_factor numeric(38,18);
  fee_account bigint; journal_id bigint; journal_status text; seq integer:=1; expected_entries integer;
  ent settlement.entitlements; user_account bigint; fee_rec record; mode text;
begin
  select * into instrument from market.instruments where id=p_instrument_id for update;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if instrument.status in ('SETTLED','VOIDED') then
    select id,public_id into v_run_id,run_public_id from settlement.runs where instrument_id=instrument.id and status='SETTLED' order by id desc limit 1;
    if v_run_id is not null then perform settlement.finalize_accounting_state(v_run_id); end if;
    return run_public_id;
  end if;
  if instrument.status not in ('SETTLEMENT_PENDING','CLOSED') then raise exception 'Market is not settlement-ready' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vad-settlement:'||instrument.id::text,0));
  perform command.release_open_orders_for_instrument(instrument.id);
  select * into ev from market.canonical_events where id=instrument.canonical_event_id;
  select * into r from oracle.resolutions where event_id=ev.id and status in ('FINAL','VOID') order by finalized_at desc limit 1;
  if r.id is null then raise exception 'Final oracle resolution is required' using errcode='23514'; end if;
  select * into pol from oracle.policies where id=r.oracle_policy_id;
  collateral_account:=finance.ensure_market_collateral_account(instrument.id,instrument.asset_id);
  collateral:=finance.account_balance(collateral_account);
  select count(*) into outcome_count from market.outcomes where instrument_id=instrument.id;
  if outcome_count<2 then raise exception 'Market outcomes are invalid' using errcode='23514'; end if;

  insert into settlement.runs(instrument_id,resolution_id,status,gross_liability,collateral_available,settlement_fee_total,idempotency_key)
  values(instrument.id,r.id,'PLANNED',0,collateral,0,'settle:'||instrument.public_id::text||':'||r.id::text)
  on conflict(idempotency_key) do update set collateral_available=excluded.collateral_available
  returning id,public_id into v_run_id,run_public_id;

  delete from settlement.entitlements e where e.run_id=v_run_id;
  if r.status='FINAL' then
    select id into winning_outcome from market.outcomes where instrument_id=instrument.id and code=r.outcome_code;
    if winning_outcome is null then raise exception 'Resolved outcome is missing from market' using errcode='23514'; end if;
    insert into settlement.entitlements(run_id,user_id,outcome_id,quantity,gross_amount,fee_amount,net_amount)
    select v_run_id,p.user_id,p.outcome_id,p.quantity,round(p.quantity*instrument.settlement_unit,18),0,round(p.quantity*instrument.settlement_unit,18)
    from trading.positions p where p.instrument_id=instrument.id and p.outcome_id=winning_outcome and p.quantity>0;
  else
    mode:=coalesce(pol.void_rule->>'mode','');
    if mode<>'EQUAL_SPLIT' then raise exception 'Unsupported void settlement policy' using errcode='0A000'; end if;
    void_factor:=1::numeric/outcome_count;
    insert into settlement.entitlements(run_id,user_id,outcome_id,quantity,gross_amount,fee_amount,net_amount)
    select v_run_id,p.user_id,p.outcome_id,p.quantity,round(p.quantity*instrument.settlement_unit*void_factor,18),0,round(p.quantity*instrument.settlement_unit*void_factor,18)
    from trading.positions p where p.instrument_id=instrument.id and p.quantity>0;
  end if;

  for ent in select * from settlement.entitlements e where e.run_id=v_run_id for update loop
    select * into fee_rec from command.quote_settlement_fee(ent.gross_amount);
    update settlement.entitlements set fee_amount=fee_rec.fee_amount,net_amount=ent.gross_amount-fee_rec.fee_amount,fee_policy_version_id=fee_rec.policy_version_id where id=ent.id;
  end loop;
  select coalesce(sum(gross_amount),0),coalesce(sum(fee_amount),0) into gross,total_fee from settlement.entitlements where run_id=v_run_id;
  if round(collateral,18)<>round(gross,18) then
    update settlement.runs set status='FAILED',gross_liability=gross,settlement_fee_total=total_fee,failure_reason='COLLATERAL_LIABILITY_MISMATCH' where id=v_run_id;
    return run_public_id;
  end if;
  update settlement.runs set status='VALIDATED',gross_liability=gross,collateral_available=collateral,settlement_fee_total=total_fee,failure_reason=null where id=v_run_id;

  insert into finance.ledger_journals(asset_id,journal_type,idempotency_key,reference_type,reference_id,description)
  values(instrument.asset_id,'MARKET_SETTLEMENT','settlement-journal:'||run_public_id::text,'SETTLEMENT_RUN',run_public_id::text,'Settle VAD market from protected collateral')
  on conflict(idempotency_key) do nothing returning id into journal_id;
  if journal_id is null then select id,status into journal_id,journal_status from finance.ledger_journals where idempotency_key='settlement-journal:'||run_public_id::text;
  else select status into journal_status from finance.ledger_journals where id=journal_id; end if;

  if journal_status<>'POSTED' then
    delete from finance.ledger_entries where journal_id=journal_id;
    insert into finance.ledger_entries(journal_id,account_id,sequence_number,direction,amount)
    values(journal_id,collateral_account,seq,'DEBIT',gross); seq:=seq+1;
    for ent in select * from settlement.entitlements e where e.run_id=v_run_id order by e.id loop
      if ent.net_amount>0 then
        user_account:=finance.ensure_user_account(ent.user_id,instrument.asset_id,'USER_AVAILABLE');
        insert into finance.ledger_entries(journal_id,account_id,sequence_number,direction,amount)
        values(journal_id,user_account,seq,'CREDIT',ent.net_amount); seq:=seq+1;
      end if;
    end loop;
    if total_fee>0 then
      fee_account:=finance.ensure_platform_account(instrument.asset_id,'PLATFORM_SETTLEMENT_FEE_REVENUE');
      insert into finance.ledger_entries(journal_id,account_id,sequence_number,direction,amount)
      values(journal_id,fee_account,seq,'CREDIT',total_fee); seq:=seq+1;
    end if;
    expected_entries:=seq-1;
    perform finance.post_ledger_journal(journal_id,expected_entries);
  end if;

  update settlement.runs set ledger_journal_id=journal_id where id=v_run_id;
  perform settlement.finalize_accounting_state(v_run_id);
  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('SETTLEMENT_COMPLETED','SETTLEMENT_RUN',run_public_id::text,jsonb_build_object('instrument_id',instrument.public_id,'gross_liability',gross,'fees',total_fee,'resolution_status',r.status),'settlement-completed:'||run_public_id::text)
  on conflict(idempotency_key) do nothing;
  return run_public_id;
end;
$$;

create or replace function public.my_settlement_receipts()
returns table(
  settlement_id uuid,market_id uuid,market_title text,outcome_code text,
  quantity numeric,gross_amount numeric,fee_amount numeric,net_amount numeric,settled_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select sr.public_id,mi.public_id,ce.title,mo.code,se.quantity,se.gross_amount,se.fee_amount,se.net_amount,sr.settled_at
  from settlement.entitlements se
  join settlement.runs sr on sr.id=se.run_id
  join market.instruments mi on mi.id=sr.instrument_id
  join market.canonical_events ce on ce.id=mi.canonical_event_id
  join market.outcomes mo on mo.id=se.outcome_id
  where se.user_id=auth.uid() and sr.status='SETTLED'
  order by sr.settled_at desc nulls last,se.id desc;
$$;

grant execute on function public.my_settlement_receipts() to authenticated;
revoke all on function public.my_settlement_receipts() from anon;
