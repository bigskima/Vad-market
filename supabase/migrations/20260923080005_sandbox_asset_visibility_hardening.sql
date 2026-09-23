
begin;

update public.assets
set metadata=coalesce(metadata,'{}'::jsonb)
  || jsonb_build_object(
    'sandbox_only',true,
    'foundation_only',true,
    'sandbox_visibility_hardened_at',statement_timestamp()
  ),
  updated_at=statement_timestamp()
where code='USDC'
  and status='DISABLED';

create or replace function public.my_sandbox_access()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select auth.uid() is not null
    and private.tester_access_satisfies(auth.uid(),'SANDBOX');
$$;

revoke all on function public.my_sandbox_access() from public,anon;
grant execute on function public.my_sandbox_access() to authenticated;

create or replace function private.asset_available_for_user(
  p_user_id uuid,
  p_asset_id bigint
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.user_accounts ua
    join public.jurisdictions j
      on j.country_code=ua.country_code
     and j.status='ACTIVE'
    join public.jurisdiction_assets ja
      on ja.jurisdiction_id=j.id
     and ja.asset_id=p_asset_id
     and ja.status='ACTIVE'
    join public.assets a
      on a.id=ja.asset_id
     and a.status='ACTIVE'
    where ua.user_id=p_user_id
      and ua.status='ACTIVE'
      and (
        lower(coalesce(a.metadata->>'sandbox_only','false'))<>'true'
        or private.tester_access_satisfies(p_user_id,'SANDBOX')
      )
  );
$$;

revoke all on function private.asset_available_for_user(uuid,bigint)
  from public,anon,authenticated;

drop policy if exists market_catalog_anon_read on public.market_catalog;
drop policy if exists market_catalog_authenticated_jurisdiction_read on public.market_catalog;

create policy market_catalog_anon_read
on public.market_catalog
for select
to anon
using (
  status = any(array[
    'OPEN','SUSPENDED','CLOSED','SETTLEMENT_PENDING','SETTLED','VOIDED'
  ]::text[])
  and exists(
    select 1
    from public.assets a
    where a.code=market_catalog.asset_code
      and a.status='ACTIVE'
      and lower(coalesce(a.metadata->>'sandbox_only','false'))<>'true'
  )
);

create policy market_catalog_authenticated_jurisdiction_read
on public.market_catalog
for select
to authenticated
using (
  status = any(array[
    'OPEN','SUSPENDED','CLOSED','SETTLEMENT_PENDING','SETTLED','VOIDED'
  ]::text[])
  and exists (
    select 1
    from public.user_accounts ua
    join public.jurisdictions j
      on j.country_code=ua.country_code
     and j.status='ACTIVE'
    join public.jurisdiction_assets ja
      on ja.jurisdiction_id=j.id
     and ja.status='ACTIVE'
    join public.assets a
      on a.id=ja.asset_id
     and a.status='ACTIVE'
    where ua.user_id=(select auth.uid())
      and ua.status='ACTIVE'
      and a.code=market_catalog.asset_code
      and (
        lower(coalesce(a.metadata->>'sandbox_only','false'))<>'true'
        or public.my_sandbox_access()
      )
  )
);

