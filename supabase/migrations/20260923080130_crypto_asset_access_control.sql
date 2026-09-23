
begin;

create or replace function public.admin_set_asset_status(
  p_asset_code text,
  p_status text,
  p_sandbox_only boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_code text:=upper(btrim(coalesce(p_asset_code,'')));
  v_status text:=upper(btrim(coalesce(p_status,'')));
  v_asset public.assets;
begin
  if auth.uid() is null or not private.has_permission('assets.manage') then
    raise exception 'Asset management permission required' using errcode='42501';
  end if;
  if v_status not in ('ACTIVE','DISABLED') then
    raise exception 'Invalid asset status' using errcode='22023';
  end if;

  select * into v_asset from public.assets where code=v_code for update;
  if v_asset.id is null then
    raise exception 'Asset not found' using errcode='P0002';
  end if;

  update public.assets
  set status=v_status,
      metadata=case
        when p_sandbox_only is null then metadata
        else coalesce(metadata,'{}'::jsonb)
          || jsonb_build_object('sandbox_only',p_sandbox_only)
      end,
      updated_at=statement_timestamp()
  where id=v_asset.id
  returning * into v_asset;

  if v_status='DISABLED' then
    update public.jurisdiction_assets
    set status='DISABLED',updated_at=statement_timestamp()
    where asset_id=v_asset.id;
  end if;

  insert into audit.records(
    actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata
  ) values(
    auth.uid(),'ADMIN','ASSET_STATUS_CHANGED','ASSET',v_asset.code,
    'Asset availability changed',
    jsonb_build_object(
      'status',v_asset.status,
      'sandbox_only',lower(coalesce(v_asset.metadata->>'sandbox_only','false'))='true'
    )
  );

  return jsonb_build_object(
    'assetCode',v_asset.code,
    'status',v_asset.status,
    'sandboxOnly',lower(coalesce(v_asset.metadata->>'sandbox_only','false'))='true'
  );
end;
$$;

revoke all on function public.admin_set_asset_status(text,text,boolean)
  from public,anon;
grant execute on function public.admin_set_asset_status(text,text,boolean)
  to authenticated;

create or replace function public.admin_set_jurisdiction_asset_status(
  p_country_code text,
  p_asset_code text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_country text:=upper(btrim(coalesce(p_country_code,'')));
  v_code text:=upper(btrim(coalesce(p_asset_code,'')));
  v_status text:=upper(btrim(coalesce(p_status,'')));
  v_jurisdiction public.jurisdictions;
  v_asset public.assets;
begin
  if auth.uid() is null or not private.has_permission('assets.manage') then
    raise exception 'Asset management permission required' using errcode='42501';
  end if;
  if v_status not in ('ACTIVE','DISABLED') then
    raise exception 'Invalid jurisdiction asset status' using errcode='22023';
  end if;

  select * into v_jurisdiction
  from public.jurisdictions
  where country_code=v_country;

  select * into v_asset
  from public.assets
  where code=v_code;

  if v_jurisdiction.id is null or v_asset.id is null then
    raise exception 'Jurisdiction or asset not found' using errcode='P0002';
  end if;

  if v_status='ACTIVE'
     and (v_jurisdiction.status<>'ACTIVE' or v_asset.status<>'ACTIVE') then
    raise exception 'Activate the jurisdiction and asset before enabling this route'
      using errcode='P0001';
  end if;

  insert into public.jurisdiction_assets(
    jurisdiction_id,asset_id,status
  ) values(
    v_jurisdiction.id,v_asset.id,v_status
  )
  on conflict(jurisdiction_id,asset_id) do update set
    status=excluded.status,
    updated_at=statement_timestamp();

  insert into audit.records(
    actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata
  ) values(
    auth.uid(),'ADMIN','JURISDICTION_ASSET_STATUS_CHANGED','JURISDICTION_ASSET',
    v_jurisdiction.country_code||':'||v_asset.code,
    'Jurisdiction asset availability changed',
    jsonb_build_object('status',v_status)
  );

  return jsonb_build_object(
    'countryCode',v_jurisdiction.country_code,
    'assetCode',v_asset.code,
    'status',v_status
  );
end;
$$;

revoke all on function public.admin_set_jurisdiction_asset_status(text,text,text)
  from public,anon;
grant execute on function public.admin_set_jurisdiction_asset_status(text,text,text)
  to authenticated;

CREATE OR REPLACE FUNCTION public.admin_crypto_network_catalog()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'assets',coalesce((
      select jsonb_agg(jsonb_build_object(
        'code',a.code,
        'name',a.name,
        'assetType',a.asset_type,
        'status',a.status,
        'metadata',a.metadata
      ) order by a.code)
      from public.assets a
      where a.asset_type in ('CRYPTO','STABLECOIN')
    ),'[]'::jsonb),
    'jurisdictionAssets',coalesce((
      select jsonb_agg(jsonb_build_object(
        'countryCode',j.country_code,
        'assetCode',a.code,
        'status',ja.status
      ) order by j.country_code,a.code)
      from public.jurisdiction_assets ja
      join public.jurisdictions j on j.id=ja.jurisdiction_id
      join public.assets a on a.id=ja.asset_id
      where a.asset_type in ('CRYPTO','STABLECOIN')
    ),'[]'::jsonb),
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
$function$;

commit;
