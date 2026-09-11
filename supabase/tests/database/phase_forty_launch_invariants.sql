-- Run after all Phase 40 migrations. This test validates structural launch-safety
-- invariants only; environment-specific credentials and external provider health are
-- validated operationally by oracle-runtime and admin_launch_readiness().
begin;

do $$
begin
  if not exists (
    select 1
    from admin.roles r
    join admin.role_permissions rp on rp.role_id=r.id
    join admin.permissions p on p.id=rp.permission_id
    where r.code='PROVIDER_ADMIN'
      and p.code='providers.manage'
  ) then
    raise exception 'Provider Admin must carry providers.manage';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.internal_validate_oracle_scheduler_secret(text)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated users must not execute the scheduler secret validator';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.internal_validate_oracle_scheduler_secret(text)',
    'EXECUTE'
  ) then
    raise exception 'Service role must be able to validate the scheduler credential';
  end if;

  if not exists (
    select 1 from vault.secrets where name='vad_oracle_scheduler_secret'
  ) then
    raise exception 'Oracle scheduler credential must be generated in Vault';
  end if;

  if not exists (
    select 1 from cron.job
    where jobname='vad-oracle-provider-health' and active
  ) then
    raise exception 'Oracle provider-health scheduler must be installed';
  end if;

  if not exists (
    select 1 from cron.job
    where jobname='vad-oracle-ingestion' and active
  ) then
    raise exception 'Oracle evidence-ingestion scheduler must be installed';
  end if;

  if not exists (
    select 1
    from oracle.policies p
    where p.name='VAD Crypto Threshold Launch Policy'
      and p.status='DRAFT'
      and coalesce((p.consensus_rule->>'min_agreeing_providers')::integer,0)>=2
  ) then
    raise exception 'Conservative launch crypto oracle policy draft is required';
  end if;

  if exists (
    select 1
    from oracle.policies p
    where p.name='VAD Crypto Threshold Launch Policy'
      and p.status='ACTIVE'
      and p.approved_by is null
  ) then
    raise exception 'Launch oracle policy must never auto-activate without approval';
  end if;

  if (
    select count(distinct p.code)
    from integration.providers p
    where p.provider_type='ORACLE'
      and p.environment='PRODUCTION'
      and p.code in ('PYTH','COINGECKO')
      and p.status='DISABLED'
  ) <> 2 then
    raise exception 'Pyth and CoinGecko must remain disabled until governed activation';
  end if;

  if exists (
    select 1
    from integration.providers p
    where p.provider_type='ORACLE'
      and p.environment='PRODUCTION'
      and p.status in ('ACTIVE','DEGRADED')
      and coalesce((p.public_metadata->>'configured')::boolean,false)=false
  ) then
    raise exception 'Unconfigured Oracle providers cannot be launch-active';
  end if;
end;
$$;

rollback;
