-- Market-specific trade limits and a narrowly-scoped API for authorized market agents.
-- Applies market-scoped min/max values only; no global defaults are stored.

begin;

-- Per-market trade limits are entered during market creation and copied
-- directly into that market's instrument and risk policy; no global defaults.

create or replace function private.apply_market_trade_limits(
  p_instrument_public_id uuid,
  p_min_trade_amount numeric,
  p_max_trade_amount numeric,
  p_liquidity_model text
) returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_instrument market.instruments;
  v_model text := upper(btrim(coalesce(p_liquidity_model,'')));
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if p_min_trade_amount is null or p_max_trade_amount is null
     or p_min_trade_amount <= 0 or p_max_trade_amount <= p_min_trade_amount then
    raise exception 'The maximum trade amount must be greater than a positive minimum.' using errcode='22023';
  end if;
  if v_model not in ('POOL','ORDER_BOOK') then
    raise exception 'Choose Peer Pool or Order Book.' using errcode='22023';
  end if;
  if p_min_trade_amount > 1000000000000 or p_max_trade_amount > 1000000000000 then
    raise exception 'Trade limits are above the supported configuration range.' using errcode='22023';
  end if;

  select * into v_instrument
  from market.instruments
  where public_id=p_instrument_public_id
  for update;
  if v_instrument.id is null then raise exception 'Market instrument not found.' using errcode='P0002'; end if;
  if v_instrument.status <> 'DRAFT' then
    raise exception 'Trade limits can only be set before market publication.' using errcode='P0001';
  end if;
  if v_instrument.liquidity_model <> v_model then
    raise exception 'The selected trading method does not match this market.' using errcode='22023';
  end if;

  update market.instruments
  set min_order_notional=p_min_trade_amount,
      updated_at=statement_timestamp()
  where id=v_instrument.id;

  if v_model='ORDER_BOOK' then
    update market.instrument_trading_risk_policies
    set order_max_order_notional=p_max_trade_amount,
        order_max_user_market_exposure=greatest(order_max_user_market_exposure,p_max_trade_amount),
        policy_version=policy_version+1
    where instrument_id=v_instrument.id;
  else
    update market.instrument_trading_risk_policies
    set pool_max_entry_stake=p_max_trade_amount,
        pool_max_user_market_stake=greatest(pool_max_user_market_stake,p_max_trade_amount),
        pool_max_market_total=greatest(pool_max_market_total,p_max_trade_amount),
        policy_version=policy_version+1
    where instrument_id=v_instrument.id;
  end if;
  if not found then raise exception 'The market risk policy is missing; limits were not applied.' using errcode='23514'; end if;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','MARKET_TRADE_LIMITS_CONFIGURED','MARKET_INSTRUMENT',v_instrument.public_id::text,
    'Configured market-specific minimum and maximum trade amounts before publication',
    jsonb_build_object('asset_id',v_instrument.asset_id,'liquidity_model',v_model,
      'min_trade_amount',p_min_trade_amount,'max_trade_amount',p_max_trade_amount));
end;
$function$;

