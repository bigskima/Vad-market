create table if not exists public.vad_market_curations (
  instrument_public_id uuid primary key references market.instruments(public_id) on delete cascade,
  active boolean not null default true,
  priority integer not null default 100 check (priority between 0 and 10000),
  published_at timestamptz not null default statement_timestamp(),
  published_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default statement_timestamp()
);

create table if not exists public.featured_market_settings (
  settings_key text primary key,
  enabled boolean not null default true,
  minimum_volume_ngn numeric(38,18) not null default 1000000 check (minimum_volume_ngn >= 0),
  window_hours integer not null default 24 check (window_hours between 1 and 168),
  max_markets integer not null default 20 check (max_markets between 1 and 50),
  last_refreshed_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default statement_timestamp(),
  constraint featured_market_settings_singleton check (settings_key='HOME_AUTOMATIC')
);

create table if not exists public.featured_market_rankings (
  instrument_public_id uuid primary key references market.instruments(public_id) on delete cascade,
  window_volume_ngn numeric(38,18) not null default 0 check (window_volume_ngn >= 0),
  trade_count integer not null default 0 check (trade_count >= 0),
  last_trade_at timestamptz,
  rank integer not null check (rank > 0),
  calculated_at timestamptz not null default statement_timestamp()
);

create index if not exists vad_market_curations_active_priority_idx
  on public.vad_market_curations(active, priority, published_at desc);
create index if not exists featured_market_rankings_rank_idx
  on public.featured_market_rankings(rank, window_volume_ngn desc);

insert into public.featured_market_settings(settings_key,enabled,minimum_volume_ngn,window_hours,max_markets)
values('HOME_AUTOMATIC',true,1000000,24,20)
on conflict(settings_key) do nothing;

-- Preserve every market that was manually curated by the previous Home feature system.
insert into public.vad_market_curations(instrument_public_id,active,priority,published_at,published_by)
select mf.instrument_public_id,mf.active,mf.feature_rank,mf.featured_at,mf.featured_by
from public.market_featured mf
where mf.active
on conflict(instrument_public_id) do update
set active=excluded.active,
    priority=excluded.priority,
    published_at=excluded.published_at,
    published_by=excluded.published_by,
    updated_at=statement_timestamp();

alter table public.vad_market_curations enable row level security;
alter table public.featured_market_settings enable row level security;
alter table public.featured_market_rankings enable row level security;

revoke all on public.vad_market_curations from anon, authenticated;
revoke all on public.featured_market_settings from anon, authenticated;
revoke all on public.featured_market_rankings from anon, authenticated;

create or replace function private.refresh_featured_market_rankings()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_window integer;
  v_count integer:=0;
begin
  perform pg_advisory_xact_lock(hashtextextended('vad-featured-market-rankings',0));
  select window_hours into v_window
  from public.featured_market_settings
  where settings_key='HOME_AUTOMATIC';
  v_window:=coalesce(v_window,24);

  delete from public.featured_market_rankings;

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
    where i.status='OPEN'
      and asset.code='NGN'
      and vc.instrument_public_id is null
  ), ranked as (
    select eu.*,
           row_number() over(order by eu.volume_ngn desc,eu.trade_count desc,eu.last_trade_at desc,eu.instrument_public_id)::integer as rank
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
$$;

create or replace function public.home_market_rails()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_settings public.featured_market_settings;
  v_vad jsonb;
  v_featured jsonb;
begin
  select * into v_settings
  from public.featured_market_settings
  where settings_key='HOME_AUTOMATIC';

  if v_settings.last_refreshed_at is null
     or v_settings.last_refreshed_at < statement_timestamp()-interval '2 minutes' then
    perform private.refresh_featured_market_rankings();
    select * into v_settings
    from public.featured_market_settings
    where settings_key='HOME_AUTOMATIC';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'instrument_public_id',vc.instrument_public_id,
    'priority',vc.priority,
    'published_at',vc.published_at
  ) order by vc.priority asc,vc.published_at desc),'[]'::jsonb)
  into v_vad
  from public.vad_market_curations vc
  join market.instruments i on i.public_id=vc.instrument_public_id
  where vc.active and i.status='OPEN';

  if coalesce(v_settings.enabled,true) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'instrument_public_id',r.instrument_public_id,
      'rank',r.rank,
      'volume_ngn',r.window_volume_ngn,
      'trade_count',r.trade_count,
      'last_trade_at',r.last_trade_at,
      'calculated_at',r.calculated_at
    ) order by r.rank),'[]'::jsonb)
    into v_featured
    from public.featured_market_rankings r
    join market.instruments i on i.public_id=r.instrument_public_id
    where i.status='OPEN'
      and r.window_volume_ngn>=v_settings.minimum_volume_ngn
      and r.rank<=v_settings.max_markets;
  else
    v_featured:='[]'::jsonb;
  end if;

  return jsonb_build_object(
    'vadMarkets',coalesce(v_vad,'[]'::jsonb),
    'featuredMarkets',coalesce(v_featured,'[]'::jsonb),
    'featuredSettings',jsonb_build_object(
      'enabled',coalesce(v_settings.enabled,true),
      'minimumVolumeNgn',coalesce(v_settings.minimum_volume_ngn,1000000),
      'windowHours',coalesce(v_settings.window_hours,24),
      'maxMarkets',coalesce(v_settings.max_markets,20),
      'lastRefreshedAt',v_settings.last_refreshed_at
    )
  );
