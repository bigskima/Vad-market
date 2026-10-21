begin;

alter table market.guided_market_types
  drop constraint if exists guided_market_types_handler_code_check;
alter table market.guided_market_types
  add constraint guided_market_types_handler_code_check
  check (handler_code in ('VERIFIED_EVENT','FOOTBALL_MATCH','CRYPTO_THRESHOLD'));

-- Sports/competition taxonomy is stored and edited in the database, not in a
-- client-side list. Automatic resolution is offered only where an Oracle
-- competition resource already exists; other sports retain verified results.
create table if not exists market.sports_competitions (
  sport_code text not null,
  sport_name text not null,
  competition_code text not null,
  competition_name text not null,
  region text not null default '',
  result_mode text not null default 'VERIFIED' check (result_mode in ('AUTOMATIC','VERIFIED')),
  provider_code text,
  provider_competition_code text,
  aliases jsonb not null default '[]'::jsonb check (jsonb_typeof(aliases)='array'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DISABLED')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  display_order integer not null default 100,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (sport_code,competition_code)
);
create index if not exists sports_competitions_status_order_idx
  on market.sports_competitions(status,sport_code,display_order,competition_name);
alter table market.sports_competitions enable row level security;
revoke all on market.sports_competitions from public,anon,authenticated;
grant select,insert,update,delete on market.sports_competitions to service_role;

insert into market.sports_competitions(
  sport_code,sport_name,competition_code,competition_name,region,result_mode,
  provider_code,provider_competition_code,aliases,status,display_order,metadata
)
select
  'FOOTBALL','Football',r.external_key,
  coalesce(nullif(r.metadata->>'display_name',''),r.external_key),
  coalesce(nullif(r.metadata->>'region',''),'International'),
  'AUTOMATIC','FOOTBALL_DATA',r.external_key,
  coalesce(r.metadata->'aliases','[]'::jsonb),r.status,
  case r.external_key when 'PL' then 10 when 'CL' then 20 when 'PD' then 30
    when 'FL1' then 40 when 'SA' then 50 when 'BL1' then 60 else 100 end,
  jsonb_build_object('provider_resource_key',r.canonical_key,
    'free_tier',coalesce((r.metadata->>'free_tier')::boolean,false))
from oracle.provider_resources r
join integration.providers p on p.id=r.provider_id
where p.code='FOOTBALL_DATA' and p.environment='PRODUCTION'
  and r.resource_type='SPORTS_COMPETITION'
on conflict(sport_code,competition_code) do update set
  competition_name=excluded.competition_name,region=excluded.region,
  result_mode=excluded.result_mode,provider_code=excluded.provider_code,
  provider_competition_code=excluded.provider_competition_code,
  aliases=excluded.aliases,status=excluded.status,metadata=excluded.metadata,
  updated_at=statement_timestamp();

-- Non-football competitions are catalogue-backed and verified-source based
-- until an approved sport-specific automated resolver is configured.
insert into market.sports_competitions(
  sport_code,sport_name,competition_code,competition_name,region,result_mode,
  aliases,status,display_order,metadata
) values
 ('BASKETBALL','Basketball','NBA','NBA','United States','VERIFIED','["National Basketball Association"]','ACTIVE',10,'{"sport_family":"TEAM"}'),
 ('BASKETBALL','Basketball','WNBA','WNBA','United States','VERIFIED','["Women''s National Basketball Association"]','ACTIVE',20,'{"sport_family":"TEAM"}'),
 ('BASKETBALL','Basketball','EUROLEAGUE','EuroLeague','Europe','VERIFIED','["Turkish Airlines EuroLeague"]','ACTIVE',30,'{"sport_family":"TEAM"}'),
 ('TENNIS','Tennis','ATP','ATP Tour','International','VERIFIED','["ATP","Men''s tennis"]','ACTIVE',10,'{"sport_family":"INDIVIDUAL"}'),
 ('TENNIS','Tennis','WTA','WTA Tour','International','VERIFIED','["WTA","Women''s tennis"]','ACTIVE',20,'{"sport_family":"INDIVIDUAL"}'),
 ('TENNIS','Tennis','AUSTRALIAN_OPEN','Australian Open','Australia','VERIFIED','["AO"]','ACTIVE',30,'{"sport_family":"INDIVIDUAL"}'),
 ('TENNIS','Tennis','ROLAND_GARROS','Roland-Garros','France','VERIFIED','["French Open"]','ACTIVE',40,'{"sport_family":"INDIVIDUAL"}'),
 ('TENNIS','Tennis','WIMBLEDON','Wimbledon','United Kingdom','VERIFIED','[]','ACTIVE',50,'{"sport_family":"INDIVIDUAL"}'),
 ('TENNIS','Tennis','US_OPEN','US Open','United States','VERIFIED','[]','ACTIVE',60,'{"sport_family":"INDIVIDUAL"}'),
 ('CRICKET','Cricket','IPL','Indian Premier League','India','VERIFIED','["IPL"]','ACTIVE',10,'{"sport_family":"TEAM"}'),
 ('CRICKET','Cricket','ICC_CRICKET_WORLD_CUP','ICC Cricket World Cup','International','VERIFIED','["Cricket World Cup"]','ACTIVE',20,'{"sport_family":"TEAM"}'),
 ('RUGBY','Rugby','SIX_NATIONS','Six Nations Championship','Europe','VERIFIED','["Six Nations"]','ACTIVE',10,'{"sport_family":"TEAM"}'),
 ('RUGBY','Rugby','RUGBY_WORLD_CUP','Rugby World Cup','International','VERIFIED','[]','ACTIVE',20,'{"sport_family":"TEAM"}'),
 ('BASEBALL','Baseball','MLB','Major League Baseball','United States','VERIFIED','["MLB"]','ACTIVE',10,'{"sport_family":"TEAM"}'),
 ('MOTORSPORT','Motorsport','FORMULA_1','Formula One','International','VERIFIED','["F1","Formula 1"]','ACTIVE',10,'{"sport_family":"INDIVIDUAL"}'),
 ('GOLF','Golf','PGA_TOUR','PGA Tour','United States','VERIFIED','[]','ACTIVE',10,'{"sport_family":"INDIVIDUAL"}'),
 ('VOLLEYBALL','Volleyball','NATIONS_LEAGUE','Volleyball Nations League','International','VERIFIED','["VNL"]','ACTIVE',10,'{"sport_family":"TEAM"}'),
 ('ESPORTS','Esports','COUNTER_STRIKE','Counter-Strike','International','VERIFIED','["CS2","Counter-Strike 2"]','ACTIVE',10,'{"sport_family":"TEAM"}'),
 ('ESPORTS','Esports','LEAGUE_OF_LEGENDS','League of Legends','International','VERIFIED','["LoL"]','ACTIVE',20,'{"sport_family":"TEAM"}')
on conflict(sport_code,competition_code) do update set
  sport_name=excluded.sport_name,competition_name=excluded.competition_name,
  region=excluded.region,aliases=excluded.aliases,status=excluded.status,
  display_order=excluded.display_order,metadata=excluded.metadata,
  updated_at=statement_timestamp();

create or replace function public.get_sports_market_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'sports',coalesce((
      select jsonb_agg(jsonb_build_object('code',s.sport_code,'name',s.sport_name)
        order by s.sport_code,s.sport_name)
      from (select distinct sport_code,sport_name from market.sports_competitions
        where status='ACTIVE') s
    ),'[]'::jsonb),
    'competitions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'sportCode',s.sport_code,'code',s.competition_code,'name',s.competition_name,
        'region',s.region,'resultMode',s.result_mode,'providerCode',s.provider_code,
        'providerCompetitionCode',s.provider_competition_code,'aliases',s.aliases
      ) order by s.sport_code,s.display_order,s.competition_name)
      from market.sports_competitions s where s.status='ACTIVE'
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.get_sports_market_catalog() from public,anon;
grant execute on function public.get_sports_market_catalog() to authenticated;

