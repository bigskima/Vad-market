-- Pre-launch UI support: expose the already-existing parent_comment_id relation
-- without changing the social.comments table or existing top-level comment RPC.

create or replace function public.add_post_reply(
  p_post_public_id uuid,
  p_parent_comment_public_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_post_id bigint;
  v_parent_id bigint;
  v_comment_id uuid;
begin
  perform private.require_active_account();

  if p_body is null or char_length(trim(p_body)) < 1 or char_length(p_body) > 2000 then
    raise exception 'Comment must be 1-2000 characters' using errcode='22023';
  end if;

  select sp.id into v_post_id
  from social.posts sp
  where sp.public_id = p_post_public_id
    and sp.status = 'PUBLISHED';

  if v_post_id is null then
    raise exception 'Post not found' using errcode='P0002';
  end if;

  select c.id into v_parent_id
  from social.comments c
  where c.public_id = p_parent_comment_public_id
    and c.post_id = v_post_id
    and c.status = 'PUBLISHED';

  if v_parent_id is null then
    raise exception 'Parent comment not found' using errcode='P0002';
  end if;

  insert into social.comments(post_id, author_user_id, parent_comment_id, body)
  values(v_post_id, auth.uid(), v_parent_id, trim(p_body))
  returning public_id into v_comment_id;

  return v_comment_id;
end;
$$;

revoke all on function public.add_post_reply(uuid,uuid,text) from public,anon;
grant execute on function public.add_post_reply(uuid,uuid,text) to authenticated;

-- PostgreSQL requires a drop/recreate when a TABLE-returning function gains a
-- column. The argument signature is unchanged and the new parent id is appended,
-- so existing clients consuming the original fields continue to work.
drop function if exists public.post_comments(uuid,integer);

create function public.post_comments(
  p_post_public_id uuid,
  p_limit integer default 50
)
returns table(
  comment_public_id uuid,
  author_user_id uuid,
  author_handle text,
  author_display_name text,
  body text,
  created_at timestamptz,
  parent_comment_public_id uuid
)
language sql
security definer
set search_path=''
as $$
  select
    c.public_id,
    c.author_user_id,
    p.handle,
    p.display_name,
    c.body,
    c.created_at,
    parent.public_id
  from social.comments c
  join social.posts sp on sp.id = c.post_id
  left join public.profiles p on p.user_id = c.author_user_id
  left join social.comments parent on parent.id = c.parent_comment_id
  where sp.public_id = p_post_public_id
    and c.status = 'PUBLISHED'
  order by c.created_at asc
  limit least(greatest(coalesce(p_limit,50),1),200);
$$;

revoke all on function public.post_comments(uuid,integer) from public,anon;
grant execute on function public.post_comments(uuid,integer) to authenticated;
