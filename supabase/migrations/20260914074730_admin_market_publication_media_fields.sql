drop function if exists public.admin_market_publication_queue_v2();

create function public.admin_market_publication_queue_v2()
returns table(
  instrument_public_id uuid,
  event_public_id uuid,
  title text,
  category text,
  asset_code text,
  instrument_status text,
  event_status text,
  opens_at timestamptz,
  closes_at timestamptz,
  resolves_after timestamptz,
  media_path text,
  is_vad_market boolean,
  vad_priority integer,
  vad_published_at timestamptz,
  automatic_feature_rank integer,
  automatic_volume_ngn numeric,
  automatic_trade_count integer,
  automatic_featured boolean
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_settings public.featured_market_settings;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;

  select * into v_settings
  from public.featured_market_settings
  where settings_key='HOME_AUTOMATIC';

  return query
  select i.public_id,
         ce.public_id,
         ce.title,
         ce.category,
         a.code,
         i.status,
         ce.status,
         ce.opens_at,
         ce.closes_at,
         ce.resolves_after,
         ce.media_path,
         coalesce(vc.active,false),
         vc.priority,
         vc.published_at,
         fr.rank,
         fr.window_volume_ngn,
         fr.trade_count,
         coalesce(v_settings.enabled,false)
           and fr.window_volume_ngn>=coalesce(v_settings.minimum_volume_ngn,1000000)
           and fr.rank<=coalesce(v_settings.max_markets,20)
  from market.instruments i
  join market.canonical_events ce on ce.id=i.canonical_event_id
  join public.assets a on a.id=i.asset_id
  left join public.vad_market_curations vc on vc.instrument_public_id=i.public_id
  left join public.featured_market_rankings fr on fr.instrument_public_id=i.public_id
  where i.status in('DRAFT','OPEN','SUSPENDED','CLOSED')
  order by case i.status when 'DRAFT' then 0 when 'OPEN' then 1 when 'SUSPENDED' then 2 else 3 end,
           ce.created_at desc;
end;
$function$;

revoke all on function public.admin_market_publication_queue_v2() from public;
revoke all on function public.admin_market_publication_queue_v2() from anon;
grant execute on function public.admin_market_publication_queue_v2() to authenticated, service_role;
