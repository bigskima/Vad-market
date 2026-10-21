begin;

-- Category presentation is a read-model/display concern only. It does not alter
-- market outcomes, resolution policies, oracle provider mappings or settlement.
alter table market.guided_categories
  add column if not exists presentation_profile text not null default 'EVENT',
  add column if not exists group_field text not null default '';

update market.guided_categories
set presentation_profile = case code
      when 'SPORTS' then 'SPORTS'
      when 'MUSIC' then 'MUSIC'
      when 'ENTERTAINMENT' then 'ENTERTAINMENT'
      when 'CRYPTO_WEB3' then 'CRYPTO'
      when 'ECONOMY_FINANCE' then 'ECONOMICS'
      when 'POLITICS' then 'PUBLIC_EVENTS'
      when 'WORLD_AFFAIRS' then 'PUBLIC_EVENTS'
      else 'EVENT'
    end,
    group_field = case code
      when 'SPORTS' then 'competition'
      when 'MUSIC' then 'event_name'
      when 'ENTERTAINMENT' then 'event_name'
      when 'CRYPTO_WEB3' then ''
      when 'ECONOMY_FINANCE' then ''
      when 'POLITICS' then 'event_name'
      when 'WORLD_AFFAIRS' then 'event_name'
      when 'BUSINESS' then 'company'
      else ''
    end,
    updated_at = statement_timestamp()
where presentation_profile = 'EVENT' and group_field = '';

insert into market.guided_categories(
  code,name,description,display_order,status,presentation_profile,group_field
) values
  ('ARTIFICIAL_INTELLIGENCE','AI & Artificial Intelligence',
   'Model launches, benchmarks, capabilities and independently verifiable AI milestones.',
   82,'ACTIVE','AI','benchmark'),
  ('STOCKS_EQUITIES','Stocks & Equities',
   'Company earnings, market milestones, exchange-listed securities and objectively verifiable financial events.',
   72,'ACTIVE','STOCKS','company')
on conflict(code) do update set
  name=excluded.name,
  description=excluded.description,
  display_order=excluded.display_order,
  presentation_profile=excluded.presentation_profile,
  group_field=excluded.group_field,
  updated_at=statement_timestamp();

