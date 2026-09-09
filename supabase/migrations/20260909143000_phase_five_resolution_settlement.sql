-- VAD Phase 5: ledger balancing, oracle finality, market close and deterministic settlement.

alter table oracle.resolutions add column if not exists created_by uuid references auth.users(id) on delete restrict;
alter table oracle.resolutions add column if not exists finalized_by uuid references auth.users(id) on delete restrict;

-- Harden every journal, not only settlement: a draft cannot become POSTED unless
-- debit and credit totals are exactly equal for the journal asset.
create or replace function finance.post_ledger_journal(
  p_journal_id bigint,
  p_expected_entry_count integer default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  journal_public_id uuid; journal_status text; actual_entry_count integer;
  debit_total numeric(38,18); credit_total numeric(38,18);
begin
  select j.public_id,j.status into journal_public_id,journal_status
  from finance.ledger_journals j where j.id=p_journal_id for update;
  if journal_public_id is null then raise exception 'Ledger journal % does not exist',p_journal_id using errcode='P0002'; end if;
  if journal_status='POSTED' then return journal_public_id; end if;
  select count(*),coalesce(sum(amount) filter(where direction='DEBIT'),0),coalesce(sum(amount) filter(where direction='CREDIT'),0)
    into actual_entry_count,debit_total,credit_total
  from finance.ledger_entries where journal_id=p_journal_id;
  if p_expected_entry_count is not null and actual_entry_count<>p_expected_entry_count then
    raise exception 'Expected % entries, found %',p_expected_entry_count,actual_entry_count using errcode='23514';
  end if;
  if round(debit_total,18)<>round(credit_total,18) then
    raise exception 'Unbalanced ledger journal: debits %, credits %',debit_total,credit_total using errcode='23514';
  end if;
  update finance.ledger_journals set status='POSTED',posted_at=statement_timestamp() where id=p_journal_id;
  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key,request_id)
  select 'LEDGER_JOURNAL_POSTED','LEDGER_JOURNAL',j.public_id::text,jsonb_build_object('journal_id',j.public_id,'asset_id',j.asset_id),'ledger-journal-posted:'||j.public_id::text,j.request_id
  from finance.ledger_journals j where j.id=p_journal_id on conflict(idempotency_key) do nothing;
  return journal_public_id;
end;
$$;

create or replace function finance.ensure_platform_account(p_asset_id bigint,p_account_type text)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare account_id bigint;
begin
  if p_account_type not in ('PLATFORM_TRADING_FEE_REVENUE','PLATFORM_SETTLEMENT_FEE_REVENUE','PLATFORM_WITHDRAWAL_REVENUE','TREASURY','SUSPENSE') then
    raise exception 'Unsupported platform account type' using errcode='22023';
  end if;
  insert into finance.ledger_accounts(asset_id,account_type,owner_type,owner_reference)
  values(p_asset_id,p_account_type,'PLATFORM','VAD') on conflict(asset_id,account_type,owner_type,owner_reference) do nothing;
  select id into account_id from finance.ledger_accounts
  where asset_id=p_asset_id and account_type=p_account_type and owner_type='PLATFORM' and owner_reference='VAD';
  return account_id;
end;
$$;

revoke all on function finance.ensure_platform_account(bigint,text) from public,anon,authenticated;
grant execute on function finance.ensure_platform_account(bigint,text) to service_role;

