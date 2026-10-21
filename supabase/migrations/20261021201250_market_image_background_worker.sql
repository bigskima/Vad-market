begin;

-- One-time worker credential and the public anon/publishable key used by pg_net.
-- The worker secret itself is generated inside Vault and never returned to callers.
do $migration$
begin
  if not exists (select 1 from vault.secrets where name='vad_market_image_worker_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'vad_market_image_worker_secret',
      'Private authorization token for the scheduled VAD market image worker'
    );
  end if;
  if not exists (select 1 from vault.secrets where name='vad_market_public_api_key') then
    perform vault.create_secret(
      'sb_publishable_yBTPjrfEAAKD9LZ9cE6YaQ_OQisiT1c',
      'vad_market_public_api_key',
      'Public publishable key for pg_net calls into VAD Edge Functions; not a secret credential'
    );
  end if;
end;
$migration$;

create or replace function public.is_market_image_worker_authorized(p_token text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from vault.decrypted_secrets s
    where s.name='vad_market_image_worker_secret'
      and s.decrypted_secret=coalesce(p_token,'')
  );
$$;
revoke all on function public.is_market_image_worker_authorized(text) from public,anon,authenticated;
grant execute on function public.is_market_image_worker_authorized(text) to service_role;

-- Process a small batch every two minutes. All images are generated and uploaded by
-- the configured Cloudflare AI provider; the worker does not touch outcome/oracle data.
do $schedule$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname='vad-market-image-worker' loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'vad-market-image-worker',
    '*/2 * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name='vad_project_url')
               || '/functions/v1/market-image-worker',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='vad_market_image_worker_secret'),
          'apikey',(select decrypted_secret from vault.decrypted_secrets where name='vad_market_public_api_key')
        ),
        body := jsonb_build_object('limit',2),
        timeout_milliseconds := 120000
      );
    $job$
  );
end;
$schedule$;

commit;
