-- Admin-managed welcome experience for the public VAD entry screen.
-- The client can read published presentation settings; only admins with content.moderate can update them.

create table if not exists public.welcome_screen_settings (
  singleton_id smallint primary key default 1 check (singleton_id = 1),
  video_enabled boolean not null default false,
  video_url text,
  poster_url text,
  headline text not null default 'See what the world thinks.',
  subheadline text not null default 'Clear odds. Real-world outcomes.',
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint welcome_screen_video_url_https check (video_url is null or video_url ~ '^https://'),
  constraint welcome_screen_poster_url_https check (poster_url is null or poster_url ~ '^https://'),
  constraint welcome_screen_headline_length check (char_length(headline) between 1 and 100),
  constraint welcome_screen_subheadline_length check (char_length(subheadline) between 1 and 180)
);

insert into public.welcome_screen_settings (singleton_id)
values (1)
on conflict (singleton_id) do nothing;

alter table public.welcome_screen_settings enable row level security;

drop policy if exists welcome_screen_settings_public_read on public.welcome_screen_settings;
create policy welcome_screen_settings_public_read
  on public.welcome_screen_settings
  for select
  to anon, authenticated
  using (singleton_id = 1);

revoke insert, update, delete on public.welcome_screen_settings from anon, authenticated;
grant select on public.welcome_screen_settings to anon, authenticated;

create or replace function public.admin_update_welcome_screen_settings(
  p_video_enabled boolean,
  p_video_url text default null,
  p_poster_url text default null,
  p_headline text default 'See what the world thinks.',
  p_subheadline text default 'Clear odds. Real-world outcomes.'
)
returns public.welcome_screen_settings
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.welcome_screen_settings;
  v_video_url text := nullif(btrim(coalesce(p_video_url, '')), '');
  v_poster_url text := nullif(btrim(coalesce(p_poster_url, '')), '');
  v_headline text := btrim(coalesce(p_headline, ''));
  v_subheadline text := btrim(coalesce(p_subheadline, ''));
begin
  if auth.uid() is null or not private.has_permission('content.moderate') then
    raise exception 'Content moderation permission required' using errcode = '42501';
  end if;

  if v_video_url is not null and (v_video_url !~ '^https://' or char_length(v_video_url) > 2048) then
    raise exception 'Video URL must be a valid HTTPS URL' using errcode = '22023';
  end if;
  if v_poster_url is not null and (v_poster_url !~ '^https://' or char_length(v_poster_url) > 2048) then
    raise exception 'Poster URL must be a valid HTTPS URL' using errcode = '22023';
  end if;
  if char_length(v_headline) not between 1 and 100 then
    raise exception 'Headline must contain 1 to 100 characters' using errcode = '22023';
  end if;
  if char_length(v_subheadline) not between 1 and 180 then
    raise exception 'Subheadline must contain 1 to 180 characters' using errcode = '22023';
  end if;
  if coalesce(p_video_enabled, false) and v_video_url is null then
    raise exception 'Provide a video URL before enabling the welcome background video' using errcode = '22023';
  end if;

  insert into public.welcome_screen_settings (
    singleton_id, video_enabled, video_url, poster_url, headline, subheadline, updated_at, updated_by
  )
  values (
    1, coalesce(p_video_enabled, false), v_video_url, v_poster_url, v_headline, v_subheadline,
    statement_timestamp(), auth.uid()
  )
  on conflict (singleton_id) do update set
    video_enabled = excluded.video_enabled,
    video_url = excluded.video_url,
    poster_url = excluded.poster_url,
    headline = excluded.headline,
    subheadline = excluded.subheadline,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by
  returning * into v_row;

  return v_row;
end;
$function$;

revoke all on function public.admin_update_welcome_screen_settings(boolean, text, text, text, text) from public, anon;
grant execute on function public.admin_update_welcome_screen_settings(boolean, text, text, text, text) to authenticated;
