-- VAD Phase 39: canonical username creator profiles.
-- Public creator URLs use usernames/handles; internal UUIDs remain backend identifiers.

create or replace function private.default_profile_username(
  p_user_id uuid,
  p_display_name text default null
) returns text
language sql
immutable
set search_path=''
as $$
  with normalized as (
    select btrim(
      regexp_replace(lower(coalesce(p_display_name,'')), '[^a-z0-9]+', '_', 'g'),
      '_'
    ) as base
  )
  select case
    when char_length(base) >= 2
      then left(base, 20) || '_' || left(md5(p_user_id::text), 6)
    else 'member_' || left(md5(p_user_id::text), 20)
  end
  from normalized;
$$;

-- Existing profiles pre-date canonical creator usernames. Normalize the two that
-- already have handles and issue stable, non-UUID public usernames to any profile
-- that does not yet have one.
update public.profiles
set handle=lower(btrim(regexp_replace(handle, '^@+', '')))
where handle is not null and btrim(handle)<>'';

update public.profiles
set handle=private.default_profile_username(user_id, display_name)
where handle is null or btrim(handle)='';

create or replace function private.normalize_profile_username()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_handle text;
begin
  v_handle:=lower(btrim(regexp_replace(coalesce(new.handle,''), '^@+', '')));

  if v_handle='' then
    if tg_op='INSERT' then
      v_handle:=private.default_profile_username(new.user_id,new.display_name);
    else
      raise exception 'Username is required' using errcode='22023';
    end if;
  end if;

  if char_length(v_handle)<2 or char_length(v_handle)>30
     or v_handle !~ '^[a-z0-9_][a-z0-9_.-]{1,29}$' then
    raise exception 'Username must be 2-30 characters using letters, numbers, underscore, dot or hyphen'
      using errcode='22023';
  end if;

  new.handle:=v_handle;
  return new;
end;
$$;

drop trigger if exists profiles_normalize_username on public.profiles;
create trigger profiles_normalize_username
before insert or update of handle on public.profiles
for each row execute function private.normalize_profile_username();

alter table public.profiles alter column handle set not null;

alter table public.profiles drop constraint if exists profiles_handle_format;
alter table public.profiles
  add constraint profiles_handle_format
  check (handle ~ '^[a-z0-9_][a-z0-9_.-]{1,29}$');

create or replace function public.creator_public_profile_by_username(p_username text)
returns jsonb
language sql
security definer
set search_path=''
as $$
  with requested as (
    select lower(btrim(regexp_replace(coalesce(p_username,''), '^@+', ''))) as username
  )
  select jsonb_build_object(
    'userId',p.user_id,
    'handle',p.handle,
    'displayName',p.display_name,
    'bio',p.bio,
    'avatarPath',p.avatar_path,
    'bannerPath',p.banner_path,
    'viewerFollows',exists(
      select 1
      from social.follows f
      where f.follower_user_id=auth.uid()
        and f.followed_user_id=p.user_id
    ),
    'isSelf',p.user_id=auth.uid()
  )
  from public.profiles p
  join public.user_accounts ua on ua.user_id=p.user_id and ua.status='ACTIVE'
  cross join requested r
  where lower(p.handle)=r.username
  limit 1;
$$;

revoke all on function public.creator_public_profile_by_username(text) from public,anon;
grant execute on function public.creator_public_profile_by_username(text) to authenticated;
