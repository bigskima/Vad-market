-- Add a peer-funded pooled-stake rail without removing the existing order-book engine.

alter table market.instruments drop constraint if exists instruments_liquidity_model_check;
alter table market.instruments
  add constraint instruments_liquidity_model_check
  check (liquidity_model in ('ORDER_BOOK','AMM','HYBRID','POOL'));

create or replace function private.apply_asset_liquidity_policy()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_peer_funded boolean:=false;
begin
  select coalesce((a.metadata->>'peer_funded_only')::boolean,false)
  into v_peer_funded
  from public.assets a
  where a.id=new.asset_id;

  if v_peer_funded then
    new.liquidity_model:='POOL';
  end if;
  return new;
end;
$function$;

drop trigger if exists apply_asset_liquidity_policy_before_write on market.instruments;
create trigger apply_asset_liquidity_policy_before_write
before insert or update of asset_id on market.instruments
for each row execute function private.apply_asset_liquidity_policy();

create table if not exists trading.pool_stakes (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  instrument_id bigint not null references market.instruments(id) on delete restrict,
  outcome_id bigint not null references market.outcomes(id) on delete restrict,
  amount numeric(38,18) not null check(amount>0),
  trading_fee_amount numeric(38,18) not null default 0 check(trading_fee_amount>=0),
  fee_policy_version_id bigint references policy.policy_versions(id),
  stake_journal_id bigint not null references finance.ledger_journals(id),
  fee_journal_id bigint references finance.ledger_journals(id),
  idempotency_key text not null unique,
  created_at timestamptz not null default statement_timestamp()
);
create index if not exists pool_stakes_instrument_time_idx on trading.pool_stakes(instrument_id,created_at desc);
create index if not exists pool_stakes_user_time_idx on trading.pool_stakes(user_id,created_at desc);
create index if not exists pool_stakes_outcome_idx on trading.pool_stakes(outcome_id);
alter table trading.pool_stakes enable row level security;
revoke all on trading.pool_stakes from public,anon,authenticated;
grant all on trading.pool_stakes to service_role;
drop trigger if exists pool_stakes_immutable on trading.pool_stakes;
create trigger pool_stakes_immutable
before update or delete on trading.pool_stakes
for each row execute function private.reject_immutable_mutation();

alter table public.market_catalog
  add column if not exists yes_volume numeric(38,18) not null default 0,
  add column if not exists no_volume numeric(38,18) not null default 0,
  add column if not exists total_volume numeric(38,18) not null default 0,
  add column if not exists participant_count integer not null default 0;

create or replace function command.refresh_market_catalog(p_instrument_id bigint)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  instrument market.instruments;
  event market.canonical_events;
  asset public.assets;
  v_resolution oracle.resolutions;
  yes_outcome_id bigint;
  no_outcome_id bigint;
  yes_last numeric(38,18);
  no_last numeric(38,18);
  yes_vol numeric(38,18):=0;
  no_vol numeric(38,18):=0;
  total_vol numeric(38,18):=0;
  latest_fill timestamptz;
  v_participants integer:=0;
