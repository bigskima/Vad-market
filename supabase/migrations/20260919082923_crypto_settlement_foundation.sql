begin;

create schema if not exists blockchain;
revoke all on schema blockchain from public, anon, authenticated;
grant usage on schema blockchain to service_role;

alter default privileges in schema blockchain
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema blockchain
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema blockchain
  grant all on tables to service_role;
alter default privileges in schema blockchain
  grant usage, select on sequences to service_role;
alter default privileges in schema blockchain
  grant execute on functions to service_role;

alter table integration.providers
  drop constraint if exists providers_provider_type_check;
alter table integration.providers
  add constraint providers_provider_type_check
  check (provider_type in (
    'PAYMENT','IDENTITY_VERIFICATION','ORACLE','AI','NOTIFICATION',
    'BLOCKCHAIN_RPC','CHAIN_INDEXER'
  ));

create table if not exists blockchain.chains (
  id bigint generated always as identity primary key,
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name text not null check (char_length(name) between 2 and 100),
  chain_family text not null check (chain_family ~ '^[A-Z][A-Z0-9_]*$'),
  client_adapter text not null check (client_adapter ~ '^[A-Z][A-Z0-9_]*$'),
  evm_chain_id bigint,
  native_symbol text not null check (char_length(native_symbol) between 1 and 16),
  explorer_url text,
  status text not null default 'DISABLED'
    check (status in ('ACTIVE','DISABLED','SUSPENDED')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint blockchain_chains_explorer_https
    check (explorer_url is null or explorer_url ~ '^https://')
);

create unique index if not exists blockchain_chains_evm_chain_id_unique
  on blockchain.chains(evm_chain_id)
  where evm_chain_id is not null;

drop trigger if exists blockchain_chains_set_updated_at on blockchain.chains;
create trigger blockchain_chains_set_updated_at
before update on blockchain.chains
for each row execute function private.set_updated_at();

alter table blockchain.chains enable row level security;

create table if not exists blockchain.asset_representations (
  id bigint generated always as identity primary key,
  chain_id bigint not null references blockchain.chains(id) on delete restrict,
  asset_id bigint not null references public.assets(id) on delete restrict,
  token_standard text not null check (token_standard ~ '^[A-Z][A-Z0-9_-]*$'),
  token_address text not null check (char_length(btrim(token_address)) between 3 and 160),
  decimals smallint not null check (decimals between 0 and 18),
  representation_type text not null
    check (representation_type in ('NATIVE','BRIDGED','WRAPPED','THIRD_PARTY')),
  issuer text,
  status text not null default 'DISABLED'
    check (status in ('ACTIVE','DISABLED','SUSPENDED')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique(chain_id, asset_id, token_address)
);

create index if not exists blockchain_asset_representations_lookup_idx
  on blockchain.asset_representations(chain_id, asset_id, status);

drop trigger if exists blockchain_asset_representations_set_updated_at on blockchain.asset_representations;
create trigger blockchain_asset_representations_set_updated_at
before update on blockchain.asset_representations
for each row execute function private.set_updated_at();

alter table blockchain.asset_representations enable row level security;

create table if not exists blockchain.contract_deployments (
  id bigint generated always as identity primary key,
  chain_id bigint not null references blockchain.chains(id) on delete restrict,
  protocol_key text not null check (protocol_key ~ '^[A-Z][A-Z0-9_]*$'),
  protocol_version integer not null check (protocol_version > 0),
  contract_address text not null check (char_length(btrim(contract_address)) between 3 and 200),
  status text not null default 'DISABLED'
    check (status in ('ACTIVE','DISABLED','SUSPENDED','RETIRED')),
  deployed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique(chain_id, protocol_key, protocol_version)
);

drop trigger if exists blockchain_contract_deployments_set_updated_at on blockchain.contract_deployments;
create trigger blockchain_contract_deployments_set_updated_at
before update on blockchain.contract_deployments
for each row execute function private.set_updated_at();

alter table blockchain.contract_deployments enable row level security;

create table if not exists blockchain.jurisdiction_chains (
  jurisdiction_id bigint not null references public.jurisdictions(id) on delete cascade,
  chain_id bigint not null references blockchain.chains(id) on delete cascade,
  status text not null default 'DISABLED'
    check (status in ('ACTIVE','DISABLED','SUSPENDED')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key(jurisdiction_id, chain_id)
);

create index if not exists blockchain_jurisdiction_chains_chain_idx
  on blockchain.jurisdiction_chains(chain_id, status);

drop trigger if exists blockchain_jurisdiction_chains_set_updated_at on blockchain.jurisdiction_chains;
create trigger blockchain_jurisdiction_chains_set_updated_at
before update on blockchain.jurisdiction_chains
for each row execute function private.set_updated_at();

alter table blockchain.jurisdiction_chains enable row level security;

create table if not exists blockchain.wallet_connections (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  chain_family text not null check (chain_family ~ '^[A-Z][A-Z0-9_]*$'),
  wallet_provider text,
  wallet_address text not null check (char_length(btrim(wallet_address)) between 3 and 200),
  status text not null default 'PENDING'
    check (status in ('PENDING','VERIFIED','REVOKED')),
  proof_method text,
  verified_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint blockchain_wallet_connection_state check (
    (status='VERIFIED' and verified_at is not null and revoked_at is null)
    or (status='REVOKED' and revoked_at is not null)
    or (status='PENDING' and verified_at is null and revoked_at is null)
  ),
  unique(user_id, chain_family, wallet_address)
);

create index if not exists blockchain_wallet_connections_user_status_idx
  on blockchain.wallet_connections(user_id, status, updated_at desc);

drop trigger if exists blockchain_wallet_connections_set_updated_at on blockchain.wallet_connections;
create trigger blockchain_wallet_connections_set_updated_at
before update on blockchain.wallet_connections
for each row execute function private.set_updated_at();

alter table blockchain.wallet_connections enable row level security;

create table if not exists market.instrument_venues (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  instrument_id bigint not null references market.instruments(id) on delete cascade,
  settlement_type text not null
    check (settlement_type in ('INTERNAL_LEDGER','ONCHAIN')),
  chain_id bigint references blockchain.chains(id) on delete restrict,
  asset_representation_id bigint references blockchain.asset_representations(id) on delete restrict,
  contract_deployment_id bigint references blockchain.contract_deployments(id) on delete restrict,
  status text not null default 'DISABLED'
    check (status in ('ACTIVE','DISABLED','SUSPENDED','CLOSED')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint instrument_venue_settlement_shape check (
    (
      settlement_type='INTERNAL_LEDGER'
      and chain_id is null
      and asset_representation_id is null
      and contract_deployment_id is null
    )
    or
    (
      settlement_type='ONCHAIN'
      and chain_id is not null
      and asset_representation_id is not null
      and contract_deployment_id is not null
    )
  )
);

create unique index if not exists market_instrument_venues_internal_unique
  on market.instrument_venues(instrument_id)
  where settlement_type='INTERNAL_LEDGER';

create unique index if not exists market_instrument_venues_chain_unique
  on market.instrument_venues(instrument_id, chain_id)
  where settlement_type='ONCHAIN';

drop trigger if exists market_instrument_venues_set_updated_at on market.instrument_venues;
create trigger market_instrument_venues_set_updated_at
before update on market.instrument_venues
for each row execute function private.set_updated_at();

alter table market.instrument_venues enable row level security;

create or replace function private.validate_instrument_venue()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_instrument_asset_id bigint;
  v_rep_chain_id bigint;
  v_rep_asset_id bigint;
  v_deployment_chain_id bigint;
begin
  if new.settlement_type='INTERNAL_LEDGER' then
    return new;
  end if;

  select i.asset_id into v_instrument_asset_id
  from market.instruments i
  where i.id=new.instrument_id;

  select ar.chain_id, ar.asset_id
    into v_rep_chain_id, v_rep_asset_id
  from blockchain.asset_representations ar
  where ar.id=new.asset_representation_id;

  select cd.chain_id into v_deployment_chain_id
  from blockchain.contract_deployments cd
  where cd.id=new.contract_deployment_id;

  if v_instrument_asset_id is null
     or v_rep_chain_id is distinct from new.chain_id
     or v_rep_asset_id is distinct from v_instrument_asset_id
     or v_deployment_chain_id is distinct from new.chain_id then
    raise exception 'On-chain venue configuration does not match the market asset and chain'
      using errcode='23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_instrument_venue()
  from public, anon, authenticated;

drop trigger if exists market_instrument_venues_validate on market.instrument_venues;
create trigger market_instrument_venues_validate
before insert or update on market.instrument_venues
for each row execute function private.validate_instrument_venue();

create or replace function public.my_crypto_networks()
returns table(
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
  asset_decimals smallint,
  representation_type text
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_account public.user_accounts;
begin
  v_account:=private.require_active_account();

  return query
  select
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
    ar.representation_type
  from public.jurisdictions j
  join public.jurisdiction_assets ja
    on ja.jurisdiction_id=j.id and ja.status='ACTIVE'
  join public.assets a
    on a.id=ja.asset_id
   and a.status='ACTIVE'
   and a.asset_type in ('STABLECOIN','CRYPTO')
  join blockchain.jurisdiction_chains jc
    on jc.jurisdiction_id=j.id and jc.status='ACTIVE'
  join blockchain.chains c
    on c.id=jc.chain_id and c.status='ACTIVE'
  join blockchain.asset_representations ar
    on ar.chain_id=c.id
   and ar.asset_id=a.id
   and ar.status='ACTIVE'
  where j.country_code=v_account.country_code
    and j.status='ACTIVE'
  order by a.code,c.name;
end;
$$;

revoke all on function public.my_crypto_networks() from public, anon;
grant execute on function public.my_crypto_networks() to authenticated;

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
     ) then
    raise exception 'Asset or provider management permission required'
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
      ) order by c.name)
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
      ) order by a.code,c.name)
      from blockchain.asset_representations ar
      join blockchain.chains c on c.id=ar.chain_id
      join public.assets a on a.id=ar.asset_id
    ),'[]'::jsonb),
    'jurisdictions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'countryCode',j.country_code,
        'chainCode',c.code,
        'status',jc.status
      ) order by j.country_code,c.code)
      from blockchain.jurisdiction_chains jc
      join public.jurisdictions j on j.id=jc.jurisdiction_id
      join blockchain.chains c on c.id=jc.chain_id
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_crypto_network_catalog() from public, anon;
grant execute on function public.admin_crypto_network_catalog() to authenticated;

