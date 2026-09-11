-- VAD pre-launch portfolio read-model hardening.
-- Consumer portfolio/order surfaces must not assume NGN when the launch
-- settlement set contains both NGN and USDC.

begin;

-- PostgreSQL cannot change a function's TABLE return signature in-place.
drop function if exists public.my_positions();
create function public.my_positions()
returns table(
  instrument_id uuid,
  event_id uuid,
  market_title text,
  outcome_code text,
  asset_code text,
  quantity numeric,
  total_cost_basis numeric,
  average_price numeric,
  status text
)
language sql
stable
security definer
set search_path=''
as $$
  select
    i.public_id,
    ce.public_id,
    ce.title,
    o.code,
    a.code,
    p.quantity,
    p.total_cost_basis,
    case when p.quantity > 0 then p.total_cost_basis / p.quantity else 0 end,
    i.status
  from trading.positions p
  join market.instruments i on i.id = p.instrument_id
  join market.canonical_events ce on ce.id = i.canonical_event_id
  join market.outcomes o on o.id = p.outcome_id
  join public.assets a on a.id = i.asset_id
  where p.user_id = auth.uid()
    and p.quantity > 0
  order by p.updated_at desc;
$$;
revoke all on function public.my_positions() from public, anon;
grant execute on function public.my_positions() to authenticated;

-- Enrich open orders with the public market identity and settlement asset so
-- the client can display a meaningful order instead of a generic BUY/SELL row.
drop function if exists public.my_open_orders();
create function public.my_open_orders()
returns table(
  order_id uuid,
  market_id bigint,
  instrument_public_id uuid,
  market_title text,
  outcome_id bigint,
  outcome_code text,
  side text,
  limit_price numeric,
  quantity numeric,
  filled_quantity numeric,
  remaining_quantity numeric,
  asset_code text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select
    o.public_id,
    o.instrument_id,
    i.public_id,
    ce.title,
    o.outcome_id,
    mo.code,
    o.side,
    o.limit_price,
    o.quantity,
    o.filled_quantity,
    (o.quantity - o.filled_quantity),
    a.code,
    o.status,
    o.created_at
  from trading.orders o
  join market.instruments i on i.id = o.instrument_id
  join market.canonical_events ce on ce.id = i.canonical_event_id
  join market.outcomes mo on mo.id = o.outcome_id
  join public.assets a on a.id = i.asset_id
  where o.user_id = auth.uid()
    and o.status in ('OPEN','PARTIALLY_FILLED')
  order by o.sequence_number desc;
$$;
revoke all on function public.my_open_orders() from public, anon;
grant execute on function public.my_open_orders() to authenticated;

commit;
