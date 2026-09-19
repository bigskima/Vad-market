create or replace function public.admin_delete_public_notice(
  p_public_id uuid,
  p_reason text default null
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_before jsonb;
  v_reason text:=btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null or not private.has_permission('content.moderate') then
    raise exception 'Content moderation permission required' using errcode='42501';
  end if;

  if p_public_id is null then
    raise exception 'Public notice is required' using errcode='22023';
  end if;

  if char_length(v_reason) < 3 or char_length(v_reason) > 1000 then
    raise exception 'A deletion reason between 3 and 1000 characters is required' using errcode='22023';
  end if;

  select to_jsonb(pn)
    into v_before
  from public.public_notices pn
  where pn.public_id=p_public_id
  for update;

  if v_before is null then
    raise exception 'Public notice not found' using errcode='P0002';
  end if;

  insert into audit.records(
    actor_user_id,
    actor_type,
    action,
    resource_type,
    resource_id,
    before_state,
    after_state,
    reason
  ) values (
    auth.uid(),
    'ADMIN',
    'PUBLIC_NOTICE_DELETED',
    'PUBLIC_NOTICE',
    p_public_id::text,
    v_before,
    null,
    v_reason
  );

  delete from public.public_notices where public_id=p_public_id;
  return true;
end;
$$;

revoke execute on function public.admin_delete_public_notice(uuid,text) from public, anon;
grant execute on function public.admin_delete_public_notice(uuid,text) to authenticated;
