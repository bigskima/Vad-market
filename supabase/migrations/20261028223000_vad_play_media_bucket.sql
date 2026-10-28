-- VAD Play campaign artwork is stored in Supabase Storage; UI forms accept uploads or a server-generated storage path, never a typed external URL.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('play-media', 'play-media', true, 5242880, array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists play_media_public_read on storage.objects;
create policy play_media_public_read
  on storage.objects for select to public
  using (bucket_id = 'play-media');

drop policy if exists play_media_admin_upload on storage.objects;
create policy play_media_admin_upload
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'play-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and private.has_permission('play.manage')
  );

drop policy if exists play_media_admin_update on storage.objects;
create policy play_media_admin_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'play-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and private.has_permission('play.manage')
  )
  with check (
    bucket_id = 'play-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and private.has_permission('play.manage')
  );

drop policy if exists play_media_admin_delete on storage.objects;
create policy play_media_admin_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'play-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and private.has_permission('play.manage')
  );

commit;
