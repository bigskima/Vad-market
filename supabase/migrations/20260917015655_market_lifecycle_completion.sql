-- Complete the VAD sandbox trading -> resolution -> settlement lifecycle without weakening production matching rules.

alter table public.market_catalog
  add column if not exists liquidity_mode text not null default 'ORDER_BOOK',
  add column if not exists reference_price numeric(38,18);

update public.assets
set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
  'sandbox_instant_liquidity', true,
  'sandbox_reference_price', 0.5,
  'sandbox_issuer_reference', 'SANDBOX_TEST_NGN_ISSUER'
),
updated_at = statement_timestamp()
where code='TNGN'
  and coalesce((metadata->>'sandbox_only')::boolean,false);

create table if not exists trading.sandbox_executions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  order_id bigint not null unique references trading.orders(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  instrument_id bigint not null references market.instruments(id) on delete restrict,
  outcome_id bigint not null references market.outcomes(id) on delete restrict,
  price numeric(38,18) not null check(price>0),
  quantity numeric(38,18) not null check(quantity>0),
  notional numeric(38,18) not null check(notional>0),
  subsidy_amount numeric(38,18) not null check(subsidy_amount>=0),
  fee_amount numeric(38,18) not null default 0 check(fee_amount>=0),
  user_collateral_journal_id bigint references finance.ledger_journals(id),
  subsidy_journal_id bigint references finance.ledger_journals(id),
  created_at timestamptz not null default statement_timestamp()
);

create index if not exists sandbox_executions_instrument_time_idx
  on trading.sandbox_executions(instrument_id,created_at desc);
create index if not exists sandbox_executions_outcome_time_idx
  on trading.sandbox_executions(outcome_id,created_at desc);

alter table trading.sandbox_executions enable row level security;
revoke all on trading.sandbox_executions from public,anon,authenticated;
grant all on trading.sandbox_executions to service_role;

drop trigger if exists sandbox_executions_immutable on trading.sandbox_executions;
create trigger sandbox_executions_immutable
before update or delete on trading.sandbox_executions
for each row execute function private.reject_immutable_mutation();

create or replace function command.execute_sandbox_liquidity(p_order_id bigint)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  ord trading.orders;
  instrument market.instruments;
  asset public.assets;
  res trading.order_reservations;
  qty numeric(38,18);
  ref_price numeric(38,18);
  user_amount numeric(38,18);
  subsidy numeric(38,18);
  improvement numeric(38,18);
  collateral_account bigint;
  issuer_account bigint;
  available_account bigint;
  user_journal bigint;
  subsidy_journal bigint;
  execution_id bigint;
  execution_public_id uuid;
  execution_fee numeric(38,18);
  issuer_reference text;