create or replace function public.admin_set_sports_competition_status(
  p_sport_code text,p_competition_code text,p_status text,p_reason text
)
returns boolean language plpgsql security definer set search_path=''
as $function$
declare v_status text:=upper(btrim(coalesce(p_status,''))); v_row market.sports_competitions;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if v_status not in ('ACTIVE','DISABLED') or char_length(btrim(coalesce(p_reason,'')))<3 then
    raise exception 'Choose a valid status and provide a reason.' using errcode='22023';
  end if;
  update market.sports_competitions
  set status=v_status,updated_at=statement_timestamp()
  where sport_code=upper(btrim(coalesce(p_sport_code,'')))
    and competition_code=upper(btrim(coalesce(p_competition_code,'')))
  returning * into v_row;
  if v_row.competition_code is null then raise exception 'Sport competition not found.' using errcode='P0002'; end if;
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','SPORTS_COMPETITION_STATUS_CHANGED','SPORTS_COMPETITION',
    v_row.sport_code||':'||v_row.competition_code,btrim(p_reason),
    jsonb_build_object('status',v_status,'sport',v_row.sport_name,'competition',v_row.competition_name,
      'result_mode',v_row.result_mode,'provider_code',v_row.provider_code));
  return true;
end;
$function$;
revoke all on function public.admin_set_sports_competition_status(text,text,text,text) from public,anon;
grant execute on function public.admin_set_sports_competition_status(text,text,text,text) to authenticated;

