-- Run after the Oct 25 overdue-oracle finalization hotfix. No production mutations.
begin;

do $$
declare
  v_evaluator text := pg_get_functiondef('oracle.evaluate_event_consensus(bigint)'::regprocedure);
  v_finalizer text := pg_get_functiondef('oracle.finalize_due_automatic_resolutions(integer)'::regprocedure);
  v_admin_finalize text := pg_get_functiondef('public.admin_finalize_resolution(bigint,jsonb)'::regprocedure);
  v_admin_void text := pg_get_functiondef('public.admin_finalize_void(bigint,jsonb)'::regprocedure);
begin
  if position('vad-oracle-event:' in v_evaluator)=0
     or position('pg_try_advisory_xact_lock' in v_evaluator)=0 then
    raise exception 'Oracle consensus evaluation must use the shared non-blocking per-event transaction lock';
  end if;

  if position('vad-oracle-event:' in v_finalizer)=0
     or position('pg_try_advisory_xact_lock' in v_finalizer)=0 then
    raise exception 'Automatic finalization must use the same non-blocking per-event transaction lock';
  end if;

  if position('TNGN' in v_finalizer)=0
     or position('SETTLEMENT_PENDING' in v_finalizer)=0 then
    raise exception 'Automatic finalization must explicitly exclude the retired TNGN asset from settlement-pending transitions';
  end if;

  if position('TNGN' in v_admin_finalize)=0
     or position('SETTLEMENT_PENDING' in v_admin_finalize)=0 then
    raise exception 'Manual outcome finalization must explicitly exclude the retired TNGN asset';
  end if;

  if position('TNGN' in v_admin_void)=0
     or position('SETTLEMENT_PENDING' in v_admin_void)=0 then
    raise exception 'Manual void finalization must explicitly exclude the retired TNGN asset';
  end if;

  if not exists (
    select 1
    from cron.job
    where jobname='vad-finalize-oracle-resolutions'
      and active
  ) then
    raise exception 'Automatic Oracle finalization scheduler must remain active';
  end if;

  if not exists (
    select 1
    from cron.job
    where jobname='vad-settle-finalized-markets'
      and active
  ) then
    raise exception 'Settlement worker scheduler must remain active';
  end if;
end;
$$;

rollback;
