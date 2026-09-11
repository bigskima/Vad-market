-- VAD Phase 40: fix provider-health upsert used by oracle-runtime.
--
-- The original function used `provider_id` both as a PL/pgSQL variable and as the
-- ON CONFLICT target column, which PostgreSQL correctly rejected as ambiguous.
-- Use an explicitly named local variable and the primary-key constraint instead.

create or replace function public.internal_record_oracle_provider_health(
  p_provider_code text,
  p_environment text,
  p_health_status text,
  p_configured boolean,
  p_latency_ms integer default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_provider_id bigint;
  v_health_status text:=upper(trim(p_health_status));
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  if v_health_status not in ('HEALTHY','DEGRADED','UNAVAILABLE','UNKNOWN') then
    raise exception 'Invalid provider health status' using errcode='22023';
  end if;

  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object' then
    raise exception 'Provider health metadata must be an object' using errcode='22023';
  end if;

  select p.id
    into v_provider_id
  from integration.providers p
  where p.code=upper(trim(p_provider_code))
    and p.environment=upper(trim(p_environment))
    and p.provider_type='ORACLE';

  if v_provider_id is null then
    raise exception 'Oracle provider not found' using errcode='P0002';
  end if;

  update integration.providers p
     set public_metadata=jsonb_set(
           coalesce(p.public_metadata,'{}'::jsonb),
           '{configured}',
           to_jsonb(coalesce(p_configured,false)),
           true
         ),
         updated_at=statement_timestamp()
   where p.id=v_provider_id;

  insert into integration.provider_health(
    provider_id,status,latency_ms,success_rate,error_rate,
    last_success_at,last_failure_at,checked_at,metadata
  )
  values(
    v_provider_id,
    v_health_status,
    p_latency_ms,
    case when v_health_status='HEALTHY' then 1 else 0 end,
    case when v_health_status='HEALTHY' then 0 else 1 end,
    case when v_health_status='HEALTHY' then statement_timestamp() else null end,
    case when v_health_status in ('DEGRADED','UNAVAILABLE') then statement_timestamp() else null end,
    statement_timestamp(),
    coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict on constraint provider_health_pkey do update set
    status=excluded.status,
    latency_ms=excluded.latency_ms,
    success_rate=excluded.success_rate,
    error_rate=excluded.error_rate,
    last_success_at=case
      when excluded.status='HEALTHY' then excluded.checked_at
      else integration.provider_health.last_success_at
    end,
    last_failure_at=case
      when excluded.status in ('DEGRADED','UNAVAILABLE') then excluded.checked_at
      else integration.provider_health.last_failure_at
    end,
    checked_at=excluded.checked_at,
    metadata=excluded.metadata;
end;
$$;

revoke all on function public.internal_record_oracle_provider_health(text,text,text,boolean,integer,jsonb) from public,anon,authenticated;
grant execute on function public.internal_record_oracle_provider_health(text,text,text,boolean,integer,jsonb) to service_role;
