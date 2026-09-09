-- VAD Phase 4A: reserve existing outcome shares for secondary SELL orders.
-- Secondary transfers do not mint or burn complete sets and therefore must never
-- modify market collateral.

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

create index share_reservations_owner_idx
  on trading.share_reservations(user_id, instrument_id, outcome_id);

alter table trading.share_reservations enable row level security;
revoke all on trading.share_reservations from public, anon, authenticated;
grant all on trading.share_reservations to service_role;

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
      where p.user_id=p_user_id
        and p.instrument_id=p_instrument_id
        and p.outcome_id=p_outcome_id),0)
    - coalesce((select sum(sr.initial_quantity-sr.consumed_quantity-sr.released_quantity)
      from trading.share_reservations sr
      join trading.orders o on o.id=sr.order_id
      where sr.user_id=p_user_id
        and sr.instrument_id=p_instrument_id
        and sr.outcome_id=p_outcome_id
        and o.status in ('OPEN','PARTIALLY_FILLED')),0),
    0
  )::numeric(38,18);
$$;

revoke all on function command.position_available_to_sell(uuid,bigint,bigint)
  from public,anon,authenticated;
grant execute on function command.position_available_to_sell(uuid,bigint,bigint)
  to service_role;
