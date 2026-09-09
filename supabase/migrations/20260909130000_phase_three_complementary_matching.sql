-- VAD Phase 3: complementary binary matching, per-order reservations, collateral minting,
-- position accounting, and market price refresh.
--
-- Launch model: fully collateralized binary outcome shares. A BUY YES order and a
-- BUY NO order may match only when their price limits can fund one complete outcome
-- set. No naked SELL path is introduced here.

-- Per-order reservation accounting ------------------------------------------

create table trading.order_reservations (
  order_id bigint primary key references trading.orders (id) on delete restrict,
  asset_id bigint not null references public.assets (id),
  reserved_account_id bigint not null references finance.ledger_accounts (id),
  initial_reserved numeric(38,18) not null check (initial_reserved >= 0),
  consumed_notional numeric(38,18) not null default 0 check (consumed_notional >= 0),
  released_notional numeric(38,18) not null default 0 check (released_notional >= 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint order_reservation_bounds check (
    consumed_notional + released_notional <= initial_reserved
  )
);

create trigger order_reservations_set_updated_at
before update on trading.order_reservations
for each row execute function private.set_updated_at();

alter table trading.order_reservations enable row level security;
revoke all on trading.order_reservations from public, anon, authenticated;
grant all on trading.order_reservations to service_role;

-- Backfill any pre-existing BUY orders conservatively from their original limit.
insert into trading.order_reservations(
  order_id, asset_id, reserved_account_id, initial_reserved,
  consumed_notional, released_notional
)
select
  o.id,
  i.asset_id,
  o.reserved_account_id,
  round(o.limit_price * o.quantity, 18),
  round(o.limit_price * o.filled_quantity, 18),
  case
    when o.status in ('CANCELLED','EXPIRED','REJECTED')
      then round(o.limit_price * (o.quantity - o.filled_quantity), 18)
    else 0
  end
from trading.orders o
join market.instruments i on i.id = o.instrument_id
where o.side = 'BUY'
  and o.reserved_account_id is not null
on conflict (order_id) do nothing;

-- Match/fill records ---------------------------------------------------------

create table trading.matches (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  instrument_id bigint not null references market.instruments (id),
  maker_order_id bigint not null references trading.orders (id),
  taker_order_id bigint not null references trading.orders (id),
  quantity numeric(38,18) not null check (quantity > 0),
  settlement_unit numeric(38,18) not null check (settlement_unit > 0),
  maker_price numeric(38,18) not null check (maker_price > 0),
  taker_price numeric(38,18) not null check (taker_price > 0),
  collateral_amount numeric(38,18) not null check (collateral_amount > 0),
  collateral_journal_id bigint not null references finance.ledger_journals (id),
  price_improvement_journal_id bigint references finance.ledger_journals (id),
  idempotency_key text not null unique,
  matched_at timestamptz not null default statement_timestamp(),
  constraint complementary_match_prices check (
    maker_price + taker_price = settlement_unit
  ),
  constraint complementary_match_orders_different check (maker_order_id <> taker_order_id)
);

create index trading_matches_instrument_time_idx
  on trading.matches (instrument_id, matched_at desc);

create table trading.fills (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  match_id bigint not null references trading.matches (id) on delete restrict,
  order_id bigint not null references trading.orders (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  outcome_id bigint not null references market.outcomes (id),
  liquidity_role text not null check (liquidity_role in ('MAKER','TAKER')),
  price numeric(38,18) not null check (price > 0),
  quantity numeric(38,18) not null check (quantity > 0),
  notional numeric(38,18) not null check (notional > 0),
  created_at timestamptz not null default statement_timestamp(),
  unique (match_id, order_id)
);

create index trading_fills_order_idx on trading.fills (order_id, created_at);
create index trading_fills_user_idx on trading.fills (user_id, created_at desc);
create index trading_fills_instrument_outcome_idx
  on trading.fills (outcome_id, created_at desc);

create trigger trading_matches_immutable
before update or delete on trading.matches
for each row execute function private.reject_immutable_mutation();

create trigger trading_fills_immutable
before update or delete on trading.fills
for each row execute function private.reject_immutable_mutation();

alter table trading.matches enable row level security;
alter table trading.fills enable row level security;
revoke all on trading.matches, trading.fills from public, anon, authenticated;
grant all on trading.matches, trading.fills to service_role;

-- Financial helpers ----------------------------------------------------------

create or replace function finance.ensure_market_collateral_account(
  p_instrument_id bigint,
  p_asset_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id bigint;
begin
  insert into finance.ledger_accounts(
    asset_id, account_type, owner_type, owner_reference
  ) values (
    p_asset_id, 'MARKET_COLLATERAL', 'MARKET', p_instrument_id::text
  )
  on conflict (asset_id, account_type, owner_type, owner_reference) do nothing;

  select la.id into account_id
  from finance.ledger_accounts la
  where la.asset_id = p_asset_id
    and la.account_type = 'MARKET_COLLATERAL'
    and la.owner_type = 'MARKET'
    and la.owner_reference = p_instrument_id::text;

  return account_id;
end;
$$;

revoke all on function finance.ensure_market_collateral_account(bigint, bigint)
  from public, anon, authenticated;
grant execute on function finance.ensure_market_collateral_account(bigint, bigint)
  to service_role;

create or replace function finance.collateralize_complete_set(
  p_asset_id bigint,
  p_maker_reserved_account_id bigint,
  p_taker_reserved_account_id bigint,
  p_collateral_account_id bigint,
  p_maker_amount numeric,
  p_taker_amount numeric,
  p_idempotency_key text,
  p_reference_id text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  journal_id bigint;
  total_amount numeric(38,18);
  account_asset bigint;
begin
  if p_maker_amount <= 0 or p_taker_amount <= 0 then
    raise exception 'Collateral contributions must be positive' using errcode = '22023';
  end if;

  total_amount := round(p_maker_amount + p_taker_amount, 18);

  select asset_id into account_asset from finance.ledger_accounts where id = p_maker_reserved_account_id;
  if account_asset is distinct from p_asset_id then
    raise exception 'Maker reservation asset mismatch' using errcode = '23514';
  end if;
  select asset_id into account_asset from finance.ledger_accounts where id = p_taker_reserved_account_id;
  if account_asset is distinct from p_asset_id then
    raise exception 'Taker reservation asset mismatch' using errcode = '23514';
  end if;
  select asset_id into account_asset from finance.ledger_accounts where id = p_collateral_account_id;
  if account_asset is distinct from p_asset_id then
    raise exception 'Collateral account asset mismatch' using errcode = '23514';
  end if;

  insert into finance.ledger_journals(
    asset_id, journal_type, idempotency_key, reference_type,
    reference_id, description
  ) values (
    p_asset_id, 'COMPLETE_SET_COLLATERAL', p_idempotency_key,
    'MATCH', p_reference_id, 'Collateralize a fully funded VAD binary outcome set'
  ) on conflict (idempotency_key) do nothing
  returning id into journal_id;

  if journal_id is null then
    select id into journal_id
    from finance.ledger_journals
    where idempotency_key = p_idempotency_key;
    return journal_id;
  end if;

  insert into finance.ledger_entries(
    journal_id, account_id, sequence_number, direction, amount
  ) values
    (journal_id, p_maker_reserved_account_id, 1, 'DEBIT', p_maker_amount),
    (journal_id, p_taker_reserved_account_id, 2, 'DEBIT', p_taker_amount),
    (journal_id, p_collateral_account_id, 3, 'CREDIT', total_amount);

  perform finance.post_ledger_journal(journal_id, 3);
  return journal_id;
end;
$$;

revoke all on function finance.collateralize_complete_set(
  bigint,bigint,bigint,bigint,numeric,numeric,text,text
) from public, anon, authenticated;
grant execute on function finance.collateralize_complete_set(
  bigint,bigint,bigint,bigint,numeric,numeric,text,text
) to service_role;

-- Read-model refresh ---------------------------------------------------------

create or replace function command.refresh_market_catalog(p_instrument_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  instrument market.instruments;
  event market.canonical_events;
  asset public.assets;
  yes_outcome_id bigint;
  no_outcome_id bigint;
  yes_last numeric(38,18);
  no_last numeric(38,18);
  latest_fill timestamptz;
begin
  select * into instrument from market.instruments where id = p_instrument_id;
  if instrument.id is null then return; end if;

  select * into event from market.canonical_events where id = instrument.canonical_event_id;
  select * into asset from public.assets where id = instrument.asset_id;

  select id into yes_outcome_id from market.outcomes
  where instrument_id = instrument.id and code = 'YES';
  select id into no_outcome_id from market.outcomes
  where instrument_id = instrument.id and code = 'NO';

  select f.price into yes_last
  from trading.fills f
  where f.outcome_id = yes_outcome_id
  order by f.created_at desc, f.id desc limit 1;

  select f.price into no_last
  from trading.fills f
  where f.outcome_id = no_outcome_id
  order by f.created_at desc, f.id desc limit 1;

  select max(f.created_at) into latest_fill
  from trading.fills f
  join trading.orders o on o.id = f.order_id
  where o.instrument_id = instrument.id;

  insert into public.market_catalog(
    instrument_public_id, event_public_id, title, category, asset_code,
    market_type, status, closes_at, yes_price, no_price,
    last_trade_at, updated_at
  ) values (
    instrument.public_id, event.public_id, event.title, event.category, asset.code,
    instrument.market_type, instrument.status, event.closes_at,
    yes_last, no_last, latest_fill, statement_timestamp()
  )
  on conflict (instrument_public_id) do update set
    event_public_id = excluded.event_public_id,
    title = excluded.title,
    category = excluded.category,
    asset_code = excluded.asset_code,
    market_type = excluded.market_type,
    status = excluded.status,
    closes_at = excluded.closes_at,
    yes_price = excluded.yes_price,
    no_price = excluded.no_price,
    last_trade_at = excluded.last_trade_at,
    updated_at = statement_timestamp();
end;
$$;

revoke all on function command.refresh_market_catalog(bigint)
  from public, anon, authenticated;
grant execute on function command.refresh_market_catalog(bigint) to service_role;

-- Complementary matching -----------------------------------------------------

create or replace function command.match_complementary_order(p_order_id bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  incoming trading.orders;
  resting trading.orders;
  instrument market.instruments;
  incoming_remaining numeric(38,18);
  resting_remaining numeric(38,18);
  fill_qty numeric(38,18);
  maker_price numeric(38,18);
  taker_price numeric(38,18);
  maker_amount numeric(38,18);
  taker_amount numeric(38,18);
  improvement numeric(38,18);
  collateral_amount numeric(38,18);
  collateral_account bigint;
  taker_available_account bigint;
  match_public_id uuid;
  match_id bigint;
  collateral_journal bigint;
  improvement_journal bigint;
  fill_count integer := 0;
  match_key text;
begin
  select * into incoming
  from trading.orders
  where id = p_order_id
  for update;

  if incoming.id is null then
    raise exception 'Incoming order not found' using errcode = 'P0002';
  end if;
  if incoming.side <> 'BUY' then
    return 0;
  end if;
  if incoming.status not in ('OPEN','PARTIALLY_FILLED') then
    return 0;
  end if;

  select * into instrument
  from market.instruments
  where id = incoming.instrument_id
  for share;

  if instrument.market_type <> 'BINARY'
     or instrument.liquidity_model <> 'ORDER_BOOK'
     or instrument.status <> 'OPEN' then
    return 0;
  end if;

  collateral_account := finance.ensure_market_collateral_account(
    instrument.id, instrument.asset_id
  );

  -- Serialize matching per instrument while still allowing different markets
  -- to execute concurrently.
  perform pg_advisory_xact_lock(hashtextextended(
    'vad-orderbook:' || instrument.id::text, 0
  ));

  loop
    select * into incoming
    from trading.orders
    where id = p_order_id
    for update;

    incoming_remaining := incoming.quantity - incoming.filled_quantity;
    exit when incoming_remaining <= 0
      or incoming.status not in ('OPEN','PARTIALLY_FILLED');

    -- Opposite outcome BUY orders create a complete binary outcome set.
    -- Higher resting bid gives the incoming order a better complementary price;
    -- equal prices use the older server sequence first.
    select o.* into resting
    from trading.orders o
    where o.instrument_id = incoming.instrument_id
      and o.outcome_id <> incoming.outcome_id
      and o.side = 'BUY'
      and o.status in ('OPEN','PARTIALLY_FILLED')
      and o.id <> incoming.id
      and o.user_id <> incoming.user_id
      and o.limit_price + incoming.limit_price >= instrument.settlement_unit
      and (o.expires_at is null or o.expires_at > statement_timestamp())
    order by o.limit_price desc, o.sequence_number asc
    limit 1
    for update skip locked;

    exit when resting.id is null;

    resting_remaining := resting.quantity - resting.filled_quantity;
    fill_qty := least(incoming_remaining, resting_remaining);
    if fill_qty <= 0 then
      exit;
    end if;

    maker_price := resting.limit_price;
    taker_price := round(instrument.settlement_unit - maker_price, 18);

    if taker_price <= 0 or taker_price > incoming.limit_price then
      raise exception 'Complementary pricing invariant failed' using errcode = '23514';
    end if;

    maker_amount := round(maker_price * fill_qty, 18);
    taker_amount := round(taker_price * fill_qty, 18);
    collateral_amount := round(instrument.settlement_unit * fill_qty, 18);

    if round(maker_amount + taker_amount, 18) <> collateral_amount then
      raise exception 'Complete-set collateral invariant failed' using errcode = '23514';
    end if;

    -- Ensure both order reservations have enough remaining claim before money
    -- moves out of the pooled USER_RESERVED account.
    if not exists (
      select 1 from trading.order_reservations r
      where r.order_id = resting.id
        and r.initial_reserved - r.consumed_notional - r.released_notional >= maker_amount
    ) then
      raise exception 'Maker order reservation is insufficient' using errcode = '23514';
    end if;

    if not exists (
      select 1 from trading.order_reservations r
      where r.order_id = incoming.id
        and r.initial_reserved - r.consumed_notional - r.released_notional >= taker_amount
    ) then
      raise exception 'Taker order reservation is insufficient' using errcode = '23514';
    end if;

    match_key := 'match:' || resting.public_id::text || ':' || incoming.public_id::text || ':' ||
      resting.filled_quantity::text || ':' || incoming.filled_quantity::text || ':' || fill_qty::text;

    -- Pre-create match identity for journal references.
    match_public_id := gen_random_uuid();

    collateral_journal := finance.collateralize_complete_set(
      instrument.asset_id,
      resting.reserved_account_id,
      incoming.reserved_account_id,
      collateral_account,
      maker_amount,
      taker_amount,
      'collateral:' || match_key,
      match_public_id::text
    );

    improvement := round((incoming.limit_price - taker_price) * fill_qty, 18);
    improvement_journal := null;
    if improvement > 0 then
      taker_available_account := finance.ensure_user_account(
        incoming.user_id, instrument.asset_id, 'USER_AVAILABLE'
      );
      improvement_journal := finance.transfer(
        instrument.asset_id,
        incoming.reserved_account_id,
        taker_available_account,
        improvement,
        'ORDER_PRICE_IMPROVEMENT_RELEASE',
        'improvement:' || match_key,
        'MATCH', match_public_id::text,
        'Release unused reservation from complementary price improvement',
        incoming.user_id
      );
    end if;

    insert into trading.matches(
      public_id, instrument_id, maker_order_id, taker_order_id,
      quantity, settlement_unit, maker_price, taker_price,
      collateral_amount, collateral_journal_id,
      price_improvement_journal_id, idempotency_key
    ) values (
      match_public_id, instrument.id, resting.id, incoming.id,
      fill_qty, instrument.settlement_unit, maker_price, taker_price,
      collateral_amount, collateral_journal, improvement_journal, match_key
    ) returning id into match_id;

    insert into trading.fills(
      match_id, order_id, user_id, outcome_id, liquidity_role,
      price, quantity, notional
    ) values
      (match_id, resting.id, resting.user_id, resting.outcome_id, 'MAKER',
       maker_price, fill_qty, maker_amount),
      (match_id, incoming.id, incoming.user_id, incoming.outcome_id, 'TAKER',
       taker_price, fill_qty, taker_amount);

    update trading.order_reservations
    set consumed_notional = consumed_notional + maker_amount
    where order_id = resting.id;

    update trading.order_reservations
    set consumed_notional = consumed_notional + taker_amount,
        released_notional = released_notional + improvement
    where order_id = incoming.id;

    insert into trading.positions(
      user_id, instrument_id, outcome_id, quantity,
      total_cost_basis, realized_pnl, fees_paid
    ) values (
      resting.user_id, instrument.id, resting.outcome_id,
      fill_qty, maker_amount, 0, 0
    ) on conflict(user_id, instrument_id, outcome_id) do update set
      quantity = trading.positions.quantity + excluded.quantity,
      total_cost_basis = trading.positions.total_cost_basis + excluded.total_cost_basis,
      updated_at = statement_timestamp();

    insert into trading.positions(
      user_id, instrument_id, outcome_id, quantity,
      total_cost_basis, realized_pnl, fees_paid
    ) values (
      incoming.user_id, instrument.id, incoming.outcome_id,
      fill_qty, taker_amount, 0, 0
    ) on conflict(user_id, instrument_id, outcome_id) do update set
      quantity = trading.positions.quantity + excluded.quantity,
      total_cost_basis = trading.positions.total_cost_basis + excluded.total_cost_basis,
      updated_at = statement_timestamp();

    update trading.orders
    set filled_quantity = filled_quantity + fill_qty,
        status = case
          when filled_quantity + fill_qty >= quantity then 'FILLED'
          else 'PARTIALLY_FILLED'
        end,
        updated_at = statement_timestamp()
    where id = resting.id;

    update trading.orders
    set filled_quantity = filled_quantity + fill_qty,
        status = case
          when filled_quantity + fill_qty >= quantity then 'FILLED'
          else 'PARTIALLY_FILLED'
        end,
        updated_at = statement_timestamp()
    where id = incoming.id;

    insert into eventing.domain_events(
      event_type, aggregate_type, aggregate_id, payload, idempotency_key
    ) values (
      'ORDER_MATCHED', 'MATCH', match_public_id::text,
      jsonb_build_object(
        'match_id', match_public_id,
        'instrument_id', instrument.public_id,
        'maker_order_id', resting.public_id,
        'taker_order_id', incoming.public_id,
        'quantity', fill_qty,
        'maker_price', maker_price,
        'taker_price', taker_price,
        'collateral_amount', collateral_amount
      ),
      'event:' || match_key
    ) on conflict(idempotency_key) do nothing;

    fill_count := fill_count + 1;
  end loop;

  perform command.refresh_market_catalog(instrument.id);
  return fill_count;
end;
$$;

revoke all on function command.match_complementary_order(bigint)
  from public, anon, authenticated;
grant execute on function command.match_complementary_order(bigint) to service_role;

-- Replace reserve/order entry so every new order gets a dedicated reservation
-- record before matching can consume pooled reserved funds.
create or replace function command.reserve_for_order(
  p_user_id uuid,
  p_market_id bigint,
  p_outcome_id bigint,
  p_side text,
  p_price numeric,
  p_quantity numeric,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  instrument market.instruments;
  outcome market.outcomes;
  required_amount numeric(38,18);
  available_account bigint;
  reserved_account bigint;
  current_available numeric(38,18);
  order_public_id uuid;
  order_id bigint;
  seq bigint;
begin
  if p_side not in ('BUY','SELL') then
    raise exception 'Unsupported order side' using errcode = '22023';
  end if;
  if p_price is null or p_price <= 0 then
    raise exception 'Price must be positive' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be positive' using errcode = '22023';
  end if;

  select * into instrument from market.instruments where id = p_market_id for share;
  if instrument.id is null then
    raise exception 'Market not found' using errcode = 'P0002';
  end if;
  if instrument.status <> 'OPEN' then
    raise exception 'Market is not open' using errcode = 'P0001';
  end if;
  if instrument.opened_at is null or instrument.opened_at > statement_timestamp()
     or (instrument.closed_at is not null and instrument.closed_at <= statement_timestamp()) then
    raise exception 'Market is outside its trading window' using errcode = 'P0001';
  end if;
  if p_price >= instrument.settlement_unit then
    raise exception 'Price must be below the settlement unit' using errcode = '22023';
  end if;

  select * into outcome from market.outcomes
  where id = p_outcome_id and instrument_id = p_market_id;
  if outcome.id is null then
    raise exception 'Outcome not found for market' using errcode = 'P0002';
  end if;

  if p_side = 'SELL' then
    raise exception 'SELL orders are disabled until share reservation is active' using errcode = '0A000';
  end if;

  required_amount := round(p_price * p_quantity, 18);
  if required_amount < instrument.min_order_notional then
    raise exception 'Order is below the market minimum notional' using errcode = '22023';
  end if;

  select o.id, o.public_id into order_id, order_public_id
  from trading.orders o
  where o.idempotency_key = p_idempotency_key and o.user_id = p_user_id;

  if order_public_id is not null then
    perform command.match_complementary_order(order_id);
    return order_public_id;
  end if;

  available_account := finance.ensure_user_account(p_user_id, instrument.asset_id, 'USER_AVAILABLE');
  reserved_account := finance.ensure_user_account(p_user_id, instrument.asset_id, 'USER_RESERVED');

  perform pg_advisory_xact_lock(hashtextextended(
    'vad-wallet:' || p_user_id::text || ':' || instrument.asset_id::text, 0
  ));

  current_available := finance.account_balance(available_account);
  if current_available < required_amount then
    raise exception 'Insufficient available balance' using errcode = 'P0001';
  end if;

  perform finance.transfer(
    instrument.asset_id, available_account, reserved_account, required_amount,
    'ORDER_RESERVE', 'reserve:' || p_idempotency_key, 'ORDER', p_idempotency_key,
    'Reserve funds for VAD limit order', p_user_id
  );

  seq := nextval('trading.order_sequence');

  insert into trading.orders(
    user_id, instrument_id, outcome_id, side, order_type,
    limit_price, quantity, filled_quantity, reserved_account_id,
    sequence_number, status, idempotency_key
  ) values (
    p_user_id, p_market_id, p_outcome_id, p_side, 'LIMIT',
    p_price, p_quantity, 0, reserved_account, seq, 'OPEN', p_idempotency_key
  ) returning id, public_id into order_id, order_public_id;

  insert into trading.order_reservations(
    order_id, asset_id, reserved_account_id, initial_reserved
  ) values (
    order_id, instrument.asset_id, reserved_account, required_amount
  );

  insert into eventing.domain_events(
    event_type, aggregate_type, aggregate_id, payload, idempotency_key
  ) values (
    'ORDER_PLACED', 'ORDER', order_public_id::text,
    jsonb_build_object(
      'order_id', order_public_id,
      'instrument_id', p_market_id,
      'outcome_id', p_outcome_id,
      'user_id', p_user_id,
      'side', p_side,
      'price', p_price,
      'quantity', p_quantity
    ),
    'order-placed:' || order_public_id::text
  );

  perform command.match_complementary_order(order_id);
  return order_public_id;
end;
$$;

revoke all on function command.reserve_for_order(uuid,bigint,bigint,text,numeric,numeric,text)
  from public, anon, authenticated;
grant execute on function command.reserve_for_order(uuid,bigint,bigint,text,numeric,numeric,text)
  to service_role;

-- Cancellation now closes the exact per-order reservation claim rather than
-- deriving release solely from the pooled reserved account.
create or replace function public.cancel_order(p_order_public_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  account public.user_accounts;
  ord trading.orders;
  reservation trading.order_reservations;
  instrument market.instruments;
  available_account bigint;
  releasable numeric(38,18);
begin
  account := private.require_active_account();

  select * into ord
  from trading.orders
  where public_id = p_order_public_id and user_id = auth.uid()
  for update;

  if ord.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if ord.status not in ('OPEN','PARTIALLY_FILLED') then
    raise exception 'Order cannot be cancelled from its current state' using errcode = 'P0001';
  end if;
  if ord.side <> 'BUY' then
    raise exception 'Unsupported cancellation path for this order side' using errcode = '0A000';
  end if;

  select * into reservation
  from trading.order_reservations
  where order_id = ord.id
  for update;

  if reservation.order_id is null then
    raise exception 'Order reservation record is missing' using errcode = '23514';
  end if;

  releasable := round(
    reservation.initial_reserved - reservation.consumed_notional - reservation.released_notional,
    18
  );

  select * into instrument from market.instruments where id = ord.instrument_id;

  if releasable > 0 then
    available_account := finance.ensure_user_account(auth.uid(), instrument.asset_id, 'USER_AVAILABLE');
    perform finance.transfer(
      instrument.asset_id,
      reservation.reserved_account_id,
      available_account,
      releasable,
      'ORDER_RESERVATION_RELEASE',
      'cancel:' || ord.public_id::text,
      'ORDER', ord.public_id::text,
      'Release unused VAD order reservation',
      auth.uid()
    );

    update trading.order_reservations
    set released_notional = released_notional + releasable
    where order_id = ord.id;
  end if;

  update trading.orders
  set status = 'CANCELLED', updated_at = statement_timestamp()
  where id = ord.id;

  insert into eventing.domain_events(
    event_type, aggregate_type, aggregate_id, payload, idempotency_key
  ) values (
    'ORDER_CANCELLED', 'ORDER', ord.public_id::text,
    jsonb_build_object(
      'order_id', ord.public_id,
      'user_id', auth.uid(),
      'released_amount', releasable
    ),
    'order-cancelled:' || ord.public_id::text
  ) on conflict(idempotency_key) do nothing;

  return true;
end;
$$;

revoke all on function public.cancel_order(uuid) from public, anon;
grant execute on function public.cancel_order(uuid) to authenticated;

-- User portfolio/read RPCs ---------------------------------------------------

create or replace function public.my_positions()
returns table(
  instrument_id uuid,
  event_id uuid,
  market_title text,
  outcome_code text,
  quantity numeric,
  total_cost_basis numeric,
  average_price numeric,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.public_id,
    ce.public_id,
    ce.title,
    o.code,
    p.quantity,
    p.total_cost_basis,
    case when p.quantity > 0 then p.total_cost_basis / p.quantity else 0 end,
    i.status
  from trading.positions p
  join market.instruments i on i.id = p.instrument_id
  join market.canonical_events ce on ce.id = i.canonical_event_id
  join market.outcomes o on o.id = p.outcome_id
  where p.user_id = auth.uid()
    and p.quantity > 0
  order by p.updated_at desc;
$$;

revoke all on function public.my_positions() from public, anon;
grant execute on function public.my_positions() to authenticated;

create or replace function public.order_book(p_instrument_public_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select id, settlement_unit from market.instruments
    where public_id = p_instrument_public_id
      and status in ('OPEN','SUSPENDED','CLOSED','SETTLEMENT_PENDING','SETTLED')
  ), depth as (
    select
      mo.code as outcome_code,
      o.limit_price,
      sum(o.quantity - o.filled_quantity) as quantity
    from trading.orders o
    join target t on t.id = o.instrument_id
    join market.outcomes mo on mo.id = o.outcome_id
    where o.side = 'BUY'
      and o.status in ('OPEN','PARTIALLY_FILLED')
      and (o.expires_at is null or o.expires_at > statement_timestamp())
    group by mo.code, o.limit_price
  )
  select jsonb_build_object(
    'instrumentId', p_instrument_public_id,
    'yesBids', coalesce((
      select jsonb_agg(jsonb_build_object('price', d.limit_price, 'quantity', d.quantity)
                       order by d.limit_price desc)
      from depth d where d.outcome_code = 'YES'
    ), '[]'::jsonb),
    'noBids', coalesce((
      select jsonb_agg(jsonb_build_object('price', d.limit_price, 'quantity', d.quantity)
                       order by d.limit_price desc)
      from depth d where d.outcome_code = 'NO'
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.order_book(uuid) from public, anon;
grant execute on function public.order_book(uuid) to authenticated;

-- The current trading-fee hook remains explicitly zero until order reservations
-- include fee buffers. This function gives the FeePolicyEngine a stable database
-- seam without silently charging fees that were never reserved.
create or replace function command.quote_trade_fees(
  p_instrument_id bigint,
  p_maker_notional numeric,
  p_taker_notional numeric
)
returns table(maker_fee numeric, taker_fee numeric, fee_policy_version_id bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select 0::numeric, 0::numeric, null::bigint;
$$;

revoke all on function command.quote_trade_fees(bigint,numeric,numeric)
  from public, anon, authenticated;
grant execute on function command.quote_trade_fees(bigint,numeric,numeric) to service_role;
