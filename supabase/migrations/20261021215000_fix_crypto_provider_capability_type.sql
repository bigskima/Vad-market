begin;

create or replace function public.admin_register_crypto_oracle_asset(
  p_symbol text,
  p_coin_gecko_id text,
  p_pyth_feed_symbol text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_symbol text:=upper(btrim(coalesce(p_symbol,'')));
  v_coin_id text:=lower(btrim(coalesce(p_coin_gecko_id,'')));
  v_pyth_symbol text:=btrim(coalesce(p_pyth_feed_symbol,''));
  v_pyth_provider integration.providers;
  v_coin_provider integration.providers;
  v_pyth_existing oracle.provider_resources;
  v_coin_existing oracle.provider_resources;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if v_symbol !~ '^[A-Z0-9]{2,20}$' then
    raise exception 'Choose a valid crypto ticker.' using errcode='22023';
  end if;
  if v_coin_id !~ '^[a-z0-9][a-z0-9-]{1,89}$' then
    raise exception 'Choose a valid CoinGecko asset ID from the live catalogue.' using errcode='22023';
  end if;
  if upper(v_pyth_symbol)<>upper('Crypto.'||v_symbol||'/USD') then
    raise exception 'The Pyth feed symbol must match the exact selected ticker/USD pair.' using errcode='22023';
  end if;
  if char_length(btrim(coalesce(p_reason,'')))<3 then
    raise exception 'Provide a reason for registering the crypto resolution asset.' using errcode='22023';
  end if;

  select * into v_pyth_provider from integration.providers
  where code='PYTH' and provider_type='ORACLE' and environment='PRODUCTION'
    and status in ('ACTIVE','DEGRADED')
    and capabilities @> '["CRYPTO_PRICE_THRESHOLD"]'::jsonb
  limit 1;
  select * into v_coin_provider from integration.providers
  where code='COINGECKO' and provider_type='ORACLE' and environment='PRODUCTION'
    and status in ('ACTIVE','DEGRADED')
    and capabilities @> '["CRYPTO_PRICE_THRESHOLD"]'::jsonb
  limit 1;
  if v_pyth_provider.id is null or v_coin_provider.id is null then
    raise exception 'The approved Pyth and CoinGecko historical price providers must be active.' using errcode='P0001';
  end if;

  select * into v_pyth_existing from oracle.provider_resources
  where provider_id=v_pyth_provider.id and resource_type='CRYPTO_PAIR'
    and canonical_key=v_symbol||'/USD' for update;
  if v_pyth_existing.id is not null
     and (v_pyth_existing.external_key<>('Crypto.'||v_symbol||'/USD')) then
    raise exception 'This ticker is already mapped to a different Pyth feed. Do not overwrite existing Oracle mappings.' using errcode='23505';
  end if;

  select * into v_coin_existing from oracle.provider_resources
  where provider_id=v_coin_provider.id and resource_type='CRYPTO_PAIR'
    and canonical_key=v_symbol||'/USD' for update;
  if v_coin_existing.id is not null and v_coin_existing.external_key<>v_coin_id then
    raise exception 'This ticker is already mapped to a different CoinGecko asset ID. Choose the mapped asset or reconcile the Oracle mapping first.' using errcode='23505';
  end if;

  insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
  values(
    v_pyth_provider.id,'CRYPTO_PAIR',v_symbol||'/USD','Crypto.'||v_symbol||'/USD','ACTIVE',
    jsonb_build_object('quote','USD','settlement_eligible',true,
      'max_timestamp_delta_seconds',120,'historical_mode','EXACT_SYMBOL',
      'discovery','ADMIN_GUIDED_EXACT_PYTH_FEED','registered_by',auth.uid())
  )
  on conflict(provider_id,resource_type,canonical_key) do update set
    status='ACTIVE',
    metadata=oracle.provider_resources.metadata||excluded.metadata,
    updated_at=statement_timestamp()
  where oracle.provider_resources.external_key=excluded.external_key;

  insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
  values(
    v_coin_provider.id,'CRYPTO_PAIR',v_symbol||'/USD',v_coin_id,'ACTIVE',
    jsonb_build_object('quote','USD','settlement_eligible',true,
      'max_timestamp_delta_seconds',600,'historical_mode','RANGE_NEAREST',
      'discovery','ADMIN_GUIDED_COINGECKO_ASSET_ID','registered_by',auth.uid())
  )
  on conflict(provider_id,resource_type,canonical_key) do update set
    status='ACTIVE',
    metadata=oracle.provider_resources.metadata||excluded.metadata,
    updated_at=statement_timestamp()
  where oracle.provider_resources.external_key=excluded.external_key;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','CRYPTO_ORACLE_ASSET_REGISTERED','CRYPTO_PAIR',v_symbol||'/USD',
    btrim(p_reason),jsonb_build_object(
      'symbol',v_symbol,'coin_gecko_id',v_coin_id,'pyth_feed_symbol',v_pyth_symbol,
      'providers',jsonb_build_array('PYTH','COINGECKO')));

  return jsonb_build_object(
    'registered',true,'symbol',v_symbol,'quote','USD',
    'coin_gecko_id',v_coin_id,'pyth_feed_symbol',v_pyth_symbol);
end;
$function$;
revoke all on function public.admin_register_crypto_oracle_asset(text,text,text,text) from public,anon;
grant execute on function public.admin_register_crypto_oracle_asset(text,text,text,text) to authenticated;

commit;
