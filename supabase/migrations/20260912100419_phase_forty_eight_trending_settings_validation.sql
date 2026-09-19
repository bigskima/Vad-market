create or replace function public.admin_update_trending_market_settings(
  p_enabled boolean,
  p_window_minutes integer,
  p_baseline_hours integer,
  p_minimum_volume_ngn numeric,
  p_minimum_trades integer,
  p_minimum_unique_traders integer,
  p_minimum_acceleration numeric,
  p_max_markets integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_before jsonb;
  v_reason text:=btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if char_length(v_reason)<3 then raise exception 'A reason is required' using errcode='22023'; end if;
  if p_enabled is null then raise exception 'Choose whether Trending Markets is on or paused' using errcode='22023'; end if;
  if p_window_minutes is null or p_window_minutes not between 15 and 360 then raise exception 'Choose a recent activity window between 15 minutes and 6 hours' using errcode='22023'; end if;
  if p_baseline_hours is null or p_baseline_hours not between 1 and 72 then raise exception 'Choose a comparison period between 1 and 72 hours' using errcode='22023'; end if;
  if p_minimum_volume_ngn is null or p_minimum_volume_ngn<0 then raise exception 'Minimum completed trading activity must be zero or greater' using errcode='22023'; end if;
  if p_minimum_trades is null or p_minimum_trades not between 1 and 10000 then raise exception 'Minimum completed trades must be between 1 and 10000' using errcode='22023'; end if;
  if p_minimum_unique_traders is null or p_minimum_unique_traders not between 2 and 10000 then raise exception 'Minimum distinct traders must be between 2 and 10000' using errcode='22023'; end if;
  if p_minimum_acceleration is null or p_minimum_acceleration not between 1 and 10 then raise exception 'Activity growth requirement must be between 1x and 10x' using errcode='22023'; end if;
  if p_max_markets is null or p_max_markets not between 1 and 50 then raise exception 'Maximum Trending Markets must be between 1 and 50' using errcode='22023'; end if;

  select to_jsonb(s) into v_before
  from public.trending_market_settings s
  where settings_key='HOME_TRENDING'
  for update;

  update public.trending_market_settings
  set enabled=p_enabled,
      window_minutes=p_window_minutes,
      baseline_hours=p_baseline_hours,
      minimum_volume_ngn=p_minimum_volume_ngn,
      minimum_trades=p_minimum_trades,
      minimum_unique_traders=p_minimum_unique_traders,
      minimum_acceleration=p_minimum_acceleration,
      max_markets=p_max_markets,
      updated_by=auth.uid(),
      updated_at=statement_timestamp()
  where settings_key='HOME_TRENDING';

  perform private.refresh_featured_market_rankings();
  perform private.refresh_trending_market_rankings();

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,before_state,after_state,reason)
  select auth.uid(),'ADMIN','TRENDING_MARKET_SETTINGS_UPDATED','TRENDING_MARKET_SETTINGS','HOME_TRENDING',v_before,to_jsonb(s),v_reason
  from public.trending_market_settings s
  where settings_key='HOME_TRENDING';

  return public.admin_trending_market_snapshot();
end;
$$;

revoke all on function public.admin_update_trending_market_settings(boolean,integer,integer,numeric,integer,integer,numeric,integer,text) from public;
grant execute on function public.admin_update_trending_market_settings(boolean,integer,integer,numeric,integer,integer,numeric,integer,text) to authenticated;