create or replace function public.admin_upsert_crypto_chain(
  p_code text,
  p_name text,
  p_chain_family text,
  p_client_adapter text,
  p_evm_chain_id bigint,
  p_native_symbol text,
  p_explorer_url text,
  p_status text default 'DISABLED',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_code text:=upper(btrim(coalesce(p_code,'')));
  v_family text:=upper(btrim(coalesce(p_chain_family,'')));
  v_adapter text:=upper(btrim(coalesce(p_client_adapter,'')));
  v_status text:=upper(btrim(coalesce(p_status,'DISABLED')));
  v_row blockchain.chains;
begin
  if auth.uid() is null or not private.has_permission('assets.manage') then
    raise exception 'Asset management permission required' using errcode='42501';
  end if;
  if v_code !~ '^[A-Z][A-Z0-9_]*$'
     or v_family !~ '^[A-Z][A-Z0-9_]*$'
     or v_adapter !~ '^[A-Z][A-Z0-9_]*$' then
    raise exception 'Invalid crypto network configuration' using errcode='22023';
  end if;
  if v_status not in ('ACTIVE','DISABLED','SUSPENDED') then
    raise exception 'Invalid crypto network status' using errcode='22023';
  end if;
  if v_status='ACTIVE' and v_adapter not in ('EVM_V1','SOLANA_V1') then
    raise exception 'This client adapter is not supported by the current VAD application'
      using errcode='P0001';
  end if;
  if v_status='ACTIVE' and v_adapter='EVM_V1' and p_evm_chain_id is null then
    raise exception 'An EVM chain ID is required before this network can be activated'
      using errcode='22023';
  end if;

  insert into blockchain.chains(
    code,name,chain_family,client_adapter,evm_chain_id,native_symbol,
    explorer_url,status,metadata
  ) values(
    v_code,btrim(p_name),v_family,v_adapter,p_evm_chain_id,btrim(p_native_symbol),
    nullif(btrim(coalesce(p_explorer_url,'')),''),v_status,coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict(code) do update set
    name=excluded.name,
    chain_family=excluded.chain_family,
    client_adapter=excluded.client_adapter,
    evm_chain_id=excluded.evm_chain_id,
    native_symbol=excluded.native_symbol,
    explorer_url=excluded.explorer_url,
    status=excluded.status,
    metadata=excluded.metadata,
    updated_at=statement_timestamp()
  returning * into v_row;

  insert into audit.records(
    actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata
  ) values(
    auth.uid(),'ADMIN','CRYPTO_CHAIN_CONFIGURED','BLOCKCHAIN_CHAIN',
    v_row.code,'Crypto network configuration changed',
    jsonb_build_object('status',v_row.status,'client_adapter',v_row.client_adapter,'evm_chain_id',v_row.evm_chain_id)
  );

  return jsonb_build_object(
    'code',v_row.code,'status',v_row.status,'clientAdapter',v_row.client_adapter,
    'evmChainId',v_row.evm_chain_id
  );
end;
$$;

revoke all on function public.admin_upsert_crypto_chain(
  text,text,text,text,bigint,text,text,text,jsonb
) from public, anon;
grant execute on function public.admin_upsert_crypto_chain(
  text,text,text,text,bigint,text,text,text,jsonb
) to authenticated;

create or replace function public.admin_upsert_chain_asset(
  p_chain_code text,
  p_asset_code text,
  p_token_standard text,
  p_token_address text,
  p_decimals smallint,
  p_representation_type text,
  p_issuer text default null,
  p_status text default 'DISABLED',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_chain blockchain.chains;
  v_asset public.assets;
  v_status text:=upper(btrim(coalesce(p_status,'DISABLED')));
  v_type text:=upper(btrim(coalesce(p_representation_type,'')));
  v_row blockchain.asset_representations;
begin
  if auth.uid() is null or not private.has_permission('assets.manage') then
    raise exception 'Asset management permission required' using errcode='42501';
  end if;

  select * into v_chain from blockchain.chains where code=upper(btrim(p_chain_code));
  select * into v_asset from public.assets where code=upper(btrim(p_asset_code));
  if v_chain.id is null or v_asset.id is null then
    raise exception 'Unknown chain or asset' using errcode='P0002';
  end if;
  if v_status not in ('ACTIVE','DISABLED','SUSPENDED')
     or v_type not in ('NATIVE','BRIDGED','WRAPPED','THIRD_PARTY') then
    raise exception 'Invalid chain asset configuration' using errcode='22023';
  end if;

  insert into blockchain.asset_representations(
    chain_id,asset_id,token_standard,token_address,decimals,
    representation_type,issuer,status,metadata
  ) values(
    v_chain.id,v_asset.id,upper(btrim(p_token_standard)),btrim(p_token_address),
    p_decimals,v_type,nullif(btrim(coalesce(p_issuer,'')),''),v_status,
    coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict(chain_id,asset_id,token_address) do update set
    token_standard=excluded.token_standard,
    decimals=excluded.decimals,
    representation_type=excluded.representation_type,
    issuer=excluded.issuer,
    status=excluded.status,
    metadata=excluded.metadata,
    updated_at=statement_timestamp()
  returning * into v_row;

  insert into audit.records(
    actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata
  ) values(
    auth.uid(),'ADMIN','CRYPTO_ASSET_REPRESENTATION_CONFIGURED','BLOCKCHAIN_ASSET',
    v_row.id::text,'Chain-specific asset configuration changed',
    jsonb_build_object(
      'chain_code',v_chain.code,'asset_code',v_asset.code,
      'status',v_row.status,'representation_type',v_row.representation_type
    )
  );

  return jsonb_build_object(
    'chainCode',v_chain.code,'assetCode',v_asset.code,
    'status',v_row.status,'representationType',v_row.representation_type
  );
end;
$$;

revoke all on function public.admin_upsert_chain_asset(
  text,text,text,text,smallint,text,text,text,jsonb
) from public, anon;
grant execute on function public.admin_upsert_chain_asset(
  text,text,text,text,smallint,text,text,text,jsonb
) to authenticated;

create or replace function public.admin_set_jurisdiction_chain_status(
  p_country_code text,
  p_chain_code text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_jurisdiction public.jurisdictions;
  v_chain blockchain.chains;
  v_status text:=upper(btrim(coalesce(p_status,'')));
begin
  if auth.uid() is null or not private.has_permission('assets.manage') then
    raise exception 'Asset management permission required' using errcode='42501';
  end if;
  if v_status not in ('ACTIVE','DISABLED','SUSPENDED') then
    raise exception 'Invalid jurisdiction chain status' using errcode='22023';
  end if;

  select * into v_jurisdiction
  from public.jurisdictions
  where country_code=upper(btrim(p_country_code));

  select * into v_chain
  from blockchain.chains
  where code=upper(btrim(p_chain_code));

  if v_jurisdiction.id is null or v_chain.id is null then
    raise exception 'Unknown jurisdiction or chain' using errcode='P0002';
  end if;

  if v_status='ACTIVE' and v_chain.status<>'ACTIVE' then
    raise exception 'Activate the chain globally before enabling it for a jurisdiction'
      using errcode='P0001';
  end if;

  insert into blockchain.jurisdiction_chains(
    jurisdiction_id,chain_id,status
  ) values(v_jurisdiction.id,v_chain.id,v_status)
  on conflict(jurisdiction_id,chain_id) do update set
    status=excluded.status,
    updated_at=statement_timestamp();

  insert into audit.records(
    actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata
  ) values(
    auth.uid(),'ADMIN','JURISDICTION_CRYPTO_CHAIN_STATUS_CHANGED','JURISDICTION_CHAIN',
    v_jurisdiction.country_code||':'||v_chain.code,
    'Jurisdiction crypto network availability changed',
    jsonb_build_object('status',v_status)
  );

  return jsonb_build_object(
    'countryCode',v_jurisdiction.country_code,
    'chainCode',v_chain.code,
    'status',v_status
  );
end;
$$;

revoke all on function public.admin_set_jurisdiction_chain_status(text,text,text)
  from public, anon;
grant execute on function public.admin_set_jurisdiction_chain_status(text,text,text)
  to authenticated;

insert into blockchain.chains(
  code,name,chain_family,client_adapter,evm_chain_id,native_symbol,explorer_url,status,metadata
) values
  ('BASE','Base','EVM','EVM_V1',8453,'ETH','https://basescan.org','DISABLED',
   '{"launch_candidate":true}'::jsonb),
  ('POLYGON','Polygon PoS','EVM','EVM_V1',137,'POL','https://polygonscan.com','DISABLED',
   '{"launch_candidate":true}'::jsonb),
  ('BSC','BNB Smart Chain','EVM','EVM_V1',56,'BNB','https://bscscan.com','DISABLED',
   '{"launch_candidate":true,"usdc_representation_requires_approval":true}'::jsonb),
  ('SOLANA','Solana','SOLANA','SOLANA_V1',null,'SOL','https://solscan.io','DISABLED',
   '{"launch_candidate":true}'::jsonb),
  ('ARC','Arc','EVM','EVM_V1',null,'USDC',null,'DISABLED',
   '{"launch_candidate":true,"requires_chain_id_before_activation":true}'::jsonb)
on conflict(code) do nothing;

insert into blockchain.asset_representations(
  chain_id,asset_id,token_standard,token_address,decimals,
  representation_type,issuer,status,metadata
)
select c.id,a.id,v.token_standard,v.token_address,6,'NATIVE','CIRCLE','DISABLED',v.metadata
from public.assets a
join (
  values
    ('BASE','ERC20','0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      '{"source":"Circle official USDC network listing","verified_for_launch":true}'::jsonb),
    ('POLYGON','ERC20','0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
      '{"source":"Circle official USDC network listing","verified_for_launch":true}'::jsonb),
    ('SOLANA','SPL','EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      '{"source":"Circle official USDC network listing","verified_for_launch":true}'::jsonb)
) as v(chain_code,token_standard,token_address,metadata) on true
join blockchain.chains c on c.code=v.chain_code
where a.code='USDC'
on conflict(chain_id,asset_id,token_address) do nothing;

insert into blockchain.jurisdiction_chains(jurisdiction_id,chain_id,status,metadata)
select j.id,c.id,'DISABLED','{"launch_candidate":true}'::jsonb
from public.jurisdictions j
cross join blockchain.chains c
where j.country_code='NG'
  and c.code in ('BASE','POLYGON','BSC','SOLANA','ARC')
on conflict(jurisdiction_id,chain_id) do nothing;

grant select, insert, update, delete on all tables in schema blockchain to service_role;
grant usage, select on all sequences in schema blockchain to service_role;

commit;
