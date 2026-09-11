-- VAD Phase 40: make scheduled Oracle runtime environment-portable.
--
-- `vad_project_url` is an environment-specific Vault value. It is configured at
-- deployment time, never committed to source control. Re-scheduling by the same
-- job name updates the existing pg_cron job in place.

select cron.schedule(
  'vad-oracle-provider-health',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url:=project_url.decrypted_secret||'/functions/v1/oracle-scheduler',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-vad-scheduler-secret',scheduler_secret.decrypted_secret
    ),
    body:=jsonb_build_object('action','health'),
    timeout_milliseconds:=30000
  ) as request_id
  from vault.decrypted_secrets project_url
  cross join vault.decrypted_secrets scheduler_secret
  where project_url.name='vad_project_url'
    and scheduler_secret.name='vad_oracle_scheduler_secret';
  $job$
);

select cron.schedule(
  'vad-oracle-ingestion',
  '* * * * *',
  $job$
  select net.http_post(
    url:=project_url.decrypted_secret||'/functions/v1/oracle-scheduler',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-vad-scheduler-secret',scheduler_secret.decrypted_secret
    ),
    body:=jsonb_build_object('action','process','limit',25),
    timeout_milliseconds:=30000
  ) as request_id
  from vault.decrypted_secrets project_url
  cross join vault.decrypted_secrets scheduler_secret
  where project_url.name='vad_project_url'
    and scheduler_secret.name='vad_oracle_scheduler_secret';
  $job$
);

create or replace function public.admin_launch_readiness()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_is_admin boolean:=false;
  v_app_ready boolean:=false;
  v_kyc_ready boolean:=false;
  v_ai_ready boolean:=false;
  v_active_oracle_policies integer:=0;
  v_crypto_mapped_quorum integer:=0;
  v_crypto_ready_quorum integer:=0;
  v_football_ready integer:=0;
  v_close_scheduler boolean:=false;
  v_consensus_scheduler boolean:=false;
  v_scheduler_endpoint_configured boolean:=false;
  v_ingestion_scheduler boolean:=false;
  v_money_enabled integer:=0;
  v_payment_ready integer:=0;
  v_provider_operators integer:=0;
  v_oracle_reviewers integer:=0;
  v_platform_ready boolean:=false;
  v_market_lifecycle_ready boolean:=false;
  v_real_money_ready boolean:=false;
  v_gates jsonb;
  v_blockers integer:=0;
  v_warnings integer:=0;
  v_release_state text;