begin
  select * into ord from trading.orders where id=p_order_id for update;
  if ord.id is null
     or ord.side<>'BUY'
     or ord.status not in ('OPEN','PARTIALLY_FILLED') then
    return 0;
  end if;

  select * into instrument from market.instruments where id=ord.instrument_id for share;
  if instrument.id is null or instrument.status<>'OPEN' then return 0; end if;

  select * into asset from public.assets where id=instrument.asset_id;
  if not coalesce((asset.metadata->>'sandbox_only')::boolean,false)
     or not coalesce((asset.metadata->>'sandbox_instant_liquidity')::boolean,false) then
    return 0;
  end if;

  ref_price:=nullif(asset.metadata->>'sandbox_reference_price','')::numeric;
  if ref_price is null or ref_price<=0 or ref_price>=instrument.settlement_unit then
    return 0;
  end if;

  if ord.limit_price<ref_price then return 0; end if;

  perform pg_advisory_xact_lock(hashtextextended('vad-sandbox-liquidity:'||instrument.id::text,0));
  select * into ord from trading.orders where id=p_order_id for update;
  qty:=ord.quantity-ord.filled_quantity;
  if qty<=0 or ord.status not in ('OPEN','PARTIALLY_FILLED') then return 0; end if;

  select * into res from trading.order_reservations where order_id=ord.id for update;
  if res.order_id is null then raise exception 'Sandbox order reservation is missing' using errcode='23514'; end if;

  user_amount:=round(ref_price*qty,18);
  subsidy:=round((instrument.settlement_unit-ref_price)*qty,18);
  improvement:=round((ord.limit_price-ref_price)*qty,18);

  if res.initial_reserved-res.consumed_notional-res.released_notional < user_amount+improvement then
    raise exception 'Sandbox order reservation is insufficient' using errcode='23514';
  end if;

  collateral_account:=finance.ensure_market_collateral_account(instrument.id,instrument.asset_id);
  issuer_reference:=coalesce(nullif(asset.metadata->>'sandbox_issuer_reference',''),'SANDBOX_TEST_NGN_ISSUER');
  insert into finance.ledger_accounts(asset_id,account_type,owner_type,owner_reference)
  values(instrument.asset_id,'TREASURY','PLATFORM',issuer_reference)
  on conflict(asset_id,account_type,owner_type,owner_reference) do nothing;
  select id into issuer_account
  from finance.ledger_accounts
  where asset_id=instrument.asset_id
    and account_type='TREASURY'
    and owner_type='PLATFORM'
    and owner_reference=issuer_reference;

  execution_public_id:=gen_random_uuid();
  user_journal:=finance.transfer(
    instrument.asset_id,res.reserved_account_id,collateral_account,user_amount,
    'SANDBOX_MARKET_COLLATERAL','sandbox-user-collateral:'||ord.public_id::text,
    'SANDBOX_EXECUTION',execution_public_id::text,
    'Fund sandbox market collateral from tester order reservation',ord.user_id
  );

  if subsidy>0 then
    subsidy_journal:=finance.transfer(
      instrument.asset_id,issuer_account,collateral_account,subsidy,
      'SANDBOX_LIQUIDITY_SUBSIDY','sandbox-liquidity-subsidy:'||ord.public_id::text,
      'SANDBOX_EXECUTION',execution_public_id::text,
      'Synthetic sandbox liquidity subsidy; no real-world value',null
    );
  end if;

  if improvement>0 then
    available_account:=finance.ensure_user_account(ord.user_id,instrument.asset_id,'USER_AVAILABLE');
    perform finance.transfer(
      instrument.asset_id,res.reserved_account_id,available_account,improvement,
      'ORDER_PRICE_IMPROVEMENT_RELEASE','sandbox-improvement:'||ord.public_id::text,
      'SANDBOX_EXECUTION',execution_public_id::text,
      'Release sandbox limit-price improvement',ord.user_id
    );
  end if;

  update trading.order_reservations
  set consumed_notional=consumed_notional+user_amount,
      released_notional=released_notional+improvement
  where order_id=ord.id;

  insert into trading.sandbox_executions(
    public_id,order_id,user_id,instrument_id,outcome_id,price,quantity,notional,
    subsidy_amount,user_collateral_journal_id,subsidy_journal_id
  ) values(
    execution_public_id,ord.id,ord.user_id,instrument.id,ord.outcome_id,ref_price,qty,user_amount,
    subsidy,user_journal,subsidy_journal
  ) returning id into execution_id;

  insert into trading.positions(user_id,instrument_id,outcome_id,quantity,total_cost_basis,realized_pnl,fees_paid)
  values(ord.user_id,instrument.id,ord.outcome_id,qty,user_amount,0,0)
  on conflict(user_id,instrument_id,outcome_id) do update
  set quantity=trading.positions.quantity+excluded.quantity,
      total_cost_basis=trading.positions.total_cost_basis+excluded.total_cost_basis,
      updated_at=statement_timestamp();

  execution_fee:=command.charge_execution_fee(
    ord.id,'COMPLETE_SET','sandbox:'||execution_public_id::text,'TAKER','BUY',user_amount
  );
  update trading.sandbox_executions set fee_amount=coalesce(execution_fee,0) where id=execution_id;

  update trading.orders
  set filled_quantity=quantity,
      status='FILLED',
      updated_at=statement_timestamp()
  where id=ord.id;

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values(
    'SANDBOX_ORDER_EXECUTED','SANDBOX_EXECUTION',execution_public_id::text,
    jsonb_build_object(
      'instrument_id',instrument.public_id,
      'order_id',ord.public_id,
      'outcome_id',ord.outcome_id,
      'price',ref_price,
      'quantity',qty,
      'notional',user_amount,
      'subsidy',subsidy
    ),
    'sandbox-order-executed:'||ord.public_id::text
  ) on conflict(idempotency_key) do nothing;

  perform command.refresh_market_catalog(instrument.id);
  return 1;