end;
$$;

create or replace function public.admin_market_publication_queue_v2()
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
set search_path=''
as $$
declare v_settings public.featured_market_settings;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  select * into v_settings from public.featured_market_settings where settings_key='HOME_AUTOMATIC';
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
$$;

create or replace function public.admin_featured_market_settings()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_settings public.featured_market_settings;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  select * into v_settings from public.featured_market_settings where settings_key='HOME_AUTOMATIC';
  return jsonb_build_object(
    'enabled',v_settings.enabled,
    'minimumVolumeNgn',v_settings.minimum_volume_ngn,
    'windowHours',v_settings.window_hours,
    'maxMarkets',v_settings.max_markets,
    'lastRefreshedAt',v_settings.last_refreshed_at
  );
end;
$$;

create or replace function public.admin_update_featured_market_settings(
  p_enabled boolean,
  p_minimum_volume_ngn numeric,
  p_window_hours integer,
  p_max_markets integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_reason text:=btrim(coalesce(p_reason,''));v_before jsonb;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if char_length(v_reason)<3 then raise exception 'A reason is required' using errcode='22023'; end if;
  if p_minimum_volume_ngn is null or p_minimum_volume_ngn<0 then raise exception 'Minimum activity must be zero or greater' using errcode='22023'; end if;
  if p_window_hours not between 1 and 168 then raise exception 'Activity window must be between 1 and 168 hours' using errcode='22023'; end if;
  if p_max_markets not between 1 and 50 then raise exception 'Featured market limit must be between 1 and 50' using errcode='22023'; end if;

  select to_jsonb(s) into v_before from public.featured_market_settings s where settings_key='HOME_AUTOMATIC' for update;
  update public.featured_market_settings
  set enabled=p_enabled,
      minimum_volume_ngn=p_minimum_volume_ngn,
      window_hours=p_window_hours,
      max_markets=p_max_markets,
      updated_by=auth.uid(),
      updated_at=statement_timestamp()
  where settings_key='HOME_AUTOMATIC';
  perform private.refresh_featured_market_rankings();

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,before_state,after_state,reason)
  select auth.uid(),'ADMIN','FEATURED_MARKET_SETTINGS_UPDATED','FEATURED_MARKET_SETTINGS','HOME_AUTOMATIC',v_before,to_jsonb(s),v_reason
  from public.featured_market_settings s where settings_key='HOME_AUTOMATIC';
  return public.admin_featured_market_settings();
end;
$$;

