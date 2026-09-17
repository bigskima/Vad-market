-- Idempotent repository reconciliation for the live winning-settlement repair.

create or replace function settlement.execute_instrument(p_instrument_id bigint)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  instrument market.instruments;
  asset public.assets;
  ev market.canonical_events;
  r oracle.resolutions;
  pol oracle.policies;
  collateral_account bigint;
  collateral numeric(38,18);
  gross numeric(38,18);
  total_fee numeric(38,18);
  excess_collateral numeric(38,18):=0;
  v_run_id bigint;
  run_public_id uuid;
  winning_outcome bigint;
  outcome_count integer;
  void_factor numeric(38,18);
  fee_account bigint;
  v_journal_id bigint;
  journal_status text;
  seq integer:=1;
  expected_entries integer;
  ent settlement.entitlements;
  user_account bigint;
  mode text;
  sandbox_mode boolean:=false;
  issuer_account bigint;
  issuer_reference text;
  pos_rec record;
  v_entitlement_gross numeric(38,18);
  v_entitlement_fee numeric(38,18);
  v_fee_policy_version bigint;
begin
  select * into instrument from market.instruments where id=p_instrument_id for update;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if instrument.status in ('SETTLED','VOIDED') then
    select id,public_id into v_run_id,run_public_id
    from settlement.runs where instrument_id=instrument.id and status='SETTLED' order by id desc limit 1;
    if v_run_id is not null then perform settlement.finalize_accounting_state(v_run_id); end if;
    perform command.refresh_market_catalog(instrument.id);
    return run_public_id;
  end if;
  if instrument.status not in ('SETTLEMENT_PENDING','CLOSED') then
    raise exception 'Market is not settlement-ready' using errcode='P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('vad-settlement:'||instrument.id::text,0));
  perform command.release_open_orders_for_instrument(instrument.id);
  select * into asset from public.assets where id=instrument.asset_id;
  sandbox_mode:=coalesce((asset.metadata->>'sandbox_only')::boolean,false);
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

  if not exists(select 1 from settlement.entitlements e where e.run_id=v_run_id) then
    if r.status='FINAL' then
      select id into winning_outcome from market.outcomes where instrument_id=instrument.id and code=r.outcome_code;
      if winning_outcome is null then raise exception 'Resolved outcome is missing from market' using errcode='23514'; end if;
      for pos_rec in
        select p.user_id,p.outcome_id,p.quantity
        from trading.positions p
        where p.instrument_id=instrument.id and p.outcome_id=winning_outcome and p.quantity>0
      loop
        v_entitlement_gross:=round(pos_rec.quantity*instrument.settlement_unit,18);
        select q.fee_amount,q.policy_version_id into v_entitlement_fee,v_fee_policy_version
        from command.quote_settlement_fee(v_entitlement_gross) q;
        v_entitlement_fee:=coalesce(v_entitlement_fee,0);
        insert into settlement.entitlements(
          run_id,user_id,outcome_id,quantity,gross_amount,fee_amount,net_amount,fee_policy_version_id
        ) values(
          v_run_id,pos_rec.user_id,pos_rec.outcome_id,pos_rec.quantity,v_entitlement_gross,
          v_entitlement_fee,v_entitlement_gross-v_entitlement_fee,v_fee_policy_version
        ) on conflict(run_id,user_id,outcome_id) do nothing;
      end loop;
    else
      mode:=coalesce(pol.void_rule->>'mode','');
      if mode<>'EQUAL_SPLIT' then raise exception 'Unsupported void settlement policy' using errcode='0A000'; end if;
      void_factor:=1::numeric/outcome_count;
      for pos_rec in
        select p.user_id,p.outcome_id,p.quantity
        from trading.positions p
        where p.instrument_id=instrument.id and p.quantity>0
      loop
        v_entitlement_gross:=round(pos_rec.quantity*instrument.settlement_unit*void_factor,18);
        select q.fee_amount,q.policy_version_id into v_entitlement_fee,v_fee_policy_version
        from command.quote_settlement_fee(v_entitlement_gross) q;
        v_entitlement_fee:=coalesce(v_entitlement_fee,0);
        insert into settlement.entitlements(
          run_id,user_id,outcome_id,quantity,gross_amount,fee_amount,net_amount,fee_policy_version_id
        ) values(
          v_run_id,pos_rec.user_id,pos_rec.outcome_id,pos_rec.quantity,v_entitlement_gross,
          v_entitlement_fee,v_entitlement_gross-v_entitlement_fee,v_fee_policy_version
        ) on conflict(run_id,user_id,outcome_id) do nothing;
      end loop;
    end if;
  end if;

  select coalesce(sum(gross_amount),0),coalesce(sum(fee_amount),0)
  into gross,total_fee from settlement.entitlements where run_id=v_run_id;

  if sandbox_mode then
    if round(collateral,18)<round(gross,18) then
      update settlement.runs
      set status='FAILED',gross_liability=gross,settlement_fee_total=total_fee,failure_reason='SANDBOX_COLLATERAL_SHORTFALL'
      where id=v_run_id;
      return run_public_id;
    end if;
    excess_collateral:=round(collateral-gross,18);
    if excess_collateral>0 then
      issuer_reference:=coalesce(nullif(asset.metadata->>'sandbox_issuer_reference',''),'SANDBOX_TEST_NGN_ISSUER');
      insert into finance.ledger_accounts(asset_id,account_type,owner_type,owner_reference)
      values(instrument.asset_id,'TREASURY','PLATFORM',issuer_reference)
      on conflict(asset_id,account_type,owner_type,owner_reference) do nothing;
      select id into issuer_account from finance.ledger_accounts
      where asset_id=instrument.asset_id and account_type='TREASURY' and owner_type='PLATFORM' and owner_reference=issuer_reference;
      perform finance.transfer(
        instrument.asset_id,collateral_account,issuer_account,excess_collateral,
        'SANDBOX_COLLATERAL_SWEEP','sandbox-settlement-sweep:'||run_public_id::text,
        'SETTLEMENT_RUN',run_public_id::text,
        'Return unused synthetic sandbox collateral to the sandbox issuer',null
      );
      collateral:=round(collateral-excess_collateral,18);
    end if;
  elsif round(collateral,18)<>round(gross,18) then
    update settlement.runs
    set status='FAILED',gross_liability=gross,settlement_fee_total=total_fee,failure_reason='COLLATERAL_LIABILITY_MISMATCH'
    where id=v_run_id;
    return run_public_id;
  end if;

  update settlement.runs
  set status='VALIDATED',gross_liability=gross,collateral_available=collateral,settlement_fee_total=total_fee,failure_reason=null
  where id=v_run_id;

  if gross=0 then
    perform settlement.finalize_accounting_state(v_run_id);
    perform command.refresh_market_catalog(instrument.id);
    insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
    values('SETTLEMENT_COMPLETED','SETTLEMENT_RUN',run_public_id::text,
      jsonb_build_object('instrument_id',instrument.public_id,'gross_liability',0,'fees',0,'resolution_status',r.status,'zero_liability',true),
      'settlement-completed:'||run_public_id::text)
    on conflict(idempotency_key) do nothing;
    return run_public_id;
  end if;

  insert into finance.ledger_journals(asset_id,journal_type,idempotency_key,reference_type,reference_id,description)
  values(instrument.asset_id,'MARKET_SETTLEMENT','settlement-journal:'||run_public_id::text,'SETTLEMENT_RUN',run_public_id::text,'Settle VAD market from protected collateral')
  on conflict(idempotency_key) do nothing returning id into v_journal_id;
  if v_journal_id is null then
    select lj.id,lj.status into v_journal_id,journal_status
    from finance.ledger_journals lj
    where lj.idempotency_key='settlement-journal:'||run_public_id::text;
  else
    select lj.status into journal_status from finance.ledger_journals lj where lj.id=v_journal_id;
  end if;

  if journal_status<>'POSTED' then
    if exists(select 1 from finance.ledger_entries le where le.journal_id=v_journal_id) then
      raise exception 'Unposted settlement journal already contains entries' using errcode='23514';
    end if;
    insert into finance.ledger_entries(journal_id,account_id,sequence_number,direction,amount)
    values(v_journal_id,collateral_account,seq,'DEBIT',gross);
    seq:=seq+1;
    for ent in select * from settlement.entitlements e where e.run_id=v_run_id order by e.id loop
      if ent.net_amount>0 then
        user_account:=finance.ensure_user_account(ent.user_id,instrument.asset_id,'USER_AVAILABLE');
        insert into finance.ledger_entries(journal_id,account_id,sequence_number,direction,amount)
        values(v_journal_id,user_account,seq,'CREDIT',ent.net_amount);
        seq:=seq+1;
      end if;
    end loop;
    if total_fee>0 then
      fee_account:=finance.ensure_platform_account(instrument.asset_id,'PLATFORM_SETTLEMENT_FEE_REVENUE');
      insert into finance.ledger_entries(journal_id,account_id,sequence_number,direction,amount)
      values(v_journal_id,fee_account,seq,'CREDIT',total_fee);
      seq:=seq+1;
    end if;
    expected_entries:=seq-1;
    perform finance.post_ledger_journal(v_journal_id,expected_entries);
  end if;

  update settlement.runs set ledger_journal_id=v_journal_id where id=v_run_id;
  perform settlement.finalize_accounting_state(v_run_id);
  perform command.refresh_market_catalog(instrument.id);
  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('SETTLEMENT_COMPLETED','SETTLEMENT_RUN',run_public_id::text,
    jsonb_build_object('instrument_id',instrument.public_id,'gross_liability',gross,'fees',total_fee,'resolution_status',r.status,'sandbox',sandbox_mode),
    'settlement-completed:'||run_public_id::text)
  on conflict(idempotency_key) do nothing;
  return run_public_id;
