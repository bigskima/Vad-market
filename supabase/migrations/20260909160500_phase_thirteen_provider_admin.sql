-- VAD Phase 13: provider onboarding/control plane without hardcoding a payment vendor.

create or replace function public.admin_provider_readiness()
returns table(provider_code text,provider_type text,environment text,provider_status text,configured boolean,operation text,country_code text,asset_code text,route_status text,priority integer)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.has_permission('providers.manage') and not private.has_permission('finance.read') then raise exception 'Permission required' using errcode='42501'; end if;
  return query
  select p.code,p.provider_type,p.environment,p.status,coalesce((p.public_metadata->>'configured')::boolean,false),r.operation,r.country_code,a.code,r.status,r.priority
  from integration.providers p
  left join integration.provider_routes r on r.provider_id=p.id
  left join public.assets a on a.id=r.asset_id
  order by p.provider_type,p.priority,p.code,r.operation,r.country_code;
end;
$$;
revoke all on function public.admin_provider_readiness() from public,anon;
grant execute on function public.admin_provider_readiness() to authenticated;

create or replace function public.admin_register_provider(
  p_code text,
  p_name text,
  p_provider_type text,
  p_environment text,
  p_capabilities jsonb default '[]'::jsonb,
  p_priority integer default 100,
  p_secret_reference text default null
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare provider_id bigint; code text:=upper(trim(p_code));
begin
  if not private.has_permission('providers.manage') then raise exception 'Permission required' using errcode='42501'; end if;
  if code !~ '^[A-Z][A-Z0-9_]*$' then raise exception 'Invalid provider code' using errcode='22023'; end if;
  if upper(p_provider_type) not in ('PAYMENT','IDENTITY_VERIFICATION','ORACLE','AI','NOTIFICATION') then raise exception 'Invalid provider type' using errcode='22023'; end if;
  if upper(p_environment) not in ('SANDBOX','PRODUCTION') then raise exception 'Invalid environment' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_capabilities,'[]'::jsonb))<>'array' then raise exception 'Capabilities must be an array' using errcode='22023'; end if;

  insert into integration.providers(code,name,provider_type,environment,status,priority,capabilities,public_metadata,secret_reference)
  values(code,trim(p_name),upper(p_provider_type),upper(p_environment),'DISABLED',greatest(coalesce(p_priority,100),0),coalesce(p_capabilities,'[]'::jsonb),'{"configured":false}'::jsonb,nullif(trim(coalesce(p_secret_reference,'')),''))
  on conflict(code,environment) do update set name=excluded.name,provider_type=excluded.provider_type,priority=excluded.priority,capabilities=excluded.capabilities,secret_reference=excluded.secret_reference
  returning id into provider_id;
  return provider_id;
end;
$$;
revoke all on function public.admin_register_provider(text,text,text,text,jsonb,integer,text) from public,anon;
grant execute on function public.admin_register_provider(text,text,text,text,jsonb,integer,text) to authenticated;

create or replace function public.admin_upsert_provider_route(
  p_provider_code text,
  p_environment text,
  p_operation text,
  p_country_code text,
  p_asset_code text default null,
  p_priority integer default 100,
  p_min_amount numeric default null,
  p_max_amount numeric default null,
  p_enabled boolean default false
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare provider bigint; asset bigint; route_id bigint; op text:=upper(trim(p_operation));
begin
  if not private.has_permission('providers.manage') then raise exception 'Permission required' using errcode='42501'; end if;
  if op not in ('KYC','DEPOSIT','WITHDRAWAL','REFUND','ORACLE_OBSERVATION') then raise exception 'Invalid operation' using errcode='22023'; end if;
  select id into provider from integration.providers where code=upper(p_provider_code) and environment=upper(p_environment);
  if provider is null then raise exception 'Provider not found' using errcode='P0002'; end if;
  if p_asset_code is not null then
    select id into asset from public.assets where code=upper(p_asset_code);
    if asset is null then raise exception 'Asset not found' using errcode='P0002'; end if;
  end if;
  if p_min_amount is not null and p_min_amount<0 then raise exception 'Minimum amount cannot be negative' using errcode='22023'; end if;
  if p_max_amount is not null and p_min_amount is not null and p_max_amount<p_min_amount then raise exception 'Maximum must be at least minimum' using errcode='22023'; end if;

  select id into route_id from integration.provider_routes where operation=op and country_code=upper(p_country_code) and provider_id=provider and asset_id is not distinct from asset;
  if route_id is null then
    insert into integration.provider_routes(operation,country_code,asset_id,provider_id,priority,status,min_amount,max_amount,constraints)
    values(op,upper(p_country_code),asset,provider,greatest(coalesce(p_priority,100),0),case when p_enabled then 'ACTIVE' else 'DISABLED' end,p_min_amount,p_max_amount,'{}'::jsonb)
    returning id into route_id;
  else
    update integration.provider_routes set priority=greatest(coalesce(p_priority,100),0),status=case when p_enabled then 'ACTIVE' else 'DISABLED' end,min_amount=p_min_amount,max_amount=p_max_amount where id=route_id;
  end if;
  return route_id;
end;
$$;
revoke all on function public.admin_upsert_provider_route(text,text,text,text,text,integer,numeric,numeric,boolean) from public,anon;
grant execute on function public.admin_upsert_provider_route(text,text,text,text,text,integer,numeric,numeric,boolean) to authenticated;

create or replace function public.admin_set_provider_status(p_provider_code text,p_environment text,p_status text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.has_permission('providers.manage') then raise exception 'Permission required' using errcode='42501'; end if;
  if upper(p_status) not in ('ACTIVE','DISABLED','DEGRADED','UNAVAILABLE') then raise exception 'Invalid status' using errcode='22023'; end if;
  update integration.providers set status=upper(p_status) where code=upper(p_provider_code) and environment=upper(p_environment);
  if not found then raise exception 'Provider not found' using errcode='P0002'; end if;
end;
$$;
revoke all on function public.admin_set_provider_status(text,text,text) from public,anon;
grant execute on function public.admin_set_provider_status(text,text,text) to authenticated;