-- Add objective event templates only. These continue through VAD's existing
-- guided-market creation and review path; they do not introduce a new resolver.
insert into market.guided_market_types(
  code,category_code,name,description,handler_code,question_template,
  condition_template,source_label,source_required,field_schema,display_order,status,metadata
) values
  (
    'AI_MODEL_BENCHMARK','ARTIFICIAL_INTELLIGENCE','AI model benchmark result',
    'A model reaches a measurable result on a named benchmark.',
    'VERIFIED_EVENT',
    'Will {{model}} achieve {{achievement}} on {{benchmark}}?',
    'Resolve YES only if the configured benchmark owner or official model provider publishes a result showing {{model}} achieved {{achievement}} on {{benchmark}} within the stated market time scope; otherwise resolve NO.',
    'Official benchmark owner or model provider',true,
    '[{"key":"model","label":"Model / provider","placeholder":"Model name and version","required":true},{"key":"benchmark","label":"Benchmark","placeholder":"Benchmark and version","required":true},{"key":"achievement","label":"Target result","placeholder":"A measurable score or rank","required":true}]'::jsonb,
    10,'ACTIVE','{"display_profile":"AI","review_required":true}'::jsonb
  ),
  (
    'AI_PRODUCT_RELEASE','ARTIFICIAL_INTELLIGENCE','AI product or model release',
    'An official model or AI product release by a stated deadline.',
    'VERIFIED_EVENT',
    'Will {{subject}} be released by the stated deadline?',
    'Resolve YES only if the configured official provider or publisher confirms the release by the market deadline; otherwise resolve NO.',
    'Official AI provider or product publisher',true,
    '[{"key":"subject","label":"Model / product","placeholder":"Product name and version","required":true},{"key":"company","label":"Provider","placeholder":"Official provider","required":true}]'::jsonb,
    20,'ACTIVE','{"display_profile":"AI","review_required":true}'::jsonb
  ),
  (
    'AI_COMPANY_MILESTONE','ARTIFICIAL_INTELLIGENCE','AI company milestone',
    'An objectively verifiable company announcement or milestone in AI.',
    'VERIFIED_EVENT',
    'Will {{company}} {{outcome}}?',
    'Resolve YES only if the configured official company, regulator or filing source confirms that {{company}} {{outcome}} by the result deadline; otherwise resolve NO.',
    'Official company, regulator or filing source',true,
    '[{"key":"company","label":"Company","placeholder":"Company name","required":true},{"key":"outcome","label":"Milestone","placeholder":"Specific measurable event","required":true}]'::jsonb,
    30,'ACTIVE','{"display_profile":"AI","review_required":true}'::jsonb
  ),
  (
    'STOCKS_EARNINGS_MILESTONE','STOCKS_EQUITIES','Company earnings milestone',
    'An earnings release or company financial milestone confirmed by a filed report.',
    'VERIFIED_EVENT',
    'Will {{company}} report {{achievement}} for {{reporting_period}}?',
    'Resolve YES only if the configured official filing or exchange source reports {{achievement}} for {{company}} in {{reporting_period}} according to the market rules; otherwise resolve NO.',
    'Official company filing, exchange or regulator source',true,
    '[{"key":"company","label":"Company / ticker","placeholder":"Company and ticker","required":true},{"key":"achievement","label":"Earnings target","placeholder":"Measurable reported value or condition","required":true},{"key":"reporting_period","label":"Reporting period","placeholder":"Quarter or fiscal year","required":true}]'::jsonb,
    10,'ACTIVE','{"display_profile":"STOCKS","review_required":true}'::jsonb
  ),
  (
    'STOCKS_COMPANY_EVENT','STOCKS_EQUITIES','Listed company event',
    'A defined public announcement, listing, acquisition or other objective company event.',
    'VERIFIED_EVENT',
    'Will {{company}} {{outcome}}?',
    'Resolve YES only if the configured official company, exchange or regulator source confirms that {{company}} {{outcome}} by the result deadline; otherwise resolve NO.',
    'Official company, exchange or regulator source',true,
    '[{"key":"company","label":"Company / ticker","placeholder":"Company and ticker","required":true},{"key":"outcome","label":"Event","placeholder":"Specific objective event","required":true}]'::jsonb,
    20,'ACTIVE','{"display_profile":"STOCKS","review_required":true}'::jsonb
  )
on conflict(code) do update set
  category_code=excluded.category_code,
  name=excluded.name,
  description=excluded.description,
  handler_code=excluded.handler_code,
  question_template=excluded.question_template,
  condition_template=excluded.condition_template,
  source_label=excluded.source_label,
  source_required=excluded.source_required,
  field_schema=excluded.field_schema,
  display_order=excluded.display_order,
  status=excluded.status,
  metadata=market.guided_market_types.metadata || excluded.metadata,
  updated_at=statement_timestamp();

-- Public market catalogue carries presentation metadata copied from the existing
-- canonical event resolution scope. Prices, outcomes and oracle policy remain separate.
alter table public.market_catalog
  add column if not exists category_code text,
  add column if not exists presentation_profile text not null default 'EVENT',
  add column if not exists group_key text,
  add column if not exists market_context jsonb not null default '{}'::jsonb;