create or replace function command.quote_settlement_fee(p_gross numeric)
returns table(fee_amount numeric,policy_version_id bigint)
language plpgsql
stable
security definer
set search_path=''
as $$
declare cfg jsonb; rate_bps numeric:=0; minimum_fee numeric:=0; maximum_fee numeric:=null;
begin
  select pv.configuration,pv.id into cfg,policy_version_id
  from policy.policies p join policy.policy_versions pv on pv.id=p.current_version_id
  where p.domain='FEES' and p.name='settlement_fee' and p.status='ACTIVE'
    and pv.effective_at<=statement_timestamp() and (pv.expires_at is null or pv.expires_at>statement_timestamp())
  limit 1;
  if cfg is not null then
    rate_bps:=coalesce((cfg->>'rate_bps')::numeric,0);
    minimum_fee:=coalesce((cfg->>'minimum_fee')::numeric,0);
    maximum_fee:=nullif(cfg->>'maximum_fee','')::numeric;
  end if;
  if rate_bps<0 or rate_bps>10000 then raise exception 'Settlement fee policy rate is invalid' using errcode='23514'; end if;
  fee_amount:=greatest(round(p_gross*rate_bps/10000,18),minimum_fee);
  if maximum_fee is not null then fee_amount:=least(fee_amount,maximum_fee); end if;
  fee_amount:=least(fee_amount,p_gross);
  return next;
end;
$$;

revoke all on function command.quote_settlement_fee(numeric) from public,anon,authenticated;
grant execute on function command.quote_settlement_fee(numeric) to service_role;

create or replace function public.admin_close_market(p_instrument_public_id uuid,p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare instrument market.instruments; ev market.canonical_events; released integer;
begin
  if not private.has_permission('markets.manage') then raise exception 'Permission required' using errcode='42501'; end if;
  select * into instrument from market.instruments where public_id=p_instrument_public_id for update;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if instrument.status not in ('OPEN','SUSPENDED') then raise exception 'Market cannot close from current state' using errcode='P0001'; end if;
  released:=command.release_open_orders_for_instrument(instrument.id);
  update market.instruments set status='CLOSED',closed_at=coalesce(closed_at,statement_timestamp()),updated_at=statement_timestamp() where id=instrument.id;
  select * into ev from market.canonical_events where id=instrument.canonical_event_id for update;
  if not exists(select 1 from market.instruments i where i.canonical_event_id=ev.id and i.status in ('OPEN','SUSPENDED')) then
    update market.canonical_events set status='AWAITING_ORACLE',updated_at=statement_timestamp() where id=ev.id;
  end if;
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,before_state,after_state,reason,metadata)
  values(auth.uid(),'USER','MARKET_CLOSE','MARKET_INSTRUMENT',instrument.public_id::text,jsonb_build_object('status',instrument.status),jsonb_build_object('status','CLOSED'),p_reason,jsonb_build_object('released_orders',released));
  return true;
end;
$$;

create or replace function public.admin_create_provisional_resolution(
  p_event_public_id uuid,p_outcome_code text,p_evidence jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare ev market.canonical_events; binding oracle.event_policy_bindings; policy oracle.policies; resolution_id bigint;
begin
  if not private.has_permission('oracle.review') then raise exception 'Permission required' using errcode='42501'; end if;
  select * into ev from market.canonical_events where public_id=p_event_public_id for update;
  if ev.id is null then raise exception 'Event not found' using errcode='P0002'; end if;
  if ev.status not in ('AWAITING_ORACLE','CLOSED') then raise exception 'Event is not awaiting resolution' using errcode='P0001'; end if;
  select * into binding from oracle.event_policy_bindings where event_id=ev.id;
  select * into policy from oracle.policies where id=binding.oracle_policy_id;
  if policy.id is null or policy.status<>'ACTIVE' then raise exception 'Active oracle policy is required' using errcode='23514'; end if;
  if not exists(select 1 from market.instruments i join market.outcomes o on o.instrument_id=i.id where i.canonical_event_id=ev.id and o.code=upper(p_outcome_code)) then
    raise exception 'Outcome is not valid for this event' using errcode='22023';
  end if;
  insert into oracle.resolutions(event_id,oracle_policy_id,outcome_code,status,consensus_evidence,created_by)
  values(ev.id,policy.id,upper(p_outcome_code),'PROVISIONAL',coalesce(p_evidence,'{}'::jsonb),auth.uid())
  on conflict(event_id,status) do update set consensus_evidence=excluded.consensus_evidence,outcome_code=excluded.outcome_code
  returning id into resolution_id;
  update market.canonical_events set status='PROVISIONALLY_RESOLVED',updated_at=statement_timestamp() where id=ev.id;
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,after_state)
  values(auth.uid(),'USER','ORACLE_PROVISIONAL_RESOLUTION','CANONICAL_EVENT',ev.public_id::text,jsonb_build_object('outcome_code',upper(p_outcome_code),'resolution_id',resolution_id));
  return resolution_id;
