create or replace function private.refresh_featured_market_rankings()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_window integer;v_count integer:=0;
begin
  perform pg_advisory_xact_lock(hashtextextended('vad-featured-market-rankings',0));
  select window_hours into v_window from public.featured_market_settings where settings_key='HOME_AUTOMATIC';
  v_window:=coalesce(v_window,24);
  delete from public.featured_market_rankings;
  with executed as (
    select m.instrument_id,sum(m.collateral_amount)::numeric(38,18) volume_ngn,count(*)::integer trade_count,max(m.matched_at) last_trade_at
    from trading.matches m where m.matched_at>=statement_timestamp()-make_interval(hours=>v_window) group by m.instrument_id
    union all
    select sm.instrument_id,sum(sm.notional)::numeric(38,18),count(*)::integer,max(sm.matched_at)
    from trading.secondary_matches sm where sm.matched_at>=statement_timestamp()-make_interval(hours=>v_window) group by sm.instrument_id
  ), aggregated as (
    select instrument_id,sum(volume_ngn)::numeric(38,18) volume_ngn,sum(trade_count)::integer trade_count,max(last_trade_at) last_trade_at from executed group by instrument_id
  ), eligible_universe as (
    select i.public_id instrument_public_id,a.volume_ngn,a.trade_count,a.last_trade_at
    from aggregated a join market.instruments i on i.id=a.instrument_id join public.assets asset on asset.id=i.asset_id
    left join public.vad_market_curations vc on vc.instrument_public_id=i.public_id and vc.active
    left join public.market_home_suppressions hs on hs.instrument_public_id=i.public_id
    where i.status='OPEN' and asset.code='NGN' and vc.instrument_public_id is null and not coalesce(hs.suppress_featured,false)
  ), ranked as (
    select eu.*,row_number() over(order by eu.volume_ngn desc,eu.trade_count desc,eu.last_trade_at desc,eu.instrument_public_id)::integer rank from eligible_universe eu
  )
  insert into public.featured_market_rankings(instrument_public_id,window_volume_ngn,trade_count,last_trade_at,rank,calculated_at)
  select instrument_public_id,volume_ngn,trade_count,last_trade_at,rank,statement_timestamp() from ranked;
  get diagnostics v_count=row_count;
  update public.featured_market_settings set last_refreshed_at=statement_timestamp(),updated_at=statement_timestamp() where settings_key='HOME_AUTOMATIC';
  return v_count;
end;$$;

