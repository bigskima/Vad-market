-- Run after Phase 41 migrations. Every mutation is rolled back.
begin;

do $$
begin
  if not exists (
    select 1
    from oracle.policies p
    where p.name='VAD Crypto Threshold Launch Policy'
      and p.version=1
      and p.status='RETIRED'
  ) then
    raise exception 'Launch Oracle policy version 1 must be retired';
  end if;

  if not exists (
    select 1
    from oracle.policies p
    where p.name='VAD Crypto Threshold Launch Policy'
      and p.version=2
      and p.status in ('DRAFT','ACTIVE')
      and p.consensus_rule->>'finalization_mode'='AUTO_AFTER_DISPUTE_WINDOW'
      and coalesce((p.consensus_rule->>'min_agreeing_providers')::integer,0)>=2
  ) then
    raise exception 'Launch Oracle policy version 2 must carry automatic finalization and two-provider quorum';
  end if;

  if not exists (
    select 1 from cron.job
    where jobname='vad-finalize-oracle-resolutions'
      and active
  ) then
    raise exception 'Automatic Oracle finalization scheduler must be active';
  end if;

  if has_function_privilege(
    'authenticated',
    'oracle.finalize_due_automatic_resolutions(integer)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated clients must not execute automatic Oracle finalization';
  end if;

  if not has_function_privilege(
    'service_role',
    'oracle.finalize_due_automatic_resolutions(integer)',
    'EXECUTE'
  ) then
    raise exception 'Service role must be able to execute automatic Oracle finalization';
  end if;

  begin
    update oracle.policies
       set consensus_rule=consensus_rule||'{"unsafe_mutation":true}'::jsonb
     where name='VAD Crypto Threshold Launch Policy'
       and version=2
       and status='DRAFT';
    raise exception 'Oracle policy facts unexpectedly remained mutable';
  exception
    when sqlstate '55000' then null;
  end;
end;
$$;

rollback;
