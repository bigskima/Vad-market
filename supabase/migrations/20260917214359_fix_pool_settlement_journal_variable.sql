create or replace function settlement.execute_pool_instrument(p_instrument_id bigint)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  instrument market.instruments;
  ev market.canonical_events;
  r oracle.resolutions;
  collateral_account bigint;
  collateral numeric(38,18);
  total_pool numeric(38,18):=0;
  winning_pool numeric(38,18):=0;
  winning_outcome bigint;
  v_run_id bigint;
  run_public_id uuid;
  gross numeric(38,18):=0;
  total_fee numeric(38,18):=0;
  v_journal_id bigint;
  journal_status text;
  fee_account bigint;
  user_account bigint;
  seq integer:=1;
  expected_entries integer;
  ent settlement.entitlements;
begin
  select * into instrument from market.instruments where id=p_instrument_id for update;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if instrument.liquidity_model<>'POOL' then raise exception 'Market does not use pooled settlement' using errcode='P0001'; end if;
  if instrument.status in ('SETTLED','VOIDED') then
    select id,public_id into v_run_id,run_public_id from settlement.runs where instrument_id=instrument.id and status='SETTLED' order by id desc limit 1;
    perform command.refresh_market_catalog(instrument.id);
    return run_public_id;
  end if;
  if instrument.status not in ('SETTLEMENT_PENDING','CLOSED') then raise exception 'Market is not settlement-ready' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('vad-pool-settlement:'||instrument.id::text,0));
  select * into ev from market.canonical_events where id=instrument.canonical_event_id;
  select * into r from oracle.resolutions where event_id=ev.id and status in ('FINAL','VOID') order by finalized_at desc nulls last,id desc limit 1;
  if r.id is null then raise exception 'Final oracle resolution is required' using errcode='23514'; end if;

  collateral_account:=finance.ensure_market_collateral_account(instrument.id,instrument.asset_id);
  collateral:=finance.account_balance(collateral_account);
  select coalesce(sum(amount),0) into total_pool from trading.pool_stakes where instrument_id=instrument.id;
  if round(collateral,18)<>round(total_pool,18) then
    raise exception 'Pool collateral does not equal participant stakes' using errcode='23514';
  end if;

  insert into settlement.runs(instrument_id,resolution_id,status,gross_liability,collateral_available,settlement_fee_total,idempotency_key)
  values(instrument.id,r.id,'PLANNED',total_pool,collateral,0,'settle:'||instrument.public_id::text||':'||r.id::text)
  on conflict(idempotency_key) do update set collateral_available=excluded.collateral_available
  returning id,public_id into v_run_id,run_public_id;

  if not exists(select 1 from settlement.entitlements e where e.run_id=v_run_id) and total_pool>0 then
    if r.status='VOID' then
      insert into settlement.entitlements(run_id,user_id,outcome_id,quantity,gross_amount,fee_amount,net_amount)
      select v_run_id,ps.user_id,ps.outcome_id,sum(ps.amount),sum(ps.amount),0,sum(ps.amount)
      from trading.pool_stakes ps where ps.instrument_id=instrument.id
      group by ps.user_id,ps.outcome_id;
    else
      select id into winning_outcome from market.outcomes where instrument_id=instrument.id and code=r.outcome_code;
      if winning_outcome is null then raise exception 'Resolved outcome is missing from market' using errcode='23514'; end if;
      select coalesce(sum(amount),0) into winning_pool from trading.pool_stakes where instrument_id=instrument.id and outcome_id=winning_outcome;

      if winning_pool=0 then
        insert into settlement.entitlements(run_id,user_id,outcome_id,quantity,gross_amount,fee_amount,net_amount)
        select v_run_id,ps.user_id,ps.outcome_id,sum(ps.amount),sum(ps.amount),0,sum(ps.amount)
        from trading.pool_stakes ps where ps.instrument_id=instrument.id
        group by ps.user_id,ps.outcome_id;
      else
        with winners as (
          select ps.user_id,ps.outcome_id,sum(ps.amount)::numeric(38,18) as stake,
                 row_number() over(order by ps.user_id,ps.outcome_id) as rn,
                 count(*) over() as cnt
          from trading.pool_stakes ps
          where ps.instrument_id=instrument.id and ps.outcome_id=winning_outcome
          group by ps.user_id,ps.outcome_id
        ), calc as (
          select w.*,round(total_pool*w.stake/winning_pool,18) as gross_pre
          from winners w
        ), exact as (
          select c.*,
            case when c.rn=c.cnt
              then round(total_pool-sum(case when c.rn<c.cnt then c.gross_pre else 0 end) over(),18)
              else c.gross_pre end as gross_exact
          from calc c
        )
        insert into settlement.entitlements(
          run_id,user_id,outcome_id,quantity,gross_amount,fee_amount,net_amount,fee_policy_version_id
        )
        select v_run_id,e.user_id,e.outcome_id,e.stake,e.gross_exact,
               coalesce(q.fee_amount,0),e.gross_exact-coalesce(q.fee_amount,0),q.policy_version_id
        from exact e
        cross join lateral command.quote_settlement_fee(e.gross_exact) q;
      end if;
    end if;
  end if;

  select coalesce(sum(gross_amount),0),coalesce(sum(fee_amount),0)
  into gross,total_fee from settlement.entitlements where run_id=v_run_id;
  if round(gross,18)<>round(total_pool,18) then
    raise exception 'Pool payout liability does not equal participant pool' using errcode='23514';
  end if;

  update settlement.runs
  set status='VALIDATED',gross_liability=gross,collateral_available=collateral,settlement_fee_total=total_fee,failure_reason=null
  where id=v_run_id;

  if gross=0 then
    perform settlement.finalize_accounting_state(v_run_id);
    perform command.refresh_market_catalog(instrument.id);
    insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
    values('SETTLEMENT_COMPLETED','SETTLEMENT_RUN',run_public_id::text,
      jsonb_build_object('instrument_id',instrument.public_id,'gross_liability',0,'fees',0,'resolution_status',r.status,'liquidity_model','POOL'),
      'settlement-completed:'||run_public_id::text)
    on conflict(idempotency_key) do nothing;
    return run_public_id;
  end if;

  insert into finance.ledger_journals(asset_id,journal_type,idempotency_key,reference_type,reference_id,description)
  values(instrument.asset_id,'MARKET_SETTLEMENT','settlement-journal:'||run_public_id::text,'SETTLEMENT_RUN',run_public_id::text,'Settle peer-funded VAD market pool')
  on conflict(idempotency_key) do nothing returning id into v_journal_id;
  if v_journal_id is null then
    select j.id,j.status into v_journal_id,journal_status from finance.ledger_journals j where j.idempotency_key='settlement-journal:'||run_public_id::text;
  else
    select j.status into journal_status from finance.ledger_journals j where j.id=v_journal_id;
  end if;

  if journal_status<>'POSTED' then
    delete from finance.ledger_entries le where le.journal_id=v_journal_id;
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
    jsonb_build_object('instrument_id',instrument.public_id,'gross_liability',gross,'fees',total_fee,'resolution_status',r.status,'liquidity_model','POOL'),
    'settlement-completed:'||run_public_id::text)
  on conflict(idempotency_key) do nothing;
  return run_public_id;
end;
$$;