create or replace function private.refresh_trending_market_rankings()
returns integer language plpgsql security definer set search_path=''
as $$
declare s public.trending_market_settings;f public.featured_market_settings;v_count integer:=0;
begin
  perform pg_advisory_xact_lock(hashtextextended('vad-trending-market-rankings',0));
  select * into s from public.trending_market_settings where settings_key='HOME_TRENDING';
  select * into f from public.featured_market_settings where settings_key='HOME_AUTOMATIC';
  delete from public.trending_market_rankings;
  with bounds as (
    select statement_timestamp() now_at,statement_timestamp()-make_interval(mins=>s.window_minutes) short_start,
      statement_timestamp()-make_interval(mins=>s.window_minutes)-make_interval(hours=>s.baseline_hours) baseline_start,
      greatest(s.window_minutes::numeric/60.0,0.25) short_hours
  ), executions as (
    select m.instrument_id,m.collateral_amount::numeric(38,18) volume_ngn,m.matched_at traded_at,((coalesce(m.maker_price,0)+coalesce(m.taker_price,0))/2.0)::numeric execution_price
    from trading.matches m,bounds b where m.matched_at>=b.baseline_start
    union all
    select sm.instrument_id,sm.notional::numeric(38,18),sm.matched_at,sm.price::numeric from trading.secondary_matches sm,bounds b where sm.matched_at>=b.baseline_start
  ), execution_stats as (
    select e.instrument_id,
      coalesce(sum(e.volume_ngn) filter(where e.traded_at>=b.short_start),0)::numeric(38,18) short_volume,
      count(*) filter(where e.traded_at>=b.short_start)::integer short_trades,
      max(e.traded_at) filter(where e.traded_at>=b.short_start) last_trade_at,
      coalesce(max(e.execution_price) filter(where e.traded_at>=b.short_start)-min(e.execution_price) filter(where e.traded_at>=b.short_start),0)::numeric price_movement,
      coalesce(sum(e.volume_ngn) filter(where e.traded_at<b.short_start),0)::numeric(38,18) baseline_volume,
      count(*) filter(where e.traded_at<b.short_start)::integer baseline_trades
    from executions e cross join bounds b group by e.instrument_id
  ), participants as (
    select m.instrument_id,o.user_id,m.matched_at traded_at from trading.matches m join trading.orders o on o.id=m.maker_order_id cross join bounds b where m.matched_at>=b.baseline_start
    union all select m.instrument_id,o.user_id,m.matched_at from trading.matches m join trading.orders o on o.id=m.taker_order_id cross join bounds b where m.matched_at>=b.baseline_start
    union all select sm.instrument_id,sm.buyer_user_id,sm.matched_at from trading.secondary_matches sm cross join bounds b where sm.matched_at>=b.baseline_start
    union all select sm.instrument_id,sm.seller_user_id,sm.matched_at from trading.secondary_matches sm cross join bounds b where sm.matched_at>=b.baseline_start
  ), participant_stats as (
    select p.instrument_id,count(distinct p.user_id) filter(where p.traded_at>=b.short_start)::integer short_traders,
      count(distinct p.user_id) filter(where p.traded_at<b.short_start)::integer baseline_traders
    from participants p cross join bounds b where p.user_id is not null group by p.instrument_id
  ), metrics as (
    select es.instrument_id,es.short_volume,es.short_trades,coalesce(ps.short_traders,0) short_traders,es.baseline_volume,es.baseline_trades,
      coalesce(ps.baseline_traders,0) baseline_traders,abs(es.price_movement) price_movement,es.last_trade_at,
      es.short_volume/greatest(es.baseline_volume*(b.short_hours/s.baseline_hours),s.minimum_volume_ngn*0.25,1) volume_acceleration,
      es.short_trades::numeric/greatest(es.baseline_trades*(b.short_hours/s.baseline_hours),1) trade_acceleration,
      coalesce(ps.short_traders,0)::numeric/greatest(coalesce(ps.baseline_traders,0)*(b.short_hours/s.baseline_hours),1) trader_acceleration,
      greatest(0,1-(extract(epoch from (b.now_at-es.last_trade_at))/greatest(s.window_minutes*60,1))) recency_factor
    from execution_stats es left join participant_stats ps on ps.instrument_id=es.instrument_id cross join bounds b
  ), scored as (
    select m.*,(35*(least(m.volume_acceleration,5)/5.0)+25*(least(m.trade_acceleration,5)/5.0)+20*(least(m.trader_acceleration,5)/5.0)+10*least(m.price_movement/0.10,1)+10*least(m.recency_factor,1))::numeric(18,6) momentum_score from metrics m
  ), eligible as (
    select i.public_id instrument_public_id,x.* from scored x join market.instruments i on i.id=x.instrument_id join public.assets a on a.id=i.asset_id
    left join public.vad_market_curations vc on vc.instrument_public_id=i.public_id and vc.active
    left join public.market_home_suppressions hs on hs.instrument_public_id=i.public_id
    left join public.featured_market_rankings fr on fr.instrument_public_id=i.public_id
    where i.status='OPEN' and a.code='NGN' and vc.instrument_public_id is null and not coalesce(hs.suppress_trending,false)
      and x.short_volume>=s.minimum_volume_ngn and x.short_trades>=s.minimum_trades and x.short_traders>=s.minimum_unique_traders
      and greatest(x.volume_acceleration,x.trade_acceleration)>=s.minimum_acceleration
      and not(coalesce(f.enabled,true) and coalesce(fr.window_volume_ngn,0)>=coalesce(f.minimum_volume_ngn,1000000) and coalesce(fr.rank,999999)<=coalesce(f.max_markets,20))
  ), ranked as (
    select e.*,row_number() over(order by e.momentum_score desc,e.short_volume desc,e.short_trades desc,e.last_trade_at desc,e.instrument_public_id)::integer trend_rank from eligible e
  )
  insert into public.trending_market_rankings(instrument_public_id,short_volume_ngn,short_trade_count,short_unique_traders,baseline_volume_ngn,baseline_trade_count,baseline_unique_traders,volume_acceleration,trade_acceleration,trader_acceleration,price_movement,momentum_score,last_trade_at,rank,calculated_at)
  select instrument_public_id,short_volume,short_trades,short_traders,baseline_volume,baseline_trades,baseline_traders,volume_acceleration,trade_acceleration,trader_acceleration,price_movement,momentum_score,last_trade_at,trend_rank,statement_timestamp() from ranked;
  get diagnostics v_count=row_count;
  update public.trending_market_settings set last_refreshed_at=statement_timestamp(),updated_at=statement_timestamp() where settings_key='HOME_TRENDING';
  return v_count;
end;$$;