end;
$$;

create or replace function public.admin_finalize_resolution(p_resolution_id bigint,p_evidence jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare r oracle.resolutions; pol oracle.policies; ev market.canonical_events;
begin
  if not private.has_permission('oracle.review') then raise exception 'Permission required' using errcode='42501'; end if;
  select * into r from oracle.resolutions where id=p_resolution_id for update;
  if r.id is null then raise exception 'Resolution not found' using errcode='P0002'; end if;
  if r.status<>'PROVISIONAL' then raise exception 'Only provisional resolutions can be finalized' using errcode='P0001'; end if;
  if r.created_by=auth.uid() then raise exception 'A different oracle reviewer must finalize the result' using errcode='42501'; end if;
  select * into pol from oracle.policies where id=r.oracle_policy_id;
  if statement_timestamp()<r.created_at+make_interval(secs=>pol.dispute_window_seconds) then raise exception 'Dispute window is still open' using errcode='P0001'; end if;
  if exists(select 1 from oracle.disputes d where d.resolution_id=r.id and d.status in ('OPEN','UNDER_REVIEW','ESCALATED')) then raise exception 'Open dispute prevents finalization' using errcode='P0001'; end if;
  update oracle.resolutions set status='FINAL',consensus_evidence=consensus_evidence||coalesce(p_evidence,'{}'::jsonb),finalized_at=statement_timestamp(),finalized_by=auth.uid() where id=r.id;
  select * into ev from market.canonical_events where id=r.event_id for update;
  update market.canonical_events set status='FINALIZED',updated_at=statement_timestamp() where id=ev.id;
  update market.instruments set status='SETTLEMENT_PENDING',updated_at=statement_timestamp() where canonical_event_id=ev.id and status='CLOSED';
  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('MARKET_FINALIZED','CANONICAL_EVENT',ev.public_id::text,jsonb_build_object('outcome_code',r.outcome_code,'resolution_id',r.id),'market-finalized:'||ev.public_id::text)
  on conflict(idempotency_key) do nothing;
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,after_state)
  values(auth.uid(),'USER','ORACLE_FINALIZE','CANONICAL_EVENT',ev.public_id::text,jsonb_build_object('outcome_code',r.outcome_code,'resolution_id',r.id));
  return true;
end;
$$;

