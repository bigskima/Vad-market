-- Give each Home carousel promotion an optional visible campaign tag.
-- This is additive to the existing campaign/content model and keeps featured markets separate.

alter table public.home_promotions
  add column if not exists tag text;

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.home_promotions'::regclass
      and conname = 'home_promotions_tag_length_check'
  ) then
    alter table public.home_promotions
      add constraint home_promotions_tag_length_check
      check (tag is null or (char_length(tag) <= 32 and tag !~ '[[:cntrl:]]'));
  end if;
end;
$constraint$;

-- Replace the existing campaign RPC signature so tag is saved in the same
-- authorized/audited write as the rest of the campaign configuration.
drop function if exists public.admin_upsert_home_promotion_campaign(
  uuid, text, text, text, text, text, text, integer, timestamptz, timestamptz
);

create function public.admin_upsert_home_promotion_campaign(
  p_public_id uuid,
  p_banner_kind text,
  p_title text,
  p_body text,
  p_image_url text,
  p_target_path text,
  p_status text,
  p_sort_order integer,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_tag text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_kind text := upper(btrim(coalesce(p_banner_kind, '')));
  v_status text := upper(btrim(coalesce(p_status, 'DRAFT')));
  v_path text := btrim(coalesce(p_target_path, ''));
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_image_url text := nullif(btrim(coalesce(p_image_url, '')), '');
  v_tag text := nullif(btrim(coalesce(p_tag, '')), '');
  v_id uuid;
  v_before jsonb;
begin
  if auth.uid() is null or not private.has_permission('content.moderate') then
    raise exception 'Content moderation permission required' using errcode = '42501';
  end if;

  if v_kind not in ('TEXT', 'IMAGE') then
    raise exception 'Banner kind must be TEXT or IMAGE' using errcode = '22023';
  end if;
  if v_status not in ('DRAFT', 'PUBLISHED', 'ARCHIVED') then
    raise exception 'Invalid campaign status' using errcode = '22023';
  end if;
  if v_path = '' or left(v_path, 1) <> '/' or left(v_path, 2) = '//' or char_length(v_path) > 512 then
    raise exception 'Campaign destination must be a valid internal VAD route' using errcode = '22023';
  end if;
  if p_sort_order is null or p_sort_order < 0 or p_sort_order > 10000 then
    raise exception 'Campaign sort order must be between 0 and 10000' using errcode = '22023';
  end if;
  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 120 then
    raise exception 'Campaign title must contain 3 to 120 characters' using errcode = '22023';
  end if;
  if v_body is not null and char_length(v_body) > 320 then
    raise exception 'Campaign supporting copy must be 320 characters or fewer' using errcode = '22023';
  end if;
  if v_tag is not null and (char_length(v_tag) > 32 or v_tag ~ '[[:cntrl:]]') then
    raise exception 'Campaign tag must be 32 characters or fewer' using errcode = '22023';
  end if;
  if v_kind = 'IMAGE' and coalesce(v_image_url, '') !~ '^https://[^[:space:]]+$' then
    raise exception 'Image campaigns require a secure HTTPS image URL' using errcode = '22023';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'Campaign end time must be later than its start time' using errcode = '22023';
  end if;

  if p_public_id is null then
    insert into public.home_promotions (
      banner_kind, title, body, tag, image_url, target_path, status, sort_order,
      starts_at, ends_at, created_by, updated_by
    )
    values (
      v_kind, v_title, v_body, v_tag,
      case when v_kind = 'IMAGE' then v_image_url else null end,
      v_path, v_status, p_sort_order, p_starts_at, p_ends_at, auth.uid(), auth.uid()
    )
    returning public_id into v_id;
    v_before := null;
  else
    select to_jsonb(hp) into v_before
    from public.home_promotions hp
    where hp.public_id = p_public_id
    for update;

    if v_before is null then
      raise exception 'Campaign not found' using errcode = 'P0002';
    end if;

    update public.home_promotions
    set banner_kind = v_kind,
        title = v_title,
        body = v_body,
        tag = v_tag,
        image_url = case when v_kind = 'IMAGE' then v_image_url else null end,
        target_path = v_path,
        status = v_status,
        sort_order = p_sort_order,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        updated_by = auth.uid()
    where public_id = p_public_id
    returning public_id into v_id;
  end if;

  insert into audit.records (
    actor_user_id, actor_type, action, resource_type, resource_id,
    before_state, after_state, reason
  )
  select auth.uid(), 'ADMIN', 'HOME_PROMOTION_CAMPAIGN_' || v_status,
         'HOME_PROMOTION', v_id::text, v_before, to_jsonb(hp),
         'Admin-managed Home carousel campaign and tag'
  from public.home_promotions hp
  where hp.public_id = v_id;

  return v_id;
end;
$function$;

revoke all on function public.admin_upsert_home_promotion_campaign(
  uuid, text, text, text, text, text, text, integer, timestamptz, timestamptz, text
) from public, anon;
grant execute on function public.admin_upsert_home_promotion_campaign(
  uuid, text, text, text, text, text, text, integer, timestamptz, timestamptz, text
) to authenticated;
