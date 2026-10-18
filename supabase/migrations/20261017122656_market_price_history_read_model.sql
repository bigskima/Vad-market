-- Actual timestamped YES/NO trade history for the VAD market detail chart.
-- Historical points are derived only from immutable executed fills; no synthetic
-- or interpolated prices are inserted.

create or replace function public.market_price_history(
  p_instrument_public_id uuid,
  p_limit integer default 120
)
returns table (
  observed_at timestamptz,
  outcome_code text,
  price numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select i.id
    from market.instruments i
    where i.public_id = p_instrument_public_id
  ),
  executions as (
    select f.created_at as observed_at, o.code as outcome_code, f.price, f.id::text as row_key
    from trading.fills f
    join market.outcomes o on o.id = f.outcome_id
    join target t on t.id = o.instrument_id
    where o.code in ('YES', 'NO')

    union all

    select sf.created_at as observed_at, o.code as outcome_code, sf.price, sf.id::text as row_key
    from trading.secondary_fills sf
    join trading.secondary_matches sm on sm.id = sf.secondary_match_id
    join market.outcomes o on o.id = sm.outcome_id
    join target t on t.id = o.instrument_id
    where o.code in ('YES', 'NO')
  )
  select e.observed_at, e.outcome_code, e.price
  from executions e
  order by e.observed_at desc, e.row_key desc
  limit greatest(1, least(coalesce(p_limit, 120), 240));
$$;

revoke all on function public.market_price_history(uuid, integer) from public, anon;
grant execute on function public.market_price_history(uuid, integer) to authenticated;
