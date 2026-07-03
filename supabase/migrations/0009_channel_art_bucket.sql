-- TVinBio — public storage bucket for channel art (avatars).
-- Reads are public (objects in a public bucket need no auth). Writes go only
-- through the owner-scoped server route (`/api/creator/avatar`) using the
-- service-role key, which bypasses storage RLS. 5 MB cap, images only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('channel-art', 'channel-art', true, 5242880, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
