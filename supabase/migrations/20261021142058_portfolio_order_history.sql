create or replace function public.my_portfolio_order_history(p_limit integer default 100)
returns table (
  order_id uuid,
  instrument_id uuid,
  market_title text,
  outcome_code text,
  asset_code text,
  side text,
  limit_price numeric,
  quantity numeric,
  filled_quantity numeric,
  remaining_quantity numeric,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    order_row.public_id,
    instrument.public_id,
    event.title,
    outcome.code,
    asset.code,
    order_row.side,
    order_row.limit_price,
    order_row.quantity,
    order_row.filled_quantity,
    greatest(order_row.quantity - order_row.filled_quantity, 0)::numeric,
    order_row.status,
    order_row.created_at,
    order_row.updated_at
  from trading.orders order_row
  join market.instruments instrument on instrument.id = order_row.instrument_id
  join market.canonical_events event on event.id = instrument.canonical_event_id
  join market.outcomes outcome on outcome.id = order_row.outcome_id
  join public.assets asset on asset.id = instrument.asset_id
  where order_row.user_id = auth.uid()
    and asset.code in (
      select unnest(policy.enabled_asset_codes)
      from public.get_my_currency_policy() policy
    )
  order by coalesce(order_row.updated_at, order_row.created_at) desc, order_row.sequence_number desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$$;

revoke all on function public.my_portfolio_order_history(integer) from public, anon;
grant execute on function public.my_portfolio_order_history(integer) to authenticated;