begin
  v_is_admin:=auth.uid() is not null and (
    private.is_super_admin()
    or exists (
      select 1
      from admin.user_roles ur
      where ur.user_id=auth.uid()
        and ur.revoked_at is null
        and ur.effective_at<=statement_timestamp()
        and (ur.expires_at is null or ur.expires_at>statement_timestamp())
    )
  );

  if not v_is_admin then
    raise exception 'Admin access required' using errcode='42501';
  end if;

  select coalesce(enabled,false)
    into v_app_ready
  from public.admin_service_posture()
  where service_key='app_access';

  select exists (
    select 1
    from integration.providers p
    join integration.provider_routes r on r.provider_id=p.id
    where p.code='DIDIT'
      and p.environment='PRODUCTION'
      and p.provider_type='IDENTITY_VERIFICATION'
      and p.status in ('ACTIVE','DEGRADED')
      and coalesce((p.public_metadata->>'configured')::boolean,false)=true
      and coalesce((p.public_metadata->>'launch_enabled')::boolean,false)=true
      and r.operation='KYC'
      and r.status='ACTIVE'
      and r.country_code='NG'
  ) and coalesce((
    select enabled from public.admin_service_posture() where service_key='kyc_start'
  ),false)
  into v_kyc_ready;

  select exists (
    select 1
    from ai.providers ap
    join integration.providers p on p.id=ap.integration_provider_id
    where p.provider_type='AI'
      and p.environment='PRODUCTION'
      and p.status in ('ACTIVE','DEGRADED')
      and ap.status='ACTIVE'
      and coalesce((p.public_metadata->>'configured')::boolean,false)=true
      and ap.capabilities @> '["MARKET_ADMISSION"]'::jsonb
      and coalesce(ap.cost_policy->>'billing_mode','') in ('FREE_ONLY','FREE_TIER','ENABLED')
  ) into v_ai_ready;

  select count(*)::integer
    into v_active_oracle_policies
  from oracle.policies
  where status='ACTIVE'
    and effective_at<=statement_timestamp();

  with launch_pairs(canonical_key) as (
    values ('BTC/USD'::text),('ETH/USD'::text),('USDC/USD'::text)
  ), mapped as (
    select lp.canonical_key,count(distinct r.provider_id)::integer as provider_count
    from launch_pairs lp
    left join oracle.provider_resources r
      on r.resource_type='CRYPTO_PAIR'
     and upper(r.canonical_key)=lp.canonical_key
     and r.status='ACTIVE'
     and coalesce((r.metadata->>'settlement_eligible')::boolean,false)=true
    left join integration.providers p
      on p.id=r.provider_id
     and p.provider_type='ORACLE'
     and p.environment='PRODUCTION'
     and p.capabilities @> '["CRYPTO_PRICE_THRESHOLD"]'::jsonb
    group by lp.canonical_key
  ), ready as (
    select lp.canonical_key,count(distinct r.provider_id)::integer as provider_count
    from launch_pairs lp
    left join oracle.provider_resources r
      on r.resource_type='CRYPTO_PAIR'
     and upper(r.canonical_key)=lp.canonical_key
     and r.status='ACTIVE'
     and coalesce((r.metadata->>'settlement_eligible')::boolean,false)=true
    left join integration.providers p
      on p.id=r.provider_id
     and p.provider_type='ORACLE'
     and p.environment='PRODUCTION'
     and p.status in ('ACTIVE','DEGRADED')
     and p.capabilities @> '["CRYPTO_PRICE_THRESHOLD"]'::jsonb
     and coalesce((p.public_metadata->>'configured')::boolean,false)=true
    left join integration.provider_health h on h.provider_id=p.id
    where p.id is not null
      and h.status in ('HEALTHY','DEGRADED')
    group by lp.canonical_key
  )
  select
    coalesce((select min(provider_count) from mapped),0),
    coalesce((select min(provider_count) from ready),0)
  into v_crypto_mapped_quorum,v_crypto_ready_quorum;

  select count(distinct p.id)::integer
    into v_football_ready
  from integration.providers p
  left join integration.provider_health h on h.provider_id=p.id
  where p.provider_type='ORACLE'
    and p.environment='PRODUCTION'
    and p.status in ('ACTIVE','DEGRADED')
    and p.capabilities @> '["FOOTBALL_MATCH_RESULT"]'::jsonb
    and coalesce((p.public_metadata->>'configured')::boolean,false)=true
    and h.status in ('HEALTHY','DEGRADED');

  select exists(
    select 1 from cron.job
    where jobname='vad-close-due-markets' and active
  ) into v_close_scheduler;

  select exists(
    select 1 from cron.job
    where jobname='vad-evaluate-oracle-consensus' and active
  ) into v_consensus_scheduler;

  select exists(
    select 1
    from vault.decrypted_secrets
    where name='vad_project_url'
      and decrypted_secret ~ '^https://[^/]+$'
  ) into v_scheduler_endpoint_configured;

  select v_scheduler_endpoint_configured and exists(
    select 1 from cron.job
    where jobname='vad-oracle-ingestion' and active
  ) into v_ingestion_scheduler;

  select count(*)::integer
    into v_money_enabled
  from public.admin_service_posture()
  where service_key in ('trading','deposits','withdrawals','settlement')
    and enabled;

  select count(distinct p.id)::integer
    into v_payment_ready
  from integration.providers p
  join integration.provider_routes r on r.provider_id=p.id
  where p.provider_type='PAYMENT'
    and p.environment='PRODUCTION'
    and p.status in ('ACTIVE','DEGRADED')
    and coalesce((p.public_metadata->>'configured')::boolean,false)=true
    and r.status='ACTIVE';

  select count(distinct ur.user_id)::integer
    into v_provider_operators
  from admin.user_roles ur
  join admin.role_permissions rp on rp.role_id=ur.role_id
  join admin.permissions perm on perm.id=rp.permission_id
  where perm.code='providers.manage'
    and ur.revoked_at is null
    and ur.effective_at<=statement_timestamp()
    and (ur.expires_at is null or ur.expires_at>statement_timestamp());

  select count(distinct ur.user_id)::integer
    into v_oracle_reviewers
  from admin.user_roles ur
  join admin.role_permissions rp on rp.role_id=ur.role_id
  join admin.permissions perm on perm.id=rp.permission_id
  where perm.code='oracle.review'
    and ur.revoked_at is null
    and ur.effective_at<=statement_timestamp()
    and (ur.expires_at is null or ur.expires_at>statement_timestamp());

  v_platform_ready:=v_app_ready and v_kyc_ready and v_ai_ready;
  v_market_lifecycle_ready:=
    v_platform_ready
    and v_active_oracle_policies>0
    and v_crypto_ready_quorum>=2
    and v_close_scheduler
    and v_consensus_scheduler
    and v_ingestion_scheduler
    and v_provider_operators>=2
    and v_oracle_reviewers>=2;
  v_real_money_ready:=
    v_market_lifecycle_ready
    and v_money_enabled=4
    and v_payment_ready>0;

  v_gates:=jsonb_build_array(
    jsonb_build_object('key','APP_ACCESS','category','Platform','title','App access','status',case when v_app_ready then 'READY' else 'BLOCKED' end,'detail',case when v_app_ready then 'The application is available.' else 'Application access is paused.' end),
    jsonb_build_object('key','IDENTITY','category','Trust & Safety','title','Identity verification','status',case when v_kyc_ready then 'READY' else 'BLOCKED' end,'detail',case when v_kyc_ready then 'Didit verification is available for Nigeria.' else 'Identity verification is not fully ready.' end),
    jsonb_build_object('key','MARKET_ADMISSION_AI','category','Markets','title','Market admission AI','status',case when v_ai_ready then 'READY' else 'BLOCKED' end,'detail',case when v_ai_ready then 'At least one configured no-paid-spend admission model is active.' else 'No configured active admission model is available.' end),
    jsonb_build_object('key','ORACLE_POLICY','category','Markets','title','Oracle policy','status',case when v_active_oracle_policies>0 then 'READY' else 'BLOCKED' end,'detail',case when v_active_oracle_policies>0 then v_active_oracle_policies||' active policy version(s).' else 'No approved active oracle policy exists.' end,'count',v_active_oracle_policies),
    jsonb_build_object('key','CRYPTO_ORACLE_QUORUM','category','Markets','title','Crypto oracle quorum','status',case when v_crypto_ready_quorum>=2 then 'READY' else 'BLOCKED' end,'detail',case when v_crypto_ready_quorum>=2 then 'At least two independent providers are healthy for every launch crypto pair.' else 'Two healthy independent providers are required for every launch crypto pair.' end,'mappedProvidersPerPair',v_crypto_mapped_quorum,'readyProvidersPerPair',v_crypto_ready_quorum),
    jsonb_build_object('key','FOOTBALL_ORACLE','category','Markets','title','Football auto-resolution','status',case when v_football_ready>=2 then 'READY' else 'WARNING' end,'detail',case when v_football_ready>=2 then 'Independent football sources are available.' else 'Football markets remain review-led until an independent corroborating source is available.' end,'readyProviders',v_football_ready),
    jsonb_build_object('key','PROVIDER_DUAL_CONTROL','category','Operations','title','Provider approval coverage','status',case when v_provider_operators>=2 then 'READY' else 'BLOCKED' end,'detail',case when v_provider_operators>=2 then 'At least two independent operators can request and approve provider status changes.' else 'Assign Provider Admin to a second trusted VAD account before activating launch providers.' end,'qualifiedOperators',v_provider_operators),
    jsonb_build_object('key','ORACLE_DUAL_CONTROL','category','Operations','title','Oracle review coverage','status',case when v_oracle_reviewers>=2 then 'READY' else 'BLOCKED' end,'detail',case when v_oracle_reviewers>=2 then 'At least two independent reviewers are available for oracle fallback and dispute handling.' else 'Assign Oracle Reviewer to a second trusted VAD account before production market resolution.' end,'qualifiedReviewers',v_oracle_reviewers),
    jsonb_build_object('key','MARKET_SCHEDULERS','category','Operations','title','Internal market schedulers','status',case when v_close_scheduler and v_consensus_scheduler then 'READY' else 'BLOCKED' end,'detail',case when v_close_scheduler and v_consensus_scheduler then 'Market close and oracle consensus jobs are active.' else 'One or more internal market scheduler jobs are inactive.' end,'closeScheduler',v_close_scheduler,'consensusScheduler',v_consensus_scheduler),
    jsonb_build_object('key','ORACLE_INGESTION','category','Operations','title','Oracle evidence ingestion','status',case when v_ingestion_scheduler then 'READY' else 'BLOCKED' end,'detail',case when not v_scheduler_endpoint_configured then 'Set the environment-specific VAD project URL in Vault before scheduled Oracle calls can run.' when v_ingestion_scheduler then 'External oracle evidence ingestion is scheduled.' else 'Automatic external oracle evidence ingestion is not scheduled.' end,'schedulerEndpointConfigured',v_scheduler_endpoint_configured),
    jsonb_build_object('key','MONEY_MOVEMENT','category','Money','title','Money movement','status',case when v_money_enabled=0 then 'PAUSED' when v_money_enabled=4 then 'READY' else 'WARNING' end,'detail',case when v_money_enabled=0 then 'Trading, deposits, withdrawals and settlement are intentionally paused.' when v_money_enabled=4 then 'All money-movement services are enabled.' else v_money_enabled||'/4 money-movement services are enabled.' end,'enabledServices',v_money_enabled),
    jsonb_build_object('key','PAYMENT_RAILS','category','Money','title','Payment rails','status',case when v_money_enabled=0 then 'PAUSED' when v_payment_ready>0 then 'READY' else 'BLOCKED' end,'detail',case when v_money_enabled=0 then 'Payment rails are not required while money movement is paused.' when v_payment_ready>0 then 'At least one configured payment route is active.' else 'Money movement cannot go live until a configured payment route is active.' end,'readyProviders',v_payment_ready)
  );

  select count(*)::integer into v_blockers
  from jsonb_array_elements(v_gates) item
  where item->>'status'='BLOCKED';

  select count(*)::integer into v_warnings
  from jsonb_array_elements(v_gates) item
  where item->>'status'='WARNING';

  v_release_state:=case
    when v_real_money_ready then 'LIVE_READY'
    when v_market_lifecycle_ready then 'MARKET_LIFECYCLE_READY'
    when v_platform_ready then 'PLATFORM_READY_MARKET_BLOCKED'
    else 'HARDENING_REQUIRED'
  end;

  return jsonb_build_object(
    'generatedAt',statement_timestamp(),
    'releaseState',v_release_state,
    'platformReady',v_platform_ready,
    'marketLifecycleReady',v_market_lifecycle_ready,
    'realMoneyReady',v_real_money_ready,
    'blockerCount',v_blockers,
    'warningCount',v_warnings,
    'gates',v_gates
  );
end;
$$;

revoke all on function public.admin_launch_readiness() from public,anon;
grant execute on function public.admin_launch_readiness() to authenticated;
