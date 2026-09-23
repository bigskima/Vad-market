create or replace function public.my_market_onchain_venues(
  p_instrument_public_id uuid
)
returns table(
  venue_id uuid,
  chain_code text,
  chain_name text,
  chain_family text,
  client_adapter text,
  evm_chain_id bigint,
  native_symbol text,
  explorer_url text,
  asset_code text,
  token_standard text,
  token_address text,
  token_decimals smallint,
  representation_type text,
  protocol_key text,
  protocol_version integer,
  contract_address text
)
language plpgsql
stable
security definer
set search_path=''
as $$
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

  if not private.asset_available_in_country(
    v_account.country_code,
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
$$;

revoke all on function public.my_market_onchain_venues(uuid)
  from public,anon;
grant execute on function public.my_market_onchain_venues(uuid)
  to authenticated;
