begin;

create or replace function public.internal_oracle_provider_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare result jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,
    'code',p.code,
    'name',p.name,
    'environment',p.environment,
    'status',p.status,
    'priority',p.priority,
    'capabilities',p.capabilities,
    'configured',coalesce((p.public_metadata->>'configured')::boolean,false),
    'adapter',p.public_metadata->>'adapter',
    'baseUrl',p.public_metadata->>'base_url',
    'secretReference',p.secret_reference,
    'publicMetadata',p.public_metadata,
    'healthStatus',coalesce((
      select h.status
      from integration.provider_health h
      where h.provider_id=p.id
      order by h.checked_at desc nulls last
      limit 1
    ),'UNKNOWN'),
    'resources',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,
        'resourceType',r.resource_type,
        'canonicalKey',r.canonical_key,
        'externalKey',r.external_key,
        'status',r.status,
        'metadata',r.metadata
      ) order by r.resource_type,r.canonical_key)
      from oracle.provider_resources r
      where r.provider_id=p.id
    ),'[]'::jsonb)
  ) order by p.priority,p.code),'[]'::jsonb) into result
  from integration.providers p
  where p.provider_type='ORACLE';
  return result;
end;
$$;

revoke all on function public.internal_oracle_provider_catalog() from public,anon,authenticated;
grant execute on function public.internal_oracle_provider_catalog() to service_role;

commit;
