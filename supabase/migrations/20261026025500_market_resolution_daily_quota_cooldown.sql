-- Rate-limit cooldowns are looked up by provider and recent attempt time.
-- Keep this partial index focused on failed calls; successful audit history grows independently.
create index if not exists ai_resolution_attempts_failed_provider_created_idx
  on oracle.ai_resolution_attempts(ai_provider_id, created_at desc)
  where status='FAILED';

-- Respect AI provider 429/quota backoff for automatic market resolution.
-- The worker still requires high-confidence quoted evidence and the configured
-- independent oracle source quorum. Auto-void retains its stricter two-model guard.

create or replace function public.get_market_resolution_ai_runtimes()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_result jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'aiProviderId',ap.id,
      'providerCode',ip.code,
      'providerName',ip.name,
      'environment',ip.environment,
      'adapter',ip.public_metadata->>'ai_adapter',
      'endpoint',ip.public_metadata->>'endpoint',
      'apiVersion',ip.public_metadata->>'api_version',
      'secretReference',ip.secret_reference,
      'modelCode',ap.model_code,
      'priority',ap.priority,
      'promptVersionId',pv.id,
      'promptVersion',pv.version,
      'systemPrompt',pv.system_prompt,
      'outputSchema',pv.output_schema
    ) order by ap.priority,ip.priority,ap.id
  ),'[]'::jsonb)
  into v_result
  from ai.providers ap
  join integration.providers ip on ip.id=ap.integration_provider_id
  join lateral (
    select pvi.id,pvi.version,pvi.system_prompt,pvi.output_schema
    from ai.prompt_versions pvi
    where pvi.capability_key='MARKET_RESOLUTION' and pvi.status='ACTIVE'
    order by pvi.version desc
    limit 1
  ) pv on true
  where ap.status='ACTIVE'
    and ip.provider_type='AI'
    and ip.status='ACTIVE'
    and ip.environment='PRODUCTION'
    and ap.capabilities @> '["MARKET_RESOLUTION"]'::jsonb
    and upper(coalesce(ap.cost_policy->>'billing_mode','FREE_ONLY'))='FREE_ONLY'
    and coalesce((ap.cost_policy->>'paid_spend_limit')::numeric,0)=0
    and not exists (
      select 1
      from oracle.ai_resolution_attempts failed_attempt
      where failed_attempt.ai_provider_id=ap.id
        and failed_attempt.status='FAILED'
        and (
          (
            failed_attempt.created_at >= statement_timestamp() - interval '24 hours'
            and (
              failed_attempt.failure_reason ilike '%daily free allocation%'
              or failed_attempt.failure_reason ilike '%daily allocation%'
              or failed_attempt.failure_reason ilike '%daily quota%'
              or failed_attempt.failure_reason ilike '%used up your daily%'
            )
          )
          or (
            failed_attempt.created_at >= statement_timestamp() - interval '30 minutes'
            and (
              failed_attempt.failure_reason ilike '%HTTP 429%'
              or failed_attempt.failure_reason ilike '%RESOURCE_EXHAUSTED%'
              or failed_attempt.failure_reason ilike '%rate limit%'
              or failed_attempt.failure_reason ilike '%quota exceeded%'
            )
          )
        )
    );

  return v_result;
end;
$function$;

comment on function public.get_market_resolution_ai_runtimes() is
  'Routes active, free-first production AI models. Generic rate-limit failures receive a 30-minute cooldown; explicit daily-allocation exhaustion receives a 24-hour cooldown. The worker uses one-model fallback only with high-confidence verified citations and two-source oracle checks. Automatic void continues to require two-model agreement.';
