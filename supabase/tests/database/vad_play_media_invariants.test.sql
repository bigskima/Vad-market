begin;
select plan(5);

select ok(
  exists (
    select 1 from storage.buckets
    where id = 'play-media'
      and public = true
      and file_size_limit = 5242880
      and allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]
  ),
  'Play artwork bucket is public-read, image-only and size bounded'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'play_media_public_read'
      and cmd = 'SELECT'
  ),
  'Public read policy is scoped to Play media'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'play_media_admin_upload'
      and cmd = 'INSERT'
      and 'authenticated' = any(roles)
  ),
  'Only authenticated users can attempt Play media uploads'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'play_media_admin_upload'
      and coalesce(with_check, '') like '%play.manage%'
      and coalesce(with_check, '') like '%auth.uid%'
  ),
  'Upload policy checks Play management access and the caller-owned path'
);

select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd = 'INSERT'
      and 'anon' = any(roles)
      and coalesce(with_check, '') like '%play-media%'
  ),
  'Anonymous users cannot upload Play campaign artwork'
);

select * from finish();
rollback;
