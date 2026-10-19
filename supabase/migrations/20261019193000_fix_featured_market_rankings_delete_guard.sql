-- Fix custom market publication rollback: ranking refresh used an unqualified DELETE,
-- rejected by the database's guarded DELETE policy (SQLSTATE 21000).
create or replace function private.refresh_featured_market_rankings()
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_window integer;
  v_count integer:=0;
begin
  perform pg_advisory_xact_lock(hashtextextended('vad-featured-market-rankings',0));
  select window_hours into v_window
  from public.featured_market_settings
  where settings_key='HOME_AUTOMATIC';
  v_window:=coalesce(v_window,24);

  -- Explicit predicate is required by the database's guarded DELETE policy.
  -- The prior unqualified DELETE raised SQLSTATE 21000 and rolled back custom
  -- market publication after the instrument/event status updates.
  delete from public.featured_market_rankings where true;

  with executed as (
    select m.instrument_id,
           sum(m.collateral_amount)::numeric(38,18) as volume_ngn,
           count(*)::integer as trade_count,
           max(m.matched_at) as last_trade_at
    from trading.matches m
    where m.matched_at >= statement_timestamp()-make_interval(hours=>v_window)
    group by m.instrument_id
    union all
    select sm.instrument_id,
           sum(sm.notional)::numeric(38,18) as volume_ngn,
           count(*)::integer as trade_count,
           max(sm.matched_at) as last_trade_at
    from trading.secondary_matches sm
    where sm.matched_at >= statement_timestamp()-make_interval(hours=>v_window)
    group by sm.instrument_id
  ), aggregated as (
    select e.instrument_id,
           sum(e.volume_ngn)::numeric(38,18) as volume_ngn,
           sum(e.trade_count)::integer as trade_count,
           max(e.last_trade_at) as last_trade_at
    from executed e
    group by e.instrument_id
  ), eligible_universe as (
    select i.public_id as instrument_public_id,
           a.volume_ngn,
           a.trade_count,
           a.last_trade_at
    from aggregated a
    join market.instruments i on i.id=a.instrument_id
    join public.assets asset on asset.id=i.asset_id
    left join public.vad_market_curations vc
      on vc.instrument_public_id=i.public_id and vc.active
    left join public.market_home_suppressions hs
      on hs.instrument_public_id=i.public_id
    where i.status='OPEN'
      and asset.code='NGN'
      and vc.instrument_public_id is null
      and not coalesce(hs.suppress_featured,false)
  ), ranked as (
    select eu.*,
           row_number() over(
             order by eu.volume_ngn desc,eu.trade_count desc,eu.last_trade_at desc,eu.instrument_public_id
           )::integer as rank
    from eligible_universe eu
  )
  insert into public.featured_market_rankings(
    instrument_public_id,window_volume_ngn,trade_count,last_trade_at,rank,calculated_at
  )
  select instrument_public_id,volume_ngn,trade_count,last_trade_at,rank,statement_timestamp()
  from ranked;

  get diagnostics v_count=row_count;
  update public.featured_market_settings
  set last_refreshed_at=statement_timestamp(),updated_at=statement_timestamp()
  where settings_key='HOME_AUTOMATIC';
  return v_count;
end;
$function$;
