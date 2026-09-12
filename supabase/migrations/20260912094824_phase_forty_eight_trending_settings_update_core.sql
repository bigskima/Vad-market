create or replace function public.admin_update_trending_market_settings(p_enabled boolean,p_window_minutes integer,p_baseline_hours integer,p_minimum_volume_ngn numeric,p_minimum_trades integer,p_minimum_unique_traders integer,p_minimum_acceleration numeric,p_max_markets integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then raise exception 'Market management permission required' using errcode='42501';end if;
  if char_length(btrim(coalesce(p_reason,'')))<3 then raise exception 'A reason is required' using errcode='22023';end if;
  update public.trending_market_settings set enabled=p_enabled,window_minutes=p_window_minutes,baseline_hours=p_baseline_hours,minimum_volume_ngn=p_minimum_volume_ngn,minimum_trades=p_minimum_trades,minimum_unique_traders=p_minimum_unique_traders,minimum_acceleration=p_minimum_acceleration,max_markets=p_max_markets,updated_by=auth.uid(),updated_at=statement_timestamp() where settings_key='HOME_TRENDING';
  perform private.refresh_featured_market_rankings();perform private.refresh_trending_market_rankings();
  return public.admin_trending_market_snapshot();
end;$$;