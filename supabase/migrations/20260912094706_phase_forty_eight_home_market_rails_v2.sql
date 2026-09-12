create or replace function public.home_market_rails()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare f public.featured_market_settings;t public.trending_market_settings;v jsonb;x jsonb;y jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into f from public.featured_market_settings where settings_key='HOME_AUTOMATIC';
  select * into t from public.trending_market_settings where settings_key='HOME_TRENDING';
  if f.last_refreshed_at is null or f.last_refreshed_at<statement_timestamp()-interval '2 minutes' then perform private.refresh_featured_market_rankings();select * into f from public.featured_market_settings where settings_key='HOME_AUTOMATIC';end if;
  if t.last_refreshed_at is null or t.last_refreshed_at<statement_timestamp()-interval '2 minutes' then perform private.refresh_trending_market_rankings();select * into t from public.trending_market_settings where settings_key='HOME_TRENDING';end if;
  select coalesce(jsonb_agg(jsonb_build_object('instrument_public_id',c.instrument_public_id,'priority',c.priority,'published_at',c.published_at) order by c.priority,c.published_at desc),'[]'::jsonb) into v
  from public.vad_market_curations c join market.instruments i on i.public_id=c.instrument_public_id where c.active and i.status='OPEN';
  if coalesce(f.enabled,true) then
    select coalesce(jsonb_agg(jsonb_build_object('instrument_public_id',r.instrument_public_id,'rank',r.rank,'volume_ngn',r.window_volume_ngn,'trade_count',r.trade_count,'last_trade_at',r.last_trade_at,'calculated_at',r.calculated_at) order by r.rank),'[]'::jsonb) into x
    from public.featured_market_rankings r join market.instruments i on i.public_id=r.instrument_public_id where i.status='OPEN' and r.window_volume_ngn>=f.minimum_volume_ngn and r.rank<=f.max_markets;
  else x:='[]'::jsonb;end if;
  if coalesce(t.enabled,true) then
    select coalesce(jsonb_agg(jsonb_build_object('instrument_public_id',r.instrument_public_id,'rank',r.rank,'momentum_score',r.momentum_score,'volume_ngn',r.short_volume_ngn,'trade_count',r.short_trade_count,'unique_traders',r.short_unique_traders,'volume_acceleration',r.volume_acceleration,'trade_acceleration',r.trade_acceleration,'price_movement',r.price_movement,'last_trade_at',r.last_trade_at,'calculated_at',r.calculated_at) order by r.rank),'[]'::jsonb) into y
    from public.trending_market_rankings r join market.instruments i on i.public_id=r.instrument_public_id where i.status='OPEN' and r.rank<=t.max_markets;
  else y:='[]'::jsonb;end if;
  return jsonb_build_object('vadMarkets',coalesce(v,'[]'::jsonb),'featuredMarkets',coalesce(x,'[]'::jsonb),'trendingMarkets',coalesce(y,'[]'::jsonb),
    'featuredSettings',jsonb_build_object('enabled',coalesce(f.enabled,true),'minimumVolumeNgn',coalesce(f.minimum_volume_ngn,1000000),'windowHours',coalesce(f.window_hours,24),'maxMarkets',coalesce(f.max_markets,20),'lastRefreshedAt',f.last_refreshed_at),
    'trendingSettings',jsonb_build_object('enabled',coalesce(t.enabled,true),'windowMinutes',coalesce(t.window_minutes,60),'baselineHours',coalesce(t.baseline_hours,6),'minimumVolumeNgn',coalesce(t.minimum_volume_ngn,100000),'minimumTrades',coalesce(t.minimum_trades,5),'minimumUniqueTraders',coalesce(t.minimum_unique_traders,3),'minimumAcceleration',coalesce(t.minimum_acceleration,1.5),'maxMarkets',coalesce(t.max_markets,12),'lastRefreshedAt',t.last_refreshed_at));
end;$$;
revoke all on function public.home_market_rails() from public;
grant execute on function public.home_market_rails() to authenticated;