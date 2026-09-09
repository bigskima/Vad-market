drop function if exists public.post_comments(uuid, integer);
create function public.post_comments(p_post_public_id uuid, p_limit integer default 50)
returns table(comment_public_id uuid, author_user_id uuid, author_handle text, author_display_name text, author_avatar_path text, body text, created_at timestamptz)
language sql
security definer
set search_path=''
as $function$
  select c.public_id,c.author_user_id,p.handle,p.display_name,p.avatar_path,c.body,c.created_at
  from social.comments c
  join social.posts sp on sp.id=c.post_id
  left join public.profiles p on p.user_id=c.author_user_id
  where sp.public_id=p_post_public_id and c.status='PUBLISHED'
  order by c.created_at asc
  limit least(greatest(coalesce(p_limit,50),1),200);
$function$;
revoke all on function public.post_comments(uuid, integer) from public, anon;
grant execute on function public.post_comments(uuid, integer) to authenticated;

create or replace function public.creator_public_profile(p_creator_user_id uuid)
returns jsonb
language sql
security definer
set search_path=''
as $function$
  select jsonb_build_object(
    'userId', p.user_id,
    'handle', p.handle,
    'displayName', p.display_name,
    'bio', p.bio,
    'avatarPath', p.avatar_path,
    'bannerPath', p.banner_path
  )
  from public.profiles p
  where p.user_id=p_creator_user_id;
$function$;
revoke all on function public.creator_public_profile(uuid) from public, anon;
grant execute on function public.creator_public_profile(uuid) to authenticated;