insert into market.guided_market_types(
  code,category_code,name,description,handler_code,question_template,
  condition_template,source_label,source_required,field_schema,display_order,status,metadata
) values(
  'CRYPTO_PRICE_THRESHOLD','CRYPTO_WEB3','Crypto price threshold',
  'A crypto asset reaches a USD price at the observation time. Both Pyth and CoinGecko historical mappings are required.',
  'CRYPTO_THRESHOLD',
  'Will {{asset_symbol}} be {{operator}} {{threshold}} USD at the observation time?',
  'Resolve YES from approved provider price observations for {{asset_symbol}}/USD at the configured observation time using {{operator}} and {{threshold}} USD. Public display quotes never settle this market.',
  'Pyth Network + CoinGecko historical prices',true,
  '[
    {"key":"asset_symbol","label":"Crypto symbol","placeholder":"Selected from live catalogue","required":true},
    {"key":"coingecko_id","label":"CoinGecko asset ID","placeholder":"Selected from live catalogue","required":true},
    {"key":"operator","label":"Price comparison","placeholder":"GT, GTE, LT or LTE","required":true},
    {"key":"threshold","label":"USD price target","placeholder":"e.g. 250","required":true},
    {"key":"quote","label":"Quote currency","placeholder":"USD","required":true}
  ]'::jsonb,
  5,'ACTIVE','{"resolver":"CRYPTO_PRICE_THRESHOLD_V1","required_providers":["PYTH","COINGECKO"],"category_profile":"CRYPTO"}'::jsonb
)
on conflict(code) do update set
  category_code=excluded.category_code,name=excluded.name,description=excluded.description,
  handler_code=excluded.handler_code,question_template=excluded.question_template,
  condition_template=excluded.condition_template,source_label=excluded.source_label,
  source_required=excluded.source_required,field_schema=excluded.field_schema,
  display_order=excluded.display_order,status='ACTIVE',
  metadata=market.guided_market_types.metadata||excluded.metadata,updated_at=statement_timestamp();