-- A new RPC signature makes the limits part of creation itself. The older
-- functions remain as compatibility shims for existing deployments, while the
-- current admin workspace uses these v3/v5/v2 endpoints.
create or replace function public.admin_create_catalog_market_v3(
  p_title text,
  p_description text,
  p_market_type_code text,
  p_details jsonb,
  p_condition text,
  p_source_name text,
  p_source_url text,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_resolves_after timestamptz,
  p_country_code text,
  p_asset_code text,
  p_liquidity_model text,
  p_min_trade_amount numeric,
  p_max_trade_amount numeric,
  p_publish_now boolean default false,
  p_feature_rank integer default 100,
  p_publication_reason text default 'Published during catalog market creation with explicit trade limits'
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_result jsonb;
  v_id uuid;
  v_handler text;
  v_model text := upper(btrim(coalesce(p_liquidity_model,'')));
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if v_model not in ('POOL','ORDER_BOOK') then raise exception 'Choose Peer Pool or Order Book.' using errcode='22023'; end if;

  if upper(btrim(coalesce(p_market_type_code,'')))<>'CRYPTO_PRICE_THRESHOLD' then
    select upper(t.handler_code) into v_handler
    from market.guided_market_types t
    where upper(t.code)=upper(btrim(coalesce(p_market_type_code,'')))
      and t.status='ACTIVE';
    if v_handler='VERIFIED_EVENT'
      and (nullif(btrim(coalesce(p_source_url,'')),'') is null
        or btrim(coalesce(p_source_url,'')) !~* '^[h][t][t][p][s]://[^/[:space:]]+[.][^/[:space:]]+'
        or btrim(coalesce(p_source_url,'')) ~* '^[h][t][t][p][s]://[0-9]{1,3}([.][0-9]{1,3}){3}([:/]|$)'
        or btrim(coalesce(p_source_url,'')) ~* '[.](local|localhost|test|internal)([:/]|$)') then
      raise exception 'Automatic market resolution requires an authoritative HTTPS source URL. The evidence worker uses that domain for direct fetching and scoped corroboration.' using errcode='22023';
    end if;
  end if;

  if upper(btrim(coalesce(p_market_type_code,'')))='CRYPTO_PRICE_THRESHOLD' then
    v_result:=public.admin_create_crypto_threshold_market(
      p_title,p_description,p_market_type_code,p_details,p_condition,p_source_name,p_source_url,
      p_opens_at,p_closes_at,p_resolves_after,p_country_code,p_asset_code,v_model,false
    );
  else
    v_result:=public.admin_create_catalog_market_v2(
      p_title,p_description,p_market_type_code,p_details,p_condition,p_source_name,p_source_url,
      p_opens_at,p_closes_at,p_resolves_after,p_country_code,p_asset_code,v_model,false
    );
  end if;

  v_id:=nullif(v_result->>'instrument_id','')::uuid;
  if v_id is null then raise exception 'The market was created without a usable instrument ID.' using errcode='P0001'; end if;
  perform private.apply_market_trade_limits(v_id,p_min_trade_amount,p_max_trade_amount,v_model);

  if coalesce(p_publish_now,false) then
    if p_opens_at > statement_timestamp() then
      raise exception 'Publish now requires an opening time that has started. Save it as a draft for a future opening.' using errcode='22023';
    end if;
    if p_closes_at <= statement_timestamp() then
      raise exception 'A market cannot be published after its closing time.' using errcode='22023';
    end if;
    perform public.admin_publish_market(v_id,coalesce(p_feature_rank,100),coalesce(nullif(btrim(coalesce(p_publication_reason,'')),''),'Published during creation with explicit trade limits'));
    v_result:=v_result||jsonb_build_object('publication_status','PUBLISHED');
  else
    v_result:=v_result||jsonb_build_object('publication_status','DRAFT');
  end if;
  return v_result||jsonb_build_object('min_trade_amount',p_min_trade_amount,'max_trade_amount',p_max_trade_amount,'liquidity_model',v_model);
end;
$function$;

create or replace function public.admin_create_guided_market_v5(
  p_title text,
  p_description text,
  p_category text,
  p_market_setup jsonb,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_resolves_after timestamptz,
  p_country_code text,
  p_asset_code text,
  p_liquidity_model text,
  p_min_trade_amount numeric,
  p_max_trade_amount numeric,
  p_publish_now boolean default false,
  p_feature_rank integer default 100,
  p_publication_reason text default 'Published during guided market creation with explicit trade limits'
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_result jsonb;
  v_id uuid;
  v_model text := upper(btrim(coalesce(p_liquidity_model,'')));
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  v_result:=public.admin_create_guided_market_v4(
    p_title,p_description,p_category,p_market_setup,p_opens_at,p_closes_at,p_resolves_after,
    p_country_code,p_asset_code,v_model,false
  );
  v_id:=nullif(v_result->>'instrument_id','')::uuid;
  if v_id is null then raise exception 'The guided market was created without a usable instrument ID.' using errcode='P0001'; end if;
  perform private.apply_market_trade_limits(v_id,p_min_trade_amount,p_max_trade_amount,v_model);
  if coalesce(p_publish_now,false) then
    if p_opens_at > statement_timestamp() or p_closes_at <= statement_timestamp() then
      raise exception 'Publish now requires an open window that has started and has not closed.' using errcode='22023';
    end if;
    perform public.admin_publish_market(v_id,coalesce(p_feature_rank,100),coalesce(nullif(btrim(coalesce(p_publication_reason,'')),''),'Published during creation with explicit trade limits'));
    v_result:=v_result||jsonb_build_object('publication_status','PUBLISHED');
  else
    v_result:=v_result||jsonb_build_object('publication_status','DRAFT');
  end if;
  return v_result||jsonb_build_object('min_trade_amount',p_min_trade_amount,'max_trade_amount',p_max_trade_amount,'liquidity_model',v_model);
end;
$function$;

create or replace function public.admin_create_multi_outcome_market_v2(
  p_title text,
  p_description text,
  p_category text,
  p_outcomes jsonb,
  p_resolution_instructions text,
  p_source_name text,
  p_source_url text,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_resolves_after timestamptz,
  p_country_code text,
  p_asset_code text,
  p_min_trade_amount numeric,
  p_max_trade_amount numeric,
  p_publish_now boolean default false,
  p_feature_rank integer default 100,
  p_publication_reason text default 'Published during multiple-outcome creation with explicit trade limits'
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_result jsonb;
  v_id uuid;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if nullif(btrim(coalesce(p_source_url,'')),'') is null
    or btrim(coalesce(p_source_url,'')) !~* '^[h][t][t][p][s]://[^/[:space:]]+[.][^/[:space:]]+'
        or btrim(coalesce(p_source_url,'')) ~* '^[h][t][t][p][s]://[0-9]{1,3}([.][0-9]{1,3}){3}([:/]|$)'
        or btrim(coalesce(p_source_url,'')) ~* '[.](local|localhost|test|internal)([:/]|$)' then
    raise exception 'Automatic multi-outcome resolution requires an authoritative HTTPS source URL for direct evidence and scoped corroboration.' using errcode='22023';
  end if;
  v_result:=public.admin_create_multi_outcome_market_v1(
    p_title,p_description,p_category,p_outcomes,p_resolution_instructions,p_source_name,p_source_url,
    p_opens_at,p_closes_at,p_resolves_after,p_country_code,p_asset_code,false
  );
  v_id:=nullif(v_result->>'instrument_id','')::uuid;
  if v_id is null then raise exception 'The multiple-outcome market was created without a usable instrument ID.' using errcode='P0001'; end if;

  -- The underlying legacy helper labels this scope as manual, but VAD's existing
  -- AI evidence worker resolves VAD_REVIEW_V1 events automatically once closed,
  -- provided both the configured source and corroborating evidence are usable.
  update market.canonical_events e
  set resolution_scope=coalesce(e.resolution_scope,'{}'::jsonb) || jsonb_build_object(
        'verification','Automatic VAD evidence resolution reads the configured official source and corroborating evidence. Ambiguous or unavailable evidence remains unresolved; finalization follows the existing VAD oracle policy.'
      ),
      updated_at=statement_timestamp()
  from market.instruments i
  where i.public_id=v_id and e.id=i.canonical_event_id;

  perform private.apply_market_trade_limits(v_id,p_min_trade_amount,p_max_trade_amount,'POOL');
  if coalesce(p_publish_now,false) then
    if p_opens_at > statement_timestamp() or p_closes_at <= statement_timestamp() then
      raise exception 'Publish now requires an open window that has started and has not closed.' using errcode='22023';
    end if;
    perform public.admin_publish_market(v_id,coalesce(p_feature_rank,100),coalesce(nullif(btrim(coalesce(p_publication_reason,'')),''),'Published during multiple-outcome creation with explicit trade limits'));
    v_result:=v_result||jsonb_build_object('publication_status','PUBLISHED');
  else
    v_result:=v_result||jsonb_build_object('publication_status','DRAFT');
  end if;
  return v_result||jsonb_build_object('min_trade_amount',p_min_trade_amount,'max_trade_amount',p_max_trade_amount,'liquidity_model','POOL');
end;
$function$;

-- Trade amounts are enforced again at the execution boundary, not only in UI
-- validation or quote RPCs. Pool and order-book quotes already perform these
-- checks; these guards cover a caller who skips quote creation entirely.
create or replace function public.place_order(
  p_market_id bigint,
  p_outcome_id bigint,
  p_side text,
  p_price numeric,
  p_quantity numeric,
  p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  v_account public.user_accounts;
  v_instrument market.instruments;
  v_risk market.instrument_trading_risk_policies;
  v_notional numeric(38,18);
begin
  v_account:=private.require_active_account();
  select * into v_instrument from market.instruments where id=p_market_id;
  if v_instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if v_instrument.liquidity_model='POOL' then raise exception 'This market uses peer-funded pooled staking' using errcode='P0001'; end if;
  if not private.trade_access_satisfies(auth.uid(),v_account.country_code,v_instrument.asset_id) then
    raise exception 'Trading is not available for this account and market' using errcode='P0001';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key)<8 or char_length(p_idempotency_key)>200 then
    raise exception 'A valid idempotency key is required' using errcode='22023';
  end if;
  if p_price is null or p_price<=0 or p_price>=v_instrument.settlement_unit or p_quantity is null or p_quantity<=0 then
    raise exception 'Invalid order price or quantity' using errcode='22023';
  end if;
  v_notional:=round(p_price*p_quantity,18);
  if v_notional < v_instrument.min_order_notional then
    raise exception 'Order is below market minimum notional' using errcode='22023';
  end if;
  select * into v_risk from market.instrument_trading_risk_policies where instrument_id=v_instrument.id;
  if v_risk.instrument_id is null then raise exception 'Market risk policy is missing.' using errcode='23514'; end if;
  if v_notional > v_risk.order_max_order_notional then
    raise exception 'Order exceeds this market''s maximum order value.' using errcode='22023';
  end if;
  return command.reserve_for_order(auth.uid(),p_market_id,p_outcome_id,upper(p_side),p_price,p_quantity,p_idempotency_key);
end;
$function$;

-- Wrap the existing pool commit function so direct commits cannot bypass the
-- per-market maximum. The original function remains private to this wrapper.
alter function public.place_pool_stake(uuid,text,numeric,text) rename to place_pool_stake_pre_market_limits;
revoke all on function public.place_pool_stake_pre_market_limits(uuid,text,numeric,text) from public, anon, authenticated;

create or replace function public.place_pool_stake(
  p_instrument_public_id uuid,
  p_outcome_code text,
  p_amount numeric,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_instrument market.instruments;
  v_risk market.instrument_trading_risk_policies;
  v_asset_code text;
  v_existing_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_idempotency_key is not null and char_length(p_idempotency_key) between 8 and 200 then
    select s.public_id into v_existing_id
    from trading.pool_stakes s
    where s.user_id=auth.uid() and s.idempotency_key=p_idempotency_key;
    if v_existing_id is not null then
      return public.place_pool_stake_pre_market_limits(p_instrument_public_id,p_outcome_code,p_amount,p_idempotency_key);
    end if;
  end if;
  select * into v_instrument from market.instruments where public_id=p_instrument_public_id;
  if v_instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if v_instrument.liquidity_model <> 'POOL' then raise exception 'This market does not use pooled staking' using errcode='P0001'; end if;
  if p_amount is null or p_amount < v_instrument.min_order_notional then
    raise exception 'Stake is below the market minimum' using errcode='22023';
  end if;
  select a.code into v_asset_code from public.assets a where a.id=v_instrument.asset_id;
  select * into v_risk from market.instrument_trading_risk_policies where instrument_id=v_instrument.id;
  if v_risk.instrument_id is null then raise exception 'Market risk policy is missing.' using errcode='23514'; end if;
  if p_amount > v_risk.pool_max_entry_stake then
    raise exception 'Stake exceeds this market''s maximum single-stake limit.' using errcode='22023';
  end if;
  return public.place_pool_stake_pre_market_limits(p_instrument_public_id,p_outcome_code,p_amount,p_idempotency_key);
end;
$function$;
revoke all on function public.place_pool_stake(uuid,text,numeric,text) from public, anon;
grant execute on function public.place_pool_stake(uuid,text,numeric,text) to authenticated;
-- Keep the historical function unavailable to normal client roles.
grant execute on function public.place_pool_stake_pre_market_limits(uuid,text,numeric,text) to service_role;

-- API credentials are one-time-displayed keys; only a SHA-256 digest is stored.
create table if not exists market.agent_api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 3 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  token_hash text not null unique,
  scopes text[] not null default array['market:read','market:create','market:publish'],
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED')),
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz
);
create index if not exists agent_api_keys_actor_status_idx on market.agent_api_keys(created_by,status,created_at desc);
alter table market.agent_api_keys enable row level security;
revoke all on market.agent_api_keys from public, anon, authenticated;

create or replace function public.admin_issue_market_agent_key(
  p_name text,
  p_scopes text[] default array['market:read','market:create','market:publish'],
  p_expires_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_name text := btrim(coalesce(p_name,''));
  v_scopes text[] := coalesce(p_scopes,array['market:read','market:create','market:publish']);
  v_raw_token text;
  v_id uuid;
  v_expires_at timestamptz := coalesce(p_expires_at, statement_timestamp() + interval '90 days');
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if char_length(v_name) not between 3 and 120 then
    raise exception 'Name the agent key between 3 and 120 characters.' using errcode='22023';
  end if;
  if cardinality(v_scopes)=0 or exists(
    select 1 from unnest(v_scopes) scope
    where scope not in ('market:read','market:create','market:publish')
  ) then
    raise exception 'Choose only supported market agent permissions.' using errcode='22023';
  end if;
  if v_expires_at <= statement_timestamp() then
    raise exception 'The agent key expiry must be in the future.' using errcode='22023';
  end if;
  v_raw_token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into market.agent_api_keys(name,created_by,token_hash,scopes,expires_at)
  values(v_name,auth.uid(),encode(extensions.digest(v_raw_token,'sha256'),'hex'),v_scopes,v_expires_at)
  returning id into v_id;
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','MARKET_AGENT_KEY_CREATED','MARKET_AGENT_KEY',v_id::text,
    'Created a scoped market-agent API credential',
    jsonb_build_object('name',v_name,'scopes',v_scopes,'expires_at',v_expires_at));
  return jsonb_build_object('id',v_id,'name',v_name,'apiKey',v_raw_token,'scopes',v_scopes,'expiresAt',v_expires_at);
end;
$function$;

create or replace function public.admin_list_market_agent_keys()
returns table(id uuid,name text,scopes text[],status text,expires_at timestamptz,last_used_at timestamptz,created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  return query select k.id,k.name,k.scopes,k.status,k.expires_at,k.last_used_at,k.created_at
    from market.agent_api_keys k
    where k.created_by=auth.uid()
    order by k.created_at desc limit 100;
end;
$function$;

create or replace function public.admin_revoke_market_agent_key(p_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  update market.agent_api_keys set status='REVOKED',revoked_at=statement_timestamp()
  where id=p_id and created_by=auth.uid() and status='ACTIVE';
  if not found then return false; end if;
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','MARKET_AGENT_KEY_REVOKED','MARKET_AGENT_KEY',p_id::text,
    'Revoked a market-agent API credential','{}'::jsonb);
  return true;
end;
$function$;

create or replace function public.internal_market_agent_context(p_api_key text)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_key market.agent_api_keys;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_api_key is null or length(p_api_key)<40 then raise exception 'Invalid agent API key' using errcode='28000'; end if;
  select * into v_key from market.agent_api_keys
  where token_hash=encode(extensions.digest(p_api_key,'sha256'),'hex')
    and status='ACTIVE' and (expires_at is null or expires_at>statement_timestamp());
  if v_key.id is null then raise exception 'Invalid or expired agent API key' using errcode='28000'; end if;
  perform set_config('request.jwt.claim.sub',v_key.created_by::text,true);
  if not private.has_permission('markets.manage') then
    raise exception 'The admin who issued this key no longer has market-management permission' using errcode='42501';
  end if;
  update market.agent_api_keys set last_used_at=statement_timestamp() where id=v_key.id;
  return jsonb_build_object('id',v_key.id,'name',v_key.name,'adminUserId',v_key.created_by,'scopes',v_key.scopes);
end;
$function$;

create or replace function public.agent_guided_market_catalog(p_api_key text)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_context jsonb;
begin
  v_context:=public.internal_market_agent_context(p_api_key);
  if not (v_context->'scopes' @> '["market:read"]'::jsonb) then
    raise exception 'The agent key lacks market:read scope' using errcode='42501';
  end if;
  perform set_config('request.jwt.claim.sub',v_context->>'adminUserId',true);
  return public.admin_guided_market_catalog();
end;
$function$;

create or replace function public.agent_create_market_v1(
  p_api_key text,
  p_title text,
  p_description text,
  p_market_type_code text,
  p_category_code text,
  p_details jsonb,
  p_condition text,
  p_source_name text,
  p_source_url text,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_resolves_after timestamptz,
  p_country_code text,
  p_asset_code text,
  p_liquidity_model text,
  p_min_trade_amount numeric,
  p_max_trade_amount numeric,
  p_publish_now boolean default true,
  p_feature_rank integer default 100,
  p_publication_reason text default 'Published through the authorized VAD Market Agent API'
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_context jsonb;
  v_result jsonb;
  v_id uuid;
  v_scopes jsonb;
  v_user_id uuid;
  v_handler text;
  v_category_name text;
  v_market_setup jsonb;
begin
  v_context:=public.internal_market_agent_context(p_api_key);
  v_scopes:=v_context->'scopes';
  if not (v_scopes @> '["market:create"]'::jsonb) then raise exception 'The agent key lacks market:create scope' using errcode='42501'; end if;
  if not (v_scopes @> '["market:read"]'::jsonb) then raise exception 'The agent key lacks market:read scope' using errcode='42501'; end if;
  if coalesce(p_publish_now,true) and not (v_scopes @> '["market:publish"]'::jsonb) then
    raise exception 'The agent key lacks market:publish scope' using errcode='42501';
  end if;
  v_user_id:=(v_context->>'adminUserId')::uuid;
  perform set_config('request.jwt.claim.sub',v_user_id::text,true);
  select upper(t.handler_code),c.name into v_handler,v_category_name
  from market.guided_market_types t
  join market.guided_categories c on c.code=t.category_code
  where upper(t.code)=upper(btrim(coalesce(p_market_type_code,'')))
    and upper(t.category_code)=upper(btrim(coalesce(p_category_code,'')))
    and t.status='ACTIVE' and c.status='ACTIVE';
  if v_handler is null then raise exception 'The requested market type is not active in that database category.' using errcode='22023'; end if;
  if v_handler='FOOTBALL_MATCH' then
    v_market_setup:=jsonb_build_object(
      'kind','FOOTBALL_MATCH',
      'result_checking',upper(coalesce(p_details->>'result_checking','AUTOMATIC')),
      'competition',coalesce(nullif(btrim(p_details->>'competition'),''),''),
      'home_team',coalesce(nullif(btrim(p_details->>'home_team'),''),''),
      'away_team',coalesce(nullif(btrim(p_details->>'away_team'),''),''),
      'prediction',upper(coalesce(p_details->>'prediction','HOME_WIN')),
      'match_starts_at',p_details->>'match_starts_at',
      'source_name',nullif(btrim(coalesce(p_details->>'source_name',p_source_name,'')),''),
      'source_url',nullif(btrim(coalesce(p_details->>'source_url',p_source_url,'')),'')
    );
    v_result:=public.admin_create_guided_market_v5(
      p_title,p_description,v_category_name,v_market_setup,p_opens_at,p_closes_at,p_resolves_after,
      p_country_code,p_asset_code,p_liquidity_model,p_min_trade_amount,p_max_trade_amount,coalesce(p_publish_now,true),
      p_feature_rank,p_publication_reason
    );
  else
    v_result:=public.admin_create_catalog_market_v3(
      p_title,p_description,p_market_type_code,p_details,p_condition,p_source_name,p_source_url,
      p_opens_at,p_closes_at,p_resolves_after,p_country_code,p_asset_code,p_liquidity_model,
      p_min_trade_amount,p_max_trade_amount,coalesce(p_publish_now,true),p_feature_rank,p_publication_reason
    );
  end if;
  v_id:=nullif(v_result->>'instrument_id','')::uuid;
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(v_user_id,'AGENT','MARKET_AGENT_CREATED_MARKET','MARKET_INSTRUMENT',coalesce(v_id::text,''),
    coalesce(nullif(btrim(p_publication_reason),''),'Published through the authorized VAD Market Agent API'),
    jsonb_build_object('agent_key_id',v_context->>'id','agent_name',v_context->>'name',
      'market_type_code',p_market_type_code,'publish_now',coalesce(p_publish_now,true),
      'min_trade_amount',p_min_trade_amount,'max_trade_amount',p_max_trade_amount));
  return v_result||jsonb_build_object('agent',jsonb_build_object('keyId',v_context->>'id','name',v_context->>'name'));
end;
$function$;


create or replace function public.agent_market_creation_options(p_api_key text)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_context jsonb;
  v_catalog jsonb;
  v_options jsonb;
begin
  v_context:=public.internal_market_agent_context(p_api_key);
  if not (v_context->'scopes' @> '["market:read"]'::jsonb) then
    raise exception 'The agent key lacks market:read scope' using errcode='42501';
  end if;
  perform set_config('request.jwt.claim.sub',v_context->>'adminUserId',true);
  v_catalog:=public.admin_guided_market_catalog();
  v_options:=public.admin_market_approval_options_v2();
  return jsonb_build_object('catalog',v_catalog,'options',v_options);
end;
$function$;

create or replace function public.agent_create_multi_outcome_market_v1(
  p_api_key text,
  p_title text,
  p_description text,
  p_category_code text,
  p_outcomes jsonb,
  p_resolution_instructions text,
  p_source_name text,
  p_source_url text,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_resolves_after timestamptz,
  p_country_code text,
  p_asset_code text,
  p_min_trade_amount numeric,
  p_max_trade_amount numeric,
  p_publish_now boolean default true,
  p_feature_rank integer default 100,
  p_publication_reason text default 'Published through the authorized VAD Market Agent API'
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_context jsonb;
  v_category_name text;
  v_user_id uuid;
  v_id uuid;
  v_scopes jsonb;
  v_result jsonb;
begin
  v_context:=public.internal_market_agent_context(p_api_key);
  v_scopes:=v_context->'scopes';
  if not (v_scopes @> '["market:create"]'::jsonb) or not (v_scopes @> '["market:read"]'::jsonb) then
    raise exception 'The agent key requires market:read and market:create scopes' using errcode='42501';
  end if;
  if coalesce(p_publish_now,true) and not (v_scopes @> '["market:publish"]'::jsonb) then
    raise exception 'The agent key lacks market:publish scope' using errcode='42501';
  end if;
  select c.name into v_category_name
  from market.guided_categories c
  where upper(c.code)=upper(btrim(coalesce(p_category_code,''))) and c.status='ACTIVE';
  if v_category_name is null then raise exception 'Choose an active database market category.' using errcode='22023'; end if;
  v_user_id:=(v_context->>'adminUserId')::uuid;
  perform set_config('request.jwt.claim.sub',v_user_id::text,true);
  v_result:=public.admin_create_multi_outcome_market_v2(
    p_title,p_description,v_category_name,p_outcomes,p_resolution_instructions,p_source_name,p_source_url,
    p_opens_at,p_closes_at,p_resolves_after,p_country_code,p_asset_code,
    p_min_trade_amount,p_max_trade_amount,coalesce(p_publish_now,true),p_feature_rank,p_publication_reason
  );
  v_id:=nullif(v_result->>'instrument_id','')::uuid;
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(v_user_id,'AGENT','MARKET_AGENT_CREATED_MULTI_OUTCOME_MARKET','MARKET_INSTRUMENT',coalesce(v_id::text,''),
    coalesce(nullif(btrim(p_publication_reason),''),'Published through the authorized VAD Market Agent API'),
    jsonb_build_object('agent_key_id',v_context->>'id','agent_name',v_context->>'name',
      'category_code',p_category_code,'market_format','MULTI_OUTCOME','publish_now',coalesce(p_publish_now,true),
      'min_trade_amount',p_min_trade_amount,'max_trade_amount',p_max_trade_amount));
  return v_result||jsonb_build_object('agent',jsonb_build_object('keyId',v_context->>'id','name',v_context->>'name'));
end;
$function$;

revoke all on function private.apply_market_trade_limits(uuid,numeric,numeric,text) from public, anon, authenticated;
revoke all on function public.admin_create_catalog_market_v3(text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,numeric,numeric,boolean,integer,text) from public, anon;
revoke all on function public.admin_create_guided_market_v5(text,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,text,text,numeric,numeric,boolean,integer,text) from public, anon;
revoke all on function public.admin_create_multi_outcome_market_v2(text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,numeric,numeric,boolean,integer,text) from public, anon;
revoke all on function public.admin_issue_market_agent_key(text,text[],timestamptz) from public, anon;
revoke all on function public.admin_list_market_agent_keys() from public, anon;
revoke all on function public.admin_revoke_market_agent_key(uuid) from public, anon;
revoke all on function public.internal_market_agent_context(text) from public, anon, authenticated;
revoke all on function public.agent_market_creation_options(text) from public, anon, authenticated;
revoke all on function public.agent_create_multi_outcome_market_v1(text,text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,numeric,numeric,boolean,integer,text) from public, anon, authenticated;
revoke all on function public.agent_guided_market_catalog(text) from public, anon, authenticated;
revoke all on function public.agent_create_market_v1(text,text,text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,numeric,numeric,boolean,integer,text) from public, anon, authenticated;
grant execute on function public.admin_create_catalog_market_v3(text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,numeric,numeric,boolean,integer,text) to authenticated;
grant execute on function public.admin_create_guided_market_v5(text,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,text,text,numeric,numeric,boolean,integer,text) to authenticated;
grant execute on function public.admin_create_multi_outcome_market_v2(text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,numeric,numeric,boolean,integer,text) to authenticated;
grant execute on function public.admin_issue_market_agent_key(text,text[],timestamptz) to authenticated;
grant execute on function public.admin_list_market_agent_keys() to authenticated;
grant execute on function public.admin_revoke_market_agent_key(uuid) to authenticated;
grant execute on function public.internal_market_agent_context(text) to service_role;
grant execute on function public.agent_market_creation_options(text) to service_role;
grant execute on function public.agent_create_multi_outcome_market_v1(text,text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,numeric,numeric,boolean,integer,text) to service_role;
grant execute on function public.agent_guided_market_catalog(text) to service_role;
grant execute on function public.agent_create_market_v1(text,text,text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,numeric,numeric,boolean,integer,text) to service_role;
grant execute on function public.place_pool_stake_pre_market_limits(uuid,text,numeric,text) to service_role;

-- Keep the public display quote cache short enough for the app's polling
-- loop while sharing cache entries across users and identical asset queries.
update market.market_data_sources
set cache_seconds=15,updated_at=statement_timestamp()
where code='COINGECKO' and status='ACTIVE';

-- Give the trading ticket the same authoritative per-market rules that
-- trade_quote/place_order enforce, so users can fix too-small/too-large orders
-- before opening a quote.
create or replace function public.market_trade_rules(p_instrument_public_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_instrument market.instruments;
  v_risk market.instrument_trading_risk_policies;
  v_asset_code text;
  v_max_trade_amount numeric(38,18);
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;

  select i.* into v_instrument
  from market.instruments i
  join public.market_catalog mc on mc.instrument_public_id=i.public_id
  where i.public_id=p_instrument_public_id and i.status='OPEN';
  if v_instrument.id is null then raise exception 'Market is not available for trading.' using errcode='P0002'; end if;

  select a.code into v_asset_code
  from public.assets a
  where a.id=v_instrument.asset_id and a.status='ACTIVE' and a.code in ('NGN','USDC');
  if v_asset_code is null then raise exception 'This market currency is not enabled for trading.' using errcode='22023'; end if;

  select * into v_risk from market.instrument_trading_risk_policies where instrument_id=v_instrument.id;
  if v_risk.instrument_id is null then raise exception 'Market risk limits are not configured.' using errcode='23514'; end if;

  v_max_trade_amount := case
    when v_instrument.liquidity_model='ORDER_BOOK' then v_risk.order_max_order_notional
    when v_instrument.liquidity_model='POOL' then v_risk.pool_max_entry_stake
    else null
  end;
  if v_instrument.min_order_notional is null or v_instrument.min_order_notional<=0
    or v_max_trade_amount is null or v_max_trade_amount<=v_instrument.min_order_notional then
    raise exception 'Market trade limits are not configured correctly.' using errcode='23514';
  end if;

  return jsonb_build_object(
    'instrumentPublicId',v_instrument.public_id,
    'assetCode',v_asset_code,
    'liquidityModel',v_instrument.liquidity_model,
    'minTradeAmount',v_instrument.min_order_notional,
    'maxTradeAmount',v_max_trade_amount,
    'maxUserMarketExposure',case when v_instrument.liquidity_model='ORDER_BOOK' then v_risk.order_max_user_market_exposure else v_risk.pool_max_user_market_stake end,
    'policyVersion',v_risk.policy_version
  );
end;
$function$;

revoke all on function public.market_trade_rules(uuid) from public, anon;
grant execute on function public.market_trade_rules(uuid) to authenticated;

-- Enforce order-book max notional and total exposure at the reservation
-- boundary as well as in trade_quote. Direct place_order calls must not be able
-- to bypass the quote/review step to submit an oversized order.
create or replace function command.reserve_for_order(
  p_user_id uuid,
  p_market_id bigint,
  p_outcome_id bigint,
  p_side text,
  p_price numeric,
  p_quantity numeric,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  instrument market.instruments;
  outcome market.outcomes;
  risk_policy market.instrument_trading_risk_policies;
  required_amount numeric(38,18);
  fee_reserve numeric(38,18):=0;
  fee_pv bigint;
  total_reserve numeric(38,18);
  available_account bigint;
  reserved_account bigint;
  current_available numeric(38,18);
  available_shares numeric(38,18);
  current_exposure numeric(38,18):=0;
  projected_exposure numeric(38,18):=0;
  order_public_id uuid;
  order_id bigint;
  seq bigint;
begin
  if p_side not in ('BUY','SELL') then
    raise exception 'Unsupported order side' using errcode='22023';
  end if;
  if p_price is null or p_price<=0 or p_quantity is null or p_quantity<=0 then
    raise exception 'Positive price and quantity required' using errcode='22023';
  end if;

  select * into instrument
  from market.instruments
  where id=p_market_id
  for share;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if instrument.status<>'OPEN' or instrument.opened_at is null
    or instrument.opened_at>statement_timestamp()
    or (instrument.closed_at is not null and instrument.closed_at<=statement_timestamp()) then
    raise exception 'Market is not open for trading' using errcode='P0001';
  end if;
  if p_price>=instrument.settlement_unit then
    raise exception 'Price must be below settlement unit' using errcode='22023';
  end if;

  select * into outcome
  from market.outcomes
  where id=p_outcome_id and instrument_id=p_market_id;
  if outcome.id is null then raise exception 'Outcome not found for market' using errcode='P0002'; end if;

  required_amount:=round(p_price*p_quantity,18);
  if required_amount<instrument.min_order_notional then
    raise exception 'Order is below market minimum notional' using errcode='22023';
  end if;

  select o.id,o.public_id into order_id,order_public_id
  from trading.orders o
  where o.idempotency_key=p_idempotency_key and o.user_id=p_user_id;
  if order_public_id is not null then
    perform command.match_best_order(order_id);
    return order_public_id;
  end if;
  if p_side='BUY' then
    perform pg_advisory_xact_lock(hashtextextended('vad-market-exposure:'||p_user_id::text||':'||p_market_id::text,0));
  end if;

  select * into risk_policy
  from market.instrument_trading_risk_policies
  where instrument_id=instrument.id
  for share;
  if risk_policy.instrument_id is null
    or risk_policy.order_max_order_notional is null
    or risk_policy.order_max_order_notional<=0
    or risk_policy.order_max_user_market_exposure is null
    or risk_policy.order_max_user_market_exposure<=0 then
    raise exception 'Market risk policy is missing or invalid.' using errcode='23514';
  end if;
  if required_amount>risk_policy.order_max_order_notional then
    raise exception 'Order exceeds this market''s maximum order value.' using errcode='22023';
  end if;

  select
    coalesce((
      select sum(greatest(p.total_cost_basis,0))
      from trading.positions p
      where p.user_id=p_user_id and p.instrument_id=instrument.id
    ),0)
    +
    coalesce((
      select sum(greatest(o.quantity-o.filled_quantity,0)*o.limit_price)
      from trading.orders o
      where o.user_id=p_user_id
        and o.instrument_id=instrument.id
        and upper(o.side)='BUY'
        and o.status in ('OPEN','PARTIALLY_FILLED','PENDING','RESERVED')
    ),0)
  into current_exposure;
  projected_exposure:=current_exposure+case when p_side='BUY' then required_amount else 0 end;
  if p_side='BUY' and projected_exposure>risk_policy.order_max_user_market_exposure then
    raise exception 'Order would exceed your maximum exposure for this market.' using errcode='22023';
  end if;


  seq:=nextval('trading.order_sequence');
  if p_side='BUY' then
    select q.fee_amount,q.policy_version_id into fee_reserve,fee_pv
    from command.max_trading_fee_reserve(required_amount) q;
    total_reserve:=required_amount+coalesce(fee_reserve,0);
    available_account:=finance.ensure_user_account(p_user_id,instrument.asset_id,'USER_AVAILABLE');
    reserved_account:=finance.ensure_user_account(p_user_id,instrument.asset_id,'USER_RESERVED');
    perform pg_advisory_xact_lock(hashtextextended('vad-wallet:'||p_user_id::text||':'||instrument.asset_id::text,0));
    current_available:=finance.account_balance(available_account);
    if current_available<total_reserve then
      raise exception 'Insufficient available balance including trading fee reserve' using errcode='P0001';
    end if;
    perform finance.transfer(
      instrument.asset_id,available_account,reserved_account,total_reserve,
      'ORDER_RESERVE','reserve:'||p_idempotency_key,'ORDER',p_idempotency_key,
      'Reserve notional and worst-case trading fee for VAD limit order',p_user_id
    );
    insert into trading.orders(
      user_id,instrument_id,outcome_id,side,order_type,limit_price,quantity,
      filled_quantity,reserved_account_id,sequence_number,status,idempotency_key
    ) values(
      p_user_id,p_market_id,p_outcome_id,'BUY','LIMIT',p_price,p_quantity,
      0,reserved_account,seq,'OPEN',p_idempotency_key
    ) returning id,public_id into order_id,order_public_id;
    insert into trading.order_reservations(
      order_id,asset_id,reserved_account_id,initial_reserved,initial_fee_reserved,fee_policy_version_id
    ) values(order_id,instrument.asset_id,reserved_account,required_amount,coalesce(fee_reserve,0),fee_pv);
  else
    perform pg_advisory_xact_lock(hashtextextended('vad-position:'||p_user_id::text||':'||p_market_id::text||':'||p_outcome_id::text,0));
    available_shares:=command.position_available_to_sell(p_user_id,p_market_id,p_outcome_id);
    if available_shares<p_quantity then raise exception 'Insufficient available shares' using errcode='P0001'; end if;
    insert into trading.orders(
      user_id,instrument_id,outcome_id,side,order_type,limit_price,quantity,
      filled_quantity,reserved_account_id,sequence_number,status,idempotency_key
    ) values(
      p_user_id,p_market_id,p_outcome_id,'SELL','LIMIT',p_price,p_quantity,
      0,null,seq,'OPEN',p_idempotency_key
    ) returning id,public_id into order_id,order_public_id;
    insert into trading.share_reservations(order_id,user_id,instrument_id,outcome_id,initial_quantity)
    values(order_id,p_user_id,p_market_id,p_outcome_id,p_quantity);
  end if;

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values(
    'ORDER_PLACED','ORDER',order_public_id::text,
    jsonb_build_object(
      'order_id',order_public_id,'instrument_id',p_market_id,'outcome_id',p_outcome_id,
      'user_id',p_user_id,'side',p_side,'price',p_price,'quantity',p_quantity,
      'fee_reserve',fee_reserve,'market_max_order_notional',risk_policy.order_max_order_notional
    ),
    'order-placed:'||order_public_id::text
  )
  on conflict(idempotency_key) do nothing;

  perform command.match_best_order(order_id);
  return order_public_id;
end;
$function$;

-- Fail closed for automatic evidence markets that do not have a source URL
-- usable by the direct-evidence and domain-scoped corroboration worker. The
-- sports enrichment trigger runs first and can attach its official competition
-- URLs before this guard validates the finished scope.
create or replace function private.require_vad_auto_resolution_source_url()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_scope jsonb := coalesce(new.resolution_scope,'{}'::jsonb);
  v_resolver text := upper(coalesce(v_scope->>'resolver_type',''));
  v_url text := nullif(btrim(coalesce(v_scope->>'source_url',v_scope->>'sourceUrl','')),'');
  v_has_url boolean := false;
begin
  if v_resolver not in ('VAD_REVIEW_V1','AI_EVIDENCE_RULE_V1') then
    return new;
  end if;

  if v_url ~* '^[h][t][t][p][s]://[^/[:space:]]+[.][^/[:space:]]+'
    and v_url !~* '^[h][t][t][p][s]://[0-9]{1,3}([.][0-9]{1,3}){3}([:/]|$)'
    and v_url !~* '[.](local|localhost|test|internal)([:/]|$)' then
    return new;
  end if;

  if jsonb_typeof(v_scope->'sources')='array' then
    select exists (
      select 1
      from jsonb_array_elements_text(v_scope->'sources') as source_value(value)
      where source_value.value ~* '^[h][t][t][p][s]://[^/[:space:]]+[.][^/[:space:]]+'
        and source_value.value !~* '^[h][t][t][p][s]://[0-9]{1,3}([.][0-9]{1,3}){3}([:/]|$)'
        and source_value.value !~* '[.](local|localhost|test|internal)([:/]|$)'
    ) into v_has_url;
  end if;

  if v_has_url then
    return new;
  end if;

  raise exception 'Automatic evidence resolution requires an authoritative HTTPS URL with a public domain. Add the source URL before creating this market.'
    using errcode='22023';
end;
$function$;

drop trigger if exists zzzz_require_vad_auto_resolution_source_url on market.canonical_events;
create trigger zzzz_require_vad_auto_resolution_source_url
before insert or update of resolution_scope,category on market.canonical_events
for each row execute function private.require_vad_auto_resolution_source_url();

revoke all on function private.require_vad_auto_resolution_source_url() from public, anon, authenticated;

-- Permanently retire the old TNGN demo settlement/variant path. Keep the
-- disabled asset, closed/settled market instruments, finance history and guard
-- triggers that reject new TNGN ledger entries/instrument writes.
update public.assets
set status='DISABLED',
    metadata=coalesce(metadata,'{}'::jsonb)
      || jsonb_build_object('retired',true,'retirement_reason','TNGN sandbox removed; historical records retained')
where upper(code)='TNGN';

drop trigger if exists market_catalog_settle_tngn_orders on public.market_catalog;
drop function if exists private.on_tngn_market_resolution_settle();
drop function if exists private.settle_tngn_market_orders(uuid);
drop function if exists private.ensure_tngn_market_variant(uuid);
drop function if exists private.on_market_catalog_tngn_variant_sync();


-- Retire the earlier global preset surface if it was partially installed in an
-- environment. Active per-market risk policies and historical trades are kept.
drop function if exists public.agent_get_market_trade_limit_defaults(text,text,text);
drop function if exists public.admin_get_market_trade_limit_defaults(text,text);
drop function if exists public.admin_save_market_trade_limit_defaults(text,text,numeric,numeric);
drop table if exists market.trade_limit_defaults;

-- Remove the retired user-facing TNGN RPC surface. Historical instrument, ledger,
-- and journal rows are deliberately preserved, along with triggers that prevent
-- mutations of retired TNGN records and the legacy settlement safety hook.
drop function if exists public.admin_set_tngn_demo_mode(boolean);
drop function if exists public.my_tngn_demo_ledger_activity(integer);
drop function if exists public.my_tngn_market_orders();
drop function if exists public.place_tngn_market_stake(uuid,text,numeric,text);
drop function if exists public.tngn_pool_quote(uuid,text,numeric);

commit;
