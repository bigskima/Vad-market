-- Increase category-neutral AI evidence resolution throughput modestly.
-- The worker claims at most two due events per minute; per-event claims,
-- two-model agreement, independent source evidence and the four-minute retry
-- cooldown remain unchanged.

BEGIN;

DO $schedule$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname='vad-ai-market-resolution'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'vad-ai-market-resolution',
    '* * * * *',
    $job$
      select net.http_post(
        url := project_url.decrypted_secret || '/functions/v1/market-resolution-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-vad-scheduler-secret', scheduler_secret.decrypted_secret
        ),
        body := jsonb_build_object('limit', 2),
        timeout_milliseconds := 60000
      ) as request_id
      from vault.decrypted_secrets project_url
      cross join vault.decrypted_secrets scheduler_secret
      where project_url.name = 'vad_project_url'
        and scheduler_secret.name = 'vad_oracle_scheduler_secret';
    $job$
  );
END;
$schedule$;

COMMIT;
