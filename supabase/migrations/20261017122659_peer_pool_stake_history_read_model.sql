-- Historical YES/NO participant allocation for peer-pool market charts.
-- Values are reconstructed from recorded stake events; no synthetic snapshots are added.
create or replace function public.peer_pool_stake_history(
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
      and upper(coalesce(i.liquidity_model, '')) like '%POOL%'
  ),
  timeline as (
    select distinct s.created_at as observed_at
    from trading.pool_stakes s
    join target t on t.id = s.instrument_id
    order by s.created_at desc
    limit greatest(1, least(coalesce(p_limit, 120), 240))
  ),
  ordered_timeline as (
    select observed_at
    from timeline
  ),
  outcome_codes as (
    select o.id as outcome_id, o.code as outcome_code
    from market.outcomes o
    join target t on t.id = o.instrument_id
    where o.code in ('YES', 'NO')
  ),
  allocation as (
    select
      ts.observed_at,
      oc.outcome_code,
      coalesce((
        select sum(s.amount)
        from trading.pool_stakes s
        join target t on t.id = s.instrument_id
        where s.outcome_id = oc.outcome_id
          and s.created_at <= ts.observed_at
      ), 0) as outcome_amount
    from ordered_timeline ts
    cross join outcome_codes oc
  ),
  normalized as (
    select
      a.observed_at,
      a.outcome_code,
      a.outcome_amount / nullif(sum(a.outcome_amount) over (partition by a.observed_at), 0) as price
    from allocation a
  )
  select n.observed_at, n.outcome_code, n.price
  from normalized n
  where n.price is not null
  order by n.observed_at asc, n.outcome_code asc;
$$;

revoke all on function public.peer_pool_stake_history(uuid, integer) from public, anon;
grant execute on function public.peer_pool_stake_history(uuid, integer) to authenticated;
