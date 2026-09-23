begin;

-- VAD USDC sandbox control plane.
-- Testnet records are deliberately DISABLED on creation. Activating a chain,
-- token representation, jurisdiction route, contract deployment, and market
-- venue remains an explicit Admin action.

insert into blockchain.chains(
  code,name,chain_family,client_adapter,evm_chain_id,native_symbol,
  explorer_url,status,metadata
) values
  (
    'BASE_SEPOLIA','Base Sepolia','EVM','EVM_V1',84532,'ETH',
    'https://sepolia.basescan.org','DISABLED',
    '{"environment":"SANDBOX","network_kind":"TESTNET","launch_candidate":true,"official_usdc_available":true}'::jsonb
  ),
  (
    'POLYGON_AMOY','Polygon Amoy','EVM','EVM_V1',80002,'POL',
    'https://amoy.polygonscan.com','DISABLED',
    '{"environment":"SANDBOX","network_kind":"TESTNET","launch_candidate":true,"official_usdc_available":true}'::jsonb
  ),
  (
    'BSC_TESTNET','BNB Smart Chain Testnet','EVM','EVM_V1',97,'BNB',
    'https://testnet.bscscan.com','DISABLED',
    '{"environment":"SANDBOX","network_kind":"TESTNET","launch_candidate":true,"official_usdc_available":false,"usdc_representation_requires_approval":true}'::jsonb
  ),
  (
    'ARC_TESTNET','Arc Testnet','EVM','EVM_V1',5042002,'USDC',
    'https://testnet.arcscan.app','DISABLED',
    '{"environment":"SANDBOX","network_kind":"TESTNET","launch_candidate":true,"official_usdc_available":true,"usdc_native_gas":true}'::jsonb
  ),
  (
    'SOLANA_DEVNET','Solana Devnet','SOLANA','SOLANA_V1',null,'SOL',
    'https://solscan.io/?cluster=devnet','DISABLED',
    '{"environment":"SANDBOX","network_kind":"DEVNET","launch_candidate":true,"official_usdc_available":true}'::jsonb
  )
on conflict(code) do update set
  name=excluded.name,
  chain_family=excluded.chain_family,
  client_adapter=excluded.client_adapter,
  evm_chain_id=excluded.evm_chain_id,
  native_symbol=excluded.native_symbol,
  explorer_url=excluded.explorer_url,
  metadata=blockchain.chains.metadata||excluded.metadata,
  updated_at=statement_timestamp();

insert into blockchain.asset_representations(
  chain_id,asset_id,token_standard,token_address,decimals,
  representation_type,issuer,status,metadata
)
select
  c.id,a.id,v.token_standard,v.token_address,6,
  'NATIVE','CIRCLE','DISABLED',v.metadata
from public.assets a
join (
  values
    (
      'BASE_SEPOLIA','ERC20',
      '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      '{"environment":"SANDBOX","source":"Circle official testnet configuration","verified_for_sandbox":true}'::jsonb
    ),
    (
      'POLYGON_AMOY','ERC20',
      '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
      '{"environment":"SANDBOX","source":"Circle official testnet configuration","verified_for_sandbox":true}'::jsonb
    ),
    (
      'ARC_TESTNET','ERC20',
      '0x3600000000000000000000000000000000000000',
      '{"environment":"SANDBOX","source":"Circle Arc official testnet configuration","verified_for_sandbox":true,"native_gas_token":true}'::jsonb
    ),
    (
      'SOLANA_DEVNET','SPL',
      '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
      '{"environment":"SANDBOX","source":"Circle official Solana Devnet configuration","verified_for_sandbox":true}'::jsonb
    )
) as v(chain_code,token_standard,token_address,metadata) on true
join blockchain.chains c on c.code=v.chain_code
where a.code='USDC'
on conflict(chain_id,asset_id,token_address) do update set
  token_standard=excluded.token_standard,
  decimals=excluded.decimals,
  representation_type=excluded.representation_type,
  issuer=excluded.issuer,
  metadata=blockchain.asset_representations.metadata||excluded.metadata,
  updated_at=statement_timestamp();

insert into blockchain.jurisdiction_chains(
  jurisdiction_id,chain_id,status,metadata
)
select
  j.id,c.id,'DISABLED',
  jsonb_build_object(
    'environment','SANDBOX',
    'created_for','USDC_TESTNET_VALIDATION'
  )
from public.jurisdictions j
cross join blockchain.chains c
where c.code in (
  'BASE_SEPOLIA','POLYGON_AMOY','BSC_TESTNET','ARC_TESTNET','SOLANA_DEVNET'
)
on conflict(jurisdiction_id,chain_id) do nothing;

