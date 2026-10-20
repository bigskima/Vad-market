begin;

-- Disabled TNGN is an empty sandbox view, not a dashboard refresh failure.
-- Keep authentication, per-user filtering, and real-money separation intact.
create or replace function public.my_tngn_market_orders()
returns setof jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  market_row record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not coalesce((public.get_demo_mode_status()->>'user_enabled')::boolean, false) then
    return;
  end if;

  for market_row in
    select distinct instrument_public_id
    from public.demo_orders
    where user_id = auth.uid()
      and instrument_public_id is not null
      and status = 'OPEN'
  loop
    perform private.settle_tngn_market_orders(market_row.instrument_public_id);
  end loop;

  return query
  select jsonb_build_object(
    'orderId', o.public_id, 'marketId', o.instrument_public_id,
    'marketTitle', o.market_title, 'outcomeCode', o.outcome_code,
    'side', o.side, 'stake', o.stake, 'assetCode', 'TNGN',
    'status', o.status, 'finalOutcome', o.final_outcome,
    'payout', o.payout, 'settledAt', o.settled_at,
    'createdAt', o.created_at, 'quotedProbability', o.quoted_probability,
    'environment', 'TNGN'
  )
  from public.demo_orders o
  where o.user_id = auth.uid()
    and o.instrument_public_id is not null
  order by o.created_at desc;
end;
$function$;

revoke all on function public.my_tngn_market_orders() from public;
grant execute on function public.my_tngn_market_orders() to authenticated;

commit;