create or replace function public.admin_finalize_void(p_resolution_id bigint,p_evidence jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare r oracle.resolutions; pol oracle.policies; ev market.canonical_events; mode text;
begin
  if not private.has_permission('oracle.review') then raise exception 'Permission required' using errcode='42501'; end if;
  select * into r from oracle.resolutions where id=p_resolution_id for update;
  if r.id is null or r.status<>'PROVISIONAL' then raise exception 'Provisional resolution required' using errcode='P0001'; end if;
  if r.created_by=auth.uid() then raise exception 'A different reviewer must finalize' using errcode='42501'; end if;
  select * into pol from oracle.policies where id=r.oracle_policy_id;
  mode:=coalesce(pol.void_rule->>'mode','');
  if mode<>'EQUAL_SPLIT' then raise exception 'This VAD runtime currently supports only EQUAL_SPLIT void policy' using errcode='0A000'; end if;
  if statement_timestamp()<r.created_at+make_interval(secs=>pol.dispute_window_seconds) then raise exception 'Dispute window is still open' using errcode='P0001'; end if;
  if exists(select 1 from oracle.disputes d where d.resolution_id=r.id and d.status in ('OPEN','UNDER_REVIEW','ESCALATED')) then raise exception 'Open dispute prevents finalization' using errcode='P0001'; end if;
  update oracle.resolutions set status='VOID',outcome_code=null,consensus_evidence=consensus_evidence||coalesce(p_evidence,'{}'::jsonb),finalized_at=statement_timestamp(),finalized_by=auth.uid() where id=r.id;
  select * into ev from market.canonical_events where id=r.event_id for update;
  update market.canonical_events set status='FINALIZED',updated_at=statement_timestamp() where id=ev.id;
  update market.instruments set status='SETTLEMENT_PENDING',updated_at=statement_timestamp() where canonical_event_id=ev.id and status='CLOSED';
  return true;
end;
$$;

create or replace function settlement.execute_instrument(p_instrument_id bigint)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  instrument market.instruments; ev market.canonical_events; r oracle.resolutions; pol oracle.policies;
  collateral_account bigint; collateral numeric(38,18); gross numeric(38,18); total_fee numeric(38,18); run_id bigint; run_public_id uuid;
  winning_outcome bigint; outcome_count integer; void_factor numeric(38,18); fee_account bigint; journal_id bigint; seq integer:=1; expected_entries integer;
  ent settlement.entitlements; user_account bigint; fee_rec record; mode text;
begin
  select * into instrument from market.instruments where id=p_instrument_id for update;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if instrument.status='SETTLED' or instrument.status='VOIDED' then
    select public_id into run_public_id from settlement.runs where instrument_id=instrument.id and status='SETTLED' order by id desc limit 1;
    return run_public_id;
  end if;
  if instrument.status not in ('SETTLEMENT_PENDING','CLOSED') then raise exception 'Market is not settlement-ready' using errcode='P0001'; end if;
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
  returning id,public_id into run_id,run_public_id;
  delete from settlement.entitlements where run_id=run_id;

  if r.status='FINAL' then
    select id into winning_outcome from market.outcomes where instrument_id=instrument.id and code=r.outcome_code;
    if winning_outcome is null then raise exception 'Resolved outcome is missing from market' using errcode='23514'; end if;
    insert into settlement.entitlements(run_id,user_id,outcome_id,quantity,gross_amount,fee_amount,net_amount)
    select run_id,p.user_id,p.outcome_id,p.quantity,round(p.quantity*instrument.settlement_unit,18),0,round(p.quantity*instrument.settlement_unit,18)
    from trading.positions p where p.instrument_id=instrument.id and p.outcome_id=winning_outcome and p.quantity>0;
  else
    mode:=coalesce(pol.void_rule->>'mode','');
    if mode<>'EQUAL_SPLIT' then raise exception 'Unsupported void settlement policy' using errcode='0A000'; end if;
    void_factor:=1::numeric/outcome_count;
    insert into settlement.entitlements(run_id,user_id,outcome_id,quantity,gross_amount,fee_amount,net_amount)
    select run_id,p.user_id,p.outcome_id,p.quantity,round(p.quantity*instrument.settlement_unit*void_factor,18),0,round(p.quantity*instrument.settlement_unit*void_factor,18)
    from trading.positions p where p.instrument_id=instrument.id and p.quantity>0;
  end if;

  for ent in select * from settlement.entitlements where run_id=run_id for update loop
    select * into fee_rec from command.quote_settlement_fee(ent.gross_amount);
    update settlement.entitlements set fee_amount=fee_rec.fee_amount,net_amount=ent.gross_amount-fee_rec.fee_amount where id=ent.id;
  end loop;
  select coalesce(sum(gross_amount),0),coalesce(sum(fee_amount),0) into gross,total_fee from settlement.entitlements where run_id=run_id;
  if round(collateral,18)<>round(gross,18) then
    update settlement.runs set status='FAILED',gross_liability=gross,settlement_fee_total=total_fee,failure_reason='COLLATERAL_LIABILITY_MISMATCH' where id=run_id;
    raise exception 'Settlement collateral % does not equal liability %',collateral,gross using errcode='23514';
  end if;
  update settlement.runs set status='VALIDATED',gross_liability=gross,collateral_available=collateral,settlement_fee_total=total_fee where id=run_id;

  insert into finance.ledger_journals(asset_id,journal_type,idempotency_key,reference_type,reference_id,description)
  values(instrument.asset_id,'MARKET_SETTLEMENT','settlement-journal:'||run_public_id::text,'SETTLEMENT_RUN',run_public_id::text,'Settle VAD market from protected collateral')
  on conflict(idempotency_key) do nothing returning id into journal_id;
  if journal_id is null then select id into journal_id from finance.ledger_journals where idempotency_key='settlement-journal:'||run_public_id::text; end if;
  if exists(select 1 from finance.ledger_journals where id=journal_id and status='POSTED') then return run_public_id; end if;
  insert into finance.ledger_entries(journal_id,account_id,sequence_number,direction,amount)
  values(journal_id,collateral_account,seq,'DEBIT',gross); seq:=seq+1;
  for ent in select * from settlement.entitlements where run_id=run_id order by id loop
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

  update settlement.runs set status='SETTLED',ledger_journal_id=journal_id,settled_at=statement_timestamp() where id=run_id;
  update trading.positions p set
    realized_pnl=p.realized_pnl + coalesce((select e.net_amount from settlement.entitlements e where e.run_id=run_id and e.user_id=p.user_id and e.outcome_id=p.outcome_id),0)-p.total_cost_basis,
    fees_paid=p.fees_paid + coalesce((select e.fee_amount from settlement.entitlements e where e.run_id=run_id and e.user_id=p.user_id and e.outcome_id=p.outcome_id),0),
    quantity=0,total_cost_basis=0,updated_at=statement_timestamp()
  where p.instrument_id=instrument.id;
  update market.instruments set status=case when r.status='VOID' then 'VOIDED' else 'SETTLED' end,updated_at=statement_timestamp() where id=instrument.id;
  if not exists(select 1 from market.instruments i where i.canonical_event_id=ev.id and i.status not in ('SETTLED','VOIDED','CANCELLED')) then
    update market.canonical_events set status=case when r.status='VOID' then 'VOIDED' else 'SETTLED' end,updated_at=statement_timestamp() where id=ev.id;
  end if;
  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('SETTLEMENT_COMPLETED','SETTLEMENT_RUN',run_public_id::text,jsonb_build_object('instrument_id',instrument.public_id,'gross_liability',gross,'fees',total_fee,'resolution_status',r.status),'settlement-completed:'||run_public_id::text)
  on conflict(idempotency_key) do nothing;
  return run_public_id;
end;
$$;

create or replace function public.admin_settle_market(p_instrument_public_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare instrument_id bigint;
begin
  if not private.has_permission('finance.journals.post') then raise exception 'Permission required' using errcode='42501'; end if;
  select id into instrument_id from market.instruments where public_id=p_instrument_public_id;
  if instrument_id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  return settlement.execute_instrument(instrument_id);
end;
$$;

revoke all on function settlement.execute_instrument(bigint) from public,anon,authenticated;
grant execute on function settlement.execute_instrument(bigint) to service_role;

grant execute on function public.admin_close_market(uuid,text),public.admin_create_provisional_resolution(uuid,text,jsonb),public.admin_finalize_resolution(bigint,jsonb),public.admin_finalize_void(bigint,jsonb),public.admin_settle_market(uuid) to authenticated;
revoke all on function public.admin_close_market(uuid,text),public.admin_create_provisional_resolution(uuid,text,jsonb),public.admin_finalize_resolution(bigint,jsonb),public.admin_finalize_void(bigint,jsonb),public.admin_settle_market(uuid) from anon;
