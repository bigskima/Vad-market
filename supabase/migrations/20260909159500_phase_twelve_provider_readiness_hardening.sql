-- VAD Phase 12 hardening: a registered provider is not runtime-ready until configuration is explicitly marked ready.

create or replace function command.select_provider(
  p_operation text,
  p_country_code text,
  p_asset_id bigint default null,
  p_amount numeric default null
)
returns bigint
language sql
stable
security definer
set search_path=''
as $$
  select r.provider_id
  from integration.provider_routes r
  join integration.providers p on p.id=r.provider_id
  left join integration.provider_health h on h.provider_id=p.id
  where r.operation=upper(p_operation)
    and r.country_code=upper(p_country_code)
    and r.status='ACTIVE'
    and p.status in ('ACTIVE','DEGRADED')
    and coalesce((p.public_metadata->>'configured')::boolean,false)=true
    and (r.asset_id is null or r.asset_id=p_asset_id)
    and (r.min_amount is null or p_amount is null or p_amount>=r.min_amount)
    and (r.max_amount is null or p_amount is null or p_amount<=r.max_amount)
    and coalesce(h.status,'HEALTHY') not in ('DOWN','UNAVAILABLE')
  order by case p.status when 'ACTIVE' then 0 else 1 end,
           case coalesce(h.status,'HEALTHY') when 'HEALTHY' then 0 when 'DEGRADED' then 1 else 2 end,
           r.priority asc,p.priority asc,r.id asc
  limit 1;
$$;
revoke all on function command.select_provider(text,text,bigint,numeric) from public,anon,authenticated;
grant execute on function command.select_provider(text,text,bigint,numeric) to service_role;

create or replace function public.provider_readiness()
returns jsonb
language sql
security definer
set search_path=''
as $$
  with acct as (select * from public.user_accounts where user_id=auth.uid()),
       ngn as (select id from public.assets where code='NGN' and status='ACTIVE' limit 1)
  select jsonb_build_object(
    'countryCode',acct.country_code,
    'kycProvider','DIDIT',
    'kycConfigured',exists(
      select 1 from integration.provider_routes r
      join integration.providers p on p.id=r.provider_id
      where r.operation='KYC' and r.country_code=acct.country_code and r.status='ACTIVE'
        and p.status in ('ACTIVE','DEGRADED')
        and coalesce((p.public_metadata->>'configured')::boolean,false)=true
    ),
    'depositConfigured',exists(
      select 1 from integration.provider_routes r
      join integration.providers p on p.id=r.provider_id,ngn
      where r.operation='DEPOSIT' and r.country_code=acct.country_code and (r.asset_id is null or r.asset_id=ngn.id)
        and r.status='ACTIVE' and p.status in ('ACTIVE','DEGRADED')
        and coalesce((p.public_metadata->>'configured')::boolean,false)=true
    ),
    'withdrawalConfigured',exists(
      select 1 from integration.provider_routes r
      join integration.providers p on p.id=r.provider_id,ngn
      where r.operation='WITHDRAWAL' and r.country_code=acct.country_code and (r.asset_id is null or r.asset_id=ngn.id)
        and r.status='ACTIVE' and p.status in ('ACTIVE','DEGRADED')
        and coalesce((p.public_metadata->>'configured')::boolean,false)=true
    ),
    'generatedAt',statement_timestamp()
  ) from acct;
$$;
revoke all on function public.provider_readiness() from public,anon;
grant execute on function public.provider_readiness() to authenticated;

create or replace function public.internal_set_provider_configured(p_provider_code text,p_configured boolean)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  update integration.providers
     set public_metadata=jsonb_set(coalesce(public_metadata,'{}'::jsonb),'{configured}',to_jsonb(p_configured),true)
   where code=upper(p_provider_code);
  if not found then raise exception 'Provider not found' using errcode='P0002'; end if;
end;
$$;
revoke all on function public.internal_set_provider_configured(text,boolean) from public,anon,authenticated;
grant execute on function public.internal_set_provider_configured(text,boolean) to service_role;