update market.guided_market_types
set question_template='Will {{competitor_a}} beat {{competitor_b}} in {{competition}} ({{sport}})?',
    condition_template='Resolve YES if {{competitor_a}} is officially recorded as the winner against {{competitor_b}} in {{competition}} for the {{sport}} event; otherwise resolve NO.',
    field_schema=jsonb_build_array(
      jsonb_build_object('key','sport','label','Sport','placeholder','Choose a sport','required',true),
      jsonb_build_object('key','competition','label','Competition / league','placeholder','Choose a competition','required',true),
      jsonb_build_object('key','competitor_a','label','Team / competitor A','placeholder','Team or athlete','required',true),
      jsonb_build_object('key','competitor_b','label','Team / competitor B','placeholder','Opponent','required',true)
    ),
    updated_at=statement_timestamp()
where code='SPORTS_MATCH_WINNER';

-- Correct only the category label. Keep the VAD_REVIEW_V1 resolver,
-- condition, observation time, status, policy binding and outcomes unchanged.
update market.canonical_events e
set category='CRYPTO_WEB3',
    normalized_parameters=jsonb_set(coalesce(e.normalized_parameters,'{}'::jsonb),'{category}',to_jsonb('CRYPTO_WEB3'::text),true),
    resolution_scope=jsonb_set(coalesce(e.resolution_scope,'{}'::jsonb),'{category}',to_jsonb('CRYPTO_WEB3'::text),true),
    updated_at=statement_timestamp()
where e.title='Will BTC/USD reach or exceed $100,000 by October 20, 2026?'
  and e.category='SPORTS'
  and coalesce(e.resolution_scope->>'resolver_type','')='VAD_REVIEW_V1';
do $backfill$
declare v_id bigint;
begin
  for v_id in select i.id from market.instruments i
    join market.canonical_events e on e.id=i.canonical_event_id
    where e.title='Will BTC/USD reach or exceed $100,000 by October 20, 2026?'
  loop perform command.refresh_market_catalog(v_id); end loop;
end;
$backfill$;

-- Add initial high-demand crypto pairs to the existing approved map. All later
-- additions use the CoinGecko asset ID selected from the live catalogue.
insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
select p.id,'CRYPTO_PAIR',v.symbol||'/USD',
  case p.code when 'PYTH' then v.pyth_symbol else v.coin_id end,
  'ACTIVE',jsonb_build_object('quote','USD','settlement_eligible',true,
    'max_timestamp_delta_seconds',case when p.code='PYTH' then 120 else 600 end,
    'historical_mode',case when p.code='COINGECKO' then 'RANGE_NEAREST' else 'EXACT_SYMBOL' end,
    'discovery','ADMIN_APPROVED_SYMBOL_AND_COIN_ID')
from integration.providers p
cross join (values
  ('SOL','solana','Crypto.SOL/USD'),
  ('ADA','cardano','Crypto.ADA/USD'),
  ('XRP','ripple','Crypto.XRP/USD'),
  ('DOGE','dogecoin','Crypto.DOGE/USD'),
  ('BNB','binancecoin','Crypto.BNB/USD'),
  ('LTC','litecoin','Crypto.LTC/USD'),
  ('DOT','polkadot','Crypto.DOT/USD'),
  ('AVAX','avalanche-2','Crypto.AVAX/USD')
) as v(symbol,coin_id,pyth_symbol)
where p.code in ('PYTH','COINGECKO') and p.environment='PRODUCTION'
on conflict(provider_id,resource_type,canonical_key) do update set
  external_key=excluded.external_key,status='ACTIVE',metadata=excluded.metadata,updated_at=statement_timestamp();