create or replace function public.admin_set_vad_market(
  p_instrument_public_id uuid,
  p_active boolean,
  p_priority integer default 100,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_instrument market.instruments;v_reason text:=btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if char_length(v_reason)<3 then raise exception 'A reason is required' using errcode='22023'; end if;
  if p_priority<0 or p_priority>10000 then raise exception 'Priority is invalid' using errcode='22023'; end if;
  select * into v_instrument from market.instruments where public_id=p_instrument_public_id for update;
  if v_instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if p_active and v_instrument.status<>'OPEN' then raise exception 'Only live markets can be added to VAD Markets' using errcode='P0001'; end if;

  insert into public.vad_market_curations(instrument_public_id,active,priority,published_at,published_by)
  values(p_instrument_public_id,p_active,p_priority,statement_timestamp(),auth.uid())
  on conflict(instrument_public_id) do update
  set active=excluded.active,
      priority=excluded.priority,
      published_at=case when excluded.active then statement_timestamp() else public.vad_market_curations.published_at end,
      published_by=auth.uid(),
      updated_at=statement_timestamp();

  -- Compatibility mirror for clients built before VAD Markets became a dedicated rail.
  insert into public.market_featured(instrument_public_id,active,feature_rank,featured_at,featured_by)
  values(p_instrument_public_id,p_active,p_priority,statement_timestamp(),auth.uid())
  on conflict(instrument_public_id) do update
  set active=excluded.active,
      feature_rank=excluded.feature_rank,
      featured_at=case when excluded.active then statement_timestamp() else public.market_featured.featured_at end,
      featured_by=auth.uid(),
      updated_at=statement_timestamp();

  perform private.refresh_featured_market_rankings();
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN',case when p_active then 'VAD_MARKET_ADDED' else 'VAD_MARKET_REMOVED' end,'MARKET',p_instrument_public_id::text,v_reason,jsonb_build_object('priority',p_priority));
  return true;
end;
$$;

create or replace function public.admin_set_market_featured(
  p_instrument_public_id uuid,
  p_featured boolean,
  p_rank integer default 100,
  p_reason text default null
)
returns boolean
language sql
security definer
set search_path=''
as $$
  select public.admin_set_vad_market(p_instrument_public_id,p_featured,p_rank,p_reason);
$$;

create or replace function public.admin_publish_market(
  p_instrument_public_id uuid,
  p_feature_rank integer default 100,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_instrument market.instruments;v_event market.canonical_events;v_reason text:=btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then raise exception 'Market management permission required' using errcode='42501'; end if;
  perform private.assert_service_available('market_publication',auth.uid());
  if char_length(v_reason)<3 then raise exception 'A publication reason is required' using errcode='22023'; end if;
  if p_feature_rank<0 or p_feature_rank>10000 then raise exception 'VAD Market priority is invalid' using errcode='22023'; end if;
  select * into v_instrument from market.instruments where public_id=p_instrument_public_id for update;
  if v_instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  select * into v_event from market.canonical_events where id=v_instrument.canonical_event_id for update;
  if v_instrument.status<>'DRAFT' then raise exception 'Only draft markets can be published' using errcode='P0001'; end if;
  if v_event.status not in('APPROVED','SCHEDULED') then raise exception 'Market is not approved for publication' using errcode='P0001'; end if;
  if v_event.opens_at is not null and v_event.opens_at>statement_timestamp() then raise exception 'Market cannot be published before its configured opening time' using errcode='P0001'; end if;
  if v_event.closes_at<=statement_timestamp() then raise exception 'Market cannot be published after its closing time' using errcode='P0001'; end if;

  update market.instruments set status='OPEN',opened_at=coalesce(opened_at,statement_timestamp()) where id=v_instrument.id;
  update market.canonical_events set status='OPEN',updated_at=statement_timestamp() where id=v_event.id;

  insert into public.vad_market_curations(instrument_public_id,active,priority,published_at,published_by)
  values(v_instrument.public_id,true,p_feature_rank,statement_timestamp(),auth.uid())
  on conflict(instrument_public_id) do update
  set active=true,priority=excluded.priority,published_at=statement_timestamp(),published_by=auth.uid(),updated_at=statement_timestamp();

  insert into public.market_featured(instrument_public_id,active,feature_rank,featured_at,featured_by)
  values(v_instrument.public_id,true,p_feature_rank,statement_timestamp(),auth.uid())
  on conflict(instrument_public_id) do update
  set active=true,feature_rank=excluded.feature_rank,featured_at=statement_timestamp(),featured_by=auth.uid(),updated_at=statement_timestamp();

  perform command.refresh_market_catalog(v_instrument.id);
  perform private.refresh_featured_market_rankings();

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('MARKET_PUBLISHED','MARKET',v_instrument.public_id::text,jsonb_build_object('instrument_public_id',v_instrument.public_id,'event_public_id',v_event.public_id,'published_by',auth.uid(),'vad_market',true),'market-published:'||v_instrument.public_id::text)
  on conflict(idempotency_key) do nothing;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','MARKET_PUBLISHED','MARKET',v_instrument.public_id::text,v_reason,jsonb_build_object('vad_market_priority',p_feature_rank));
  return true;
end;
$$;

create or replace function public.admin_refresh_featured_market_rankings()
returns integer
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  return private.refresh_featured_market_rankings();
end;
$$;

revoke all on function public.home_market_rails() from public;
grant execute on function public.home_market_rails() to anon, authenticated;
revoke all on function public.admin_market_publication_queue_v2() from public;
revoke all on function public.admin_featured_market_settings() from public;
revoke all on function public.admin_update_featured_market_settings(boolean,numeric,integer,integer,text) from public;
revoke all on function public.admin_set_vad_market(uuid,boolean,integer,text) from public;
revoke all on function public.admin_refresh_featured_market_rankings() from public;
grant execute on function public.admin_market_publication_queue_v2() to authenticated;
grant execute on function public.admin_featured_market_settings() to authenticated;
grant execute on function public.admin_update_featured_market_settings(boolean,numeric,integer,integer,text) to authenticated;
grant execute on function public.admin_set_vad_market(uuid,boolean,integer,text) to authenticated;
grant execute on function public.admin_refresh_featured_market_rankings() to authenticated;

-- Keep the old RPC callable for compatible clients, but its meaning is now VAD Markets curation.
revoke all on function public.admin_set_market_featured(uuid,boolean,integer,text) from public;
grant execute on function public.admin_set_market_featured(uuid,boolean,integer,text) to authenticated;

select private.refresh_featured_market_rankings();

do $$
declare v_job bigint;
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    for v_job in select jobid from cron.job where jobname='vad-featured-market-rankings' loop
      perform cron.unschedule(v_job);
    end loop;
    perform cron.schedule(
      'vad-featured-market-rankings',
      '* * * * *',
      $cron$select private.refresh_featured_market_rankings();$cron$
    );
  end if;
end;
$$;