CREATE OR REPLACE FUNCTION public.create_conviction_post(p_body text, p_post_type text DEFAULT 'ANALYSIS'::text, p_instrument_public_id uuid DEFAULT NULL::uuid, p_stance_outcome_code text DEFAULT NULL::text, p_confidence numeric DEFAULT NULL::numeric, p_media_path text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  acct public.user_accounts;
  instrument market.instruments;
  event_id bigint;
  outcome_code text;
  post_id uuid;
  kind text:=upper(trim(coalesce(p_post_type,'ANALYSIS')));
begin
  acct:=private.require_active_account();
  if not private.capability_enabled('create_post',acct.country_code) then
    raise exception 'Posting is not currently enabled' using errcode='P0001';
  end if;
  if kind not in ('ANALYSIS','PREDICTION','COMMENTARY','SHORT_VIDEO') then
    raise exception 'Invalid post type' using errcode='22023';
  end if;
  if p_body is null or char_length(trim(p_body))<1 or char_length(p_body)>5000 then
    raise exception 'Post must be 1-5000 characters' using errcode='22023';
  end if;
  if p_confidence is not null and (p_confidence<0 or p_confidence>1) then
    raise exception 'Confidence must be between 0 and 1' using errcode='22023';
  end if;

  if not private.asset_code_available_for_user(p_user_id := auth.uid(),p_asset_code := 'NGN')
     and private.text_mentions_ngn(p_body) then
    raise exception 'NGN content is not available for your account location' using errcode='P0001';
  end if;

  if p_instrument_public_id is not null then
    select * into instrument from market.instruments where public_id=p_instrument_public_id;
    if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
    if not private.asset_available_for_user(auth.uid(),instrument.asset_id) then
      raise exception 'This market is not available for your account location' using errcode='P0001';
    end if;
    event_id:=instrument.canonical_event_id;
    if p_stance_outcome_code is not null then
      outcome_code:=upper(trim(p_stance_outcome_code));
      if not exists(select 1 from market.outcomes where instrument_id=instrument.id and code=outcome_code) then
        raise exception 'Stance is not a market outcome' using errcode='22023';
      end if;
    end if;
  elsif p_stance_outcome_code is not null then
    raise exception 'A market is required for an outcome stance' using errcode='22023';
  end if;

  if kind='PREDICTION' and outcome_code is null then
    raise exception 'Prediction posts require a market outcome stance' using errcode='22023';
  end if;

  insert into social.posts(
    author_user_id,post_type,body,media_path,canonical_event_id,
    instrument_id,stance_outcome_code,confidence,status
  )
  values(
    auth.uid(),kind,trim(p_body),nullif(trim(coalesce(p_media_path,'')),''),
    event_id,instrument.id,outcome_code,p_confidence,'PUBLISHED'
  )
  returning public_id into post_id;

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values(
    'SOCIAL_POST_PUBLISHED','SOCIAL_POST',post_id::text,
    jsonb_build_object(
      'post_id',post_id,'author_user_id',auth.uid(),'post_type',kind,
      'instrument_public_id',p_instrument_public_id
    ),
    'social-post:'||post_id::text
  );

  return post_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.home_market_rails()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  acct public.user_accounts;
  f public.featured_market_settings;
  t public.trending_market_settings;
  v jsonb;
  x jsonb;
  y jsonb;
begin
  acct:=private.require_active_account();

  select * into f from public.featured_market_settings where settings_key='HOME_AUTOMATIC';
  select * into t from public.trending_market_settings where settings_key='HOME_TRENDING';

  if f.last_refreshed_at is null
     or f.last_refreshed_at<statement_timestamp()-interval '2 minutes' then
    perform private.refresh_featured_market_rankings();
    select * into f from public.featured_market_settings where settings_key='HOME_AUTOMATIC';
  end if;

  if t.last_refreshed_at is null
     or t.last_refreshed_at<statement_timestamp()-interval '2 minutes' then
    perform private.refresh_trending_market_rankings();
    select * into t from public.trending_market_settings where settings_key='HOME_TRENDING';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'instrument_public_id',c.instrument_public_id,
    'priority',c.priority,
    'published_at',c.published_at
  ) order by c.priority,c.published_at desc),'[]'::jsonb)
  into v
  from public.vad_market_curations c
  join market.instruments i on i.public_id=c.instrument_public_id
  where c.active and i.status='OPEN'
    and private.asset_available_for_user(auth.uid(),i.asset_id);

  if coalesce(f.enabled,true) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'instrument_public_id',r.instrument_public_id,
      'rank',r.rank,
      'volume_ngn',r.window_volume_ngn,
      'trade_count',r.trade_count,
      'last_trade_at',r.last_trade_at,
      'calculated_at',r.calculated_at
    ) order by r.rank),'[]'::jsonb)
    into x
    from public.featured_market_rankings r
    join market.instruments i on i.public_id=r.instrument_public_id
    where i.status='OPEN'
      and private.asset_available_for_user(auth.uid(),i.asset_id)
      and r.window_volume_ngn>=f.minimum_volume_ngn
      and r.rank<=f.max_markets;
  else
    x:='[]'::jsonb;
  end if;

  if coalesce(t.enabled,true) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'instrument_public_id',r.instrument_public_id,
      'rank',r.rank,
      'momentum_score',r.momentum_score,
      'volume_ngn',r.short_volume_ngn,
      'trade_count',r.short_trade_count,
      'unique_traders',r.short_unique_traders,
      'volume_acceleration',r.volume_acceleration,
      'trade_acceleration',r.trade_acceleration,
      'price_movement',r.price_movement,
      'last_trade_at',r.last_trade_at,
      'calculated_at',r.calculated_at
    ) order by r.rank),'[]'::jsonb)
    into y
    from public.trending_market_rankings r
    join market.instruments i on i.public_id=r.instrument_public_id
    where i.status='OPEN'
      and private.asset_available_for_user(auth.uid(),i.asset_id)
      and r.rank<=t.max_markets;
  else
    y:='[]'::jsonb;
  end if;

  return jsonb_build_object(
    'vadMarkets',coalesce(v,'[]'::jsonb),
    'featuredMarkets',coalesce(x,'[]'::jsonb),
    'trendingMarkets',coalesce(y,'[]'::jsonb),
    'featuredSettings',jsonb_build_object(
      'enabled',coalesce(f.enabled,true),
      'minimumVolumeNgn',coalesce(f.minimum_volume_ngn,1000000),
      'windowHours',coalesce(f.window_hours,24),
      'maxMarkets',coalesce(f.max_markets,20),
      'lastRefreshedAt',f.last_refreshed_at
    ),
    'trendingSettings',jsonb_build_object(
      'enabled',coalesce(t.enabled,true),
      'windowMinutes',coalesce(t.window_minutes,60),
      'baselineHours',coalesce(t.baseline_hours,6),
      'minimumVolumeNgn',coalesce(t.minimum_volume_ngn,100000),
      'minimumTrades',coalesce(t.minimum_trades,5),
      'minimumUniqueTraders',coalesce(t.minimum_unique_traders,3),
      'minimumAcceleration',coalesce(t.minimum_acceleration,1.5),
      'maxMarkets',coalesce(t.max_markets,12),
      'lastRefreshedAt',t.last_refreshed_at
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.my_market_onchain_venues(p_instrument_public_id uuid)
 RETURNS TABLE(venue_id uuid, chain_code text, chain_name text, chain_family text, client_adapter text, evm_chain_id bigint, native_symbol text, explorer_url text, asset_code text, token_standard text, token_address text, token_decimals smallint, representation_type text, protocol_key text, protocol_version integer, contract_address text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_account public.user_accounts;
  v_instrument market.instruments;
begin
  v_account:=private.require_active_account();

  select i.* into v_instrument
  from market.instruments i
  where i.public_id=p_instrument_public_id;

  if v_instrument.id is null then
    raise exception 'Market not found' using errcode='P0002';
  end if;

  if not private.asset_available_for_user(
    auth.uid(),
    v_instrument.asset_id
  ) then
    return;
  end if;

  return query
  select
    iv.public_id,
    c.code,
    c.name,
    c.chain_family,
    c.client_adapter,
    c.evm_chain_id,
    c.native_symbol,
    c.explorer_url,
    a.code,
    ar.token_standard,
    ar.token_address,
    ar.decimals,
    ar.representation_type,
    cd.protocol_key,
    cd.protocol_version,
    cd.contract_address
  from market.instrument_venues iv
  join blockchain.chains c
    on c.id=iv.chain_id
   and c.status='ACTIVE'
  join blockchain.asset_representations ar
    on ar.id=iv.asset_representation_id
   and ar.chain_id=c.id
   and ar.asset_id=v_instrument.asset_id
   and ar.status='ACTIVE'
  join public.assets a
    on a.id=ar.asset_id
   and a.status='ACTIVE'
  join blockchain.contract_deployments cd
    on cd.id=iv.contract_deployment_id
   and cd.chain_id=c.id
   and cd.protocol_key='VAD_SETTLEMENT_V1'
   and cd.protocol_version=1
   and cd.status='ACTIVE'
  join public.jurisdictions j
    on j.country_code=v_account.country_code
   and j.status='ACTIVE'
  join blockchain.jurisdiction_chains jc
    on jc.jurisdiction_id=j.id
   and jc.chain_id=c.id
   and jc.status='ACTIVE'
  where iv.instrument_id=v_instrument.id
    and iv.settlement_type='ONCHAIN'
    and iv.status='ACTIVE'
  order by
    case c.chain_family when 'EVM' then 0 when 'SOLANA' then 1 else 9 end,
    c.name;
end;
$function$;

commit;
