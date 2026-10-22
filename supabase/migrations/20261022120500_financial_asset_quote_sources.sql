begin;

-- Financial asset display data is deliberately separate from Oracle resources,
-- prediction odds, wallet ledgers and settlement sources.
alter table market.market_data_sources
  add column if not exists asset_class text not null default 'CRYPTO'
    check (asset_class in ('CRYPTO','STOCKS','COMMODITIES','FOREX','ECONOMICS')),
  add column if not exists adapter_code text not null default 'COINGECKO_MARKETS'
    check (adapter_code in ('COINGECKO_MARKETS','TWELVE_DATA_QUOTE','FRED_SERIES')),
  add column if not exists priority integer not null default 100
    check (priority between 0 and 10000),
  add column if not exists daily_request_limit integer not null default 100
    check (daily_request_limit between 1 and 10000),
  add column if not exists secret_reference text,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provider_metadata)='object');

update market.market_data_sources
set asset_class='CRYPTO',
    adapter_code='COINGECKO_MARKETS',
    priority=10,
    daily_request_limit=2500,
    provider_metadata=provider_metadata || '{"fresh_quote_ttl_seconds":30,"purpose":"DISPLAY_ONLY","oracle_role":"NONE"}'::jsonb,
    cache_seconds=least(cache_seconds,30),
    updated_at=statement_timestamp()
where code='COINGECKO';

insert into market.market_data_sources(
  code,name,base_url,status,quote_currency,default_page_size,cache_seconds,
  asset_class,adapter_code,priority,daily_request_limit,secret_reference,provider_metadata,metadata
) values
  (
    'TWELVE_DATA_STOCKS','Twelve Data equities and ETF display quotes',
    'https://api.twelvedata.com','DISABLED','USD',20,300,
    'STOCKS','TWELVE_DATA_QUOTE',20,250,'TWELVE_DATA_API_KEY',
    '{"catalog_mode":"SYMBOL_SEARCH","quote_mode":"QUOTE","purpose":"DISPLAY_ONLY","notes":"Enable only after TWELVE_DATA_API_KEY is added to the Edge Function secrets. Data plan and exchange entitlements vary by symbol."}'::jsonb,
    '{"asset_classes":["STOCKS","ETFS"],"source_type":"QUOTE"}'::jsonb
  ),
  (
    'TWELVE_DATA_COMMODITIES','Twelve Data commodities and energy',
    'https://api.twelvedata.com','DISABLED','USD',20,300,
    'COMMODITIES','TWELVE_DATA_QUOTE',30,250,'TWELVE_DATA_API_KEY',
    '{"catalog_mode":"SYMBOL_SEARCH","quote_mode":"QUOTE","purpose":"DISPLAY_ONLY","notes":"Enable only after TWELVE_DATA_API_KEY is added to the Edge Function secrets. Symbol availability depends on provider entitlements."}'::jsonb,
    '{"asset_classes":["COMMODITIES","ENERGY"],"source_type":"QUOTE"}'::jsonb
  ),
  (
    'TWELVE_DATA_FOREX','Twelve Data FX display quotes',
    'https://api.twelvedata.com','DISABLED','USD',20,300,
    'FOREX','TWELVE_DATA_QUOTE',40,250,'TWELVE_DATA_API_KEY',
    '{"catalog_mode":"SYMBOL_SEARCH","quote_mode":"QUOTE","purpose":"DISPLAY_ONLY","notes":"Enable only after TWELVE_DATA_API_KEY is added to the Edge Function secrets."}'::jsonb,
    '{"asset_classes":["FOREX"],"source_type":"QUOTE"}'::jsonb
  ),
  (
    'FRED_ECONOMICS','Federal Reserve Economic Data series',
    'https://api.stlouisfed.org/fred','DISABLED','USD',20,3600,
    'ECONOMICS','FRED_SERIES',50,800,'FRED_API_KEY',
    '{"catalog_mode":"SERIES_SEARCH","quote_mode":"LATEST_OBSERVATION","purpose":"DISPLAY_ONLY","notes":"Enable only after FRED_API_KEY is added to the Edge Function secrets. Observations may be delayed or revised by the publisher."}'::jsonb,
    '{"asset_classes":["ECONOMICS","INDICATORS"],"source_type":"SERIES"}'::jsonb
  )