end;
$function$;

create or replace function settlement.settle_due_instruments(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  rec record;
  settled_count integer:=0;
  failed_count integer:=0;
  attempted_count integer:=0;
  v_status text;
  v_service_state jsonb;
begin
  if p_limit is null or p_limit<1 or p_limit>500 then
    raise exception 'Settlement limit must be between 1 and 500' using errcode='22023';
  end if;
  v_service_state:=private.service_control_state('settlement',null);
  if not coalesce((v_service_state->>'enabled')::boolean,false) then
    return jsonb_build_object('attempted',0,'settled',0,'failed',0,'disabled',true);
  end if;

  for rec in
    select i.id,i.public_id
    from market.instruments i
    where i.status='SETTLEMENT_PENDING'
      and exists(
        select 1 from oracle.resolutions r
        join market.canonical_events ce on ce.id=r.event_id
        where ce.id=i.canonical_event_id and r.status in ('FINAL','VOID')
      )
    order by i.updated_at,i.id
    for update skip locked
    limit p_limit
  loop
    attempted_count:=attempted_count+1;
    begin
      perform settlement.execute_instrument(rec.id);
      select status into v_status from market.instruments where id=rec.id;
      if v_status in ('SETTLED','VOIDED') then
        settled_count:=settled_count+1;
      else
        failed_count:=failed_count+1;
      end if;
    exception when others then
      failed_count:=failed_count+1;
      insert into audit.records(actor_type,action,resource_type,resource_id,reason,metadata)
      values(
        'SYSTEM','AUTOMATIC_SETTLEMENT_FAILED','MARKET_INSTRUMENT',rec.public_id::text,
        'Automatic settlement attempt failed',
        jsonb_build_object('sqlstate',sqlstate,'error',sqlerrm)
      );
    end;
  end loop;

  return jsonb_build_object('attempted',attempted_count,'settled',settled_count,'failed',failed_count,'disabled',false);
end;
$function$;

revoke all on function settlement.settle_due_instruments(integer) from public,anon,authenticated;
grant execute on function settlement.settle_due_instruments(integer) to service_role;
