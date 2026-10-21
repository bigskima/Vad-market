begin;

-- Mark positions from the last executed price for that exact outcome.
-- Attribute entry execution fees to the remaining inventory using the current
-- quantity / bought-quantity ratio; do not charge sell execution fees to
-- unrealized inventory P&L.
create or replace function public.my_portfolio_position_marks()
returns table (
  instrument_id uuid,
  event_id uuid,
  market_title text,
  outcome_code text,
  asset_code text,
  quantity numeric,
  total_cost_basis numeric,
  fees_paid numeric,
  average_price numeric,
  market_status text,
  current_price numeric,
  current_value numeric,
  unrealized_pnl numeric,
  return_percentage numeric,
  marked_at timestamptz,
  mark_status text,
  media_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  with position_source as (
    select
      i.id as instrument_id_internal,
      i.public_id as instrument_public_id,
      ce.public_id as event_public_id,
      ce.title as title,
      o.code as outcome,
      a.code as asset,
      p.user_id,
      p.instrument_id,
      p.outcome_id,
      p.quantity as qty,
      p.total_cost_basis as cost_basis,
      coalesce(p.fees_paid, 0)
        + coalesce(
            buy_fee.total_fee
              * least(1, p.quantity / nullif(bought_quantity.total_quantity, 0)),
            0
          ) as fees,
      case when p.quantity > 0 then p.total_cost_basis / p.quantity else 0 end as avg_price,
      upper(coalesce(i.status, 'UNKNOWN')) as status,
      current_mark.price,
      current_mark.observed_at as last_traded,
      mc.media_path as media,
      exists (
        select 1
        from settlement.runs sr
        join settlement.entitlements se on se.run_id = sr.id
        where sr.instrument_id = i.id
          and sr.status = 'SETTLED'
          and se.user_id = p.user_id
          and se.outcome_id = p.outcome_id
      ) as has_settlement
    from trading.positions p
    join market.instruments i on i.id = p.instrument_id
    join market.canonical_events ce on ce.id = i.canonical_event_id
    join market.outcomes o on o.id = p.outcome_id
    join public.assets a on a.id = i.asset_id
    left join public.market_catalog mc on mc.instrument_public_id = i.public_id
    left join lateral (
      select execution.price, execution.observed_at
      from (
        select f.price, f.created_at as observed_at, f.id::text as row_key
        from trading.fills f
        where f.outcome_id = o.id
        union all
        select sf.price, sf.created_at as observed_at, sf.id::text as row_key
        from trading.secondary_fills sf
        join trading.secondary_matches sm on sm.id = sf.secondary_match_id
        where sm.outcome_id = o.id
      ) execution
      order by execution.observed_at desc, execution.row_key desc
      limit 1
    ) current_mark on true
    left join lateral (
      select coalesce(sum(ef.fee_amount), 0)::numeric as total_fee
      from trading.execution_fees ef
      join trading.orders fee_order on fee_order.id = ef.order_id
      where fee_order.user_id = p.user_id
        and fee_order.instrument_id = p.instrument_id
        and fee_order.outcome_id = p.outcome_id
        and fee_order.side = 'BUY'
        and ef.side = 'BUY'
    ) buy_fee on true
    left join lateral (
      select (
        coalesce((
          select sum(f.quantity)
          from trading.fills f
          join trading.orders buy_order on buy_order.id = f.order_id
          where buy_order.user_id = p.user_id
            and buy_order.instrument_id = p.instrument_id
            and buy_order.outcome_id = p.outcome_id
            and buy_order.side = 'BUY'
        ), 0)
        + coalesce((
          select sum(sf.quantity)
          from trading.secondary_fills sf
          join trading.orders buy_order on buy_order.id = sf.order_id
          join trading.secondary_matches sm on sm.id = sf.secondary_match_id
          where buy_order.user_id = p.user_id
            and buy_order.instrument_id = p.instrument_id
            and sm.outcome_id = p.outcome_id
            and buy_order.side = 'BUY'
        ), 0)
      )::numeric as total_quantity
    ) bought_quantity on true
    where p.user_id = auth.uid()
      and p.quantity > 0
      and a.code in (
        select unnest(policy.enabled_asset_codes)
        from public.get_my_currency_policy() policy
      )
  ),
  labelled as (
    select source.*,
      case
        when status = 'OPEN'
          and price between 0 and 1
          and last_traded >= statement_timestamp() - interval '24 hours'
          then 'MARKED'
        when status = 'OPEN' and last_traded is null then 'UNPRICED'
        when status = 'OPEN' then 'STALE'
        when status in ('SETTLED', 'VOIDED') and has_settlement then 'SETTLED'
        else 'UNAVAILABLE'
      end as valuation_status
    from position_source source
  )
  select
    instrument_public_id,
    event_public_id,
    title,
    outcome,
    asset,
    qty,
    cost_basis,
    fees,
    avg_price,
    status,
    case when valuation_status = 'MARKED' then price else null end,
    case
      when valuation_status = 'MARKED' then qty * price
      when valuation_status = 'SETTLED' then 0::numeric
      else null
    end,
    case
      when valuation_status = 'MARKED' then (qty * price) - cost_basis - fees
      else null
    end,
    case
      when valuation_status = 'MARKED' and cost_basis + fees > 0
        then ((qty * price) - cost_basis - fees) / (cost_basis + fees)
      else null
    end,
    last_traded,
    valuation_status,
    media
  from labelled
  order by title;
$$;

revoke all on function public.my_portfolio_position_marks() from public, anon;
grant execute on function public.my_portfolio_position_marks() to authenticated;

commit;