end;
$function$;

revoke all on function command.execute_sandbox_liquidity(bigint) from public,anon,authenticated;
grant execute on function command.execute_sandbox_liquidity(bigint) to service_role;

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
  yes_outcome_id bigint;
  no_outcome_id bigint;
  yes_last numeric(38,18);
  no_last numeric(38,18);
  latest_fill timestamptz;
  v_liquidity_mode text;
  v_reference_price numeric(38,18);
begin
  select * into instrument from market.instruments where id=p_instrument_id;
  if instrument.id is null then return; end if;
  select * into event from market.canonical_events where id=instrument.canonical_event_id;
  select * into asset from public.assets where id=instrument.asset_id;
  select id into yes_outcome_id from market.outcomes where instrument_id=instrument.id and code='YES';
  select id into no_outcome_id from market.outcomes where instrument_id=instrument.id and code='NO';

  select x.price into yes_last
  from (
    select f.price,f.created_at from trading.fills f where f.outcome_id=yes_outcome_id
    union all
    select se.price,se.created_at from trading.sandbox_executions se where se.outcome_id=yes_outcome_id
  ) x order by x.created_at desc limit 1;

  select x.price into no_last
  from (
    select f.price,f.created_at from trading.fills f where f.outcome_id=no_outcome_id
    union all
    select se.price,se.created_at from trading.sandbox_executions se where se.outcome_id=no_outcome_id
  ) x order by x.created_at desc limit 1;

  if yes_last is null and no_last is not null then yes_last:=round(instrument.settlement_unit-no_last,18); end if;
  if no_last is null and yes_last is not null then no_last:=round(instrument.settlement_unit-yes_last,18); end if;

  select max(x.created_at) into latest_fill
  from (
    select f.created_at from trading.fills f join trading.orders o on o.id=f.order_id where o.instrument_id=instrument.id
    union all
    select se.created_at from trading.sandbox_executions se where se.instrument_id=instrument.id
  ) x;

  if coalesce((asset.metadata->>'sandbox_only')::boolean,false)
     and coalesce((asset.metadata->>'sandbox_instant_liquidity')::boolean,false) then
    v_liquidity_mode:='SANDBOX_INSTANT';
    v_reference_price:=nullif(asset.metadata->>'sandbox_reference_price','')::numeric;
    if yes_last is null and v_reference_price is not null then
      yes_last:=v_reference_price;
      no_last:=round(instrument.settlement_unit-v_reference_price,18);
    end if;
  else
    v_liquidity_mode:=instrument.liquidity_model;
    v_reference_price:=null;
  end if;

  insert into public.market_catalog(
    instrument_public_id,event_public_id,title,category,asset_code,market_type,status,
    closes_at,resolves_after,media_path,yes_price,no_price,last_trade_at,liquidity_mode,reference_price,updated_at
  ) values(
    instrument.public_id,event.public_id,event.title,event.category,asset.code,instrument.market_type,instrument.status,
    event.closes_at,event.resolves_after,event.media_path,yes_last,no_last,latest_fill,v_liquidity_mode,v_reference_price,statement_timestamp()
  )
  on conflict(instrument_public_id) do update set
    event_public_id=excluded.event_public_id,
    title=excluded.title,
    category=excluded.category,
    asset_code=excluded.asset_code,
    market_type=excluded.market_type,
    status=excluded.status,
    closes_at=excluded.closes_at,
    resolves_after=excluded.resolves_after,
    media_path=excluded.media_path,
    yes_price=excluded.yes_price,
    no_price=excluded.no_price,
    last_trade_at=excluded.last_trade_at,
    liquidity_mode=excluded.liquidity_mode,
    reference_price=excluded.reference_price,
    updated_at=statement_timestamp();