create or replace function command.refresh_market_catalog(p_instrument_id bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  instrument market.instruments;
  event market.canonical_events;
  asset public.assets;
  category_row market.guided_categories;
  category_code text;
  presentation_profile text := 'EVENT';
  group_field text := '';
  group_key text;
  market_context jsonb := '{}'::jsonb;
  v_liquidity_mode text;
  v_reference_price numeric(38,18);
  yes_outcome_id bigint;
  no_outcome_id bigint;
  yes_last numeric(38,18);
  no_last numeric(38,18);
  latest_fill timestamptz;
begin
  select * into instrument from market.instruments where id=p_instrument_id;
  if instrument.id is null then return; end if;
  select * into event from market.canonical_events where id=instrument.canonical_event_id;
  if event.id is null then return; end if;
  select * into asset from public.assets where id=instrument.asset_id;
  select * into category_row
  from market.guided_categories c
  where c.status='ACTIVE'
    and (
      case upper(btrim(coalesce(event.category,'')))
        when 'CRYPTO' then c.code='CRYPTO_WEB3'
        when 'CRYPTO & WEB3' then c.code='CRYPTO_WEB3'
        when 'AI' then c.code='ARTIFICIAL_INTELLIGENCE'
        when 'TECH' then c.code='TECHNOLOGY'
        when 'STOCKS' then c.code='STOCKS_EQUITIES'
        when 'STOCKS & EQUITIES' then c.code='STOCKS_EQUITIES'
        when 'ECONOMY' then c.code='ECONOMY_FINANCE'
        when 'FINANCE' then c.code='ECONOMY_FINANCE'
        when 'WORLD' then c.code='WORLD_AFFAIRS'
        else upper(btrim(c.name))=upper(btrim(coalesce(event.category,'')))
          or c.code=upper(regexp_replace(btrim(coalesce(event.category,'')),'[^A-Za-z0-9]+','_','g'))
      end
    )
  order by case when upper(btrim(c.name))=upper(btrim(coalesce(event.category,''))) then 0 else 1 end
  limit 1;

  category_code := category_row.code;
  presentation_profile := coalesce(nullif(category_row.presentation_profile,''),'EVENT');
  group_field := coalesce(category_row.group_field,'');
  market_context := coalesce(event.resolution_scope,'{}'::jsonb);
  if group_field <> '' then
    group_key := nullif(btrim(coalesce(
      market_context->'subject'->>group_field,
      market_context->>group_field,
      market_context->'details'->>group_field
    )), '');
  else
    group_key := null;
  end if;

  select id into yes_outcome_id from market.outcomes where instrument_id=instrument.id and code='YES';
  select id into no_outcome_id from market.outcomes where instrument_id=instrument.id and code='NO';

  -- Preserve existing VAD lifecycle behaviour: current executed prices can come
  -- from the real order book or the isolated sandbox execution ledger.
  select x.price into yes_last
  from (
    select f.price,f.created_at from trading.fills f where f.outcome_id=yes_outcome_id
    union all
    select se.price,se.created_at from trading.sandbox_executions se where se.outcome_id=yes_outcome_id
  ) x order by x.created_at desc limit 1;

  select x.price into no_last
  from (
    select f.price,f.created_at from trading.fills f where f.outcome_id=no_outcome_id
    union all
    select se.price,se.created_at from trading.sandbox_executions se where se.outcome_id=no_outcome_id
  ) x order by x.created_at desc limit 1;

  if yes_last is null and no_last is not null then
    yes_last := round(instrument.settlement_unit - no_last, 18);
  end if;
  if no_last is null and yes_last is not null then
    no_last := round(instrument.settlement_unit - yes_last, 18);
  end if;

  select max(x.created_at) into latest_fill
  from (
    select f.created_at
    from trading.fills f
    join trading.orders o on o.id=f.order_id
    where o.instrument_id=instrument.id
    union all
    select se.created_at from trading.sandbox_executions se where se.instrument_id=instrument.id
  ) x;

  if coalesce((asset.metadata->>'sandbox_only')::boolean,false)
     and coalesce((asset.metadata->>'sandbox_instant_liquidity')::boolean,false) then
    v_liquidity_mode := 'SANDBOX_INSTANT';
    v_reference_price := nullif(asset.metadata->>'sandbox_reference_price','')::numeric;
    if yes_last is null and v_reference_price is not null then
      yes_last := v_reference_price;
      no_last := round(instrument.settlement_unit - v_reference_price, 18);
    end if;
  else
    v_liquidity_mode := instrument.liquidity_model;
    v_reference_price := null;
  end if;

  insert into public.market_catalog(
    instrument_public_id,event_public_id,title,category,category_code,presentation_profile,
    group_key,market_context,asset_code,market_type,status,
    closes_at,resolves_after,media_path,yes_price,no_price,last_trade_at,liquidity_mode,reference_price,updated_at
  )
  values(
    instrument.public_id,event.public_id,event.title,event.category,category_code,presentation_profile,
    group_key,market_context,asset.code,instrument.market_type,instrument.status,
    event.closes_at,event.resolves_after,event.media_path,yes_last,no_last,latest_fill,v_liquidity_mode,v_reference_price,statement_timestamp()
  )
  on conflict(instrument_public_id) do update set
    event_public_id=excluded.event_public_id,
    title=excluded.title,
    category=excluded.category,
    category_code=excluded.category_code,
    presentation_profile=excluded.presentation_profile,
    group_key=excluded.group_key,
    market_context=excluded.market_context,
    asset_code=excluded.asset_code,
    market_type=excluded.market_type,
    status=excluded.status,
    closes_at=excluded.closes_at,
    resolves_after=excluded.resolves_after,
    media_path=excluded.media_path,
    yes_price=excluded.yes_price,
    no_price=excluded.no_price,
    last_trade_at=excluded.last_trade_at,
    liquidity_mode=excluded.liquidity_mode,
    reference_price=excluded.reference_price,
    updated_at=statement_timestamp();
end;
$function$;

-- Backfill the read model without touching the canonical events, outcomes, fills,
-- resolution scopes, oracle evidence or settlement records.
update public.market_catalog mc
set category_code = gc.code,
    presentation_profile = coalesce(nullif(gc.presentation_profile,''),'EVENT'),
    group_key = case
      when coalesce(gc.group_field,'') = '' then null
      else nullif(btrim(coalesce(
        ce.resolution_scope->'subject'->>gc.group_field,
        ce.resolution_scope->>gc.group_field,
        ce.resolution_scope->'details'->>gc.group_field
      )), '')
    end,
    market_context = coalesce(ce.resolution_scope,'{}'::jsonb)
from market.instruments i
join market.canonical_events ce on ce.id=i.canonical_event_id
left join market.guided_categories gc
  on gc.status='ACTIVE'
 and (
   case upper(btrim(coalesce(ce.category,'')))
     when 'CRYPTO' then gc.code='CRYPTO_WEB3'
     when 'CRYPTO & WEB3' then gc.code='CRYPTO_WEB3'
     when 'AI' then gc.code='ARTIFICIAL_INTELLIGENCE'
     when 'TECH' then gc.code='TECHNOLOGY'
     when 'STOCKS' then gc.code='STOCKS_EQUITIES'
     when 'STOCKS & EQUITIES' then gc.code='STOCKS_EQUITIES'
     when 'ECONOMY' then gc.code='ECONOMY_FINANCE'
     when 'FINANCE' then gc.code='ECONOMY_FINANCE'
     when 'WORLD' then gc.code='WORLD_AFFAIRS'
     else upper(btrim(gc.name))=upper(btrim(coalesce(ce.category,'')))
       or gc.code=upper(regexp_replace(btrim(coalesce(ce.category,'')),'[^A-Za-z0-9]+','_','g'))
   end
 )
where mc.instrument_public_id=i.public_id;

create or replace function public.admin_guided_market_catalog()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;

  select jsonb_build_object(
    'categories',coalesce(jsonb_agg(jsonb_build_object(
      'code',c.code,
      'name',c.name,
      'description',c.description,
      'displayOrder',c.display_order,
      'presentationProfile',c.presentation_profile,
      'groupField',c.group_field,
      'marketTypes',coalesce((
        select jsonb_agg(jsonb_build_object(
          'code',t.code,
          'name',t.name,
          'description',t.description,
          'handler',t.handler_code,
          'questionTemplate',t.question_template,
          'conditionTemplate',t.condition_template,
          'sourceLabel',t.source_label,
          'sourceRequired',t.source_required,
          'fields',t.field_schema,
          'displayOrder',t.display_order,
          'metadata',t.metadata
        ) order by t.display_order,t.name)
        from market.guided_market_types t
        where t.category_code=c.code and t.status='ACTIVE'
      ),'[]'::jsonb)
    ) order by c.display_order,c.name),'[]'::jsonb)
  ) into v_result
  from market.guided_categories c
  where c.status='ACTIVE';

  return v_result;
end;
$$;

revoke all on function public.admin_guided_market_catalog() from public,anon;
grant execute on function public.admin_guided_market_catalog() to authenticated;

create or replace function public.get_market_category_experiences()
returns table(
  code text,
  name text,
  description text,
  display_order integer,
  presentation_profile text,
  group_field text
)
language sql
stable
security definer
set search_path=''
as $$
  select c.code,c.name,c.description,c.display_order,c.presentation_profile,c.group_field
  from market.guided_categories c
  where c.status='ACTIVE'
  order by c.display_order,c.name;
$$;
revoke all on function public.get_market_category_experiences() from public;
grant execute on function public.get_market_category_experiences() to anon,authenticated;

create or replace function public.admin_set_guided_category_presentation(
  p_category_code text,
  p_presentation_profile text,
  p_group_field text default ''
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_code text := upper(btrim(coalesce(p_category_code,'')));
  v_profile text := upper(btrim(coalesce(p_presentation_profile,'EVENT')));
  v_field text := btrim(coalesce(p_group_field,''));
  v_category market.guided_categories;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if v_profile not in ('EVENT','CRYPTO','SPORTS','MUSIC','AI','STOCKS','ECONOMICS','ENTERTAINMENT','PUBLIC_EVENTS') then
    raise exception 'Choose a supported market presentation profile.' using errcode='22023';
  end if;
  if v_field <> '' and v_field !~ '^[A-Za-z][A-Za-z0-9_]{0,79}$' then
    raise exception 'The grouping field must be a plain field name.' using errcode='22023';
  end if;

  update market.guided_categories
  set presentation_profile=v_profile,group_field=v_field,updated_at=statement_timestamp()
  where code=v_code
  returning * into v_category;
  if v_category.code is null then raise exception 'Market category not found.' using errcode='P0002'; end if;

  update public.market_catalog mc
  set category_code=v_category.code,
      presentation_profile=v_category.presentation_profile,
      group_key=case
        when v_field='' then null
        else nullif(btrim(coalesce(
          mc.market_context->'subject'->>v_field,
          mc.market_context->>v_field,
          mc.market_context->'details'->>v_field
        )), '')
      end,
      updated_at=statement_timestamp()
  where mc.category_code=v_category.code
     or upper(btrim(coalesce(mc.category,'')))=upper(btrim(v_category.name));

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(
    auth.uid(),'ADMIN','MARKET_CATEGORY_PRESENTATION_UPDATED','MARKET_CATEGORY',v_category.code,
    'Updated the category display and grouping behavior',
    jsonb_build_object('presentation_profile',v_profile,'group_field',v_field,'category_name',v_category.name)
  );
  return true;
end;
$$;
revoke all on function public.admin_set_guided_category_presentation(text,text,text) from public,anon;
grant execute on function public.admin_set_guided_category_presentation(text,text,text) to authenticated;

-- Dedicated public crypto market-data feed configuration. It deliberately lives
-- outside oracle.provider_resources: this feed is for display, not settlement.
create table if not exists market.market_data_sources(
  code text primary key check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name text not null,
  base_url text not null check (base_url ~ '^https://'),
  status text not null default 'DISABLED' check (status in ('ACTIVE','DISABLED')),
  quote_currency text not null default 'USD' check (quote_currency ~ '^[A-Z]{3,8}$'),
  default_page_size integer not null default 24 check (default_page_size between 1 and 100),
  cache_seconds integer not null default 60 check (cache_seconds between 15 and 3600),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);
alter table market.market_data_sources enable row level security;
revoke all on market.market_data_sources from public,anon,authenticated;
grant select,insert,update on market.market_data_sources to service_role;
drop trigger if exists market_data_sources_set_updated_at on market.market_data_sources;
create trigger market_data_sources_set_updated_at
before update on market.market_data_sources
for each row execute function private.set_updated_at();

insert into market.market_data_sources(
  code,name,base_url,status,quote_currency,default_page_size,cache_seconds,metadata
) values (
  'COINGECKO','CoinGecko public crypto market data',
  'https://api.coingecko.com/api/v3','ACTIVE','USD',24,60,
  '{"purpose":"DISPLAY_ONLY","oracle_role":"NONE","price_change_period":"24h","sparkline_period":"7d"}'::jsonb
)
on conflict(code) do nothing;

create or replace function public.admin_market_data_source_config()
returns table(
  code text,
  name text,
  base_url text,
  status text,
  quote_currency text,
  default_page_size integer,
  cache_seconds integer,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not private.has_permission('providers.manage') then
    raise exception 'Provider management permission required' using errcode='42501';
  end if;
  return query
  select s.code,s.name,s.base_url,s.status,s.quote_currency,s.default_page_size,s.cache_seconds,s.updated_at
  from market.market_data_sources s
  order by s.name;
end;
$$;
revoke all on function public.admin_market_data_source_config() from public,anon;
grant execute on function public.admin_market_data_source_config() to authenticated;

create or replace function public.admin_set_market_data_source_status(
  p_code text,
  p_status text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_code text := upper(btrim(coalesce(p_code,'')));
  v_status text := upper(btrim(coalesce(p_status,'')));
  v_old_status text;
begin
  if auth.uid() is null or not private.has_permission('providers.manage') then
    raise exception 'Provider management permission required' using errcode='42501';
  end if;
  if v_status not in ('ACTIVE','DISABLED') then
    raise exception 'Market data source status must be ACTIVE or DISABLED.' using errcode='22023';
  end if;
  if char_length(btrim(coalesce(p_reason,''))) < 3 then
    raise exception 'Enter a reason for changing the market data source.' using errcode='22023';
  end if;

  select s.status into v_old_status from market.market_data_sources s where s.code=v_code for update;
  if v_old_status is null then raise exception 'Market data source not found.' using errcode='P0002'; end if;

  update market.market_data_sources
  set status=v_status,updated_by=auth.uid(),updated_at=statement_timestamp()
  where code=v_code;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(
    auth.uid(),'ADMIN','MARKET_DATA_SOURCE_STATUS_UPDATED','MARKET_DATA_SOURCE',v_code,
    btrim(p_reason),jsonb_build_object('old_status',v_old_status,'new_status',v_status,'purpose','DISPLAY_ONLY')
  );
  return true;
end;
$$;
revoke all on function public.admin_set_market_data_source_status(text,text,text) from public,anon;
grant execute on function public.admin_set_market_data_source_status(text,text,text) to authenticated;


create or replace function public.admin_update_market_data_source_settings(
  p_code text,
  p_quote_currency text,
  p_default_page_size integer,
  p_cache_seconds integer,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_code text := upper(btrim(coalesce(p_code,'')));
  v_quote text := upper(btrim(coalesce(p_quote_currency,'')));
  v_old market.market_data_sources;
begin
  if auth.uid() is null or not private.has_permission('providers.manage') then
    raise exception 'Provider management permission required' using errcode='42501';
  end if;
  if v_quote !~ '^[A-Z]{3,8}$' then
    raise exception 'Choose a valid quote currency code.' using errcode='22023';
  end if;
  if p_default_page_size is null or p_default_page_size < 1 or p_default_page_size > 100 then
    raise exception 'Default page size must be between 1 and 100.' using errcode='22023';
  end if;
  if p_cache_seconds is null or p_cache_seconds < 15 or p_cache_seconds > 3600 then
    raise exception 'Cache duration must be between 15 and 3600 seconds.' using errcode='22023';
  end if;
  if char_length(btrim(coalesce(p_reason,''))) < 3 then
    raise exception 'Enter a reason for updating the market data settings.' using errcode='22023';
  end if;

  select * into v_old from market.market_data_sources where code=v_code for update;
  if v_old.code is null then raise exception 'Market data source not found.' using errcode='P0002'; end if;

  update market.market_data_sources
  set quote_currency=v_quote,
      default_page_size=p_default_page_size,
      cache_seconds=p_cache_seconds,
      updated_by=auth.uid(),
      updated_at=statement_timestamp()
  where code=v_code;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(
    auth.uid(),'ADMIN','MARKET_DATA_SOURCE_SETTINGS_UPDATED','MARKET_DATA_SOURCE',v_code,
    btrim(p_reason),
    jsonb_build_object(
      'purpose','DISPLAY_ONLY',
      'previous_quote_currency',v_old.quote_currency,
      'quote_currency',v_quote,
      'previous_default_page_size',v_old.default_page_size,
      'default_page_size',p_default_page_size,
      'previous_cache_seconds',v_old.cache_seconds,
      'cache_seconds',p_cache_seconds
    )
  );
  return true;
end;
$$;
revoke all on function public.admin_update_market_data_source_settings(text,text,integer,integer,text) from public,anon;
grant execute on function public.admin_update_market_data_source_settings(text,text,integer,integer,text) to authenticated;


-- Service-role-only response cache limits public upstream API traffic. Display prices
-- may be stale during provider outages; this cache is never consulted by Oracle runtime.
create table if not exists market.market_data_cache (
  request_key text primary key check (char_length(request_key) between 1 and 300),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  fetched_at timestamptz not null,
  expires_at timestamptz not null,
  stale_until timestamptz not null,
  updated_at timestamptz not null default statement_timestamp(),
  check (expires_at >= fetched_at),
  check (stale_until >= expires_at)
);
alter table market.market_data_cache enable row level security;
revoke all on market.market_data_cache from public,anon,authenticated;
grant select,insert,update,delete on market.market_data_cache to service_role;
create index if not exists market_market_data_cache_expiry_idx
  on market.market_data_cache(stale_until);

commit;
