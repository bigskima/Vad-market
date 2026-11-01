BEGIN;

DO $test$
DECLARE
  v_command text;
BEGIN
  SELECT command INTO v_command
  FROM cron.job
  WHERE jobname='vad-ai-market-resolution'
    AND active
  ORDER BY jobid DESC
  LIMIT 1;

  IF v_command IS NULL OR v_command NOT LIKE '%''limit'', 2%' OR v_command NOT LIKE '%timeout_milliseconds := 60000%' THEN
    RAISE EXCEPTION 'AI resolution scheduler must claim two due markets per minute with its existing 60-second request timeout';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname='vad-finalize-oracle-resolutions' AND active
  ) OR NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname='vad-settle-finalized-markets' AND active
  ) THEN
    RAISE EXCEPTION 'Finalization and settlement schedulers must remain active';
  END IF;
END;
$test$;

ROLLBACK;
