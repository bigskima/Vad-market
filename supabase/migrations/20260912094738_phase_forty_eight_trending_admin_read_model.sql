create or replace function public.admin_trending_market_snapshot()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare s public.trending_market_settings;r jsonb;h jsonb;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then raise exception 'Market management permission required' using errcode='42501';end if;
  select * into s from public.trending_market_settings where settings_key='HOME_TRENDING';
  select coalesce(jsonb_agg(jsonb_build_object('instrumentPublicId',tr.instrument_public_id,'rank',tr.rank,'volumeNgn',tr.short_volume_ngn,'tradeCount',tr.short_trade_count,'uniqueTraders',tr.short_unique_traders,'momentumScore',tr.momentum_score,'volumeAcceleration',tr.volume_acceleration,'tradeAcceleration',tr.trade_acceleration,'priceMovement',tr.price_movement,'lastTradeAt',tr.last_trade_at,'calculatedAt',tr.calculated_at) order by tr.rank),'[]'::jsonb) into r from public.trending_market_rankings tr;
  select coalesce(jsonb_agg(jsonb_build_object('instrumentPublicId',hs.instrument_public_id,'featuredSuppressed',hs.suppress_featured,'trendingSuppressed',hs.suppress_trending,'reason',hs.reason,'updatedAt',hs.updated_at)),'[]'::jsonb) into h from public.market_home_suppressions hs;
  return jsonb_build_object('settings',jsonb_build_object('enabled',s.enabled,'windowMinutes',s.window_minutes,'baselineHours',s.baseline_hours,'minimumVolumeNgn',s.minimum_volume_ngn,'minimumTrades',s.minimum_trades,'minimumUniqueTraders',s.minimum_unique_traders,'minimumAcceleration',s.minimum_acceleration,'maxMarkets',s.max_markets,'lastRefreshedAt',s.last_refreshed_at),'rankings',r,'suppressions',h);
end;$$;
revoke all on function public.admin_trending_market_snapshot() from public;
grant execute on function public.admin_trending_market_snapshot() to authenticated;