create or replace function public.admin_upsert_contract_deployment(
  p_chain_code text,
  p_protocol_key text,
  p_protocol_version integer,
  p_contract_address text,
  p_status text default 'DISABLED',
  p_deployed_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_chain blockchain.chains;
  v_protocol text:=upper(btrim(coalesce(p_protocol_key,'')));
  v_status text:=upper(btrim(coalesce(p_status,'DISABLED')));
  v_address text:=btrim(coalesce(p_contract_address,''));
  v_metadata jsonb:=coalesce(p_metadata,'{}'::jsonb);
  v_row blockchain.contract_deployments;
  v_quote_signer text;
  v_settlement_signer text;
  v_resolver text;
  v_treasury text;
  v_vad_signer text;
begin
  if auth.uid() is null or not private.has_permission('assets.manage') then
    raise exception 'Asset management permission required' using errcode='42501';
  end if;

  select * into v_chain
  from blockchain.chains
  where code=upper(btrim(coalesce(p_chain_code,'')));

  if v_chain.id is null then
    raise exception 'Unknown blockchain network' using errcode='P0002';
  end if;
  if v_protocol !~ '^[A-Z][A-Z0-9_]*$'
     or p_protocol_version is null
     or p_protocol_version<=0 then
    raise exception 'Invalid settlement protocol configuration' using errcode='22023';
  end if;
  if v_status not in ('ACTIVE','DISABLED','SUSPENDED','RETIRED') then
    raise exception 'Invalid contract deployment status' using errcode='22023';
  end if;
  if jsonb_typeof(v_metadata)<>'object' then
    raise exception 'Contract metadata must be an object' using errcode='22023';
  end if;

  if v_chain.chain_family='EVM' then
    if v_address !~ '^0x[0-9a-fA-F]{40}$' then
      raise exception 'EVM contract address is invalid' using errcode='22023';
    end if;
  elsif v_chain.chain_family='SOLANA' then
    if v_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
      raise exception 'Solana program address is invalid' using errcode='22023';
    end if;
  else
    raise exception 'Unsupported settlement chain family' using errcode='P0001';
  end if;

  if v_status='ACTIVE' and v_chain.status<>'ACTIVE' then
    raise exception 'Activate the blockchain network before activating a deployment'
      using errcode='P0001';
  end if;

  if v_protocol='VAD_SETTLEMENT_V1' and p_protocol_version=1 then
    if v_chain.chain_family='EVM' then
      v_quote_signer:=lower(btrim(coalesce(v_metadata->>'quote_signer_address','')));
      v_settlement_signer:=lower(btrim(coalesce(v_metadata->>'settlement_signer_address','')));
      v_resolver:=lower(btrim(coalesce(v_metadata->>'resolver_address','')));
      v_treasury:=lower(btrim(coalesce(v_metadata->>'treasury_address','')));

      if v_quote_signer !~ '^0x[0-9a-f]{40}$'
         or v_settlement_signer !~ '^0x[0-9a-f]{40}$'
         or v_resolver !~ '^0x[0-9a-f]{40}$'
         or v_treasury !~ '^0x[0-9a-f]{40}$' then
        raise exception 'VAD Settlement V1 EVM deployment metadata is incomplete'
          using errcode='22023';
      end if;
    else
      v_vad_signer:=btrim(coalesce(v_metadata->>'vad_signer_address',''));
      v_resolver:=btrim(coalesce(v_metadata->>'resolver_authority',''));
      v_treasury:=btrim(coalesce(v_metadata->>'treasury_address',''));

      if v_vad_signer !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
         or v_resolver !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
         or v_treasury !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
        raise exception 'VAD Settlement V1 Solana deployment metadata is incomplete'
          using errcode='22023';
      end if;
    end if;
  end if;

  insert into blockchain.contract_deployments(
    chain_id,protocol_key,protocol_version,contract_address,
    status,deployed_at,metadata
  ) values(
    v_chain.id,v_protocol,p_protocol_version,v_address,
    v_status,p_deployed_at,v_metadata
  )
  on conflict(chain_id,protocol_key,protocol_version) do update set
    contract_address=excluded.contract_address,
    status=excluded.status,
    deployed_at=excluded.deployed_at,
    metadata=excluded.metadata,
    updated_at=statement_timestamp()
  returning * into v_row;

  insert into audit.records(
    actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata
  ) values(
    auth.uid(),'ADMIN','BLOCKCHAIN_CONTRACT_DEPLOYMENT_CONFIGURED',
    'BLOCKCHAIN_CONTRACT_DEPLOYMENT',v_row.id::text,
    'Blockchain settlement deployment configuration changed',
    jsonb_build_object(
      'chain_code',v_chain.code,
      'chain_family',v_chain.chain_family,
      'protocol_key',v_row.protocol_key,
      'protocol_version',v_row.protocol_version,
      'contract_address',v_row.contract_address,
      'status',v_row.status
    )
  );

  return jsonb_build_object(
    'chainCode',v_chain.code,
    'chainFamily',v_chain.chain_family,
    'protocolKey',v_row.protocol_key,
    'protocolVersion',v_row.protocol_version,
    'contractAddress',v_row.contract_address,
    'status',v_row.status,
    'deployedAt',v_row.deployed_at
  );
end;
$$;

revoke all on function public.admin_upsert_contract_deployment(
  text,text,integer,text,text,timestamptz,jsonb
) from public,anon;
grant execute on function public.admin_upsert_contract_deployment(
  text,text,integer,text,text,timestamptz,jsonb
) to authenticated;

create or replace function public.admin_upsert_instrument_onchain_venue(
  p_instrument_public_id uuid,
  p_chain_code text,
  p_protocol_key text default 'VAD_SETTLEMENT_V1',
  p_protocol_version integer default 1,
  p_status text default 'DISABLED',
  p_token_address text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_instrument market.instruments;
  v_asset public.assets;
  v_chain blockchain.chains;
  v_rep blockchain.asset_representations;
  v_deployment blockchain.contract_deployments;
  v_row market.instrument_venues;
  v_status text:=upper(btrim(coalesce(p_status,'DISABLED')));
  v_protocol text:=upper(btrim(coalesce(p_protocol_key,'VAD_SETTLEMENT_V1')));
  v_rep_count bigint;
begin
  if auth.uid() is null
     or not private.has_permission('markets.manage')
     or not private.has_permission('assets.manage') then
    raise exception 'Market and asset management permissions required'
      using errcode='42501';
  end if;
  if p_instrument_public_id is null then
    raise exception 'Market is required' using errcode='22023';
  end if;
  if v_status not in ('ACTIVE','DISABLED','SUSPENDED','CLOSED') then
    raise exception 'Invalid market venue status' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object' then
    raise exception 'Venue metadata must be an object' using errcode='22023';
  end if;

  select * into v_instrument
  from market.instruments
  where public_id=p_instrument_public_id;
  if v_instrument.id is null then
    raise exception 'Market not found' using errcode='P0002';
  end if;

  select * into v_asset
  from public.assets
  where id=v_instrument.asset_id;
  if v_asset.id is null then
    raise exception 'Market settlement asset is unavailable' using errcode='P0002';
  end if;

  select * into v_chain
  from blockchain.chains
  where code=upper(btrim(coalesce(p_chain_code,'')));
  if v_chain.id is null then
    raise exception 'Blockchain network not found' using errcode='P0002';
  end if;

  if nullif(btrim(coalesce(p_token_address,'')),'') is not null then
    select * into v_rep
    from blockchain.asset_representations
    where chain_id=v_chain.id
      and asset_id=v_instrument.asset_id
      and lower(token_address)=lower(btrim(p_token_address))
    order by id
    limit 1;
  else
    select count(*) into v_rep_count
    from blockchain.asset_representations
    where chain_id=v_chain.id
      and asset_id=v_instrument.asset_id
      and status<>'SUSPENDED';

    if v_rep_count<>1 then
      raise exception 'Choose the exact chain-specific settlement token representation'
        using errcode='22023';
    end if;

    select * into v_rep
    from blockchain.asset_representations
    where chain_id=v_chain.id
      and asset_id=v_instrument.asset_id
      and status<>'SUSPENDED'
    order by id
    limit 1;
  end if;

  if v_rep.id is null then
    raise exception 'Approved chain-specific settlement asset not found'
      using errcode='P0002';
  end if;

  select * into v_deployment
  from blockchain.contract_deployments
  where chain_id=v_chain.id
    and protocol_key=v_protocol
    and protocol_version=p_protocol_version;
  if v_deployment.id is null then
    raise exception 'Settlement protocol deployment not found on this network'
      using errcode='P0002';
  end if;

  if v_status='ACTIVE' then
    if v_instrument.status not in ('OPEN','DRAFT','APPROVED') then
      raise exception 'This market state cannot accept a new active on-chain venue'
        using errcode='P0001';
    end if;
    if v_chain.status<>'ACTIVE'
       or v_rep.status<>'ACTIVE'
       or v_deployment.status<>'ACTIVE' then
      raise exception 'Activate the chain, asset representation, and settlement deployment first'
        using errcode='P0001';
    end if;
  end if;

  insert into market.instrument_venues(
    instrument_id,settlement_type,chain_id,asset_representation_id,
    contract_deployment_id,status,metadata
  ) values(
    v_instrument.id,'ONCHAIN',v_chain.id,v_rep.id,
    v_deployment.id,v_status,coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict(instrument_id,chain_id)
    where settlement_type='ONCHAIN'
  do update set
    asset_representation_id=excluded.asset_representation_id,
    contract_deployment_id=excluded.contract_deployment_id,
    status=excluded.status,
    metadata=excluded.metadata,
    updated_at=statement_timestamp()
  returning * into v_row;

  insert into audit.records(
    actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata
  ) values(
    auth.uid(),'ADMIN','ONCHAIN_MARKET_VENUE_CONFIGURED',
    'MARKET_INSTRUMENT_VENUE',v_row.public_id::text,
    'On-chain market settlement venue configuration changed',
    jsonb_build_object(
      'instrument_public_id',v_instrument.public_id,
      'asset_code',v_asset.code,
      'chain_code',v_chain.code,
      'protocol_key',v_deployment.protocol_key,
      'protocol_version',v_deployment.protocol_version,
      'status',v_row.status
    )
  );

  return jsonb_build_object(
    'venueId',v_row.public_id,
    'instrumentPublicId',v_instrument.public_id,
    'assetCode',v_asset.code,
    'chainCode',v_chain.code,
    'protocolKey',v_deployment.protocol_key,
    'protocolVersion',v_deployment.protocol_version,
    'status',v_row.status
  );
end;
$$;

revoke all on function public.admin_upsert_instrument_onchain_venue(
  uuid,text,text,integer,text,text,jsonb
) from public,anon;
grant execute on function public.admin_upsert_instrument_onchain_venue(
  uuid,text,text,integer,text,text,jsonb
) to authenticated;

create or replace function public.admin_crypto_network_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null
     or not (
       private.has_permission('assets.manage')
       or private.has_permission('providers.manage')
       or private.has_permission('markets.manage')
     ) then
    raise exception 'Asset, provider, or market management permission required'
      using errcode='42501';
  end if;

  select jsonb_build_object(
    'chains',coalesce((
      select jsonb_agg(jsonb_build_object(
        'code',c.code,
        'name',c.name,
        'family',c.chain_family,
        'clientAdapter',c.client_adapter,
        'evmChainId',c.evm_chain_id,
        'nativeSymbol',c.native_symbol,
        'explorerUrl',c.explorer_url,
        'status',c.status,
        'metadata',c.metadata
      ) order by
        coalesce(c.metadata->>'environment','PRODUCTION'),
        c.name
      )
      from blockchain.chains c
    ),'[]'::jsonb),
    'assetRepresentations',coalesce((
      select jsonb_agg(jsonb_build_object(
        'chainCode',c.code,
        'assetCode',a.code,
        'tokenStandard',ar.token_standard,
        'tokenAddress',ar.token_address,
        'decimals',ar.decimals,
        'representationType',ar.representation_type,
        'issuer',ar.issuer,
        'status',ar.status,
        'metadata',ar.metadata
      ) order by
        coalesce(c.metadata->>'environment','PRODUCTION'),
        a.code,c.name
      )
      from blockchain.asset_representations ar
      join blockchain.chains c on c.id=ar.chain_id
      join public.assets a on a.id=ar.asset_id
    ),'[]'::jsonb),
    'jurisdictions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'countryCode',j.country_code,
        'chainCode',c.code,
        'status',jc.status,
        'metadata',jc.metadata
      ) order by j.country_code,c.name)
      from blockchain.jurisdiction_chains jc
      join public.jurisdictions j on j.id=jc.jurisdiction_id
      join blockchain.chains c on c.id=jc.chain_id
    ),'[]'::jsonb),
    'contractDeployments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'chainCode',c.code,
        'chainFamily',c.chain_family,
        'protocolKey',cd.protocol_key,
        'protocolVersion',cd.protocol_version,
        'contractAddress',cd.contract_address,
        'status',cd.status,
        'deployedAt',cd.deployed_at,
        'metadata',cd.metadata
      ) order by c.name,cd.protocol_key,cd.protocol_version)
      from blockchain.contract_deployments cd
      join blockchain.chains c on c.id=cd.chain_id
    ),'[]'::jsonb),
    'marketVenues',coalesce((
      select jsonb_agg(jsonb_build_object(
        'venueId',iv.public_id,
        'instrumentPublicId',i.public_id,
        'marketTitle',ce.title,
        'assetCode',a.code,
        'chainCode',c.code,
        'settlementType',iv.settlement_type,
        'protocolKey',cd.protocol_key,
        'protocolVersion',cd.protocol_version,
        'contractAddress',cd.contract_address,
        'status',iv.status,
        'metadata',iv.metadata
      ) order by iv.updated_at desc,iv.id desc)
      from market.instrument_venues iv
      join market.instruments i on i.id=iv.instrument_id
      join market.canonical_events ce on ce.id=i.canonical_event_id
      join public.assets a on a.id=i.asset_id
      left join blockchain.chains c on c.id=iv.chain_id
      left join blockchain.contract_deployments cd on cd.id=iv.contract_deployment_id
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_crypto_network_catalog() from public,anon;
grant execute on function public.admin_crypto_network_catalog() to authenticated;

commit;
