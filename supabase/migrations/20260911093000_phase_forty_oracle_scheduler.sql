-- VAD Phase 40: secure scheduled oracle provider health + evidence ingestion.
--
-- External network calls stay in Edge Functions. Postgres only schedules a small
-- authenticated bridge through pg_net. The scheduler credential is generated in
-- Vault at migration time and is never embedded in source control or cron SQL.

create extension if not exists pg_net;

-- Generate the scheduler credential once. Re-applying this migration does not
-- rotate it unexpectedly and therefore cannot silently break an active scheduler.
do $$
declare
  v_secret text;
begin
  if not exists (
    select 1 from vault.secrets where name='vad_oracle_scheduler_secret'
  ) then
    v_secret:=encode(extensions.gen_random_bytes(32),'hex');
    perform vault.create_secret(
      v_secret,
      'vad_oracle_scheduler_secret',
      'Authenticates pg_cron requests to the VAD oracle scheduler Edge Function'
    );
  end if;
end $$;

-- The Edge Function uses its service-role database client to validate the secret.
-- Signed-in/anonymous clients cannot call this validator directly.
create or replace function public.internal_validate_oracle_scheduler_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    p_secret is not null
    and length(p_secret)>=32
    and exists (
      select 1
      from vault.decrypted_secrets s
      where s.name='vad_oracle_scheduler_secret'
        and extensions.digest(s.decrypted_secret,'sha256')
            =extensions.digest(p_secret,'sha256')
    );
$$;

revoke all on function public.internal_validate_oracle_scheduler_secret(text) from public,anon,authenticated;
grant execute on function public.internal_validate_oracle_scheduler_secret(text) to service_role;

-- Health checks validate configured credentials and connectivity without activating
-- a disabled provider. Provider status transitions remain maker/checker governed.
select cron.schedule(
  'vad-oracle-provider-health',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url:='https://kixxqfqntfzlprapqkem.supabase.co/functions/v1/oracle-scheduler',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-vad-scheduler-secret',(
        select decrypted_secret
        from vault.decrypted_secrets
        where name='vad_oracle_scheduler_secret'
      )
    ),
    body:=jsonb_build_object('action','health'),
    timeout_milliseconds:=30000
  ) as request_id;
  $job$
);

-- Process due Oracle events once per minute. oracle-runtime itself selects only
-- ACTIVE/DEGRADED providers, so scheduling cannot bypass provider activation.
select cron.schedule(
  'vad-oracle-ingestion',
  '* * * * *',
  $job$
  select net.http_post(
    url:='https://kixxqfqntfzlprapqkem.supabase.co/functions/v1/oracle-scheduler',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-vad-scheduler-secret',(
        select decrypted_secret
        from vault.decrypted_secrets
        where name='vad_oracle_scheduler_secret'
      )
    ),
    body:=jsonb_build_object('action','process','limit',25),
    timeout_milliseconds:=30000
  ) as request_id;
  $job$
);
