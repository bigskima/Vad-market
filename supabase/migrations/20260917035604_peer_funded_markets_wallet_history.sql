-- Enforce VAD's user-vs-user market economics for TNGN test markets.
update public.assets
set metadata = (coalesce(metadata,'{}'::jsonb) - 'sandbox_reference_price') || jsonb_build_object(
  'sandbox_instant_liquidity', false,
  'peer_funded_only', true
),
updated_at = statement_timestamp()
where code='TNGN';

-- Keep the old function signature for compatibility, but synthetic house liquidity is disabled.
create or replace function command.execute_sandbox_liquidity(p_order_id bigint)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
begin
  return 0;
end;
$function$;
revoke all on function command.execute_sandbox_liquidity(bigint) from public,anon,authenticated;
grant execute on function command.execute_sandbox_liquidity(bigint) to service_role;

-- Order placement now uses only real order-book matching. No platform/issuer subsidy is invoked.
create or replace function command.reserve_for_order(
  p_user_id uuid,
  p_market_id bigint,
  p_outcome_id bigint,
  p_side text,
  p_price numeric,
  p_quantity numeric,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  instrument market.instruments;
  outcome market.outcomes;
  required_amount numeric(38,18);
  fee_reserve numeric(38,18):=0;
  fee_pv bigint;
  total_reserve numeric(38,18);
  available_account bigint;
  reserved_account bigint;
  current_available numeric(38,18);
  available_shares numeric(38,18);
  order_public_id uuid;
  order_id bigint;
  seq bigint;
begin
  if p_side not in ('BUY','SELL') then raise exception 'Unsupported order side' using errcode='22023'; end if;
  if p_price is null or p_price<=0 or p_quantity is null or p_quantity<=0 then raise exception 'Positive price and quantity required' using errcode='22023'; end if;
  select * into instrument from market.instruments where id=p_market_id for share;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if instrument.status<>'OPEN' or instrument.opened_at is null or instrument.opened_at>statement_timestamp() or (instrument.closed_at is not null and instrument.closed_at<=statement_timestamp()) then raise exception 'Market is not open for trading' using errcode='P0001'; end if;
  if p_price>=instrument.settlement_unit then raise exception 'Price must be below settlement unit' using errcode='22023'; end if;
  select * into outcome from market.outcomes where id=p_outcome_id and instrument_id=p_market_id;
  if outcome.id is null then raise exception 'Outcome not found for market' using errcode='P0002'; end if;
  required_amount:=round(p_price*p_quantity,18);
  if required_amount<instrument.min_order_notional then raise exception 'Order is below market minimum notional' using errcode='22023'; end if;

  select o.id,o.public_id into order_id,order_public_id
  from trading.orders o where o.idempotency_key=p_idempotency_key and o.user_id=p_user_id;
  if order_public_id is not null then
    perform command.match_best_order(order_id);
    return order_public_id;
  end if;

  seq:=nextval('trading.order_sequence');
  if p_side='BUY' then
    select q.fee_amount,q.policy_version_id into fee_reserve,fee_pv from command.max_trading_fee_reserve(required_amount) q;
    total_reserve:=required_amount+coalesce(fee_reserve,0);
    available_account:=finance.ensure_user_account(p_user_id,instrument.asset_id,'USER_AVAILABLE');
    reserved_account:=finance.ensure_user_account(p_user_id,instrument.asset_id,'USER_RESERVED');
    perform pg_advisory_xact_lock(hashtextextended('vad-wallet:'||p_user_id::text||':'||instrument.asset_id::text,0));
    current_available:=finance.account_balance(available_account);
    if current_available<total_reserve then raise exception 'Insufficient available balance including trading fee reserve' using errcode='P0001'; end if;
    perform finance.transfer(instrument.asset_id,available_account,reserved_account,total_reserve,'ORDER_RESERVE','reserve:'||p_idempotency_key,'ORDER',p_idempotency_key,'Reserve notional and worst-case trading fee for VAD limit order',p_user_id);
    insert into trading.orders(user_id,instrument_id,outcome_id,side,order_type,limit_price,quantity,filled_quantity,reserved_account_id,sequence_number,status,idempotency_key)
    values(p_user_id,p_market_id,p_outcome_id,'BUY','LIMIT',p_price,p_quantity,0,reserved_account,seq,'OPEN',p_idempotency_key)
    returning id,public_id into order_id,order_public_id;
    insert into trading.order_reservations(order_id,asset_id,reserved_account_id,initial_reserved,initial_fee_reserved,fee_policy_version_id)
    values(order_id,instrument.asset_id,reserved_account,required_amount,coalesce(fee_reserve,0),fee_pv);
  else
    perform pg_advisory_xact_lock(hashtextextended('vad-position:'||p_user_id::text||':'||p_market_id::text||':'||p_outcome_id::text,0));
    available_shares:=command.position_available_to_sell(p_user_id,p_market_id,p_outcome_id);
    if available_shares<p_quantity then raise exception 'Insufficient available shares' using errcode='P0001'; end if;
    insert into trading.orders(user_id,instrument_id,outcome_id,side,order_type,limit_price,quantity,filled_quantity,reserved_account_id,sequence_number,status,idempotency_key)
    values(p_user_id,p_market_id,p_outcome_id,'SELL','LIMIT',p_price,p_quantity,0,null,seq,'OPEN',p_idempotency_key)
    returning id,public_id into order_id,order_public_id;
    insert into trading.share_reservations(order_id,user_id,instrument_id,outcome_id,initial_quantity)
    values(order_id,p_user_id,p_market_id,p_outcome_id,p_quantity);
  end if;

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('ORDER_PLACED','ORDER',order_public_id::text,jsonb_build_object('order_id',order_public_id,'instrument_id',p_market_id,'outcome_id',p_outcome_id,'user_id',p_user_id,'side',p_side,'price',p_price,'quantity',p_quantity,'fee_reserve',fee_reserve),'order-placed:'||order_public_id::text)
  on conflict(idempotency_key) do nothing;

  perform command.match_best_order(order_id);
  return order_public_id;
end;
$function$;

-- Realtime notification for actual matched fills (both sides), not merely submitted orders.
create or replace function private.notify_trade_fill()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_market_public_id uuid;
  v_title text;
  v_asset_code text;
  v_outcome_code text;
  v_order_public_id uuid;
begin
  select i.public_id,ce.title,a.code,mo.code,o.public_id
  into v_market_public_id,v_title,v_asset_code,v_outcome_code,v_order_public_id
  from trading.orders o
  join market.instruments i on i.id=o.instrument_id
  join market.canonical_events ce on ce.id=i.canonical_event_id
  join public.assets a on a.id=i.asset_id
  join market.outcomes mo on mo.id=new.outcome_id
  where o.id=new.order_id;

  perform private.enqueue_user_notification(
    new.user_id,
    'TRADE_FILLED',
    'Trade matched',
    'Your '||v_outcome_code||' order matched in '||v_title||'. This position is now active for settlement.',
    'fill-notification:'||new.id::text,
    v_market_public_id,
    v_order_public_id,
    'SUCCESS',
    jsonb_build_object('assetCode',v_asset_code,'outcome',v_outcome_code,'quantity',new.quantity,'price',new.price,'notional',new.notional)
  );
  return new;
end;
$function$;

drop trigger if exists notify_trade_fill_after_insert on trading.fills;
create trigger notify_trade_fill_after_insert
after insert on trading.fills
for each row execute function private.notify_trade_fill();

-- Wallet activity now exposes trading reservations/releases/fees/payouts from the ledger.
create or replace function public.my_wallet_activity(p_limit integer default 100)
returns table(
  activity_id uuid,
  asset_code text,
  activity_type text,
  direction text,
  amount numeric,
  account_type text,
  market_id uuid,
  market_title text,
  reference_type text,
  reference_id text,
  description text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $function$
  with mine as (
    select
      j.public_id as activity_id,
      a.code as asset_code,
      j.journal_type as activity_type,
      e.direction,
      e.amount,
      la.account_type,
      j.reference_type,
      j.reference_id,
      j.description,
      j.created_at,
      j.id as journal_id
    from finance.ledger_entries e
    join finance.ledger_journals j on j.id=e.journal_id and j.status='POSTED'
    join finance.ledger_accounts la on la.id=e.account_id
    join public.assets a on a.id=j.asset_id
    where la.owner_type='USER'
      and la.owner_reference=auth.uid()::text
      and (
        la.account_type='USER_AVAILABLE'
        or (la.account_type='USER_RESERVED' and j.journal_type='TRADING_FEE')
      )
  ), linked as (
    select
      m.*,
      coalesce(o.instrument_id,sr.instrument_id) as instrument_id
    from mine m
    left join trading.orders o
      on (m.reference_type='ORDER' and o.public_id::text=m.reference_id)
      or (m.activity_type='ORDER_RESERVE' and o.idempotency_key=m.reference_id)
    left join settlement.runs sr
      on m.reference_type='SETTLEMENT_RUN' and sr.public_id::text=m.reference_id
  )
  select
    l.activity_id,
    l.asset_code,
    l.activity_type,
    l.direction,
    l.amount,
    l.account_type,
    i.public_id as market_id,
    ce.title as market_title,
    l.reference_type,
    l.reference_id,
    l.description,
    l.created_at
  from linked l
  left join market.instruments i on i.id=l.instrument_id
  left join market.canonical_events ce on ce.id=i.canonical_event_id
  order by l.created_at desc,l.journal_id desc
  limit greatest(1,least(coalesce(p_limit,100),500));
$function$;
revoke all on function public.my_wallet_activity(integer) from public,anon;
grant execute on function public.my_wallet_activity(integer) to authenticated,service_role;

-- Completed peer-funded market history includes both wins and losses and the final YES/NO result.
create or replace function public.my_market_history()
returns table(
  market_id uuid,
  market_title text,
  selected_outcome text,
  final_outcome text,
  asset_code text,
  matched_quantity numeric,
  stake_amount numeric,
  trading_fee numeric,
  gross_payout numeric,
  settlement_fee numeric,
  net_payout numeric,
  realized_pnl numeric,
  result text,
  settled_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $function$
  with fills as (
    select
      o.user_id,
      o.instrument_id,
      o.outcome_id,
      sum(f.quantity)::numeric as matched_quantity,
      sum(f.notional)::numeric as stake_amount
    from trading.fills f
    join trading.orders o on o.id=f.order_id
    where o.user_id=auth.uid()
    group by o.user_id,o.instrument_id,o.outcome_id
  ), fees as (
    select
      o.user_id,
      o.instrument_id,
      o.outcome_id,
      coalesce(sum(ef.fee_amount),0)::numeric as trading_fee
    from trading.execution_fees ef
    join trading.orders o on o.id=ef.order_id
    where o.user_id=auth.uid()
    group by o.user_id,o.instrument_id,o.outcome_id
  )
  select
    i.public_id,
    ce.title,
    mo.code,
    r.outcome_code,
    a.code,
    f.matched_quantity,
    f.stake_amount,
    coalesce(fs.trading_fee,0),
    coalesce(ent.gross_amount,0),
    coalesce(ent.fee_amount,0),
    coalesce(ent.net_amount,0),
    (coalesce(ent.net_amount,0)-f.stake_amount-coalesce(fs.trading_fee,0))::numeric,
    case
      when r.status='VOID' then 'VOID'
      when r.status='FINAL' and r.outcome_code=mo.code then 'WON'
      when r.status='FINAL' then 'LOST'
      else 'PENDING'
    end,
    sr.settled_at
  from fills f
  join market.instruments i on i.id=f.instrument_id
  join market.canonical_events ce on ce.id=i.canonical_event_id
  join market.outcomes mo on mo.id=f.outcome_id
  join public.assets a on a.id=i.asset_id
  left join fees fs on fs.user_id=f.user_id and fs.instrument_id=f.instrument_id and fs.outcome_id=f.outcome_id
  left join lateral (
    select rr.* from oracle.resolutions rr
    where rr.event_id=ce.id and rr.status in ('FINAL','VOID')
    order by rr.finalized_at desc nulls last,rr.id desc limit 1
  ) r on true
  left join lateral (
    select s.* from settlement.runs s
    where s.instrument_id=i.id and s.status='SETTLED'
    order by s.settled_at desc nulls last,s.id desc limit 1
  ) sr on true
  left join settlement.entitlements ent
    on ent.run_id=sr.id and ent.user_id=f.user_id and ent.outcome_id=f.outcome_id
  order by sr.settled_at desc nulls last,ce.closes_at desc;
$function$;
revoke all on function public.my_market_history() from public,anon;
grant execute on function public.my_market_history() to authenticated,service_role;

-- Payout receipts must correspond to actual user-vs-user fills, never legacy synthetic executions.
create or replace function public.my_settlement_receipts()
returns table(settlement_id uuid, market_id uuid, market_title text, outcome_code text, asset_code text, quantity numeric, gross_amount numeric, fee_amount numeric, net_amount numeric, settled_at timestamptz)
language sql
stable
security definer
set search_path=''
as $function$
  select sr.public_id,mi.public_id,ce.title,mo.code,a.code,se.quantity,se.gross_amount,se.fee_amount,se.net_amount,sr.settled_at
  from settlement.entitlements se
  join settlement.runs sr on sr.id=se.run_id
  join market.instruments mi on mi.id=sr.instrument_id
  join market.canonical_events ce on ce.id=mi.canonical_event_id
  join market.outcomes mo on mo.id=se.outcome_id
  join public.assets a on a.id=mi.asset_id
  where se.user_id=auth.uid()
    and sr.status='SETTLED'
    and exists(
      select 1
      from trading.fills f
      join trading.orders o on o.id=f.order_id
      where o.user_id=auth.uid()
        and o.instrument_id=mi.id
        and o.outcome_id=se.outcome_id
    )
  order by sr.settled_at desc nulls last,se.id desc;
$function$;

-- One-time cleanup of any already-settled synthetic TNGN executions.
-- These were test artifacts and are neutralized so tester balances return to the state
-- they would have had if only peer-funded fills were allowed.
do $block$
declare
  rec record;
  v_user_available bigint;
  v_issuer bigint;
  v_trading_fee_account bigint;
  v_settlement_fee_account bigint;
  v_settlement_fee numeric(38,18);
  v_resolution_outcome text;
begin
  for rec in
    select se.*,i.asset_id,mo.code as outcome_code,ce.id as event_id
    from trading.sandbox_executions se
    join market.instruments i on i.id=se.instrument_id
    join market.canonical_events ce on ce.id=i.canonical_event_id
    join market.outcomes mo on mo.id=se.outcome_id
    where exists(
      select 1 from settlement.runs sr
      where sr.instrument_id=se.instrument_id and sr.status='SETTLED'
    )
  loop
    select r.outcome_code into v_resolution_outcome
    from oracle.resolutions r
    where r.event_id=rec.event_id and r.status='FINAL'
    order by r.finalized_at desc nulls last,r.id desc limit 1;
    if v_resolution_outcome is null then continue; end if;

    v_user_available:=finance.ensure_user_account(rec.user_id,rec.asset_id,'USER_AVAILABLE');
    insert into finance.ledger_accounts(asset_id,account_type,owner_type,owner_reference)
    values(rec.asset_id,'TREASURY','PLATFORM','SANDBOX_TEST_NGN_ISSUER')
    on conflict(asset_id,account_type,owner_type,owner_reference) do nothing;
    select id into v_issuer from finance.ledger_accounts
    where asset_id=rec.asset_id and account_type='TREASURY' and owner_type='PLATFORM' and owner_reference='SANDBOX_TEST_NGN_ISSUER';

    if rec.fee_amount>0 then
      v_trading_fee_account:=finance.ensure_platform_account(rec.asset_id,'PLATFORM_TRADING_FEE_REVENUE');
      perform finance.transfer(rec.asset_id,v_trading_fee_account,v_user_available,rec.fee_amount,
        'LEGACY_SANDBOX_FEE_REFUND','legacy-sandbox-trading-fee-refund:'||rec.public_id::text,
        'SANDBOX_EXECUTION',rec.public_id::text,'Refund fee from deprecated synthetic sandbox execution',null);
    end if;

    select coalesce(sum(e.fee_amount),0) into v_settlement_fee
    from settlement.entitlements e
    join settlement.runs sr on sr.id=e.run_id
    where sr.instrument_id=rec.instrument_id and sr.status='SETTLED'
      and e.user_id=rec.user_id and e.outcome_id=rec.outcome_id;
    if v_settlement_fee>0 then
      v_settlement_fee_account:=finance.ensure_platform_account(rec.asset_id,'PLATFORM_SETTLEMENT_FEE_REVENUE');
      perform finance.transfer(rec.asset_id,v_settlement_fee_account,v_user_available,v_settlement_fee,
        'LEGACY_SANDBOX_FEE_REFUND','legacy-sandbox-settlement-fee-refund:'||rec.public_id::text,
        'SANDBOX_EXECUTION',rec.public_id::text,'Refund settlement fee from deprecated synthetic sandbox execution',null);
    end if;

    if upper(v_resolution_outcome)=upper(rec.outcome_code) then
      if rec.subsidy_amount>0 then
        perform finance.transfer(rec.asset_id,v_user_available,v_issuer,rec.subsidy_amount,
          'LEGACY_SANDBOX_CORRECTION','legacy-sandbox-subsidy-reversal:'||rec.public_id::text,
          'SANDBOX_EXECUTION',rec.public_id::text,'Remove issuer-funded profit from deprecated synthetic execution',null);
      end if;
    else
      if rec.notional>0 then
        perform finance.transfer(rec.asset_id,v_issuer,v_user_available,rec.notional,
          'LEGACY_SANDBOX_CORRECTION','legacy-sandbox-stake-refund:'||rec.public_id::text,
          'SANDBOX_EXECUTION',rec.public_id::text,'Refund stake from deprecated synthetic execution',null);
      end if;
    end if;

    perform private.enqueue_user_notification(
      rec.user_id,'SANDBOX_CORRECTED','Test trade corrected',
      'A legacy synthetic-liquidity test trade was reversed. VAD test markets now use peer-funded user matching only.',
      'legacy-sandbox-corrected:'||rec.public_id::text,
      (select public_id from market.instruments where id=rec.instrument_id),
      (select public_id from trading.orders where id=rec.order_id),
      'INFO',jsonb_build_object('assetCode','TNGN','peerFundedOnly',true)
    );
  end loop;
end;
$block$;

-- Refresh catalog metadata after disabling sandbox instant liquidity.
do $block$
declare v_id bigint;
begin
  for v_id in select id from market.instruments loop
    perform command.refresh_market_catalog(v_id);
  end loop;
end;
$block$;