begin
  select * into instrument from market.instruments where id=p_instrument_id;
  if instrument.id is null then return; end if;
  select * into event from market.canonical_events where id=instrument.canonical_event_id;
  select * into asset from public.assets where id=instrument.asset_id;
  select * into v_resolution
  from oracle.resolutions
  where event_id=event.id
  order by coalesce(finalized_at,created_at) desc,id desc
  limit 1;

  select id into yes_outcome_id from market.outcomes where instrument_id=instrument.id and code='YES';
  select id into no_outcome_id from market.outcomes where instrument_id=instrument.id and code='NO';

  if instrument.liquidity_model='POOL' then
    select
      coalesce(sum(ps.amount) filter(where ps.outcome_id=yes_outcome_id),0),
      coalesce(sum(ps.amount) filter(where ps.outcome_id=no_outcome_id),0),
      coalesce(sum(ps.amount),0),
      max(ps.created_at),
      count(distinct ps.user_id)::int
    into yes_vol,no_vol,total_vol,latest_fill,v_participants
    from trading.pool_stakes ps
    where ps.instrument_id=instrument.id;

    if total_vol>0 then
      yes_last:=round(yes_vol/total_vol,18);
      no_last:=round(no_vol/total_vol,18);
    else
      yes_last:=0.5;
      no_last:=0.5;
    end if;
  else
    select x.price into yes_last
    from trading.fills x
    join trading.orders o on o.id=x.order_id
    where o.instrument_id=instrument.id and x.outcome_id=yes_outcome_id
    order by x.created_at desc limit 1;

    select x.price into no_last
    from trading.fills x
    join trading.orders o on o.id=x.order_id
    where o.instrument_id=instrument.id and x.outcome_id=no_outcome_id
    order by x.created_at desc limit 1;

    if yes_last is null and no_last is not null then yes_last:=round(instrument.settlement_unit-no_last,18); end if;
    if no_last is null and yes_last is not null then no_last:=round(instrument.settlement_unit-yes_last,18); end if;

    select
      coalesce(sum(f.notional) filter(where f.outcome_id=yes_outcome_id),0),
      coalesce(sum(f.notional) filter(where f.outcome_id=no_outcome_id),0),
      coalesce(sum(f.notional),0),
      max(f.created_at),
      count(distinct f.user_id)::int
    into yes_vol,no_vol,total_vol,latest_fill,v_participants
    from trading.fills f
    join trading.orders o on o.id=f.order_id
    where o.instrument_id=instrument.id;
  end if;

  insert into public.market_catalog(
    instrument_public_id,event_public_id,title,category,asset_code,market_type,status,
    opens_at,closes_at,resolves_after,media_path,yes_price,no_price,last_trade_at,
    liquidity_mode,reference_price,resolution_status,resolution_outcome,resolution_finalized_at,
    yes_volume,no_volume,total_volume,participant_count,updated_at
  ) values(
    instrument.public_id,event.public_id,event.title,event.category,asset.code,instrument.market_type,instrument.status,
    event.opens_at,event.closes_at,event.resolves_after,event.media_path,yes_last,no_last,latest_fill,
    instrument.liquidity_model,null,v_resolution.status,
    case when v_resolution.status in ('FINAL','VOID') then v_resolution.outcome_code else null end,
    v_resolution.finalized_at,yes_vol,no_vol,total_vol,v_participants,statement_timestamp()
  )
  on conflict(instrument_public_id) do update set
    event_public_id=excluded.event_public_id,title=excluded.title,category=excluded.category,
    asset_code=excluded.asset_code,market_type=excluded.market_type,status=excluded.status,
    opens_at=excluded.opens_at,closes_at=excluded.closes_at,resolves_after=excluded.resolves_after,
    media_path=excluded.media_path,yes_price=excluded.yes_price,no_price=excluded.no_price,
    last_trade_at=excluded.last_trade_at,liquidity_mode=excluded.liquidity_mode,
    reference_price=excluded.reference_price,resolution_status=excluded.resolution_status,
    resolution_outcome=excluded.resolution_outcome,resolution_finalized_at=excluded.resolution_finalized_at,
    yes_volume=excluded.yes_volume,no_volume=excluded.no_volume,total_volume=excluded.total_volume,
    participant_count=excluded.participant_count,updated_at=statement_timestamp();
end;
$function$;