on conflict(code) do update set
  name=excluded.name,
  base_url=excluded.base_url,
  asset_class=excluded.asset_class,
  adapter_code=excluded.adapter_code,
  priority=excluded.priority,
  daily_request_limit=excluded.daily_request_limit,
  secret_reference=excluded.secret_reference,
  provider_metadata=market.market_data_sources.provider_metadata || excluded.provider_metadata,
  metadata=market.market_data_sources.metadata || excluded.metadata,
  updated_at=statement_timestamp();

create table if not exists market.financial_market_data_usage (
  source_code text not null references market.market_data_sources(code) on delete cascade,
  usage_day date not null,
  request_count integer not null default 0 check (request_count>=0),
  daily_limit integer not null check (daily_limit between 1 and 10000),
  updated_at timestamptz not null default statement_timestamp(),
  primary key(source_code,usage_day)
);
alter table market.financial_market_data_usage enable row level security;
revoke all on market.financial_market_data_usage from public,anon,authenticated;
grant select,insert,update,delete on market.financial_market_data_usage to service_role;

create table if not exists market.financial_market_data_cache (
  request_key text primary key check (char_length(request_key) between 8 and 220),
  source_code text not null references market.market_data_sources(code) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  fetched_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  stale_until timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (expires_at>=fetched_at),
  check (stale_until>=expires_at)
);
create index if not exists financial_market_data_cache_expiry_idx
  on market.financial_market_data_cache(expires_at,stale_until);
alter table market.financial_market_data_cache enable row level security;
revoke all on market.financial_market_data_cache from public,anon,authenticated;
grant select,insert,update,delete on market.financial_market_data_cache to service_role;

create or replace function public.admin_financial_market_data_source_config()
returns table(
  code text,name text,base_url text,status text,quote_currency text,
  default_page_size integer,cache_seconds integer,asset_class text,
  adapter_code text,priority integer,daily_request_limit integer,
  secret_reference text,provider_metadata jsonb,updated_at timestamptz
)
language plpgsql stable security definer set search_path=''
as $function$
begin
  if auth.uid() is null or not private.has_permission('providers.manage') then
    raise exception 'Provider management permission required' using errcode='42501';
  end if;
  return query
  select s.code,s.name,s.base_url,s.status,s.quote_currency,s.default_page_size,
    s.cache_seconds,s.asset_class,s.adapter_code,s.priority,s.daily_request_limit,
    s.secret_reference,s.provider_metadata,s.updated_at
  from market.market_data_sources s
  order by s.priority,s.asset_class,s.name;
end;
$function$;
revoke all on function public.admin_financial_market_data_source_config() from public,anon;
grant execute on function public.admin_financial_market_data_source_config() to authenticated;

create or replace function public.admin_set_financial_market_data_source_status(
  p_code text,p_status text,p_reason text
)
returns boolean
language plpgsql security definer set search_path=''
as $function$
declare
  v_code text:=upper(btrim(coalesce(p_code,'')));
  v_status text:=upper(btrim(coalesce(p_status,'')));
  v_old text;
begin
  if auth.uid() is null or not private.has_permission('providers.manage') then
    raise exception 'Provider management permission required' using errcode='42501';
  end if;
  if v_status not in ('ACTIVE','DISABLED') or char_length(btrim(coalesce(p_reason,'')))<3 then
    raise exception 'Choose a valid status and provide a reason.' using errcode='22023';
  end if;
  select status into v_old from market.market_data_sources where code=v_code for update;
  if v_old is null then raise exception 'Financial market-data source not found.' using errcode='P0002'; end if;
  update market.market_data_sources set status=v_status,updated_by=auth.uid(),updated_at=statement_timestamp()
  where code=v_code;
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','FINANCIAL_MARKET_DATA_SOURCE_STATUS_UPDATED','MARKET_DATA_SOURCE',v_code,
    btrim(p_reason),jsonb_build_object('old_status',v_old,'new_status',v_status,'asset_class',
      (select asset_class from market.market_data_sources where code=v_code),'purpose','DISPLAY_ONLY'));
  return true;
end;
$function$;
revoke all on function public.admin_set_financial_market_data_source_status(text,text,text) from public,anon;
grant execute on function public.admin_set_financial_market_data_source_status(text,text,text) to authenticated;