create or replace function public.admin_create_crypto_threshold_market(
  p_title text,p_description text,p_market_type_code text,p_details jsonb,p_condition text,
  p_source_name text,p_source_url text,p_opens_at timestamptz,p_closes_at timestamptz,
  p_resolves_after timestamptz,p_country_code text,p_asset_code text,p_liquidity_model text,
  p_publish_now boolean default false
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_details jsonb:=coalesce(p_details,'{}'::jsonb);
  v_symbol text:=upper(btrim(coalesce(v_details->>'asset_symbol','')));
  v_coin_id text:=lower(btrim(coalesce(v_details->>'coingecko_id','')));
  v_quote text:=upper(btrim(coalesce(v_details->>'quote','USD')));
  v_operator text:=upper(btrim(coalesce(v_details->>'operator','')));
  v_threshold numeric;
  v_result jsonb;
  v_instrument market.instruments;
  v_event market.canonical_events;
  v_asset public.assets;
  v_policy_id bigint;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if upper(btrim(coalesce(p_market_type_code,'')))<>'CRYPTO_PRICE_THRESHOLD' then
    raise exception 'Crypto markets must use the approved threshold market type.' using errcode='22023';
  end if;
  if v_symbol !~ '^[A-Z0-9]{2,20}$' then
    raise exception 'Select a valid crypto symbol from the live asset catalog.' using errcode='22023';
  end if;
  if v_coin_id !~ '^[a-z0-9][a-z0-9-]{1,89}$' then
    raise exception 'Select the crypto asset from the live catalog so the provider ID is unambiguous.' using errcode='22023';
  end if;
  if v_quote<>'USD' then raise exception 'Automatic crypto resolution currently requires USD pairs.' using errcode='22023'; end if;
  if v_operator not in ('GT','GTE','LT','LTE') then
    raise exception 'Choose a supported price comparison.' using errcode='22023';
  end if;
  if coalesce(v_details->>'threshold','') !~ '^[0-9]+([.][0-9]{1,18})?$' then
    raise exception 'Enter a positive numeric USD target.' using errcode='22023';
  end if;
  v_threshold:=(v_details->>'threshold')::numeric;
  if v_threshold<=0 then raise exception 'The USD target must be greater than zero.' using errcode='22023'; end if;
  if p_resolves_after is null or p_closes_at is null or p_resolves_after<=p_closes_at then
    raise exception 'The observation time must be after the trading close.' using errcode='22023';
  end if;

  v_result:=public.admin_create_catalog_market_v2(
    p_title,p_description,p_market_type_code,v_details,p_condition,p_source_name,p_source_url,
    p_opens_at,p_closes_at,p_resolves_after,p_country_code,p_asset_code,p_liquidity_model,p_publish_now
  );
  select * into v_instrument from market.instruments
    where public_id=(v_result->>'instrument_id')::uuid for update;
  if v_instrument.id is null then raise exception 'Created crypto instrument could not be found.' using errcode='P0002'; end if;
  select * into v_event from market.canonical_events where id=v_instrument.canonical_event_id for update;
  if v_event.id is null then raise exception 'Created crypto event could not be found.' using errcode='P0002'; end if;
  select * into v_asset from public.assets where id=v_instrument.asset_id;
  if v_asset.id is null then raise exception 'Created market currency could not be found.' using errcode='P0002'; end if;

  update market.canonical_events e
  set category='CRYPTO_WEB3',
      normalized_parameters=e.normalized_parameters||jsonb_build_object(
        'crypto_asset_symbol',v_symbol,'coin_gecko_id',v_coin_id,'quote_currency',v_quote,
        'threshold_operator',v_operator,'threshold_value',v_threshold),
      resolution_scope=e.resolution_scope||jsonb_build_object(
        'resolver_type','CRYPTO_PRICE_THRESHOLD_V1','category','CRYPTO_WEB3',
        'asset',v_symbol,'quote',v_quote,'operator',v_operator,'threshold',v_threshold,
        'observation_time',p_resolves_after,
        'subject',jsonb_build_object('asset',v_symbol,'symbol',v_symbol,'quote',v_quote,'coin_id',v_coin_id),
        'market_question',p_title,
        'condition',coalesce(nullif(btrim(coalesce(p_condition,'')),''),v_symbol||'/USD '||v_operator||' '||v_threshold::text),
        'verification','Resolution uses approved historical Pyth and CoinGecko observations in the configured observation window. Live display quotes do not determine outcomes.',
        'configured_by','ADMIN_GUIDED_CRYPTO_THRESHOLD'),
      updated_at=statement_timestamp()
  where e.id=v_event.id returning * into v_event;

  select p.id into v_policy_id
  from oracle.policies p
  join oracle.capabilities c on c.id=p.capability_id
  where p.status='ACTIVE' and p.effective_at<=statement_timestamp()
    and c.code='OBJECTIVE_EVENT_RESULT'
    and (
      (coalesce((v_asset.metadata->>'sandbox_only')::boolean,false)
        and upper(coalesce(p.consensus_rule->>'environment',''))='SANDBOX')
      or
      (not coalesce((v_asset.metadata->>'sandbox_only')::boolean,false)
        and upper(coalesce(p.consensus_rule->>'environment','PRODUCTION'))<>'SANDBOX')
    )
    and exists(select 1 from jsonb_array_elements(p.source_hierarchy) h where upper(coalesce(h->>'provider_code',''))='PYTH')
    and exists(select 1 from jsonb_array_elements(p.source_hierarchy) h where upper(coalesce(h->>'provider_code',''))='COINGECKO')
  order by p.effective_at desc,p.version desc limit 1;
  if v_policy_id is null then raise exception 'An active Pyth/CoinGecko crypto resolution policy is unavailable.' using errcode='P0001'; end if;

  update oracle.event_policy_bindings
  set oracle_policy_id=v_policy_id,bound_at=statement_timestamp(),bound_by=auth.uid()
  where event_id=v_event.id;
  if not found then
    insert into oracle.event_policy_bindings(event_id,oracle_policy_id,bound_at,bound_by)
    values(v_event.id,v_policy_id,statement_timestamp(),auth.uid());
  end if;

  insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
  select p.id,'CRYPTO_PAIR',v_symbol||'/'||v_quote,
    case p.code when 'PYTH' then 'Crypto.'||v_symbol||'/'||v_quote else v_coin_id end,
    'ACTIVE',jsonb_build_object('quote',v_quote,'settlement_eligible',true,
      'max_timestamp_delta_seconds',case when p.code='PYTH' then 120 else 600 end,
      'historical_mode',case when p.code='COINGECKO' then 'RANGE_NEAREST' else 'EXACT_SYMBOL' end,
      'discovery','ADMIN_APPROVED_SYMBOL_AND_COIN_ID')
  from integration.providers p
  where p.provider_type='ORACLE' and p.environment='PRODUCTION'
    and p.code in ('PYTH','COINGECKO')
  on conflict(provider_id,resource_type,canonical_key) do update set
    external_key=excluded.external_key,status='ACTIVE',
    metadata=excluded.metadata,updated_at=statement_timestamp();

  perform command.refresh_market_catalog(v_instrument.id);
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','CRYPTO_THRESHOLD_MARKET_CONFIGURED','MARKET',v_instrument.public_id::text,
    'Created a crypto threshold market using approved historical Oracle providers',
    jsonb_build_object('symbol',v_symbol,'coin_gecko_id',v_coin_id,'quote',v_quote,
      'operator',v_operator,'threshold',v_threshold,'observation_time',p_resolves_after,
      'oracle_policy_id',v_policy_id,'providers',jsonb_build_array('PYTH','COINGECKO')));
  return v_result||jsonb_build_object('resolver_type','CRYPTO_PRICE_THRESHOLD_V1',
    'oracle_policy_id',v_policy_id,'crypto_asset',v_symbol,'coin_gecko_id',v_coin_id);
end;
$function$;
revoke all on function public.admin_create_crypto_threshold_market(text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,boolean) from public,anon;
grant execute on function public.admin_create_crypto_threshold_market(text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,boolean) to authenticated;

commit;
