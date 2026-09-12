create or replace function public.admin_refresh_trending_market_rankings()
returns integer language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then raise exception 'Market management permission required' using errcode='42501';end if;
  perform private.refresh_featured_market_rankings();return private.refresh_trending_market_rankings();
end;$$;
revoke all on function public.admin_update_trending_market_settings(boolean,integer,integer,numeric,integer,integer,numeric,integer,text) from public;
revoke all on function public.admin_set_market_home_suppression(uuid,text,boolean,text) from public;
revoke all on function public.admin_refresh_trending_market_rankings() from public;
grant execute on function public.admin_update_trending_market_settings(boolean,integer,integer,numeric,integer,integer,numeric,integer,text) to authenticated;
grant execute on function public.admin_set_market_home_suppression(uuid,text,boolean,text) to authenticated;
grant execute on function public.admin_refresh_trending_market_rankings() to authenticated;
select private.refresh_featured_market_rankings();
select private.refresh_trending_market_rankings();
do $$ declare v_job bigint; begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    for v_job in select jobid from cron.job where jobname='vad-trending-market-rankings' loop perform cron.unschedule(v_job);end loop;
    perform cron.schedule('vad-trending-market-rankings','* * * * *',$cron$select private.refresh_trending_market_rankings();$cron$);
  end if;
end;$$;