create or replace function public.internal_financial_market_data_source_runtime(p_asset_class text)
returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare v_class text:=upper(btrim(coalesce(p_asset_class,''))); v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if v_class not in ('STOCKS','COMMODITIES','FOREX','ECONOMICS') then
    raise exception 'Unsupported financial asset class.' using errcode='22023';
  end if;
  select jsonb_build_object(
    'code',s.code,'name',s.name,'baseUrl',s.base_url,'status',s.status,
    'quoteCurrency',s.quote_currency,'defaultPageSize',s.default_page_size,
    'cacheSeconds',s.cache_seconds,'assetClass',s.asset_class,'adapterCode',s.adapter_code,
    'dailyRequestLimit',s.daily_request_limit,'secretReference',s.secret_reference,
    'providerMetadata',s.provider_metadata
  ) into v_result
  from market.market_data_sources s
  where s.asset_class=v_class
  order by case s.status when 'ACTIVE' then 0 when 'DEGRADED' then 1 else 2 end,s.priority,s.code
  limit 1;
  return v_result;
end;
$function$;
revoke all on function public.internal_financial_market_data_source_runtime(text) from public,anon,authenticated;
grant execute on function public.internal_financial_market_data_source_runtime(text) to service_role;

create or replace function public.internal_reserve_financial_market_request(
  p_source_code text,p_request_cost integer default 1
)
returns boolean
language plpgsql security definer set search_path=''
as $function$
declare
  v_source text:=upper(btrim(coalesce(p_source_code,'')));
  v_day date:=(statement_timestamp() at time zone 'UTC')::date;
  v_cost integer:=least(greatest(coalesce(p_request_cost,1),1),20);
  v_limit integer;
  v_count integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  select daily_request_limit into v_limit
  from market.market_data_sources where code=v_source and status='ACTIVE';
  if v_limit is null then return false; end if;
  insert into market.financial_market_data_usage(source_code,usage_day,request_count,daily_limit,updated_at)
  values(v_source,v_day,v_cost,v_limit,statement_timestamp())
  on conflict(source_code,usage_day) do update set
    request_count=market.financial_market_data_usage.request_count+excluded.request_count,
    daily_limit=excluded.daily_limit,updated_at=statement_timestamp()
  where market.financial_market_data_usage.request_count+excluded.request_count<=excluded.daily_limit
  returning request_count into v_count;
  return v_count is not null;
end;
$function$;
revoke all on function public.internal_reserve_financial_market_request(text,integer) from public,anon,authenticated;
grant execute on function public.internal_reserve_financial_market_request(text,integer) to service_role;

create or replace function public.internal_get_financial_market_data_cache(p_request_key text)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select jsonb_build_object('sourceCode',c.source_code,'payload',c.payload,'fetchedAt',c.fetched_at,
    'expiresAt',c.expires_at,'staleUntil',c.stale_until) into v_result
  from market.financial_market_data_cache c
  where c.request_key=left(btrim(coalesce(p_request_key,'')),220);
  return v_result;
end;
$function$;
revoke all on function public.internal_get_financial_market_data_cache(text) from public,anon,authenticated;
grant execute on function public.internal_get_financial_market_data_cache(text) to service_role;

create or replace function public.internal_upsert_financial_market_data_cache(
  p_request_key text,p_source_code text,p_payload jsonb,p_ttl_seconds integer default 300,
  p_stale_seconds integer default 21600
)
returns boolean language plpgsql security definer set search_path=''
as $function$
declare
  v_key text:=left(btrim(coalesce(p_request_key,'')),220);
  v_source text:=upper(btrim(coalesce(p_source_code,'')));
  v_now timestamptz:=statement_timestamp();
  v_ttl integer:=least(greatest(coalesce(p_ttl_seconds,300),15),86400);
  v_stale integer:=least(greatest(coalesce(p_stale_seconds,21600),0),604800);
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if char_length(v_key)<8 or jsonb_typeof(coalesce(p_payload,'null'::jsonb))<>'object' then
    raise exception 'Invalid financial market-data cache entry.' using errcode='22023';
  end if;
  insert into market.financial_market_data_cache(request_key,source_code,payload,fetched_at,expires_at,stale_until,updated_at)
  values(v_key,v_source,p_payload,v_now,v_now+make_interval(secs=>v_ttl),v_now+make_interval(secs=>v_ttl+v_stale),v_now)
  on conflict(request_key) do update set source_code=excluded.source_code,payload=excluded.payload,
    fetched_at=excluded.fetched_at,expires_at=excluded.expires_at,stale_until=excluded.stale_until,updated_at=excluded.updated_at;
  return true;
end;
$function$;
revoke all on function public.internal_upsert_financial_market_data_cache(text,text,jsonb,integer,integer) from public,anon,authenticated;
grant execute on function public.internal_upsert_financial_market_data_cache(text,text,jsonb,integer,integer) to service_role;

commit;
