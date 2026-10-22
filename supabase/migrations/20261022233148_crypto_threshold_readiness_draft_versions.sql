begin;

-- Report the pending draft policy version separately from the approval state.
-- A draft version is informational only and never makes an environment ready.
CREATE OR REPLACE FUNCTION public.internal_crypto_threshold_policy_readiness()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_production_ready boolean:=false;
  v_sandbox_ready boolean:=false;
  v_production_version integer;
  v_sandbox_version integer;
  v_coinbase_health text:='UNKNOWN';
  v_kraken_health text:='UNKNOWN';
  v_coinbase_failure text;
  v_kraken_failure text;
  v_sources_ready boolean:=false;
  v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  with candidate_policies as (
    select p.version,
      upper(coalesce(nullif(p.consensus_rule->>'environment',''),'PRODUCTION')) as environment,
      (p.status='ACTIVE' and p.approved_by is not null and p.effective_at<=statement_timestamp()) as is_ready
    from oracle.policies p
    join oracle.capabilities c on c.id=p.capability_id
    where c.code='OBJECTIVE_EVENT_RESULT'
      and p.status in ('ACTIVE','DRAFT')
      and upper(coalesce(p.consensus_rule->>'distinct_providers','false'))='TRUE'
      and case
        when coalesce(p.consensus_rule->>'min_agreeing_providers','') ~ '^[0-9]+$'
          then (p.consensus_rule->>'min_agreeing_providers')::integer
        else 0
      end >= 2
      and jsonb_array_length(coalesce(p.source_hierarchy,'[]'::jsonb))=2
      and exists(select 1 from jsonb_array_elements(p.source_hierarchy) h
        where upper(coalesce(h->>'provider_code',''))='COINBASE'
          and upper(coalesce(h->>'role',''))='PRIMARY')
      and exists(select 1 from jsonb_array_elements(p.source_hierarchy) h
        where upper(coalesce(h->>'provider_code',''))='KRAKEN'
          and upper(coalesce(h->>'role',''))='CORROBORATING')
  )
  select
    coalesce(bool_or(is_ready and environment<>'SANDBOX'),false),
    coalesce(bool_or(is_ready and environment='SANDBOX'),false),
    max(version) filter(where environment<>'SANDBOX'),
    max(version) filter(where environment='SANDBOX')
  into v_production_ready,v_sandbox_ready,v_production_version,v_sandbox_version
  from candidate_policies;

  select coalesce(h.status,'UNKNOWN'),h.metadata->>'failure_code'
  into v_coinbase_health,v_coinbase_failure
  from integration.providers p
  left join lateral (
    select status,metadata from integration.provider_health
    where provider_id=p.id order by checked_at desc nulls last limit 1
  ) h on true
  where p.code='COINBASE' and p.environment='PRODUCTION'
    and p.provider_type='ORACLE' and p.status in ('ACTIVE','DEGRADED')
    and p.capabilities @> '["CRYPTO_PRICE_THRESHOLD"]'::jsonb
    and coalesce((p.public_metadata->>'configured')::boolean,false);
  if not found then
    v_coinbase_health:='UNAVAILABLE';
    v_coinbase_failure:='PROVIDER_NOT_CONFIGURED';
  end if;

  select coalesce(h.status,'UNKNOWN'),h.metadata->>'failure_code'
  into v_kraken_health,v_kraken_failure
  from integration.providers p
  left join lateral (
    select status,metadata from integration.provider_health
    where provider_id=p.id order by checked_at desc nulls last limit 1
  ) h on true
  where p.code='KRAKEN' and p.environment='PRODUCTION'
    and p.provider_type='ORACLE' and p.status in ('ACTIVE','DEGRADED')
    and p.capabilities @> '["CRYPTO_PRICE_THRESHOLD"]'::jsonb
    and coalesce((p.public_metadata->>'configured')::boolean,false);
  if not found then
    v_kraken_health:='UNAVAILABLE';
    v_kraken_failure:='PROVIDER_NOT_CONFIGURED';
  end if;

  v_sources_ready := v_coinbase_health<>'UNAVAILABLE'
    and v_kraken_health<>'UNAVAILABLE';

  v_result:=jsonb_build_object(
    'available',true,
    'productionPolicyReady',v_production_ready,
    'sandboxPolicyReady',v_sandbox_ready,
    'productionPolicyVersion',v_production_version,
    'sandboxPolicyVersion',v_sandbox_version,
    'providersRuntimeReady',v_sources_ready,
    'coinbaseHealth',v_coinbase_health,
    'krakenHealth',v_kraken_health,
    'coinbaseFailureCode',v_coinbase_failure,
    'krakenFailureCode',v_kraken_failure,
    'productionReason',case when v_production_ready then null
      else 'No active, approved Coinbase/Kraken production policy with the required distinct two-provider quorum is available.' end,
    'sandboxReason',case when v_sandbox_ready then null
      else 'No active, approved Coinbase/Kraken sandbox policy with the required distinct two-provider quorum is available.' end,
    'providerReason',case when v_sources_ready then null
      else 'At least one required settlement provider is currently marked unavailable. Run a fresh Oracle provider health check before creating this market.' end
  );
  return v_result;
end;
$function$;

revoke all on function public.internal_crypto_threshold_policy_readiness() from public,anon,authenticated;
grant execute on function public.internal_crypto_threshold_policy_readiness() to service_role;
select pg_notify('pgrst','reload schema');
commit;
