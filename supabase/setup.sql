-- Run once in the project's SQL Editor. Safe to rerun for these named policies.
-- Avatars are private. Users can access only their own fixed avatar path.
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/png'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "nijiehon_avatar_read" on storage.objects;
create policy "nijiehon_avatar_read" on storage.objects for select to authenticated
using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.png');
drop policy if exists "nijiehon_avatar_insert" on storage.objects;
create policy "nijiehon_avatar_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.png');
drop policy if exists "nijiehon_avatar_update" on storage.objects;
create policy "nijiehon_avatar_update" on storage.objects for update to authenticated
using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.png')
with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.png');
commit;
