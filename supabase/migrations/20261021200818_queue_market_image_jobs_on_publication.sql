-- Queue market artwork as soon as a non-draft catalogue item is created or published.
-- This is a queue only: no external AI request runs inside a database transaction.
create or replace function private.enqueue_missing_market_image()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if upper(coalesce(new.status, '')) in (
       'OPEN', 'SUSPENDED', 'CLOSED', 'RESOLVING',
       'SETTLEMENT_PENDING', 'SETTLED', 'VOIDED'
     )
     and nullif(btrim(coalesce(new.media_path, '')), '') is null then
    insert into public.market_image_generation_jobs(
      instrument_public_id, status, created_at, updated_at
    )
    values (
      new.instrument_public_id, 'PENDING',
      statement_timestamp(), statement_timestamp()
    )
    on conflict (instrument_public_id) do nothing;
  end if;
  return new;
end;
$function$;

revoke all on function private.enqueue_missing_market_image() from public, anon, authenticated;

drop trigger if exists market_catalog_enqueue_missing_ai_image on public.market_catalog;
create trigger market_catalog_enqueue_missing_ai_image
after insert or update of status, media_path
on public.market_catalog
for each row
execute function private.enqueue_missing_market_image();

-- Backfill the currently published catalogue so images can be generated without
-- an admin editing each record. The client queue wakes the worker when markets load.
insert into public.market_image_generation_jobs(
  instrument_public_id, status, created_at, updated_at
)
select mc.instrument_public_id, 'PENDING', statement_timestamp(), statement_timestamp()
from public.market_catalog mc
where upper(coalesce(mc.status, '')) in (
    'OPEN', 'SUSPENDED', 'CLOSED', 'RESOLVING',
    'SETTLEMENT_PENDING', 'SETTLED', 'VOIDED'
  )
  and nullif(btrim(coalesce(mc.media_path, '')), '') is null
on conflict (instrument_public_id) do nothing;