end;
$function$;

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
    perform command.execute_sandbox_liquidity(order_id);
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
  values('ORDER_PLACED','ORDER',order_public_id::text,jsonb_build_object('order_id',order_public_id,'instrument_id',p_market_id,'outcome_id',p_outcome_id,'user_id',p_user_id,'side',p_side,'price',p_price,'quantity',p_quantity,'fee_reserve',fee_reserve),'order-placed:'||order_public_id::text);

  perform command.match_best_order(order_id);
  perform command.execute_sandbox_liquidity(order_id);
  return order_public_id;
end;
$function$;

create or replace function public.my_order_status(p_order_public_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_order trading.orders;
  v_instrument market.instruments;
  v_asset public.assets;
  v_outcome market.outcomes;
  v_position_quantity numeric(38,18);
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_order from trading.orders where public_id=p_order_public_id and user_id=auth.uid();
  if v_order.id is null then raise exception 'Order not found' using errcode='P0002'; end if;
  select * into v_instrument from market.instruments where id=v_order.instrument_id;
  select * into v_asset from public.assets where id=v_instrument.asset_id;
  select * into v_outcome from market.outcomes where id=v_order.outcome_id;
  select coalesce(quantity,0) into v_position_quantity
  from trading.positions
  where user_id=auth.uid() and instrument_id=v_order.instrument_id and outcome_id=v_order.outcome_id;

  return jsonb_build_object(
    'orderId',v_order.public_id,
    'status',v_order.status,
    'side',v_order.side,
    'outcomeCode',v_outcome.code,
    'assetCode',v_asset.code,
    'quantity',v_order.quantity,
    'filledQuantity',v_order.filled_quantity,
    'remainingQuantity',greatest(v_order.quantity-v_order.filled_quantity,0),
    'positionQuantity',coalesce(v_position_quantity,0),
    'positionCreated',coalesce(v_position_quantity,0)>0,
    'liquidityMode',case
      when coalesce((v_asset.metadata->>'sandbox_only')::boolean,false)
       and coalesce((v_asset.metadata->>'sandbox_instant_liquidity')::boolean,false)
      then 'SANDBOX_INSTANT'
      else v_instrument.liquidity_model
    end,
    'updatedAt',v_order.updated_at
  );
end;
$function$;

revoke all on function public.my_order_status(uuid) from public,anon;
grant execute on function public.my_order_status(uuid) to authenticated,service_role;

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
  journal_id bigint;
  journal_status text;
  seq integer:=1;
  expected_entries integer;
  ent settlement.entitlements;
  user_account bigint;
  fee_rec record;
  mode text;
  sandbox_mode boolean:=false;
  issuer_account bigint;
  issuer_reference text;
begin
  select * into instrument from market.instruments where id=p_instrument_id for update;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if instrument.status in ('SETTLED','VOIDED') then
    select id,public_id into v_run_id,run_public_id from settlement.runs where instrument_id=instrument.id and status='SETTLED' order by id desc limit 1;
    if v_run_id is not null then perform settlement.finalize_accounting_state(v_run_id); end if;
    perform command.refresh_market_catalog(instrument.id);
    return run_public_id;
  end if;
  if instrument.status not in ('SETTLEMENT_PENDING','CLOSED') then raise exception 'Market is not settlement-ready' using errcode='P0001'; end if;

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

  delete from settlement.entitlements e where e.run_id=v_run_id;
  if r.status='FINAL' then
    select id into winning_outcome from market.outcomes where instrument_id=instrument.id and code=r.outcome_code;
    if winning_outcome is null then raise exception 'Resolved outcome is missing from market' using errcode='23514'; end if;
    insert into settlement.entitlements(run_id,user_id,outcome_id,quantity,gross_amount,fee_amount,net_amount)
    select v_run_id,p.user_id,p.outcome_id,p.quantity,round(p.quantity*instrument.settlement_unit,18),0,round(p.quantity*instrument.settlement_unit,18)
    from trading.positions p
    where p.instrument_id=instrument.id and p.outcome_id=winning_outcome and p.quantity>0;
  else
    mode:=coalesce(pol.void_rule->>'mode','');
    if mode<>'EQUAL_SPLIT' then raise exception 'Unsupported void settlement policy' using errcode='0A000'; end if;
    void_factor:=1::numeric/outcome_count;
    insert into settlement.entitlements(run_id,user_id,outcome_id,quantity,gross_amount,fee_amount,net_amount)
    select v_run_id,p.user_id,p.outcome_id,p.quantity,round(p.quantity*instrument.settlement_unit*void_factor,18),0,round(p.quantity*instrument.settlement_unit*void_factor,18)
    from trading.positions p
    where p.instrument_id=instrument.id and p.quantity>0;
  end if;

  for ent in select * from settlement.entitlements e where e.run_id=v_run_id for update loop
    select * into fee_rec from command.quote_settlement_fee(ent.gross_amount);
    update settlement.entitlements
    set fee_amount=fee_rec.fee_amount,
        net_amount=ent.gross_amount-fee_rec.fee_amount,
        fee_policy_version_id=fee_rec.policy_version_id
    where id=ent.id;
  end loop;

  select coalesce(sum(gross_amount),0),coalesce(sum(fee_amount),0)
  into gross,total_fee from settlement.entitlements where run_id=v_run_id;

  if sandbox_mode then
    if round(collateral,18)<round(gross,18) then
      update settlement.runs set status='FAILED',gross_liability=gross,settlement_fee_total=total_fee,failure_reason='SANDBOX_COLLATERAL_SHORTFALL' where id=v_run_id;
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
    update settlement.runs set status='FAILED',gross_liability=gross,settlement_fee_total=total_fee,failure_reason='COLLATERAL_LIABILITY_MISMATCH' where id=v_run_id;
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
  on conflict(idempotency_key) do nothing returning id into journal_id;
  if journal_id is null then
    select id,status into journal_id,journal_status from finance.ledger_journals where idempotency_key='settlement-journal:'||run_public_id::text;
  else
    select status into journal_status from finance.ledger_journals where id=journal_id;
  end if;

  if journal_status<>'POSTED' then
    delete from finance.ledger_entries where journal_id=journal_id;
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
    end;
  end loop;

  return jsonb_build_object('attempted',attempted_count,'settled',settled_count,'failed',failed_count,'disabled',false);
end;
$function$;

revoke all on function settlement.settle_due_instruments(integer) from public,anon,authenticated;
grant execute on function settlement.settle_due_instruments(integer) to service_role;

do $block$
declare r record;
begin
  for r in select jobid from cron.job where command='select settlement.settle_due_instruments(50);' loop
    perform cron.unschedule(r.jobid);
  end loop;
  perform cron.schedule('vad-settle-finalized-markets','* * * * *','select settlement.settle_due_instruments(50);');
end;
$block$;

do $block$
declare v_id bigint;
begin
  for v_id in select id from market.instruments loop
    perform command.refresh_market_catalog(v_id);
  end loop;
end;
$block$;