BEGIN;

DO $test$
DECLARE
  v_def text := pg_get_functiondef('public.admin_oracle_queue_v2()'::regprocedure);
BEGIN
  IF position('resolution_mode' IN v_def)=0
     OR position('AUTOMATIC' IN v_def)=0
     OR position('MANUAL_EXCEPTION' IN v_def)=0
     OR position('latest_ai_failure_reason' IN v_def)=0
     OR position('retry_after' IN v_def)=0 THEN
    RAISE EXCEPTION 'Status-aware Oracle queue must distinguish automatic markets and expose retry diagnostics';
  END IF;

  IF position('finalization_mode' IN v_def)=0 THEN
    RAISE EXCEPTION 'Automatic/manual classification must be policy-driven';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema='public'
      AND routine_name='admin_oracle_queue_v2'
      AND grantee='authenticated'
      AND privilege_type='EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Authenticated policy reviewers must be able to read the status-aware Oracle queue';
  END IF;
END;
$test$;

ROLLBACK;
