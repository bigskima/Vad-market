alter table public.profiles add column if not exists banner_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-media', 'profile-media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "profile_media_public_read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'profile-media');

create policy "profile_media_insert_own"
on storage.objects for insert
to authenticated
with check (bucket_id = 'profile-media' and split_part(name, '/', 1) = (select auth.uid())::text);

create policy "profile_media_update_own"
on storage.objects for update
to authenticated
using (bucket_id = 'profile-media' and split_part(name, '/', 1) = (select auth.uid())::text)
with check (bucket_id = 'profile-media' and split_part(name, '/', 1) = (select auth.uid())::text);

create policy "profile_media_delete_own"
on storage.objects for delete
to authenticated
using (bucket_id = 'profile-media' and split_part(name, '/', 1) = (select auth.uid())::text);
