-- VAD Phase 40: production launch readiness + foreign-key performance hardening.
--
-- The release-readiness read model is intentionally operational: it reports what is
-- actually available now without silently enabling money movement, providers or
-- oracle policies. Provider activation and oracle-policy approval remain governed
-- admin actions. External API calls remain in Edge Functions.

-- PostgreSQL does not automatically index the referencing side of foreign keys.
-- Add a covering index for every currently-uncovered FK in VAD-owned operational
-- schemas. This protects deletes/updates of referenced rows and the high-frequency
-- joins used by markets, oracle, settlement, social and trading workloads.
do $$
declare
  r record;
  v_index_name text;
  v_columns text;
begin
  for r in
    select
      con.oid as constraint_oid,
      con.conrelid,
      con.conkey,
      con.conname,
      n.nspname as schema_name,
      c.relname as table_name
    from pg_constraint con
    join pg_class c on c.oid=con.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    where con.contype='f'
      and n.nspname in (
        'admin','integration','market','oracle','payments','policy',
        'risk','settlement','social','trading'
      )
      and not exists (
        select 1
        from pg_index i
        where i.indrelid=con.conrelid
          and i.indisvalid
          and (i.indkey::smallint[])[0:cardinality(con.conkey)-1]=con.conkey
      )
    order by n.nspname,c.relname,con.conname
  loop
    select string_agg(format('%I',a.attname),', ' order by u.ord)
      into v_columns
    from unnest(r.conkey) with ordinality u(attnum,ord)
    join pg_attribute a
      on a.attrelid=r.conrelid and a.attnum=u.attnum;

    v_index_name:=
      left(
        regexp_replace(
          r.schema_name||'_'||r.table_name||'_'||r.conname||'_idx',
          '[^a-zA-Z0-9_]+','','g'
        ),
        55
      )||'_'||substr(md5(r.schema_name||'.'||r.table_name||'.'||r.conname),1,7);

    execute format(
      'create index if not exists %I on %I.%I (%s)',
      v_index_name,r.schema_name,r.table_name,v_columns
    );
  end loop;
end $$;

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
  v_ingestion_scheduler boolean:=false;
  v_money_enabled integer:=0;
  v_payment_ready integer:=0;
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

  -- For launch crypto pairs, use the weakest pair as the readiness score. Two
  -- independent settlement-eligible providers are required for automatic consensus.
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

  -- External provider evidence must be fetched by the oracle-runtime Edge Function.
  -- We intentionally do not embed service-role credentials in a migration/cron command.
  select exists(
    select 1 from cron.job
    where jobname in ('vad-oracle-ingestion','vad-oracle-runtime','vad-oracle-provider-ingestion')
      and active
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

  v_platform_ready:=v_app_ready and v_kyc_ready and v_ai_ready;
  v_market_lifecycle_ready:=
    v_platform_ready
    and v_active_oracle_policies>0
    and v_crypto_ready_quorum>=2
    and v_close_scheduler
    and v_consensus_scheduler
    and v_ingestion_scheduler;
  v_real_money_ready:=
    v_market_lifecycle_ready
    and v_money_enabled=4
    and v_payment_ready>0;

  v_gates:=jsonb_build_array(
    jsonb_build_object(
      'key','APP_ACCESS','category','Platform','title','App access',
      'status',case when v_app_ready then 'READY' else 'BLOCKED' end,
      'detail',case when v_app_ready then 'The application is available.' else 'Application access is paused.' end
    ),
    jsonb_build_object(
      'key','IDENTITY','category','Trust & Safety','title','Identity verification',
      'status',case when v_kyc_ready then 'READY' else 'BLOCKED' end,
      'detail',case when v_kyc_ready then 'Didit verification is available for Nigeria.' else 'Identity verification is not fully ready.' end
    ),
    jsonb_build_object(
      'key','MARKET_ADMISSION_AI','category','Markets','title','Market admission AI',
      'status',case when v_ai_ready then 'READY' else 'BLOCKED' end,
      'detail',case when v_ai_ready then 'At least one configured no-paid-spend admission model is active.' else 'No configured active admission model is available.' end
    ),
    jsonb_build_object(
      'key','ORACLE_POLICY','category','Markets','title','Oracle policy',
      'status',case when v_active_oracle_policies>0 then 'READY' else 'BLOCKED' end,
      'detail',case when v_active_oracle_policies>0 then v_active_oracle_policies||' active policy version(s).' else 'No approved active oracle policy exists.' end,
      'count',v_active_oracle_policies
    ),
    jsonb_build_object(
      'key','CRYPTO_ORACLE_QUORUM','category','Markets','title','Crypto oracle quorum',
      'status',case when v_crypto_ready_quorum>=2 then 'READY' else 'BLOCKED' end,
      'detail',case when v_crypto_ready_quorum>=2 then 'At least two independent providers are healthy for every launch crypto pair.' else 'Two healthy independent providers are required for every launch crypto pair.' end,
      'mappedProvidersPerPair',v_crypto_mapped_quorum,
      'readyProvidersPerPair',v_crypto_ready_quorum
    ),
    jsonb_build_object(
      'key','FOOTBALL_ORACLE','category','Markets','title','Football auto-resolution',
      'status',case when v_football_ready>=2 then 'READY' else 'WARNING' end,
      'detail',case when v_football_ready>=2 then 'Independent football sources are available.' else 'Football markets remain review-led until an independent corroborating source is available.' end,
      'readyProviders',v_football_ready
    ),
    jsonb_build_object(
      'key','MARKET_SCHEDULERS','category','Operations','title','Internal market schedulers',
      'status',case when v_close_scheduler and v_consensus_scheduler then 'READY' else 'BLOCKED' end,
      'detail',case when v_close_scheduler and v_consensus_scheduler then 'Market close and oracle consensus jobs are active.' else 'One or more internal market scheduler jobs are inactive.' end,
      'closeScheduler',v_close_scheduler,
      'consensusScheduler',v_consensus_scheduler
    ),
    jsonb_build_object(
      'key','ORACLE_INGESTION','category','Operations','title','Oracle evidence ingestion',
      'status',case when v_ingestion_scheduler then 'READY' else 'BLOCKED' end,
      'detail',case when v_ingestion_scheduler then 'External oracle evidence ingestion is scheduled.' else 'The oracle runtime exists, but automatic external evidence ingestion is not scheduled yet.' end
    ),
    jsonb_build_object(
      'key','MONEY_MOVEMENT','category','Money','title','Money movement',
      'status',case when v_money_enabled=0 then 'PAUSED' when v_money_enabled=4 then 'READY' else 'WARNING' end,
      'detail',case when v_money_enabled=0 then 'Trading, deposits, withdrawals and settlement are intentionally paused.' when v_money_enabled=4 then 'All money-movement services are enabled.' else v_money_enabled||'/4 money-movement services are enabled.' end,
      'enabledServices',v_money_enabled
    ),
    jsonb_build_object(
      'key','PAYMENT_RAILS','category','Money','title','Payment rails',
      'status',case when v_money_enabled=0 then 'PAUSED' when v_payment_ready>0 then 'READY' else 'BLOCKED' end,
      'detail',case when v_money_enabled=0 then 'Payment rails are not required while money movement is paused.' when v_payment_ready>0 then 'At least one configured payment route is active.' else 'Money movement cannot go live until a configured payment route is active.' end,
      'readyProviders',v_payment_ready
    )
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
