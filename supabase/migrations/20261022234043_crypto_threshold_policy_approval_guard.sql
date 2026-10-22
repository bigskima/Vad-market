begin;

-- Crypto threshold settlement policies must not become ACTIVE through the
-- generic approval RPC unless their exact two-source quorum and live source
-- readiness match the resolver implementation.
create or replace function public.admin_approve_oracle_policy(p_policy_public_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  target oracle.policies;
  expected_environment text;
  minimum_agreeing_text text;
begin
  if auth.uid() is null or not private.has_permission('oracle.review') then
    raise exception 'Oracle review permission required' using errcode='42501';
  end if;

  select * into target
  from oracle.policies
  where public_id=p_policy_public_id
  for update;

  if target.id is null then
    raise exception 'Oracle policy not found' using errcode='P0002';
  end if;
  if target.status<>'DRAFT' then
    raise exception 'Only draft oracle policies can be approved' using errcode='P0001';
  end if;
  if target.created_by=auth.uid() then
    raise exception 'A different reviewer must approve this oracle policy' using errcode='42501';
  end if;

  if target.name in ('VAD Crypto Threshold Launch Policy','VAD Sandbox Crypto Threshold Policy') then
    if target.name='VAD Sandbox Crypto Threshold Policy' then
      expected_environment:='SANDBOX';
    else
      expected_environment:='PRODUCTION';
    end if;

    if upper(coalesce(nullif(target.consensus_rule->>'environment',''),'PRODUCTION'))<>expected_environment then
      raise exception 'Crypto threshold policy environment does not match its approved policy name' using errcode='22023';
    end if;

    if jsonb_typeof(target.source_hierarchy) is distinct from 'array' then
      raise exception 'Crypto threshold policy source hierarchy must be an array' using errcode='22023';
    end if;
    if jsonb_array_length(target.source_hierarchy)<>2 then
      raise exception 'Crypto threshold policy must define exactly Coinbase and Kraken as two independent sources' using errcode='22023';
    end if;

    if upper(coalesce(target.consensus_rule->>'distinct_providers','false'))<>'TRUE' then
      raise exception 'Crypto threshold policy must require distinct-provider consensus' using errcode='22023';
    end if;
    minimum_agreeing_text:=coalesce(target.consensus_rule->>'min_agreeing_providers','');
    if minimum_agreeing_text !~ '^[0-9]+$' then
      raise exception 'Crypto threshold policy must specify a numeric two-provider quorum' using errcode='22023';
    end if;
    if minimum_agreeing_text::integer<2 then
      raise exception 'Crypto threshold policy must require agreement from both providers' using errcode='22023';
    end if;

    if not (
      exists(
        select 1 from jsonb_array_elements(target.source_hierarchy) h
        where upper(coalesce(h->>'provider_code',''))='COINBASE'
          and upper(coalesce(h->>'role',''))='PRIMARY'
      )
      and exists(
        select 1 from jsonb_array_elements(target.source_hierarchy) h
        where upper(coalesce(h->>'provider_code',''))='KRAKEN'
          and upper(coalesce(h->>'role',''))='CORROBORATING'
      )
    ) then
      raise exception 'Crypto threshold policy must use Coinbase as PRIMARY and Kraken as CORROBORATING' using errcode='22023';
    end if;

    -- These checks are server-side: client-side gating alone is not trusted.
    if exists(
      select 1
      from (values
        ('COINBASE','https://api.coinbase.com','COINBASE_PUBLIC_CANDLES_V1'),
        ('KRAKEN','https://api.kraken.com','KRAKEN_PUBLIC_OHLC_V1')
      ) required(code,base_url,adapter)
      left join integration.providers p
        on p.code=required.code
       and p.environment='PRODUCTION'
       and p.provider_type='ORACLE'
      where p.id is null
         or p.status not in ('ACTIVE','DEGRADED')
         or not coalesce((p.public_metadata->>'configured')::boolean,false)
         or p.public_metadata->>'base_url' is distinct from required.base_url
         or p.public_metadata->>'adapter' is distinct from required.adapter
         or not (p.capabilities @> '["CRYPTO_PRICE_THRESHOLD"]'::jsonb)
         or not exists(
           select 1 from integration.provider_health h
           where h.provider_id=p.id
             and h.status='HEALTHY'
             and h.checked_at=(
               select max(latest.checked_at)
               from integration.provider_health latest
               where latest.provider_id=p.id
             )
         )
    ) then
      raise exception 'Coinbase/Kraken runtime readiness must be HEALTHY and correctly configured before this crypto threshold policy can be approved' using errcode='P0001';
    end if;
  end if;

  update oracle.policies
  set status='ACTIVE',approved_by=auth.uid()
  where id=target.id;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','ORACLE_POLICY_APPROVED','ORACLE_POLICY',target.public_id::text,
    'Approved oracle policy',
    jsonb_build_object('name',target.name,'version',target.version));

  return true;
end;
$function$;

select pg_notify('pgrst','reload schema');
commit;