create or replace function public.pool_quote(
  p_instrument_public_id uuid,
  p_outcome_code text,
  p_amount numeric
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  acct public.user_accounts;
  instrument market.instruments;
  outcome market.outcomes;
  total_pool numeric(38,18):=0;
  outcome_pool numeric(38,18):=0;
  fee numeric(38,18):=0;
  fee_pv bigint;
  est_gross numeric(38,18):=0;
  est_settlement_fee numeric(38,18):=0;
  est_pv bigint;
begin
  acct:=private.require_active_account();
  select * into instrument from market.instruments where public_id=p_instrument_public_id;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if instrument.liquidity_model<>'POOL' then raise exception 'This market does not use pooled staking' using errcode='P0001'; end if;
  if instrument.status<>'OPEN' or instrument.opened_at is null or instrument.opened_at>statement_timestamp() or (instrument.closed_at is not null and instrument.closed_at<=statement_timestamp()) then raise exception 'Market is not open' using errcode='P0001'; end if;
  if not private.trade_access_satisfies(auth.uid(),acct.country_code,instrument.asset_id) then raise exception 'Trading is not available for this account and market' using errcode='P0001'; end if;
  if p_amount is null or p_amount<instrument.min_order_notional then raise exception 'Stake is below the market minimum' using errcode='22023'; end if;
  select * into outcome from market.outcomes where instrument_id=instrument.id and code=upper(trim(p_outcome_code));
  if outcome.id is null then raise exception 'Outcome not found' using errcode='P0002'; end if;

  select coalesce(sum(amount),0),coalesce(sum(amount) filter(where outcome_id=outcome.id),0)
  into total_pool,outcome_pool
  from trading.pool_stakes where instrument_id=instrument.id;

  select q.fee_amount,q.policy_version_id into fee,fee_pv from command.quote_trading_fee(p_amount,'TAKER') q;
  if outcome_pool+p_amount>0 then
    est_gross:=round((p_amount/(outcome_pool+p_amount))*(total_pool+p_amount),18);
  end if;
  select q.fee_amount,q.policy_version_id into est_settlement_fee,est_pv from command.quote_settlement_fee(est_gross) q;

  return jsonb_build_object(
    'instrumentPublicId',instrument.public_id,
    'instrumentId',instrument.id,
    'outcomeId',outcome.id,
    'outcomeCode',outcome.code,
    'assetId',instrument.asset_id,
    'amount',p_amount,
    'tradingFee',coalesce(fee,0),
    'tradingFeePolicyVersionId',fee_pv,
    'maximumCashDebit',p_amount+coalesce(fee,0),
    'poolTotalBefore',total_pool,
    'outcomePoolBefore',outcome_pool,
    'poolTotalAfter',total_pool+p_amount,
    'outcomePoolAfter',outcome_pool+p_amount,
    'impliedProbability',case when total_pool+p_amount>0 then round((outcome_pool+p_amount)/(total_pool+p_amount),18) else 0.5 end,
    'estimatedGrossPayout',est_gross,
    'estimatedSettlementFee',coalesce(est_settlement_fee,0),
    'estimatedNetPayout',greatest(est_gross-coalesce(est_settlement_fee,0),0),
    'quotedAt',statement_timestamp()
  );
end;
$function$;
revoke all on function public.pool_quote(uuid,text,numeric) from public,anon;
grant execute on function public.pool_quote(uuid,text,numeric) to authenticated,service_role;

create or replace function public.place_pool_stake(
  p_instrument_public_id uuid,
  p_outcome_code text,
  p_amount numeric,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  acct public.user_accounts;
  instrument market.instruments;
  outcome market.outcomes;
  existing trading.pool_stakes;
  v_public_id uuid:=gen_random_uuid();
  v_available bigint;
  v_collateral bigint;
  v_fee_account bigint;
  v_balance numeric(38,18);
  v_fee numeric(38,18):=0;
  v_fee_pv bigint;
  v_stake_journal bigint;
  v_fee_journal bigint;
begin
  acct:=private.require_active_account();
  if p_idempotency_key is null or char_length(p_idempotency_key)<8 or char_length(p_idempotency_key)>200 then raise exception 'A valid idempotency key is required' using errcode='22023'; end if;
  select * into existing from trading.pool_stakes where user_id=auth.uid() and idempotency_key=p_idempotency_key;
  if existing.id is not null then
    return jsonb_build_object('stakeId',existing.public_id,'amount',existing.amount,'tradingFee',existing.trading_fee_amount,'status','COMMITTED');
  end if;

  select * into instrument from market.instruments where public_id=p_instrument_public_id for share;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if instrument.liquidity_model<>'POOL' then raise exception 'This market does not use pooled staking' using errcode='P0001'; end if;
  if instrument.status<>'OPEN' or instrument.opened_at is null or instrument.opened_at>statement_timestamp() or (instrument.closed_at is not null and instrument.closed_at<=statement_timestamp()) then raise exception 'Market is not open' using errcode='P0001'; end if;
  if not private.trade_access_satisfies(auth.uid(),acct.country_code,instrument.asset_id) then raise exception 'Trading is not available for this account and market' using errcode='P0001'; end if;
  if p_amount is null or p_amount<instrument.min_order_notional then raise exception 'Stake is below the market minimum' using errcode='22023'; end if;
  select * into outcome from market.outcomes where instrument_id=instrument.id and code=upper(trim(p_outcome_code));
  if outcome.id is null then raise exception 'Outcome not found' using errcode='P0002'; end if;

  select q.fee_amount,q.policy_version_id into v_fee,v_fee_pv from command.quote_trading_fee(p_amount,'TAKER') q;
  v_fee:=coalesce(v_fee,0);
  v_available:=finance.ensure_user_account(auth.uid(),instrument.asset_id,'USER_AVAILABLE');
  v_collateral:=finance.ensure_market_collateral_account(instrument.id,instrument.asset_id);
  perform pg_advisory_xact_lock(hashtextextended('vad-wallet:'||auth.uid()::text||':'||instrument.asset_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('vad-pool:'||instrument.id::text,0));
  v_balance:=finance.account_balance(v_available);
  if v_balance<p_amount+v_fee then raise exception 'Insufficient available balance including trading fee' using errcode='P0001'; end if;

  v_stake_journal:=finance.transfer(
    instrument.asset_id,v_available,v_collateral,p_amount,
    'POOL_STAKE','pool-stake:'||v_public_id::text,'POOL_STAKE',v_public_id::text,
    'Commit peer-funded VAD market stake',auth.uid()
  );
  if v_fee>0 then
    v_fee_account:=finance.ensure_platform_account(instrument.asset_id,'PLATFORM_TRADING_FEE_REVENUE');
    v_fee_journal:=finance.transfer(
      instrument.asset_id,v_available,v_fee_account,v_fee,
      'TRADING_FEE','pool-stake-fee:'||v_public_id::text,'POOL_STAKE',v_public_id::text,
      'VAD pooled-stake execution fee',auth.uid()
    );
  end if;

  insert into trading.pool_stakes(
    public_id,user_id,instrument_id,outcome_id,amount,trading_fee_amount,
    fee_policy_version_id,stake_journal_id,fee_journal_id,idempotency_key
  ) values(
    v_public_id,auth.uid(),instrument.id,outcome.id,p_amount,v_fee,
    v_fee_pv,v_stake_journal,v_fee_journal,p_idempotency_key
  );

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values(
    'POOL_STAKE_PLACED','POOL_STAKE',v_public_id::text,
    jsonb_build_object('stake_id',v_public_id,'instrument_id',instrument.public_id,'user_id',auth.uid(),'outcome',outcome.code,'amount',p_amount,'fee',v_fee),
    'pool-stake-placed:'||v_public_id::text
  ) on conflict(idempotency_key) do nothing;

  perform command.refresh_market_catalog(instrument.id);
  return jsonb_build_object('stakeId',v_public_id,'marketId',instrument.public_id,'outcomeCode',outcome.code,'amount',p_amount,'tradingFee',v_fee,'status','COMMITTED');
end;
$function$;
revoke all on function public.place_pool_stake(uuid,text,numeric,text) from public,anon;
grant execute on function public.place_pool_stake(uuid,text,numeric,text) to authenticated,service_role;

create or replace function settlement.execute_pool_instrument(p_instrument_id bigint)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
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
  journal_id bigint;
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
        -- Nobody backed the final outcome. Return every participant's committed stake; VAD keeps no unmatched pool.
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
  on conflict(idempotency_key) do nothing returning id into journal_id;
  if journal_id is null then
    select j.id,j.status into journal_id,journal_status from finance.ledger_journals j where j.idempotency_key='settlement-journal:'||run_public_id::text;
  else
    select j.status into journal_status from finance.ledger_journals j where j.id=journal_id;
  end if;

  if journal_status<>'POSTED' then
    delete from finance.ledger_entries le where le.journal_id=journal_id;
    insert into finance.ledger_entries(journal_id,account_id,sequence_number,direction,amount)
    values(journal_id,collateral_account,seq,'DEBIT',gross);
    seq:=seq+1;
    for ent in select * from settlement.entitlements e where e.run_id=v_run_id order by e.id loop
      if ent.net_amount>0 then
        user_account:=finance.ensure_user_account(ent.user_id,instrument.asset_id,'USER_AVAILABLE');
        insert into finance.ledger_entries(journal_id,account_id,sequence_number,direction,amount)
        values(journal_id,user_account,seq,'CREDIT',ent.net_amount);
        seq:=seq+1;
      end if;
    end loop;
    if total_fee>0 then
      fee_account:=finance.ensure_platform_account(instrument.asset_id,'PLATFORM_SETTLEMENT_FEE_REVENUE');
      insert into finance.ledger_entries(journal_id,account_id,sequence_number,direction,amount)
      values(journal_id,fee_account,seq,'CREDIT',total_fee);
      seq:=seq+1;
    end if;
    expected_entries:=seq-1;
    perform finance.post_ledger_journal(journal_id,expected_entries);
  end if;

  update settlement.runs set ledger_journal_id=journal_id where id=v_run_id;
  perform settlement.finalize_accounting_state(v_run_id);
  perform command.refresh_market_catalog(instrument.id);
  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('SETTLEMENT_COMPLETED','SETTLEMENT_RUN',run_public_id::text,
    jsonb_build_object('instrument_id',instrument.public_id,'gross_liability',gross,'fees',total_fee,'resolution_status',r.status,'liquidity_model','POOL'),
    'settlement-completed:'||run_public_id::text)
  on conflict(idempotency_key) do nothing;
  return run_public_id;
end;
$function$;
revoke all on function settlement.execute_pool_instrument(bigint) from public,anon,authenticated;
grant execute on function settlement.execute_pool_instrument(bigint) to service_role;

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
  if p_limit is null or p_limit<1 or p_limit>500 then raise exception 'Settlement limit must be between 1 and 500' using errcode='22023'; end if;
  v_service_state:=private.service_control_state('settlement',null);
  if not coalesce((v_service_state->>'enabled')::boolean,false) then return jsonb_build_object('attempted',0,'settled',0,'failed',0,'disabled',true); end if;
  for rec in
    select i.id,i.public_id,i.liquidity_model
    from market.instruments i
    where i.status='SETTLEMENT_PENDING'
      and exists(select 1 from oracle.resolutions r join market.canonical_events ce on ce.id=r.event_id where ce.id=i.canonical_event_id and r.status in ('FINAL','VOID'))
    order by i.updated_at,i.id for update skip locked limit p_limit
  loop
    attempted_count:=attempted_count+1;
    begin
      if rec.liquidity_model='POOL' then perform settlement.execute_pool_instrument(rec.id); else perform settlement.execute_instrument(rec.id); end if;
      select status into v_status from market.instruments where id=rec.id;
      if v_status in ('SETTLED','VOIDED') then settled_count:=settled_count+1; else failed_count:=failed_count+1; end if;
    exception when others then
      failed_count:=failed_count+1;
      insert into audit.records(actor_type,action,resource_type,resource_id,reason,metadata)
      values('SYSTEM','AUTOMATIC_SETTLEMENT_FAILED','MARKET_INSTRUMENT',rec.public_id::text,'Automatic settlement attempt failed',jsonb_build_object('sqlstate',sqlstate,'error',sqlerrm,'liquidity_model',rec.liquidity_model));
    end;
  end loop;
  return jsonb_build_object('attempted',attempted_count,'settled',settled_count,'failed',failed_count,'disabled',false);
end;
$function$;

create or replace function public.admin_settle_market(p_instrument_public_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  instrument market.instruments;
begin
  if auth.uid() is null or not private.has_permission('finance.journals.post') then raise exception 'Settlement permission required' using errcode='42501'; end if;
  if not private.service_is_available('settlement',auth.uid()) then raise exception 'Settlement service is not available' using errcode='P0001'; end if;
  select * into instrument from market.instruments where public_id=p_instrument_public_id;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if instrument.liquidity_model='POOL' then return settlement.execute_pool_instrument(instrument.id); end if;
  return settlement.execute_instrument(instrument.id);
end;
$function$;

create or replace function private.notify_pool_stake()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_market_public_id uuid;
  v_title text;
  v_asset text;
  v_outcome text;
begin
  select i.public_id,ce.title,a.code,mo.code
  into v_market_public_id,v_title,v_asset,v_outcome
  from market.instruments i
  join market.canonical_events ce on ce.id=i.canonical_event_id
  join public.assets a on a.id=i.asset_id
  join market.outcomes mo on mo.id=new.outcome_id
  where i.id=new.instrument_id;
  perform private.enqueue_user_notification(
    new.user_id,'STAKE_COMMITTED','Prediction entered',
    'Your '||v_outcome||' stake of '||trim(to_char(new.amount,'FM999999999999990D00'))||' '||v_asset||' is committed to '||v_title||'.',
    'pool-stake-notify:'||new.public_id::text,v_market_public_id,null,'SUCCESS',
    jsonb_build_object('assetCode',v_asset,'outcome',v_outcome,'amount',new.amount,'tradingFee',new.trading_fee_amount)
  );
  return new;
end;
$function$;
drop trigger if exists notify_pool_stake_after_insert on trading.pool_stakes;
create trigger notify_pool_stake_after_insert
after insert on trading.pool_stakes
for each row execute function private.notify_pool_stake();

create or replace function private.project_pool_domain_event_notification()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_instrument market.instruments;
  v_event market.canonical_events;
  v_asset text;
  v_outcome text;
  v_run settlement.runs;
  v_resolution oracle.resolutions;
  v_net numeric(38,18);
  v_user record;
begin
  if new.event_type='MARKET_CLOSED' then
    select * into v_instrument from market.instruments where public_id::text=new.aggregate_id and liquidity_model='POOL';
    if v_instrument.id is null then return new; end if;
    select * into v_event from market.canonical_events where id=v_instrument.canonical_event_id;
    select code into v_asset from public.assets where id=v_instrument.asset_id;
    for v_user in select distinct user_id from trading.pool_stakes where instrument_id=v_instrument.id loop
      perform private.enqueue_user_notification(v_user.user_id,'MARKET_CLOSED','Trading closed',
        'Staking has closed for '||v_event.title||'. Result verification is next.',
        'pool-notify:'||new.id::text||':'||v_user.user_id::text,v_instrument.public_id,null,'INFO',
        jsonb_build_object('assetCode',v_asset));
    end loop;
  elsif new.event_type='MARKET_FINALIZED' then
    select * into v_event from market.canonical_events where public_id::text=new.aggregate_id;
    if v_event.id is null then return new; end if;
    v_outcome:=upper(coalesce(new.payload->>'outcome_code',''));
    for v_instrument in select * from market.instruments where canonical_event_id=v_event.id and liquidity_model='POOL' loop
      select code into v_asset from public.assets where id=v_instrument.asset_id;
      for v_user in select distinct user_id from trading.pool_stakes where instrument_id=v_instrument.id loop
        perform private.enqueue_user_notification(v_user.user_id,'MARKET_RESOLVED','Final result: '||coalesce(nullif(v_outcome,''),'FINAL'),
          v_event.title||' resolved '||coalesce(nullif(v_outcome,''),'FINAL')||'. Pool settlement is now processing.',
          'pool-notify:'||new.id::text||':'||v_instrument.public_id::text||':'||v_user.user_id::text,
          v_instrument.public_id,null,'SUCCESS',jsonb_build_object('assetCode',v_asset,'outcome',v_outcome));
      end loop;
    end loop;
  elsif new.event_type='SETTLEMENT_COMPLETED' then
    select * into v_run from settlement.runs where public_id::text=new.aggregate_id;
    if v_run.id is null then return new; end if;
    select * into v_instrument from market.instruments where id=v_run.instrument_id and liquidity_model='POOL';
    if v_instrument.id is null then return new; end if;
    select * into v_event from market.canonical_events where id=v_instrument.canonical_event_id;
    select * into v_resolution from oracle.resolutions where id=v_run.resolution_id;
    select code into v_asset from public.assets where id=v_instrument.asset_id;
    for v_user in select distinct user_id from trading.pool_stakes where instrument_id=v_instrument.id loop
      select coalesce(sum(net_amount),0) into v_net from settlement.entitlements where run_id=v_run.id and user_id=v_user.user_id;
      if v_resolution.status='VOID' then
        perform private.enqueue_user_notification(v_user.user_id,'STAKE_REFUNDED','Market voided — stake returned',
          'Your committed '||v_asset||' stake was returned because the market was voided.',
          'pool-notify:'||new.id::text||':'||v_user.user_id::text||':void',v_instrument.public_id,null,'INFO',
          jsonb_build_object('assetCode',v_asset,'netAmount',v_net));
      elsif exists(select 1 from trading.pool_stakes ps join market.outcomes mo on mo.id=ps.outcome_id where ps.instrument_id=v_instrument.id and ps.user_id=v_user.user_id and mo.code=v_resolution.outcome_code) then
        perform private.enqueue_user_notification(v_user.user_id,'PAYOUT_CREDITED','You won — pool payout credited',
          'Final result: '||v_resolution.outcome_code||'. Your peer-funded '||v_asset||' payout has been credited.',
          'pool-notify:'||new.id::text||':'||v_user.user_id::text||':win',v_instrument.public_id,null,'SUCCESS',
          jsonb_build_object('assetCode',v_asset,'outcome',v_resolution.outcome_code,'netAmount',v_net));
      else
        perform private.enqueue_user_notification(v_user.user_id,'SETTLEMENT_LOST','Prediction settled — not a winner',
          'Final result: '||v_resolution.outcome_code||'. Your selected outcome did not win this market.',
          'pool-notify:'||new.id::text||':'||v_user.user_id::text||':loss',v_instrument.public_id,null,'INFO',
          jsonb_build_object('assetCode',v_asset,'outcome',v_resolution.outcome_code));
      end if;
    end loop;
  end if;
  return new;
end;
$function$;

drop trigger if exists project_pool_domain_event_notification_after_insert on eventing.domain_events;
create trigger project_pool_domain_event_notification_after_insert
after insert on eventing.domain_events
for each row execute function private.project_pool_domain_event_notification();

create or replace function public.my_pool_stakes()
returns table(
  stake_id uuid,market_id uuid,market_title text,outcome_code text,asset_code text,
  amount numeric,trading_fee numeric,market_status text,final_outcome text,created_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $function$
  select ps.public_id,i.public_id,ce.title,mo.code,a.code,ps.amount,ps.trading_fee_amount,i.status,
    case when r.status in ('FINAL','VOID') then r.outcome_code else null end,ps.created_at
  from trading.pool_stakes ps
  join market.instruments i on i.id=ps.instrument_id
  join market.canonical_events ce on ce.id=i.canonical_event_id
  join market.outcomes mo on mo.id=ps.outcome_id
  join public.assets a on a.id=i.asset_id
  left join lateral (
    select rr.* from oracle.resolutions rr where rr.event_id=ce.id order by coalesce(rr.finalized_at,rr.created_at) desc,rr.id desc limit 1
  ) r on true
  where ps.user_id=auth.uid()
  order by ps.created_at desc;
$function$;
revoke all on function public.my_pool_stakes() from public,anon;
grant execute on function public.my_pool_stakes() to authenticated,service_role;

create or replace function public.my_market_history()
returns table(
  market_id uuid,market_title text,selected_outcome text,final_outcome text,asset_code text,
  matched_quantity numeric,stake_amount numeric,trading_fee numeric,gross_payout numeric,
  settlement_fee numeric,net_payout numeric,realized_pnl numeric,result text,settled_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $function$
  with pool_base as (
    select ps.user_id,ps.instrument_id,ps.outcome_id,sum(ps.amount)::numeric as stake_amount,
           sum(ps.amount)::numeric as matched_quantity,sum(ps.trading_fee_amount)::numeric as trading_fee
    from trading.pool_stakes ps where ps.user_id=auth.uid()
    group by ps.user_id,ps.instrument_id,ps.outcome_id
  ), order_base as (
    select o.user_id,o.instrument_id,o.outcome_id,sum(f.quantity)::numeric as matched_quantity,
           sum(f.notional)::numeric as stake_amount,coalesce(sum(ef.fee_amount),0)::numeric as trading_fee
    from trading.fills f
    join trading.orders o on o.id=f.order_id
    left join trading.execution_fees ef on ef.order_id=o.id and ef.execution_reference=f.match_id::text
    where o.user_id=auth.uid()
    group by o.user_id,o.instrument_id,o.outcome_id
  ), base as (
    select * from pool_base
    union all
    select * from order_base
  )
  select i.public_id,ce.title,mo.code,r.outcome_code,a.code,b.matched_quantity,b.stake_amount,b.trading_fee,
         coalesce(ent.gross_amount,0),coalesce(ent.fee_amount,0),coalesce(ent.net_amount,0),
         (coalesce(ent.net_amount,0)-b.stake_amount-b.trading_fee)::numeric,
         case
           when r.status='VOID' then 'VOID'
           when sr.status='SETTLED' and ent.net_amount>0 and r.outcome_code=mo.code then 'WON'
           when sr.status='SETTLED' and r.outcome_code<>mo.code and ent.net_amount>=b.stake_amount then 'REFUNDED'
           when sr.status='SETTLED' and r.outcome_code<>mo.code then 'LOST'
           when r.status='FINAL' then 'SETTLING'
           else 'PENDING'
         end,
         sr.settled_at
  from base b
  join market.instruments i on i.id=b.instrument_id
  join market.canonical_events ce on ce.id=i.canonical_event_id
  join market.outcomes mo on mo.id=b.outcome_id
  join public.assets a on a.id=i.asset_id
  left join lateral (
    select rr.* from oracle.resolutions rr where rr.event_id=ce.id and rr.status in ('FINAL','VOID') order by rr.finalized_at desc nulls last,rr.id desc limit 1
  ) r on true
  left join lateral (
    select s.* from settlement.runs s where s.instrument_id=i.id and s.status='SETTLED' order by s.settled_at desc nulls last,s.id desc limit 1
  ) sr on true
  left join settlement.entitlements ent on ent.run_id=sr.id and ent.user_id=b.user_id and ent.outcome_id=b.outcome_id
  order by coalesce(sr.settled_at,ce.closes_at) desc;
$function$;
revoke all on function public.my_market_history() from public,anon;
grant execute on function public.my_market_history() to authenticated,service_role;

create or replace function public.my_order_history()
returns table(
  order_id uuid,market_id uuid,market_title text,selected_outcome text,final_outcome text,
  side text,limit_price numeric,quantity numeric,filled_quantity numeric,asset_code text,
  order_status text,result text,created_at timestamptz,finalized_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $function$
  select o.public_id,i.public_id,ce.title,mo.code,r.outcome_code,o.side,o.limit_price,o.quantity,o.filled_quantity,a.code,o.status,
    case
      when exists(select 1 from trading.sandbox_executions se where se.order_id=o.id) then 'LEGACY_TEST_CORRECTED'
      when o.filled_quantity=0 then case when o.status='CANCELLED' then 'UNMATCHED' else 'PENDING' end
      when r.status='VOID' then 'VOID'
      when r.status='FINAL' and r.outcome_code=mo.code then 'WON'
      when r.status='FINAL' then 'LOST'
      else 'PENDING'
    end,
    o.created_at,r.finalized_at
  from trading.orders o
  join market.instruments i on i.id=o.instrument_id
  join market.canonical_events ce on ce.id=i.canonical_event_id
  join market.outcomes mo on mo.id=o.outcome_id
  join public.assets a on a.id=i.asset_id
  left join lateral (
    select rr.* from oracle.resolutions rr where rr.event_id=ce.id and rr.status in ('FINAL','VOID') order by rr.finalized_at desc nulls last,rr.id desc limit 1
  ) r on true
  where o.user_id=auth.uid()
  order by o.created_at desc;
$function$;
revoke all on function public.my_order_history() from public,anon;
grant execute on function public.my_order_history() to authenticated,service_role;

-- Refresh current catalog rows under truthful peer-funded volume accounting.
do $block$
declare v_id bigint;
begin
  for v_id in select id from market.instruments loop perform command.refresh_market_catalog(v_id); end loop;
end;
$block$;