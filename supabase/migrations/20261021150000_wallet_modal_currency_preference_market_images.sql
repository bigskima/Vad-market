-- Modal wallet UI preference plus server-owned, idempotent AI market-image generation.
alter table public.user_currency_preferences
  add column if not exists preferred_asset_code text;

update public.user_currency_preferences
set preferred_asset_code = case
  when 'NGN' = any(enabled_asset_codes) then 'NGN'
  when 'USDC' = any(enabled_asset_codes) then 'USDC'
  when 'TNGN' = any(enabled_asset_codes) then 'TNGN'
  else null
end
where preferred_asset_code is null;

alter table public.user_currency_preferences
  drop constraint if exists user_currency_preferences_preferred_asset_code_check;
alter table public.user_currency_preferences
  add constraint user_currency_preferences_preferred_asset_code_check
  check (preferred_asset_code is null or preferred_asset_code = any (array['NGN','USDC','TNGN']::text[]));

-- Normalize common representations so Nigerian accounts consistently match the ISO alpha-2 policy.
update public.user_accounts
set country_code = case
  when upper(trim(country_code)) in ('NG', 'NGA', 'NIGERIA') then 'NG'
  else upper(trim(country_code))
end
where country_code is not null
  and country_code is distinct from case
    when upper(trim(country_code)) in ('NG', 'NGA', 'NIGERIA') then 'NG'
    else upper(trim(country_code))
  end;

create table if not exists public.market_image_generation_jobs (
  instrument_public_id uuid primary key,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'GENERATING', 'DONE', 'FAILED')),
  attempts integer not null default 0 check (attempts >= 0),
  started_at timestamptz,
  lease_expires_at timestamptz,
  generated_media_path text,
  provider_code text,
  model_code text,
  prompt_text text,
  last_error text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);
alter table public.market_image_generation_jobs enable row level security;
revoke all on public.market_image_generation_jobs from public, anon, authenticated;
grant select, insert, update on public.market_image_generation_jobs to service_role;

-- Only the Edge Function's service-role client can attach AI-created media.
-- Existing manually uploaded media is never overwritten by automatic generation.
create or replace function public.internal_set_market_generated_media(
  p_instrument_public_id uuid,
  p_media_path text,
  p_provider text,
  p_model text,
  p_prompt text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_instrument market.instruments;
  v_event market.canonical_events;
  v_path text := nullif(btrim(coalesce(p_media_path, '')), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_instrument_public_id is null or v_path is null
     or split_part(v_path, '/', 1) <> 'generated'
     or split_part(v_path, '/', 2) <> p_instrument_public_id::text
     or position('..' in v_path) > 0
     or left(v_path, 1) = '/' then
    raise exception 'Invalid generated market media path' using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'market-media' and o.name = v_path
  ) then
    raise exception 'Generated image upload not found' using errcode = 'P0002';
  end if;

  select * into v_instrument
  from market.instruments
  where public_id = p_instrument_public_id
  for update;
  if v_instrument.id is null then
    raise exception 'Market not found' using errcode = 'P0002';
  end if;

  select * into v_event
  from market.canonical_events
  where id = v_instrument.canonical_event_id
  for update;
  if v_event.id is null then
    raise exception 'Canonical market event not found' using errcode = 'P0002';
  end if;
  if nullif(btrim(coalesce(v_event.media_path, '')), '') is not null then
    return false;
  end if;

  update market.canonical_events
  set media_path = v_path, updated_at = statement_timestamp()
  where id = v_event.id
    and nullif(btrim(coalesce(media_path, '')), '') is null;
  if not found then
    return false;
  end if;

  perform command.refresh_market_catalog(v_instrument.id);
  update public.market_image_generation_jobs
  set status = 'DONE',
      generated_media_path = v_path,
      provider_code = p_provider,
      model_code = p_model,
      prompt_text = p_prompt,
      last_error = null,
      lease_expires_at = null,
      updated_at = statement_timestamp()
  where instrument_public_id = p_instrument_public_id;
  return true;
end;
$function$;

revoke all on function public.internal_set_market_generated_media(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.internal_set_market_generated_media(uuid, text, text, text, text) to service_role;
