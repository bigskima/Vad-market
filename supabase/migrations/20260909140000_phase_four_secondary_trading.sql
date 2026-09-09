-- VAD Phase 4: secondary share trading.
-- Existing outcome shares may be sold to another participant without changing
-- market collateral. SELL orders reserve shares, BUY orders reserve cash.
-- Matching is server-authoritative and price/time deterministic.

create table trading.share_reservations (
  order_id bigint primary key references trading.orders(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  instrument_id bigint not null references market.instruments(id),
  outcome_id bigint not null references market.outcomes(id),
  initial_quantity numeric(38,18) not null check (initial_quantity > 0),
  consumed_quantity numeric(38,18) not null default 0 check (consumed_quantity >= 0),
  released_quantity numeric(38,18) not null default 0 check (released_quantity >= 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint share_reservation_bounds check (
    consumed_quantity + released_quantity <= initial_quantity
  )
);

create trigger share_reservations_set_updated_at
before update on trading.share_reservations
for each row execute function private.set_updated_at();

alter table trading.share_reservations enable row level security;
revoke all on trading.share_reservations from public, anon, authenticated;
grant all on trading.share_reservations to service_role;

create index share_reservations_owner_idx
  on trading.share_reservations(user_id, instrument_id, outcome_id);

create table trading.secondary_matches (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  instrument_id bigint not null references market.instruments(id),
  outcome_id bigint not null references market.outcomes(id),
  maker_order_id bigint not null references trading.orders(id),
  taker_order_id bigint not null references trading.orders(id),
  buyer_user_id uuid not null references auth.users(id) on delete restrict,
  seller_user_id uuid not null references auth.users(id) on delete restrict,
  price numeric(38,18) not null check (price > 0),
  quantity numeric(38,18) not null check (quantity > 0),
  notional numeric(38,18) not null check (notional > 0),
  cash_journal_id bigint not null references finance.ledger_journals(id),
  price_improvement_journal_id bigint references finance.ledger_journals(id),
  idempotency_key text not null unique,
  matched_at timestamptz not null default statement_timestamp(),
  constraint secondary_orders_different check (maker_order_id <> taker_order_id),
  constraint secondary_users_different check (buyer_user_id <> seller_user_id)
);

create table trading.secondary_fills (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  secondary_match_id bigint not null references trading.secondary_matches(id) on delete restrict,
  order_id bigint not null references trading.orders(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  side text not null check (side in ('BUY','SELL')),
  liquidity_role text not null check (liquidity_role in ('MAKER','TAKER')),
  price numeric(38,18) not null check (price > 0),
  quantity numeric(38,18) not null check (quantity > 0),
  notional numeric(38,18) not null check (notional > 0),
  created_at timestamptz not null default statement_timestamp(),
  unique(secondary_match_id, order_id)
);

create index secondary_matches_book_idx
  on trading.secondary_matches(instrument_id, outcome_id, matched_at desc);
create index secondary_fills_user_idx
  on trading.secondary_fills(user_id, created_at desc);

create trigger secondary_matches_immutable
before update or delete on trading.secondary_matches
for each row execute function private.reject_immutable_mutation();
create trigger secondary_fills_immutable
before update or delete on trading.secondary_fills
for each row execute function private.reject_immutable_mutation();

alter table trading.secondary_matches enable row level security;
alter table trading.secondary_fills enable row level security;
revoke all on trading.secondary_matches, trading.secondary_fills from public, anon, authenticated;
grant all on trading.secondary_matches, trading.secondary_fills to service_role;

create or replace function command.position_available_to_sell(
  p_user_id uuid,
  p_instrument_id bigint,
  p_outcome_id bigint
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    coalesce((select p.quantity
      from trading.positions p
      where p.user_id = p_user_id
        and p.instrument_id = p_instrument_id
        and p.outcome_id = p_outcome_id), 0)
    - coalesce((select sum(sr.initial_quantity - sr.consumed_quantity - sr.released_quantity)
      from trading.share_reservations sr
      join trading.orders o on o.id = sr.order_id
      where sr.user_id = p_user_id
        and sr.instrument_id = p_instrument_id
        and sr.outcome_id = p_outcome_id
        and o.status in ('OPEN','PARTIALLY_FILLED')), 0),
    0
  )::numeric(38,18);
$$;

revoke all on function command.position_available_to_sell(uuid,bigint,bigint)
  from public, anon, authenticated;
grant execute on function command.position_available_to_sell(uuid,bigint,bigint)
  to service_role;

-- A complementary matcher now executes at most one resting order. This allows the
-- routing loop below to compare secondary liquidity with complete-set liquidity
-- before each fill.
create or replace function command.match_complementary_order(p_order_id bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  incoming trading.orders; resting trading.orders; instrument market.instruments;
  incoming_remaining numeric(38,18); resting_remaining numeric(38,18); fill_qty numeric(38,18);
  maker_price numeric(38,18); taker_price numeric(38,18); maker_amount numeric(38,18); taker_amount numeric(38,18);
  improvement numeric(38,18); collateral_amount numeric(38,18); collateral_account bigint; taker_available_account bigint;
  match_public_id uuid; match_id bigint; collateral_journal bigint; improvement_journal bigint; match_key text;
begin
  select * into incoming from trading.orders where id = p_order_id for update;
  if incoming.id is null then raise exception 'Incoming order not found' using errcode='P0002'; end if;
  if incoming.side <> 'BUY' or incoming.status not in ('OPEN','PARTIALLY_FILLED') then return 0; end if;
  select * into instrument from market.instruments where id=incoming.instrument_id for share;
  if instrument.market_type <> 'BINARY' or instrument.liquidity_model <> 'ORDER_BOOK' or instrument.status <> 'OPEN' then return 0; end if;
  perform pg_advisory_xact_lock(hashtextextended('vad-orderbook:'||instrument.id::text,0));
  incoming_remaining := incoming.quantity - incoming.filled_quantity;
  if incoming_remaining <= 0 then return 0; end if;

  select o.* into resting
  from trading.orders o
  where o.instrument_id=incoming.instrument_id
    and o.outcome_id<>incoming.outcome_id
    and o.side='BUY'
    and o.status in ('OPEN','PARTIALLY_FILLED')
    and o.id<>incoming.id and o.user_id<>incoming.user_id
    and o.limit_price + incoming.limit_price >= instrument.settlement_unit
    and (o.expires_at is null or o.expires_at>statement_timestamp())
  order by o.limit_price desc, o.sequence_number asc
  limit 1 for update skip locked;
  if resting.id is null then return 0; end if;

  resting_remaining := resting.quantity-resting.filled_quantity;
  fill_qty := least(incoming_remaining,resting_remaining);
  if fill_qty<=0 then return 0; end if;
  maker_price := resting.limit_price;
  taker_price := round(instrument.settlement_unit-maker_price,18);
  if taker_price<=0 or taker_price>incoming.limit_price then
    raise exception 'Complementary pricing invariant failed' using errcode='23514';
  end if;
  maker_amount:=round(maker_price*fill_qty,18);
  taker_amount:=round(taker_price*fill_qty,18);
  collateral_amount:=round(instrument.settlement_unit*fill_qty,18);
  if round(maker_amount+taker_amount,18)<>collateral_amount then
    raise exception 'Complete-set collateral invariant failed' using errcode='23514';
  end if;
  if not exists(select 1 from trading.order_reservations r where r.order_id=resting.id and r.initial_reserved-r.consumed_notional-r.released_notional>=maker_amount) then
    raise exception 'Maker reservation is insufficient' using errcode='23514';
  end if;
  if not exists(select 1 from trading.order_reservations r where r.order_id=incoming.id and r.initial_reserved-r.consumed_notional-r.released_notional>=taker_amount) then
    raise exception 'Taker reservation is insufficient' using errcode='23514';
  end if;

  match_key:='match:'||resting.public_id::text||':'||incoming.public_id::text||':'||resting.filled_quantity::text||':'||incoming.filled_quantity::text||':'||fill_qty::text;
  match_public_id:=gen_random_uuid();
  collateral_account:=finance.ensure_market_collateral_account(instrument.id,instrument.asset_id);
  collateral_journal:=finance.collateralize_complete_set(instrument.asset_id,resting.reserved_account_id,incoming.reserved_account_id,collateral_account,maker_amount,taker_amount,'collateral:'||match_key,match_public_id::text);
  improvement:=round((incoming.limit_price-taker_price)*fill_qty,18);
  improvement_journal:=null;
  if improvement>0 then
    taker_available_account:=finance.ensure_user_account(incoming.user_id,instrument.asset_id,'USER_AVAILABLE');
    improvement_journal:=finance.transfer(instrument.asset_id,incoming.reserved_account_id,taker_available_account,improvement,'ORDER_PRICE_IMPROVEMENT_RELEASE','improvement:'||match_key,'MATCH',match_public_id::text,'Release unused reservation from complementary price improvement',incoming.user_id);
  end if;

  insert into trading.matches(public_id,instrument_id,maker_order_id,taker_order_id,quantity,settlement_unit,maker_price,taker_price,collateral_amount,collateral_journal_id,price_improvement_journal_id,idempotency_key)
  values(match_public_id,instrument.id,resting.id,incoming.id,fill_qty,instrument.settlement_unit,maker_price,taker_price,collateral_amount,collateral_journal,improvement_journal,match_key)
  returning id into match_id;
  insert into trading.fills(match_id,order_id,user_id,outcome_id,liquidity_role,price,quantity,notional) values
    (match_id,resting.id,resting.user_id,resting.outcome_id,'MAKER',maker_price,fill_qty,maker_amount),
    (match_id,incoming.id,incoming.user_id,incoming.outcome_id,'TAKER',taker_price,fill_qty,taker_amount);
  update trading.order_reservations set consumed_notional=consumed_notional+maker_amount where order_id=resting.id;
  update trading.order_reservations set consumed_notional=consumed_notional+taker_amount,released_notional=released_notional+improvement where order_id=incoming.id;

  insert into trading.positions(user_id,instrument_id,outcome_id,quantity,total_cost_basis,realized_pnl,fees_paid)
  values(resting.user_id,instrument.id,resting.outcome_id,fill_qty,maker_amount,0,0)
  on conflict(user_id,instrument_id,outcome_id) do update
    set quantity=trading.positions.quantity+excluded.quantity,
        total_cost_basis=trading.positions.total_cost_basis+excluded.total_cost_basis,
        updated_at=statement_timestamp();
  insert into trading.positions(user_id,instrument_id,outcome_id,quantity,total_cost_basis,realized_pnl,fees_paid)
  values(incoming.user_id,instrument.id,incoming.outcome_id,fill_qty,taker_amount,0,0)
  on conflict(user_id,instrument_id,outcome_id) do update
    set quantity=trading.positions.quantity+excluded.quantity,
        total_cost_basis=trading.positions.total_cost_basis+excluded.total_cost_basis,
        updated_at=statement_timestamp();
  update trading.orders set filled_quantity=filled_quantity+fill_qty,status=case when filled_quantity+fill_qty>=quantity then 'FILLED' else 'PARTIALLY_FILLED' end,updated_at=statement_timestamp() where id=resting.id;
  update trading.orders set filled_quantity=filled_quantity+fill_qty,status=case when filled_quantity+fill_qty>=quantity then 'FILLED' else 'PARTIALLY_FILLED' end,updated_at=statement_timestamp() where id=incoming.id;
  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('ORDER_MATCHED','MATCH',match_public_id::text,jsonb_build_object('match_type','COMPLETE_SET','match_id',match_public_id,'instrument_id',instrument.public_id,'quantity',fill_qty,'maker_price',maker_price,'taker_price',taker_price,'collateral_amount',collateral_amount),'event:'||match_key)
  on conflict(idempotency_key) do nothing;
  perform command.refresh_market_catalog(instrument.id);
  return 1;
end;
$$;

create or replace function command.match_secondary_order(p_order_id bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  incoming trading.orders; resting trading.orders; buyer trading.orders; seller trading.orders; instrument market.instruments;
  incoming_remaining numeric(38,18); resting_remaining numeric(38,18); fill_qty numeric(38,18); execution_price numeric(38,18); notional numeric(38,18);
  seller_pos trading.positions; seller_cost_released numeric(38,18); seller_available bigint; buyer_available bigint;
  buyer_res trading.order_reservations; seller_res trading.share_reservations; improvement numeric(38,18); improvement_journal bigint; cash_journal bigint;
  match_public_id uuid; secondary_match_id bigint; match_key text;
begin
  select * into incoming from trading.orders where id=p_order_id for update;
  if incoming.id is null then raise exception 'Incoming order not found' using errcode='P0002'; end if;
  if incoming.status not in ('OPEN','PARTIALLY_FILLED') then return 0; end if;
  select * into instrument from market.instruments where id=incoming.instrument_id for share;
  if instrument.status<>'OPEN' then return 0; end if;
  perform pg_advisory_xact_lock(hashtextextended('vad-orderbook:'||instrument.id::text,0));
  incoming_remaining:=incoming.quantity-incoming.filled_quantity;
  if incoming_remaining<=0 then return 0; end if;

  if incoming.side='BUY' then
    select o.* into resting from trading.orders o
    where o.instrument_id=incoming.instrument_id and o.outcome_id=incoming.outcome_id
      and o.side='SELL' and o.status in ('OPEN','PARTIALLY_FILLED')
      and o.id<>incoming.id and o.user_id<>incoming.user_id
      and o.limit_price<=incoming.limit_price
      and (o.expires_at is null or o.expires_at>statement_timestamp())
    order by o.limit_price asc,o.sequence_number asc limit 1 for update skip locked;
  else
    select o.* into resting from trading.orders o
    where o.instrument_id=incoming.instrument_id and o.outcome_id=incoming.outcome_id
      and o.side='BUY' and o.status in ('OPEN','PARTIALLY_FILLED')
      and o.id<>incoming.id and o.user_id<>incoming.user_id
      and o.limit_price>=incoming.limit_price
      and (o.expires_at is null or o.expires_at>statement_timestamp())
    order by o.limit_price desc,o.sequence_number asc limit 1 for update skip locked;
  end if;
  if resting.id is null then return 0; end if;
  resting_remaining:=resting.quantity-resting.filled_quantity;
  fill_qty:=least(incoming_remaining,resting_remaining);
  if fill_qty<=0 then return 0; end if;
  execution_price:=resting.limit_price;
  notional:=round(execution_price*fill_qty,18);

  if incoming.side='BUY' then buyer:=incoming; seller:=resting; else buyer:=resting; seller:=incoming; end if;
  select * into buyer_res from trading.order_reservations where order_id=buyer.id for update;
  select * into seller_res from trading.share_reservations where order_id=seller.id for update;
  if buyer_res.order_id is null or buyer_res.initial_reserved-buyer_res.consumed_notional-buyer_res.released_notional<notional then
    raise exception 'Buyer reservation is insufficient' using errcode='23514';
  end if;
  if seller_res.order_id is null or seller_res.initial_quantity-seller_res.consumed_quantity-seller_res.released_quantity<fill_qty then
    raise exception 'Seller share reservation is insufficient' using errcode='23514';
  end if;
  select * into seller_pos from trading.positions
  where user_id=seller.user_id and instrument_id=seller.instrument_id and outcome_id=seller.outcome_id for update;
  if seller_pos.user_id is null or seller_pos.quantity<fill_qty then
    raise exception 'Seller position is insufficient' using errcode='23514';
  end if;

  seller_cost_released:=case when seller_pos.quantity=0 then 0 else round(seller_pos.total_cost_basis*(fill_qty/seller_pos.quantity),18) end;
  seller_available:=finance.ensure_user_account(seller.user_id,instrument.asset_id,'USER_AVAILABLE');
  match_public_id:=gen_random_uuid();
  match_key:='secondary:'||resting.public_id::text||':'||incoming.public_id::text||':'||resting.filled_quantity::text||':'||incoming.filled_quantity::text||':'||fill_qty::text;
  cash_journal:=finance.transfer(instrument.asset_id,buyer_res.reserved_account_id,seller_available,notional,'SECONDARY_TRADE','cash:'||match_key,'SECONDARY_MATCH',match_public_id::text,'Transfer consideration for existing VAD outcome shares',buyer.user_id);

  improvement:=0; improvement_journal:=null;
  if buyer.id=incoming.id and buyer.limit_price>execution_price then
    improvement:=round((buyer.limit_price-execution_price)*fill_qty,18);
    if improvement>0 then
      buyer_available:=finance.ensure_user_account(buyer.user_id,instrument.asset_id,'USER_AVAILABLE');
      improvement_journal:=finance.transfer(instrument.asset_id,buyer_res.reserved_account_id,buyer_available,improvement,'ORDER_PRICE_IMPROVEMENT_RELEASE','secondary-improvement:'||match_key,'SECONDARY_MATCH',match_public_id::text,'Release unused buyer reservation from secondary execution improvement',buyer.user_id);
    end if;
  end if;

  insert into trading.secondary_matches(public_id,instrument_id,outcome_id,maker_order_id,taker_order_id,buyer_user_id,seller_user_id,price,quantity,notional,cash_journal_id,price_improvement_journal_id,idempotency_key)
  values(match_public_id,instrument.id,incoming.outcome_id,resting.id,incoming.id,buyer.user_id,seller.user_id,execution_price,fill_qty,notional,cash_journal,improvement_journal,match_key)
  returning id into secondary_match_id;
  insert into trading.secondary_fills(secondary_match_id,order_id,user_id,side,liquidity_role,price,quantity,notional) values
    (secondary_match_id,resting.id,resting.user_id,resting.side,'MAKER',execution_price,fill_qty,notional),
    (secondary_match_id,incoming.id,incoming.user_id,incoming.side,'TAKER',execution_price,fill_qty,notional);

  update trading.order_reservations set consumed_notional=consumed_notional+notional,released_notional=released_notional+improvement where order_id=buyer.id;
  update trading.share_reservations set consumed_quantity=consumed_quantity+fill_qty where order_id=seller.id;
  update trading.positions
    set quantity=quantity-fill_qty,
        total_cost_basis=greatest(total_cost_basis-seller_cost_released,0),
        realized_pnl=realized_pnl+(notional-seller_cost_released),
        updated_at=statement_timestamp()
  where user_id=seller.user_id and instrument_id=instrument.id and outcome_id=seller.outcome_id;
  insert into trading.positions(user_id,instrument_id,outcome_id,quantity,total_cost_basis,realized_pnl,fees_paid)
  values(buyer.user_id,instrument.id,buyer.outcome_id,fill_qty,notional,0,0)
  on conflict(user_id,instrument_id,outcome_id) do update
    set quantity=trading.positions.quantity+excluded.quantity,
        total_cost_basis=trading.positions.total_cost_basis+excluded.total_cost_basis,
        updated_at=statement_timestamp();
  update trading.orders set filled_quantity=filled_quantity+fill_qty,status=case when filled_quantity+fill_qty>=quantity then 'FILLED' else 'PARTIALLY_FILLED' end,updated_at=statement_timestamp() where id=resting.id;
  update trading.orders set filled_quantity=filled_quantity+fill_qty,status=case when filled_quantity+fill_qty>=quantity then 'FILLED' else 'PARTIALLY_FILLED' end,updated_at=statement_timestamp() where id=incoming.id;
  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('ORDER_MATCHED','SECONDARY_MATCH',match_public_id::text,jsonb_build_object('match_type','SECONDARY','match_id',match_public_id,'instrument_id',instrument.public_id,'outcome_id',incoming.outcome_id,'price',execution_price,'quantity',fill_qty,'buyer_user_id',buyer.user_id,'seller_user_id',seller.user_id),'event:'||match_key)
  on conflict(idempotency_key) do nothing;
  perform command.refresh_market_catalog(instrument.id);
  return 1;
end;
$$;

create or replace function command.match_best_order(p_order_id bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  incoming trading.orders; instrument market.instruments; secondary_price numeric(38,18); complementary_price numeric(38,18);
  secondary_seq bigint; complementary_seq bigint; matched integer; total_matches integer:=0;
begin
  loop
    select * into incoming from trading.orders where id=p_order_id for update;
    exit when incoming.id is null or incoming.status not in ('OPEN','PARTIALLY_FILLED') or incoming.filled_quantity>=incoming.quantity;
    select * into instrument from market.instruments where id=incoming.instrument_id;
    secondary_price:=null; complementary_price:=null; secondary_seq:=null; complementary_seq:=null;

    if incoming.side='SELL' then
      select o.limit_price,o.sequence_number into secondary_price,secondary_seq
      from trading.orders o where o.instrument_id=incoming.instrument_id and o.outcome_id=incoming.outcome_id
        and o.side='BUY' and o.status in ('OPEN','PARTIALLY_FILLED') and o.user_id<>incoming.user_id
        and o.limit_price>=incoming.limit_price and (o.expires_at is null or o.expires_at>statement_timestamp())
      order by o.limit_price desc,o.sequence_number asc limit 1;
      if secondary_price is null then exit; end if;
      matched:=command.match_secondary_order(incoming.id);
    else
      select o.limit_price,o.sequence_number into secondary_price,secondary_seq
      from trading.orders o where o.instrument_id=incoming.instrument_id and o.outcome_id=incoming.outcome_id
        and o.side='SELL' and o.status in ('OPEN','PARTIALLY_FILLED') and o.user_id<>incoming.user_id
        and o.limit_price<=incoming.limit_price and (o.expires_at is null or o.expires_at>statement_timestamp())
      order by o.limit_price asc,o.sequence_number asc limit 1;

      select round(instrument.settlement_unit-o.limit_price,18),o.sequence_number into complementary_price,complementary_seq
      from trading.orders o where o.instrument_id=incoming.instrument_id and o.outcome_id<>incoming.outcome_id
        and o.side='BUY' and o.status in ('OPEN','PARTIALLY_FILLED') and o.user_id<>incoming.user_id
        and o.limit_price+incoming.limit_price>=instrument.settlement_unit and (o.expires_at is null or o.expires_at>statement_timestamp())
      order by o.limit_price desc,o.sequence_number asc limit 1;

      if secondary_price is null and complementary_price is null then exit; end if;
      if complementary_price is null
         or (secondary_price is not null and (secondary_price<complementary_price or (secondary_price=complementary_price and secondary_seq<=complementary_seq))) then
        matched:=command.match_secondary_order(incoming.id);
      else
        matched:=command.match_complementary_order(incoming.id);
      end if;
    end if;
    exit when coalesce(matched,0)=0;
    total_matches:=total_matches+matched;
  end loop;
  return total_matches;
end;
$$;

create or replace function command.reserve_for_order(
  p_user_id uuid,p_market_id bigint,p_outcome_id bigint,p_side text,p_price numeric,p_quantity numeric,p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  instrument market.instruments; outcome market.outcomes; required_amount numeric(38,18); available_account bigint; reserved_account bigint;
  current_available numeric(38,18); available_shares numeric(38,18); order_public_id uuid; order_id bigint; seq bigint;
begin
  if p_side not in ('BUY','SELL') then raise exception 'Unsupported order side' using errcode='22023'; end if;
  if p_price is null or p_price<=0 then raise exception 'Price must be positive' using errcode='22023'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'Quantity must be positive' using errcode='22023'; end if;
  select * into instrument from market.instruments where id=p_market_id for share;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if instrument.status<>'OPEN' then raise exception 'Market is not open' using errcode='P0001'; end if;
  if instrument.opened_at is null or instrument.opened_at>statement_timestamp() or (instrument.closed_at is not null and instrument.closed_at<=statement_timestamp()) then raise exception 'Market is outside its trading window' using errcode='P0001'; end if;
  if p_price>=instrument.settlement_unit then raise exception 'Price must be below settlement unit' using errcode='22023'; end if;
  select * into outcome from market.outcomes where id=p_outcome_id and instrument_id=p_market_id;
  if outcome.id is null then raise exception 'Outcome not found for market' using errcode='P0002'; end if;
  required_amount:=round(p_price*p_quantity,18);
  if required_amount<instrument.min_order_notional then raise exception 'Order is below the market minimum notional' using errcode='22023'; end if;
  select o.id,o.public_id into order_id,order_public_id from trading.orders o where o.idempotency_key=p_idempotency_key and o.user_id=p_user_id;
  if order_public_id is not null then perform command.match_best_order(order_id); return order_public_id; end if;
  seq:=nextval('trading.order_sequence');

  if p_side='BUY' then
    available_account:=finance.ensure_user_account(p_user_id,instrument.asset_id,'USER_AVAILABLE');
    reserved_account:=finance.ensure_user_account(p_user_id,instrument.asset_id,'USER_RESERVED');
    perform pg_advisory_xact_lock(hashtextextended('vad-wallet:'||p_user_id::text||':'||instrument.asset_id::text,0));
    current_available:=finance.account_balance(available_account);
    if current_available<required_amount then raise exception 'Insufficient available balance' using errcode='P0001'; end if;
    perform finance.transfer(instrument.asset_id,available_account,reserved_account,required_amount,'ORDER_RESERVE','reserve:'||p_idempotency_key,'ORDER',p_idempotency_key,'Reserve funds for VAD limit order',p_user_id);
    insert into trading.orders(user_id,instrument_id,outcome_id,side,order_type,limit_price,quantity,filled_quantity,reserved_account_id,sequence_number,status,idempotency_key)
    values(p_user_id,p_market_id,p_outcome_id,p_side,'LIMIT',p_price,p_quantity,0,reserved_account,seq,'OPEN',p_idempotency_key)
    returning id,public_id into order_id,order_public_id;
    insert into trading.order_reservations(order_id,asset_id,reserved_account_id,initial_reserved)
    values(order_id,instrument.asset_id,reserved_account,required_amount);
  else
    perform pg_advisory_xact_lock(hashtextextended('vad-position:'||p_user_id::text||':'||p_market_id::text||':'||p_outcome_id::text,0));
    available_shares:=command.position_available_to_sell(p_user_id,p_market_id,p_outcome_id);
    if available_shares<p_quantity then raise exception 'Insufficient available shares' using errcode='P0001'; end if;
    insert into trading.orders(user_id,instrument_id,outcome_id,side,order_type,limit_price,quantity,filled_quantity,reserved_account_id,sequence_number,status,idempotency_key)
    values(p_user_id,p_market_id,p_outcome_id,p_side,'LIMIT',p_price,p_quantity,0,null,seq,'OPEN',p_idempotency_key)
    returning id,public_id into order_id,order_public_id;
    insert into trading.share_reservations(order_id,user_id,instrument_id,outcome_id,initial_quantity)
    values(order_id,p_user_id,p_market_id,p_outcome_id,p_quantity);
  end if;

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('ORDER_PLACED','ORDER',order_public_id::text,jsonb_build_object('order_id',order_public_id,'instrument_id',p_market_id,'outcome_id',p_outcome_id,'user_id',p_user_id,'side',p_side,'price',p_price,'quantity',p_quantity),'order-placed:'||order_public_id::text);
  perform command.match_best_order(order_id);
  return order_public_id;
end;
$$;

create or replace function public.cancel_order(p_order_public_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  account public.user_accounts; ord trading.orders; cash_res trading.order_reservations; share_res trading.share_reservations;
  instrument market.instruments; available_account bigint; releasable numeric(38,18); shares_releasable numeric(38,18);
begin
  account:=private.require_active_account();
  select * into ord from trading.orders where public_id=p_order_public_id and user_id=auth.uid() for update;
  if ord.id is null then raise exception 'Order not found' using errcode='P0002'; end if;
  if ord.status not in ('OPEN','PARTIALLY_FILLED') then raise exception 'Order cannot be cancelled from its current state' using errcode='P0001'; end if;
  select * into instrument from market.instruments where id=ord.instrument_id;
  if ord.side='BUY' then
    select * into cash_res from trading.order_reservations where order_id=ord.id for update;
    if cash_res.order_id is null then raise exception 'Order reservation record is missing' using errcode='23514'; end if;
    releasable:=round(cash_res.initial_reserved-cash_res.consumed_notional-cash_res.released_notional,18);
    if releasable>0 then
      available_account:=finance.ensure_user_account(auth.uid(),instrument.asset_id,'USER_AVAILABLE');
      perform finance.transfer(instrument.asset_id,cash_res.reserved_account_id,available_account,releasable,'ORDER_RESERVATION_RELEASE','cancel:'||ord.public_id::text,'ORDER',ord.public_id::text,'Release unused VAD cash order reservation',auth.uid());
      update trading.order_reservations set released_notional=released_notional+releasable where order_id=ord.id;
    end if;
  else
    select * into share_res from trading.share_reservations where order_id=ord.id for update;
    if share_res.order_id is null then raise exception 'Share reservation record is missing' using errcode='23514'; end if;
    shares_releasable:=share_res.initial_quantity-share_res.consumed_quantity-share_res.released_quantity;
    if shares_releasable>0 then
      update trading.share_reservations set released_quantity=released_quantity+shares_releasable where order_id=ord.id;
    end if;
  end if;
  update trading.orders set status='CANCELLED',updated_at=statement_timestamp() where id=ord.id;
  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('ORDER_CANCELLED','ORDER',ord.public_id::text,jsonb_build_object('order_id',ord.public_id,'user_id',auth.uid(),'released_cash',coalesce(releasable,0),'released_shares',coalesce(shares_releasable,0)),'order-cancelled:'||ord.public_id::text)
  on conflict(idempotency_key) do nothing;
  return true;
end;
$$;

-- Market close helper releases all still-open reservations atomically. It is
-- intentionally internal; admin/runtime closing commands can call it later.
create or replace function command.release_open_orders_for_instrument(p_instrument_id bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare ord trading.orders; cash_res trading.order_reservations; share_res trading.share_reservations; instrument market.instruments; available_account bigint; releasable numeric(38,18); count_released integer:=0;
begin
  select * into instrument from market.instruments where id=p_instrument_id for update;
  for ord in select * from trading.orders where instrument_id=p_instrument_id and status in ('OPEN','PARTIALLY_FILLED') for update loop
    if ord.side='BUY' then
      select * into cash_res from trading.order_reservations where order_id=ord.id for update;
      releasable:=coalesce(cash_res.initial_reserved-cash_res.consumed_notional-cash_res.released_notional,0);
      if releasable>0 then
        available_account:=finance.ensure_user_account(ord.user_id,instrument.asset_id,'USER_AVAILABLE');
        perform finance.transfer(instrument.asset_id,cash_res.reserved_account_id,available_account,releasable,'MARKET_CLOSE_ORDER_RELEASE','market-close:'||p_instrument_id::text||':'||ord.public_id::text,'ORDER',ord.public_id::text,'Release open cash reservation at market close',ord.user_id);
        update trading.order_reservations set released_notional=released_notional+releasable where order_id=ord.id;
      end if;
    else
      select * into share_res from trading.share_reservations where order_id=ord.id for update;
      if share_res.order_id is not null then
        update trading.share_reservations set released_quantity=released_quantity+(initial_quantity-consumed_quantity-released_quantity) where order_id=ord.id;
      end if;
    end if;
    update trading.orders set status='CANCELLED',updated_at=statement_timestamp() where id=ord.id;
    count_released:=count_released+1;
  end loop;
  return count_released;
end;
$$;

revoke all on function command.match_complementary_order(bigint), command.match_secondary_order(bigint), command.match_best_order(bigint), command.release_open_orders_for_instrument(bigint) from public,anon,authenticated;
grant execute on function command.match_complementary_order(bigint), command.match_secondary_order(bigint), command.match_best_order(bigint), command.release_open_orders_for_instrument(bigint) to service_role;

-- Existing authenticated public.place_order continues to call reserve_for_order,
-- which now safely supports both BUY and SELL.
