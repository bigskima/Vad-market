-- Campaign-aware admin editing for the existing Home promotion carousel.
-- Reuses public.home_promotions; featured-market ranking and curation remain separate.

create index if not exists home_promotions_campaign_window_sort_idx
  on public.home_promotions (status, sort_order, starts_at, ends_at);

create or replace function public.admin_upsert_home_promotion_campaign(
  p_public_id uuid,
  p_banner_kind text,
  p_title text,
  p_body text,
  p_image_url text,
  p_target_path text,
  p_status text,
  p_sort_order integer,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
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
  if v_title is null then
    raise exception 'Campaigns require a title' using errcode = '22023';
  end if;
  if v_kind = 'IMAGE' and coalesce(v_image_url, '') !~ '^https://[^[:space:]]+$' then
    raise exception 'Image campaigns require a secure HTTPS image URL' using errcode = '22023';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'Campaign end time must be later than its start time' using errcode = '22023';
  end if;

  if p_public_id is null then
    insert into public.home_promotions (
      banner_kind, title, body, image_url, target_path, status, sort_order,
      starts_at, ends_at, created_by, updated_by
    )
    values (
      v_kind, v_title, v_body, case when v_kind = 'IMAGE' then v_image_url else null end,
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
         'Admin-managed Home carousel campaign'
  from public.home_promotions hp
  where hp.public_id = v_id;

  return v_id;
end;
$function$;

revoke all on function public.admin_upsert_home_promotion_campaign(uuid, text, text, text, text, text, text, integer, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_upsert_home_promotion_campaign(uuid, text, text, text, text, text, text, integer, timestamptz, timestamptz) to authenticated;
